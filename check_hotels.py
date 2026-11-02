import os
from math import atan2, cos, radians, sin, sqrt
import geopandas as gpd
import pandas as pd
from shapely.geometry import Point

# Resolve paths locally in current directory or fallback to ../data
hotels_path = 'hotels.csv' if os.path.exists('hotels.csv') else ('test.csv' if os.path.exists('test.csv') else '../data/hotels.csv')
bbmp_path = 'bbmp.geojson' if os.path.exists('bbmp.geojson') else '../data/bbmp.geojson'
output_path = 'hotels_checked.csv'

# Load
df = pd.read_csv(hotels_path)
gdf = gpd.read_file(bbmp_path)

print("=" * 60)
print("HOTELS DATA")
print("=" * 60)
print(f"Loaded from: {hotels_path}")
print(f"Total hotels: {len(df)}")
print(f"Columns: {list(df.columns)}")
print(f"Missing values:\n{df.isnull().sum()}")
print(f"Duplicate lat/lon: {df.duplicated(['lat','lon']).sum()}")
print(f"Duplicate names: {df['name'].duplicated().sum() if 'name' in df.columns else 'N/A'}")
print(f"\nLat range: {df['lat'].min():.4f} – {df['lat'].max():.4f}")
print(f"Lon range: {df['lon'].min():.4f} – {df['lon'].max():.4f}")

print("\n" + "=" * 60)
print("BBMP BOUNDARY")
print("=" * 60)
print(f"Features (wards): {len(gdf)}")
print(f"CRS: {gdf.crs}")
print(f"Bounds: {gdf.total_bounds}")

# CRS fix if needed
if gdf.crs != "EPSG:4326":
    print("⚠️ Converting to EPSG:4326")
    gdf = gdf.to_crs("EPSG:4326")

# BBMP union
bbmp_union = gdf.union_all() if hasattr(gdf, 'union_all') else gdf.unary_union
print(f"BBMP area: {bbmp_union.area:.4f} sq degrees")

# Hotel inclusion check
df['in_bbmp'] = df.apply(
    lambda r: bbmp_union.contains(Point(r['lon'], r['lat'])),
    axis=1
)

print("\n" + "=" * 60)
print("HOTELS IN/OUT BBMP")
print("=" * 60)
print(f"Inside BBMP:  {df['in_bbmp'].sum()}")
print(f"Outside BBMP: {(~df['in_bbmp']).sum()}")

if (~df['in_bbmp']).sum() > 0:
    print("\nHotels OUTSIDE BBMP:")
    print(df[~df['in_bbmp']][['name', 'lat', 'lon']].to_string())

# Distance from center (outlier detection)
def haversine(lat1, lon1, lat2, lon2):
    R = 6371
    dlat = radians(lat2 - lat1)
    dlon = radians(lon2 - lon1)
    a = sin(dlat/2)**2 + cos(radians(lat1)) * cos(radians(lat2)) * sin(dlon/2)**2
    return 2 * R * atan2(sqrt(a), sqrt(1-a))

df['dist_center_km'] = df.apply(
    lambda r: haversine(12.9716, 77.5946, r['lat'], r['lon']), axis=1
)

print("\n" + "=" * 60)
print("DISTANCE FROM BANGALORE CENTER")
print("=" * 60)
print(df['dist_center_km'].describe())
print(f"\nHotels > 40km: {(df['dist_center_km'] > 40).sum()}")
if (df['dist_center_km'] > 40).sum() > 0:
    print(df[df['dist_center_km'] > 40][['name','lat','lon','dist_center_km']].to_string())

# Save cleaned
df.to_csv(output_path, index=False)
print(f"\n✅ Saved {output_path}")
