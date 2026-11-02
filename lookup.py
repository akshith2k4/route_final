"""
LinenGrass Route Lookup Engine: Given GPS Lat and Lon, returns Region ID,
Region Name, LinenGrass Route, H3 Hexagon ID, Distance to Bangalore Center,
and Nearest Known Hotel.

Strictly 6 Operational Regions (LOTR Schematic Aligned):
- R0: South-East (Koramangala, HSR, BTM & E-City)
- R1: Central (CBD, Indiranagar & MG Road)
- R2: North (Hebbal, Manyata & Airport NH 44)
- R3: East (Whitefield & Marathahalli)
- R4: South-West (JP Nagar, Jayanagar & Kanakapura Rd)
- R5: North-West (Yeshwanthpur HQ, Rajajinagar & Magadi Rd)

Usage:
  # CLI single lookup:
  python lookup.py 12.9352 77.6145

  # CLI JSON output:
  python lookup.py 12.9352 77.6145 --json

  # Interactive mode:
  python lookup.py
"""
import sys
import json
import joblib
import h3
import pandas as pd
from math import radians, sin, cos, atan2, sqrt

# Load models and mappings
hex_map = joblib.load('hex_map_final.pkl')

try:
    with open('data/region_metadata.json', 'r') as f:
        REGION_METADATA = json.load(f)
except Exception:
    REGION_METADATA = {}

BANGALORE_CENTER = (12.9716, 77.5946)

# Load master hotels for nearest-neighbor reference
try:
    with open('data/hotels.json', 'r') as f:
        hotels_data = json.load(f)
    df_hotels = pd.DataFrame(hotels_data)
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
    hex_id = h3.latlng_to_cell(lat, lon, resolution)
    
    if hex_id in hex_map:
        region_id = hex_map[hex_id]
        lookup_type = "exact"
        in_operational_footprint = True
    else:
        nearest_hex = min(hex_map.keys(), key=lambda x: h3.grid_distance(x, hex_id))
        region_id = hex_map[nearest_hex]
        dist_hexes = h3.grid_distance(nearest_hex, hex_id)
        lookup_type = f"outside_footprint (nearest: {dist_hexes} hexes away)"
        in_operational_footprint = False

    meta = REGION_METADATA.get(str(region_id), {})
    region_code = meta.get("code", f"R{region_id}")
    region_name = meta.get("name", f"Region {region_id}")
    short_name = meta.get("short_name", region_name)
    tier = meta.get("tier", "Operational Route")
    route_status = meta.get("route_status", "Known")
    lotr_route = meta.get("lotr_route", "N/A")
    key_areas = meta.get("key_areas", "")

    boundary = h3.cell_to_boundary(hex_id)
    boundary_coords = [[p[0], p[1]] for p in boundary]

    dist_center = haversine(BANGALORE_CENTER[0], BANGALORE_CENTER[1], lat, lon)

    nearest_hotel_info = None
    if df_hotels is not None and len(df_hotels) > 0:
        dists = [haversine(lat, lon, hlat, hlon) for hlat, hlon in zip(df_hotels['lat'], df_hotels['lon'])]
        min_idx = dists.index(min(dists))
        nearest_hotel = df_hotels.iloc[min_idx]
        nearest_hotel_info = {
            "name": nearest_hotel['name'],
            "distance_km": round(dists[min_idx], 2),
            "hotel_region": int(nearest_hotel['region']),
            "region_code": f"R{int(nearest_hotel['region'])}"
        }

    return {
        "status": "success",
        "input_coordinates": {"lat": lat, "lon": lon},
        "region_id": int(region_id),
        "region_code": region_code,
        "region_name": region_name,
        "short_name": short_name,
        "lotr_route": lotr_route,
        "route_status": route_status,
        "key_areas": key_areas,
        "tier": tier,
        "in_operational_footprint": in_operational_footprint,
        "hexagon_id": hex_id,
        "hexagon_resolution": resolution,
        "lookup_type": lookup_type,
        "dist_from_bangalore_center_km": round(dist_center, 2),
        "nearest_hotel": nearest_hotel_info,
        "hexagon_boundary": boundary_coords
    }

def print_result(res: dict):
    print("=" * 70)
    print("📍 LINENGRASS HOTEL LOCATION LOOKUP RESULT")
    print("=" * 70)
    print(f"Coordinates:           {res['input_coordinates']['lat']:.5f}, {res['input_coordinates']['lon']:.5f}")
    print(f"Region Code:           {res['region_code']}")
    print(f"Assigned Region:       {res['region_name']}")
    print(f"LinenGrass Route:      {res['lotr_route']}")
    print(f"Route Status:          {res['route_status']}")
    print(f"Operational Tier:      {res['tier']}")
    print(f"Key Localities:        {res['key_areas']}")
    print(f"H3 Hexagon ID (Res 7): {res['hexagon_id']}")
    print(f"Lookup Status:         {res['lookup_type']}")
    print(f"In Active Footprint:   {'✅ Yes' if res['in_operational_footprint'] else '⚠️ No (Outside)'}")
    print(f"Dist to Center:        {res['dist_from_bangalore_center_km']} km")
    if res['nearest_hotel']:
        print(f"Nearest Known Hotel:   {res['nearest_hotel']['name']} ({res['nearest_hotel']['distance_km']} km away, {res['nearest_hotel']['region_code']})")
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
