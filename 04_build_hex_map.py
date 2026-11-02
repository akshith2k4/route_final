"""
Step 4: Build Master 6-Region Hex Map (LOTR-aligned)
Extends the 6 urban regions strictly along active highway corridors to the farthest active hotels:
- Region 0 (Southeast): Koramangala, HSR & Hosur Rd / E-City (27 hotels)
- Region 1 (Central / Inner East): CBD, Indiranagar, MG Road & Domlur (17 hotels)
- Region 2 (North): Hebbal, Nagawara, Manyata, Hennur & Airport corridor (17 hotels)
- Region 3 (East): Whitefield & Marathahalli (6 hotels)
- Region 4 (South): JP Nagar, Jayanagar, BTM & Bannerghatta Rd (27 hotels)
- Region 5 (West): Yeshwanthpur (HQ), Rajajinagar, Peenya & Magadi Rd (6 hotels)

No artificial 50km countryside hexagons — only active operational footprint.
"""
import pandas as pd
import geopandas as gpd
import h3
import joblib
import json
import numpy as np
from shapely.geometry import Point
from math import radians, sin, cos, atan2, sqrt

def haversine(lat1, lon1, lat2, lon2):
    R = 6371
    dlat = radians(lat2 - lat1); dlon = radians(lon2 - lon1)
    a = sin(dlat/2)**2 + cos(radians(lat1)) * cos(radians(lat2)) * sin(dlon/2)**2
    return 2 * R * atan2(sqrt(a), sqrt(1-a))

print("=" * 80)
print("BUILDING 6-REGION HEXAGON OPERATIONAL FOOTPRINT")
print("=" * 80)

# 1. Load Data
df_urban = pd.read_csv('hotels_urban_clustered.csv')
df_outer = pd.read_csv('hotels_outer_clustered.csv')

gdf = gpd.read_file('bbmp.geojson')
if gdf.crs != "EPSG:4326":
    gdf = gdf.to_crs("EPSG:4326")

bbmp_union = gdf.union_all() if hasattr(gdf, 'union_all') else gdf.unary_union

# 2. BBMP Urban Core Hexagons (res=7)
bbmp_hexes = set()
try:
    bbmp_hexes = set(h3.geo_to_cells(bbmp_union.__geo_interface__, res=7))
    print(f"Polyfill BBMP hexes: {len(bbmp_hexes)}")
except Exception as e:
    min_lon, min_lat, max_lon, max_lat = bbmp_union.bounds
    for lat in np.arange(min_lat, max_lat, 0.01):
        for lon in np.arange(min_lon, max_lon, 0.01):
            if bbmp_union.contains(Point(lon, lat)):
                bbmp_hexes.add(h3.latlng_to_cell(lat, lon, 7))
    print(f"Manual fill BBMP hexes: {len(bbmp_hexes)}")

# Base 8 centroids merged into the 6 LOTR zones:
#   0 (BTM/Hulimavu/Bannerghatta) + 4 (JP Nagar/Jayanagar) + 7 (Kanakapura) -> R4 South
#   6 (Koramangala/HSR) -> R0 South-East
#   1 Central, 2 North, 3 East, 5 West keep their IDs.
BASE_8_CENTROIDS = [
    (12.897545, 77.600871), # 0: BTM / Hulimavu / Bannerghatta
    (12.975317, 77.605515), # 1: Central / CBD
    (13.046299, 77.626499), # 2: North / Hebbal
    (12.973642, 77.718538), # 3: East / Whitefield
    (12.926320, 77.575699), # 4: JP Nagar / Jayanagar
    (13.031606, 77.560270), # 5: West / Yeshwanthpur
    (12.923476, 77.629603), # 6: Koramangala / HSR
    (12.877906, 77.548851), # 7: Kanakapura / Uttarahalli
]
MERGE_MAP = {0: 4, 6: 0, 7: 4}

hex_to_region = {}
for h in bbmp_hexes:
    hlat, hlon = h3.cell_to_latlng(h)
    base_r = min(range(len(BASE_8_CENTROIDS)),
                 key=lambda i: haversine(hlat, hlon, *BASE_8_CENTROIDS[i]))
    hex_to_region[h] = MERGE_MAP.get(base_r, base_r)

# UK COMFORTS (13.1219, 77.6311) fixed to Region 2 (North)
uk_hex = h3.latlng_to_cell(13.121868, 77.631093, 7)
hex_to_region[uk_hex] = 2

# Domlur is part of the LOTR Central / Inner East zone, but its H3 cell centre
# falls on the Koramangala/HSR side of the Voronoi boundary. Pin it to R1.
domlur_hex = h3.latlng_to_cell(12.960873, 77.638700, 7)
hex_to_region[domlur_hex] = 1

# EKAA KEYS (HSR Layout) sits on the R0/R4 hex boundary. Keep its cell in R0
# so the hotel label and the lookup result agree.
ekaa_hex = h3.latlng_to_cell(12.8900, 77.6399, 7)
hex_to_region[ekaa_hex] = 0

print(f"Initial BBMP urban hexagons: {len(hex_to_region)}")

# 3. Extend corridors ONLY up to the active outer hotels
corridor_hex_count = 0
for _, r in df_outer.iterrows():
    hotel_hex = h3.latlng_to_cell(r['lat'], r['lon'], 7)
    reg = int(r['region_outer'])
    
    # Find closest hex currently in this region to connect from
    matching_hexes = [h for h, rg in hex_to_region.items() if rg == reg]
    hlat, hlon = r['lat'], r['lon']
    closest_h = min(matching_hexes, key=lambda x: haversine(hlat, hlon, *h3.cell_to_latlng(x)))
    
    # Contiguous grid path from region boundary to hotel
    path = h3.grid_path_cells(closest_h, hotel_hex)
    for ph in path:
        if ph not in hex_to_region:
            hex_to_region[ph] = reg
            corridor_hex_count += 1
            
    # Buffer 1-ring around hotel location
    for neighbor in h3.grid_disk(hotel_hex, 1):
        if neighbor not in hex_to_region:
            hex_to_region[neighbor] = reg
            corridor_hex_count += 1

print(f"Added {corridor_hex_count} corridor/hotel hexagons.")
print(f"Total hexagons in 6-region operational footprint: {len(hex_to_region)}")

# 4. Distribution Breakdown
from collections import Counter
dist = Counter(hex_to_region.values())
print("\nHexagons per region:")
for r in sorted(dist.keys()):
    print(f"  Region {r}: {dist[r]} hexagons")

# 5. Centroids Calculation
all_hotels = []
for _, r in df_urban.iterrows():
    reg = int(r['region_urban'])
    if r['name'] == 'UK COMFORTS':
        reg = 2
    all_hotels.append({'name': r['name'], 'lat': float(r['lat']), 'lon': float(r['lon']), 'region': reg})

for _, r in df_outer.iterrows():
    all_hotels.append({'name': r['name'], 'lat': float(r['lat']), 'lon': float(r['lon']), 'region': int(r['region_outer'])})

df_all = pd.DataFrame(all_hotels)
centroids_df = df_all.groupby('region')[['lat', 'lon']].mean().reset_index()
counts_df = df_all.groupby('region')['name'].count().reset_index().rename(columns={'name': 'count'})
centroids_df = centroids_df.merge(counts_df, on='region')
centroids_df.to_csv('urban_centroids.csv', index=False)
print("\nSaved updated urban_centroids.csv:")
print(centroids_df)

# 6. Save Artifacts
joblib.dump(hex_to_region, 'hex_map_final.pkl')
joblib.dump({}, 'corridor_to_id_final.pkl')

with open('data/hex_map.json', 'w') as f:
    json.dump(hex_to_region, f)

with open('data/corridor_to_id.json', 'w') as f:
    json.dump({}, f)

with open('data/hotels.json', 'w') as f:
    json.dump(all_hotels, f, indent=2)

print("\n✅ Successfully built and saved:")
print("  - hex_map_final.pkl & data/hex_map.json")
print("  - corridor_to_id_final.pkl & data/corridor_to_id.json (cleared outer corridors)")
print("  - data/hotels.json (100 hotels mapped to 6 regions)")
print("  - urban_centroids.csv")
