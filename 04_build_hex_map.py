"""
Step 4: Full Hex Map — Urban 8 regions + Outer corridors (including R22 Hosur-Rd-E-City and UK Comforts fix)
"""
import pandas as pd
import geopandas as gpd
import h3
import joblib
import numpy as np
from shapely.geometry import Point
from math import radians, sin, cos, atan2, sqrt

# ---- Load data ----
df_urban = pd.read_csv('hotels_urban_clustered.csv')
df_outer = pd.read_csv('hotels_outer_clustered.csv')
gdf = gpd.read_file('bbmp.geojson')
if gdf.crs != "EPSG:4326":
    gdf = gdf.to_crs("EPSG:4326")

centroids_df = pd.read_csv('urban_centroids.csv')
urban_centroids = [(r['lat'], r['lon']) for _, r in centroids_df.iterrows()]
n_urban = len(urban_centroids)

corridor_ids_df = pd.read_csv('corridor_ids.csv')
if 'Unnamed: 0' in corridor_ids_df.columns:
    corridor_to_id = corridor_ids_df.set_index('Unnamed: 0')['id'].to_dict()
else:
    corridor_to_id = corridor_ids_df.set_index('name')['id'].to_dict()

CORRIDOR_TOWNS = {
    'SH9-Doddaballapur':  (13.29, 77.54),
    'NH44-Airport':       (13.20, 77.71),
    'Budigere-NE':        (13.15, 77.78),
    'Hoskote-East':       (13.10, 77.85),
    'Sarjapur-SE':        (12.86, 77.78),
    'Hosur-SE':           (12.78, 77.77),
    'Anekal-South':       (12.71, 77.69),
    'Kanakapura-SW':      (12.75, 77.40),
    'Mysore-SW':          (12.80, 77.38),
    'Magadi-West':        (12.96, 77.30),
    'NH48-Tumkur':        (13.10, 77.38),
    'NW-Doddaballapur':   (13.15, 77.40),
    'Hosur-Rd-E-City':    (12.84, 77.67),
}

def haversine(lat1, lon1, lat2, lon2):
    R = 6371
    dlat = radians(lat2 - lat1); dlon = radians(lon2 - lon1)
    a = sin(dlat/2)**2 + cos(radians(lat1)) * cos(radians(lat2)) * sin(dlon/2)**2
    return 2 * R * atan2(sqrt(a), sqrt(1-a))

# ---- URBAN HEXAGONS (inside BBMP) ----
print("=" * 80)
print("URBAN HEXAGONS (BBMP boundary)")
print("=" * 80)

bbmp_union = gdf.union_all() if hasattr(gdf, 'union_all') else gdf.unary_union

bbmp_hexes = set()
try:
    bbmp_hexes = set(h3.geo_to_cells(bbmp_union.__geo_interface__, res=7))
    print(f"Polyfill method: {len(bbmp_hexes)} hexagons")
except Exception as e:
    print(f"Polyfill fallback ({e})...")
    min_lon, min_lat, max_lon, max_lat = bbmp_union.bounds
    for lat in np.arange(min_lat, max_lat, 0.01):
        for lon in np.arange(min_lon, max_lon, 0.01):
            if bbmp_union.contains(Point(lon, lat)):
                bbmp_hexes.add(h3.latlng_to_cell(lat, lon, 7))
    print(f"Manual fill: {len(bbmp_hexes)} hexagons")

# Assign each BBMP hex → nearest urban centroid
bbmp_hex_to_region = {}
for h in bbmp_hexes:
    hlat, hlon = h3.cell_to_latlng(h)
    nearest_idx = min(range(n_urban),
                      key=lambda i: haversine(hlat, hlon, *urban_centroids[i]))
    bbmp_hex_to_region[h] = int(centroids_df.iloc[nearest_idx]['region'])

# Fix UK COMFORTS (13.1219, 77.6311) boundary hexagon -> Urban R2
uk_hex = h3.latlng_to_cell(13.121868, 77.631093, 7)
bbmp_hex_to_region[uk_hex] = 2
print(f"✅ UK COMFORTS hexagon {uk_hex} mapped to Urban-R2")

print(f"Total urban hexagons: {len(bbmp_hex_to_region)}")

# ---- OUTER HEXAGONS (outside BBMP, within 50km) ----
print("\n" + "=" * 80)
print("OUTER HEXAGONS (BMR 50km radius, outside BBMP)")
print("=" * 80)

BANGALORE_CENTER = (12.9716, 77.5946)
BMR_RADIUS_KM = 50

outer_hex_to_region = {}
count = 0
for lat in np.arange(12.4, 13.6, 0.015):
    for lon in np.arange(77.0, 78.2, 0.015):
        if haversine(*BANGALORE_CENTER, lat, lon) <= BMR_RADIUS_KM:
            h = h3.latlng_to_cell(lat, lon, 7)
            if h in bbmp_hex_to_region:
                continue  # Already urban
            # Nearest corridor town
            nearest_c = min(CORRIDOR_TOWNS.keys(),
                            key=lambda c: haversine(lat, lon, *CORRIDOR_TOWNS[c]))
            outer_hex_to_region[h] = corridor_to_id[nearest_c]
            count += 1

print(f"Outer hexagons: {len(outer_hex_to_region)}")

# ---- COMBINE ----
full_hex_map = {**bbmp_hex_to_region, **outer_hex_to_region}

print("\n" + "=" * 80)
print("FINAL HEX MAP")
print("=" * 80)
print(f"Urban hexagons (BBMP):     {len(bbmp_hex_to_region)}")
print(f"Outer hexagons (BMR):      {len(outer_hex_to_region)}")
print(f"Total hex → region:        {len(full_hex_map)}")

# Distribution check
from collections import Counter
urban_dist = Counter(bbmp_hex_to_region.values())
outer_dist = Counter(outer_hex_to_region.values())

print("\nUrban hexagons per region:")
for r in sorted(urban_dist.keys()):
    print(f"  R{r} (urban): {urban_dist[r]} hexagons")

print("\nOuter hexagons per corridor:")
for r in sorted(outer_dist.keys()):
    cname = [c for c, cid in corridor_to_id.items() if cid == r]
    cname = cname[0] if cname else f'R{r}'
    print(f"  R{r} ({cname}): {outer_dist[r]} hexagons")

# ---- SAVE ----
joblib.dump(full_hex_map, 'hex_map_final.pkl')
joblib.dump(corridor_to_id, 'corridor_to_id_final.pkl')
print(f"\n✅ Saved hex_map_final.pkl")
print(f"✅ Saved corridor_to_id_final.pkl")
