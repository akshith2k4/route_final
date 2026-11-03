"""
Step 2: Urban Clustering — 86 BBMP hotels ni K=4-14 metrics tho evaluate chey.

The KMeans step uses the historical 8-cluster solution, then merges it into the
5 LOTR zones used by the map:
  - old cluster 0 (BTM / Hulimavu / Bannerghatta) -> R4 South
  - old cluster 5 (Yeshwanthpur / Rajajinagar)     -> R2 North & West
  - old cluster 6 (Koramangala / HSR)              -> R0 South-East
  - old cluster 7 (Kanakapura / Uttarahalli)       -> R4 South
All other clusters keep their IDs (1 Central, 2 North & West, 3 East, 4 South).
"""
import pandas as pd
import numpy as np
import pyproj
from sklearn.cluster import KMeans
from sklearn.metrics import silhouette_score, davies_bouldin_score, calinski_harabasz_score

# ---- Load data ----
df = pd.read_csv('hotels_checked.csv')  # nee file path update chey
df_urban = df[df['in_bbmp']].copy()

print("=" * 90)
print(f"URBAN CLUSTERING — {len(df_urban)} hotels in BBMP")
print("=" * 90)

# ---- UTM 43N projection (accurate meters) ----
transformer = pyproj.Transformer.from_crs(
    "EPSG:4326", "EPSG:32643", always_xy=True
)
x, y = transformer.transform(df_urban['lon'].values, df_urban['lat'].values)
coords = np.column_stack([x, y])

print(f"Coordinates projected to UTM 43N (meters)")
print(f"X range: {x.min():.0f} – {x.max():.0f}")
print(f"Y range: {y.min():.0f} – {y.max():.0f}\n")

# ---- Evaluate K = 4 to 14 ----
print("=" * 100)
print(f"{'K':>3s} | {'Silhouette':>10s} | {'Davies-B':>10s} | {'Calinski-H':>11s} | "
      f"{'Min':>4s} | {'Max':>4s} | {'Avg':>5s} | {'Bal':>4s} | Status")
print("=" * 100)

results = []
for k in range(4, 15):
    km = KMeans(n_clusters=k, random_state=42, n_init=20)
    labels = km.fit_predict(coords)

    sil = silhouette_score(coords, labels)
    db = davies_bouldin_score(coords, labels)
    ch = calinski_harabasz_score(coords, labels)

    counts = pd.Series(labels).value_counts()
    balance = counts.min() / counts.max()

    # Status logic:
    # ✅ = ideal (sil > 0.30, min >= 5, max <= 22)
    # ⚠️ = acceptable (sil 0.25-0.30 OR slight imbalance)
    # ❌ = poor
    if sil > 0.30 and counts.min() >= 5 and counts.max() <= 22:
        status = "✅ ideal"
    elif sil > 0.25 and counts.min() >= 4 and counts.max() <= 25:
        status = "⚠️ ok"
    else:
        status = "❌ poor"

    print(f"{k:>3d} | {sil:>10.3f} | {db:>10.3f} | {ch:>11.1f} | "
          f"{counts.min():>4d} | {counts.max():>4d} | {counts.mean():>5.1f} | "
          f"{balance:>4.2f} | {status}")

    results.append({
        'k': k, 'sil': sil, 'db': db, 'ch': ch,
        'min': counts.min(), 'max': counts.max(),
        'balance': balance, 'labels': labels, 'inertia': km.inertia_
    })

# ---- Choose the 8-cluster base ----
# The LOTR merge below is defined on the historical K=8 solution. Keep the
# silhouette diagnostics above, but use K=8 as the base so the merge is stable.
valid = [r for r in results if r['min'] >= 4 and r['max'] <= 22]
best = next((r for r in results if r['k'] == 8),
            max(valid or results, key=lambda r: r['sil']))

print(f"\n✅ Using KMeans K = {best['k']} as the 8-cluster base")
print(f"   Silhouette: {best['sil']:.3f} (higher better, max 1.0)")
print(f"   Davies-Bouldin: {best['db']:.3f} (lower better, min 0.0)")
print(f"   Region sizes: min={best['min']}, max={best['max']}")

# ---- Base 8 centroids and merge map into 5 LOTR zones ----
BASE_8_CENTROIDS = [
    (12.897545, 77.600871), # 0: BTM / Hulimavu / Bannerghatta -> R4
    (12.975317, 77.605515), # 1: Central / CBD -> R1
    (13.046299, 77.626499), # 2: North / Hebbal -> R2
    (12.973642, 77.718538), # 3: East / Whitefield -> R3
    (12.926320, 77.575699), # 4: JP Nagar / Jayanagar -> R4
    (13.031606, 77.560270), # 5: West / Yeshwanthpur -> R2
    (12.923476, 77.629603), # 6: Koramangala / HSR -> R0
    (12.877906, 77.548851), # 7: Kanakapura / Uttarahalli -> R4
]
MERGE_MAP = {0: 4, 5: 2, 6: 0, 7: 4}

import os
from math import radians, sin, cos, atan2, sqrt

def haversine(lat1, lon1, lat2, lon2):
    R = 6371
    dlat = radians(lat2 - lat1); dlon = radians(lon2 - lon1)
    a = sin(dlat/2)**2 + cos(radians(lat1)) * cos(radians(lat2)) * sin(dlon/2)**2
    return 2 * R * atan2(sqrt(a), sqrt(1-a))

existing_assignments = {}
if os.path.exists('hotels_urban_clustered.csv'):
    prev_df = pd.read_csv('hotels_urban_clustered.csv')
    existing_assignments = dict(zip(prev_df['name'], prev_df['region_urban']))

assigned_regions = []
for _, r in df_urban.iterrows():
    name = r['name']
    if name in existing_assignments:
        assigned_regions.append(int(existing_assignments[name]))
    else:
        base_r = min(range(len(BASE_8_CENTROIDS)),
                     key=lambda i: haversine(r['lat'], r['lon'], *BASE_8_CENTROIDS[i]))
        final_reg = MERGE_MAP.get(base_r, base_r)
        print(f"✨ Newly Added Hotel: {name} -> Assigned to Region {final_reg}")
        assigned_regions.append(final_reg)

df_urban['region_urban'] = assigned_regions

print("\n" + "=" * 90)
print(f"FINAL URBAN DISTRIBUTION (K={best['k']} → 5 LOTR zones)")
print("=" * 90)

for i in sorted(df_urban['region_urban'].unique()):
    sub = df_urban[df_urban['region_urban'] == i]
    print(f"\nRegion {i}: {len(sub)} hotels")
    # Sample 3 hotels
    sample = sub['name'].head(3).tolist()
    for name in sample:
        print(f"   • {name}")
    if len(sub) > 3:
        print(f"   ... and {len(sub) - 3} more")

# ---- Save ----
df_urban.to_csv('hotels_urban_clustered.csv', index=False)
print(f"\n✅ Saved hotels_urban_clustered.csv ({len(df_urban)} hotels)")

# ---- Save centroids (for hex map step) ----
centroids = []
for i in sorted(df_urban['region_urban'].unique()):
    sub = df_urban[df_urban['region_urban'] == i]
    centroids.append({
        'region': i,
        'lat': sub['lat'].mean(),
        'lon': sub['lon'].mean(),
        'count': len(sub)
    })
centroids_df = pd.DataFrame(centroids)
centroids_df.to_csv('urban_centroids.csv', index=False)
print(f"✅ Saved urban_centroids.csv ({df_urban['region_urban'].nunique()} centroids)")

# ---- Sanity check ----
print("\n" + "=" * 90)
print("SANITY CHECK")
print("=" * 90)
print(f"Total urban hotels: {len(df_urban)}")
print(f"Assigned to regions: {df_urban['region_urban'].notna().sum()}")
print(f"Unique regions: {df_urban['region_urban'].nunique()}")
print(f"Region size range: {df_urban['region_urban'].value_counts().min()} – "
      f"{df_urban['region_urban'].value_counts().max()}")
