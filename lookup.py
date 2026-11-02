"""
Lookup Engine: Given GPS Lat and Lon, returns Region ID, Region Name, Tier,
H3 Hexagon ID, Hexagon Boundary, Distance to Bangalore Center, and Nearest Hotel.

Usage:
  # CLI single lookup:
  python lookup.py 12.9352 77.6145

  # CLI JSON output:
  python lookup.py 12.9352 77.6145 --json

  # Interactive mode:
  python lookup.py

  # In Python:
  from lookup import get_hotel_region
  result = get_hotel_region(12.9352, 77.6145)
"""
import sys
import json
import joblib
import h3
import pandas as pd
from math import radians, sin, cos, atan2, sqrt

# Load models and mappings
hex_map = joblib.load('hex_map_final.pkl')
corridor_to_id = joblib.load('corridor_to_id_final.pkl')
id_to_corridor = {v: k for k, v in corridor_to_id.items()}

# Master Region Metadata (Identifiable Names, Codes, LOTR routes, Key Areas)
try:
    with open('data/region_metadata.json', 'r') as f:
        REGION_METADATA = json.load(f)
except Exception:
    REGION_METADATA = {}

BANGALORE_CENTER = (12.9716, 77.5946)

# Load existing hotels for nearest-neighbor reference
try:
    df_u = pd.read_csv('hotels_urban_clustered.csv')
    df_o = pd.read_csv('hotels_outer_clustered.csv')
    df_hotels = pd.concat([
        df_u[['name', 'lat', 'lon', 'region_urban']].rename(columns={'region_urban': 'region'}),
        df_o[['name', 'lat', 'lon', 'region_outer']].rename(columns={'region_outer': 'region'})
    ], ignore_index=True)
except Exception:
    df_hotels = None

def haversine(lat1, lon1, lat2, lon2):
    R = 6371
    dlat = radians(lat2 - lat1); dlon = radians(lon2 - lon1)
    a = sin(dlat/2)**2 + cos(radians(lat1)) * cos(radians(lat2)) * sin(dlon/2)**2
    return 2 * R * atan2(sqrt(a), sqrt(1-a))

def get_hotel_region(lat: float, lon: float, resolution: int = 7) -> dict:
    """
    Given (lat, lon), return the region, hexagon, and spatial metadata.
    """
    # 1. Compute H3 Hexagon
    hex_id = h3.latlng_to_cell(lat, lon, resolution)
    
    # 2. Look up in Master BMR Hex Map
    if hex_id in hex_map:
        region_id = hex_map[hex_id]
        lookup_type = "exact"
    else:
        # Fallback to nearest mapped hex within the BMR 50km disk
        nearest_hex = min(hex_map.keys(), key=lambda x: h3.grid_distance(x, hex_id))
        region_id = hex_map[nearest_hex]
        lookup_type = f"nearest_fallback (distance: {h3.grid_distance(nearest_hex, hex_id)} hexes)"

    # 3. Determine Region Metadata
    is_urban = (region_id < 10)
    default_tier = "Urban Core (Inside BBMP)" if is_urban else "Outer Highway Corridor (BMR)"
    meta = REGION_METADATA.get(str(region_id), {})
    
    region_code = meta.get("code", f"R{region_id}")
    region_name = meta.get("name", id_to_corridor.get(region_id, f"Region {region_id}"))
    short_name = meta.get("short_name", region_name)
    tier = meta.get("tier", default_tier)
    lotr_route = meta.get("lotr_route", "N/A")
    key_areas = meta.get("key_areas", "")

    # 4. Hexagon Boundary coordinates (lat, lon)
    boundary = h3.cell_to_boundary(hex_id)
    boundary_coords = [[p[0], p[1]] for p in boundary]

    # 5. Distance to Bangalore Center
    dist_center = haversine(BANGALORE_CENTER[0], BANGALORE_CENTER[1], lat, lon)

    # 6. Find Nearest Existing Hotel
    nearest_hotel_info = None
    if df_hotels is not None and len(df_hotels) > 0:
        dists = [haversine(lat, lon, hlat, hlon) for hlat, hlon in zip(df_hotels['lat'], df_hotels['lon'])]
        min_idx = dists.index(min(dists))
        nearest_hotel = df_hotels.iloc[min_idx]
        nearest_hotel_info = {
            "name": nearest_hotel['name'],
            "distance_km": round(dists[min_idx], 2),
            "hotel_region": int(nearest_hotel['region'])
        }

    return {
        "status": "success",
        "input_coordinates": {"lat": lat, "lon": lon},
        "region_id": int(region_id),
        "region_code": region_code,
        "region_name": region_name,
        "short_name": short_name,
        "lotr_route": lotr_route,
        "key_areas": key_areas,
        "tier": tier,
        "hexagon_id": hex_id,
        "hexagon_resolution": resolution,
        "lookup_type": lookup_type,
        "dist_from_bangalore_center_km": round(dist_center, 2),
        "nearest_hotel": nearest_hotel_info,
        "hexagon_boundary": boundary_coords
    }

def print_result(res: dict):
    print("=" * 70)
    print("📍 HOTEL LOCATION LOOKUP RESULT")
    print("=" * 70)
    print(f"Coordinates:           {res['input_coordinates']['lat']:.5f}, {res['input_coordinates']['lon']:.5f}")
    print(f"Region Code:           {res['region_code']}")
    print(f"Assigned Region:       {res['region_name']}")
    print(f"LinenGrass Route:      {res['lotr_route']}")
    print(f"Operational Tier:      {res['tier']}")
    print(f"Key Localities:        {res['key_areas']}")
    print(f"H3 Hexagon ID (Res 7): {res['hexagon_id']}")
    print(f"Lookup Status:         {res['lookup_type']}")
    print(f"Dist to Center:        {res['dist_from_bangalore_center_km']} km")
    if res['nearest_hotel']:
        print(f"Nearest Known Hotel:   {res['nearest_hotel']['name']} ({res['nearest_hotel']['distance_km']} km away, Region {res['nearest_hotel']['hotel_region']})")
    print("=" * 70)

if __name__ == "__main__":
    args = sys.argv[1:]
    
    if len(args) >= 2:
        try:
            lat = float(args[0])
            lon = float(args[1])
            as_json = "--json" in args
            result = get_hotel_region(lat, lon)
            if as_json:
                print(json.dumps(result, indent=2))
            else:
                print_result(result)
        except ValueError:
            print("❌ Error: Latitude and Longitude must be numbers.")
            print("Usage: python lookup.py <latitude> <longitude> [--json]")
    else:
        print("💡 Interactive Lookup Mode")
        try:
            lat_str = input("Enter Latitude (e.g. 12.9352): ").strip()
            lon_str = input("Enter Longitude (e.g. 77.6145): ").strip()
            result = get_hotel_region(float(lat_str), float(lon_str))
            print_result(result)
        except Exception as e:
            print(f"❌ Error: {e}")
            print("Usage: python lookup.py <latitude> <longitude>")
