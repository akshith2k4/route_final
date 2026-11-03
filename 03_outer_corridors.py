"""
Step 3: Outer Corridors — 14 BBMP-external hotels assigned directly to parent operational regions:
- Hosur-Rd-E-City (11 hotels) -> Region 0 (South-East: Electronic City, Hosur Rd, Koramangala & HSR)
- Sarjapur-SE (1 hotel: GLOBAL STAY) -> Region 0 (South-East: Sarjapur Rd up to Sarjapura)
- NH44-Airport (1 hotel) -> Region 2 (North & West: Hebbal, Manyata & Airport NH 44)
- Magadi-West (1 hotel) -> Region 2 (North & West: Yeshwanthpur HQ & Magadi Rd)
"""
import pandas as pd
from math import radians, sin, cos, atan2, sqrt

# ---- Load data ----
df = pd.read_csv('hotels_checked.csv')
df_outer = df[~df['in_bbmp']].copy()

print("=" * 90)
print(f"OUTER CORRIDORS — {len(df_outer)} hotels outside BBMP")
print("=" * 90)

if len(df_outer) == 0:
    print("✅ No outer hotels. Skip Step 3.")
    exit()

CORRIDOR_TOWNS = {
    'NH44-Airport':       (13.20, 77.71),   # Assigned to Region 2 (North & West)
    'Sarjapur-SE':        (12.88, 77.75),   # Dommasandra / Sarjapur Rd -> Region 0 (South-East)
    'Magadi-West':        (12.96, 77.30),   # Assigned to Region 2 (North & West)
    'Hosur-Rd-E-City':    (12.84, 77.67),   # Electronic City / Hosur Rd -> Region 0 (South-East)
}

corridor_to_parent_region = {
    'NH44-Airport': 2,
    'Sarjapur-SE': 0,
    'Magadi-West': 2,
    'Hosur-Rd-E-City': 0,
}

def haversine(lat1, lon1, lat2, lon2):
    R = 6371
    dlat = radians(lat2 - lat1)
    dlon = radians(lon2 - lon1)
    a = (sin(dlat/2)**2 +
         cos(radians(lat1)) * cos(radians(lat2)) * sin(dlon/2)**2)
    return 2 * R * atan2(sqrt(a), sqrt(1-a))

def nearest_corridor(lat, lon):
    """Return (corridor_name, distance_to_town_km)"""
    distances = {
        c: haversine(lat, lon, *CORRIDOR_TOWNS[c])
        for c in CORRIDOR_TOWNS
    }
    nearest = min(distances, key=distances.get)
    return nearest, distances[nearest]

# ---- Assign each outer hotel ----
print("\n" + "=" * 90)
print("HOTEL → PARENT REGION ASSIGNMENTS")
print("=" * 90)

assignments = []
for _, r in df_outer.iterrows():
    corridor, dist = nearest_corridor(r['lat'], r['lon'])
    parent_reg = corridor_to_parent_region[corridor]
    assignments.append({
        'name': r['name'],
        'lat': r['lat'],
        'lon': r['lon'],
        'corridor': corridor,
        'region_outer': parent_reg,
        'dist_to_town_km': dist
    })

assignments_df = pd.DataFrame(assignments).sort_values('region_outer')

for _, a in assignments_df.iterrows():
    print(f"  {a['name']:30s} → R{a['region_outer']:2d} "
          f"({a['corridor']:20s}, {a['dist_to_town_km']:.1f} km to corridor point)")

# ---- Corridor distribution ----
print("\n" + "=" * 90)
print("OUTER HOTEL PARENT REGION DISTRIBUTION")
print("=" * 90)

dist = assignments_df.groupby(['region_outer', 'corridor']).size()
for (region_id, corridor), count in dist.items():
    print(f"  R{region_id:2d} ({corridor:20s}): {count} hotels")

# ---- Save ----
df_outer_out = df_outer.copy()
df_outer_out['corridor'] = assignments_df.set_index('name').loc[
    df_outer_out['name'], 'corridor'
].values
df_outer_out['region_outer'] = assignments_df.set_index('name').loc[
    df_outer_out['name'], 'region_outer'
].values

df_outer_out.to_csv('hotels_outer_clustered.csv', index=False)
print(f"\n✅ Saved hotels_outer_clustered.csv ({len(df_outer_out)} hotels)")
