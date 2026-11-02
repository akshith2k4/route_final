"""
Step 3: Outer Corridors — 14 BBMP-external hotels assigned with R22 Hosur-Rd-E-City
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

# ---- Corridor reference towns (actual Bangalore highway towns + E-City corridor) ----
CORRIDOR_TOWNS = {
    'SH9-Doddaballapur':  (13.29, 77.54),   # Doddaballapur town (N)
    'NH44-Airport':       (13.20, 77.71),   # Devanahalli airport (NNE)
    'Budigere-NE':        (13.15, 77.78),   # Budigere Cross (NE)
    'Hoskote-East':       (13.10, 77.85),   # Hoskote town (E)
    'Sarjapur-SE':        (12.86, 77.78),   # Sarjapur town (ESE)
    'Hosur-SE':           (12.78, 77.77),   # Attibele / Hosur Rd (SE)
    'Anekal-South':       (12.71, 77.69),   # Anekal town (S)
    'Kanakapura-SW':      (12.75, 77.40),   # Harohalli / Kanakapura (SSW)
    'Mysore-SW':          (12.80, 77.38),   # Bidadi / Ramanagara (SW)
    'Magadi-West':        (12.96, 77.30),   # Magadi town (W)
    'NH48-Tumkur':        (13.10, 77.38),   # Nelamangala (WNW)
    'NW-Doddaballapur':   (13.15, 77.40),   # Hesaraghatta side (NW)
    'Hosur-Rd-E-City':    (12.84, 77.67),   # Electronic City / Hosur Rd (R22)
}

corridor_to_id = {
    'SH9-Doddaballapur': 10,
    'NH44-Airport': 11,
    'Budigere-NE': 12,
    'Hoskote-East': 13,
    'Sarjapur-SE': 14,
    'Hosur-SE': 15,
    'Anekal-South': 16,
    'Kanakapura-SW': 17,
    'Mysore-SW': 18,
    'Magadi-West': 19,
    'NH48-Tumkur': 20,
    'NW-Doddaballapur': 21,
    'Hosur-Rd-E-City': 22,
}
id_to_corridor = {v: k for k, v in corridor_to_id.items()}

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
print("HOTEL → CORRIDOR ASSIGNMENTS")
print("=" * 90)

assignments = []
for _, r in df_outer.iterrows():
    corridor, dist = nearest_corridor(r['lat'], r['lon'])
    region_id = corridor_to_id[corridor]
    assignments.append({
        'name': r['name'],
        'lat': r['lat'],
        'lon': r['lon'],
        'corridor': corridor,
        'region_outer': region_id,
        'dist_to_town_km': dist
    })

assignments_df = pd.DataFrame(assignments).sort_values('region_outer')

for _, a in assignments_df.iterrows():
    print(f"  {a['name']:30s} → R{a['region_outer']:2d} "
          f"({a['corridor']:20s}, {a['dist_to_town_km']:.1f} km to center)")

# ---- Corridor distribution ----
print("\n" + "=" * 90)
print("CORRIDOR DISTRIBUTION")
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

# ---- Save corridor mapping ----
pd.Series(corridor_to_id).to_csv('corridor_ids.csv', header=['id'])
print(f"✅ Saved corridor_ids.csv ({len(corridor_to_id)} corridors)")

# ---- Sanity check ----
print("\n" + "=" * 90)
print("SANITY CHECK")
print("=" * 90)
print(f"Total outer hotels: {len(df_outer_out)}")
print(f"Assigned: {df_outer_out['region_outer'].notna().sum()}")
print(f"Unique corridors used: {df_outer_out['corridor'].nunique()} / {len(corridor_to_id)}")
print(f"Corridors with hotels: {sorted(df_outer_out['region_outer'].unique())}")
