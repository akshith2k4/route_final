"""
Generate Manual Routes with Google Routes API & Visualize on Region Map
Exact fixed stop sequence, real-time road polylines, IST timestamps, and Folium map.
"""
import json
import os
import sys
import urllib.request
from datetime import datetime, timedelta, timezone
import pandas as pd
import folium
from folium import plugins
from google.oauth2 import service_account
from google.auth.transport.requests import Request

IST = timezone(timedelta(hours=5, minutes=30))
DEPOT = {"lat": 13.017275, "lon": 77.546578}
DEPOT_NAME = "LinenGrass HQ (Yeshwanthpur Central Laundry)"

# Master definition of the 8 manual routes
MANUAL_ROUTES_CONFIG = [
    {
        "id": "103501",
        "route_key": "route_1_whitefield",
        "name": "Route 1 - Whitefield (ID: 103501)",
        "color": "#059669",  # Emerald Green
        "nominal_cap": 40,
        "max_load": 36,
        "hotels": [
            "FORTUNE STAY",
            "DAY SUITES",
            "AURUM KEY",
            "OCTAVE HOTEL AND SPA - MARATHAHALLI",
            "GLOBAL STAY",
            "OCTAVE HOTEL AND SPA - SARJAPUR ROAD",
            "SM COMFORTS HSR",
            "PARK INN",
            "Wandr - Brookefield",
            "Hyatt Centric Whitefield Bengaluru"  # HYATT WHITEFIELD MAHADEVPURA
        ]
    },
    {
        "id": "103601",
        "route_key": "route_2_electronic_city",
        "name": "Route 2 - Electronic City (ID: 103601)",
        "color": "#dc2626",  # Crimson Red
        "nominal_cap": 40,
        "max_load": 36,
        "hotels": [
            "OCTAVE HOTEL - DOUBLE ROAD",
            "OCTAVE HOTEL AND SPA - JP NAGAR",
            "BRIXTON LUXE",
            "Wandr - HSR Layout",
            "EKAA KEYS",
            "EAST PARK PREMIUM",
            "EAST PARK RIO",
            "HOTEL VERTEX",
            "GOLDEN SUITES",
            "INVENTREE E-CITY",
            "CASA PICCOSA E-CITY",  # CASA PICOSSA E-CITY
            "CELESTIAL SUITES",
            "NIRANTARA RESORT",
            "CELEBRITY SUITES",
            "V.B.H INN",
            "CLOVER A RIVIDO HOTELS",
            "GOLDEN STAY"
        ]
    },
    {
        "id": "103602",
        "route_key": "route_2_jayanagara",
        "name": "Route 2 - Jayanagara (ID: 103602)",
        "color": "#d97706",  # Amber Gold
        "nominal_cap": 35,
        "max_load": 32,
        "hotels": [
            "Wandr - Richmond Road",
            "LE GRANDEUR",
            "LE-GRANDEUR (NK CIRCLE)",
            "KINGSTON PALACE",
            "UR COMFORTS",
            "VP INTERNATIONAL",
            "SHETTY GARDENIA HOTEL",
            "SY COMFORTS",
            "S V B R HOTEL",
            "SK COMFORTS",
            "HOLIDAY VILLAGE",
            "NISARGA HOTEL"
        ]
    },
    {
        "id": "103603",
        "route_key": "route_3_bg_road_madiwala",
        "name": "Route 3 - B.G Road & Madiwala (ID: 103603)",
        "color": "#e11d48",  # Rose Red
        "nominal_cap": 20,
        "max_load": 18,
        "hotels": [
            "SV COMFORTS",
            "NEST BY RIVIDO",
            "HOTEL MONARCH INTERNATIONAL",
            "DD COMFORTS",
            "SM INTERNATIONAL",
            "ARAMA SUITES",
            "TEMPLE KEYS",
            "M R HAPPY STAY INN",
            "OLIVE HULIMAVU HOTEL",
            "FELICITY",
            "SM STAY INN",
            "FOUNTAIN TREE",
            "STERLING KEYS",
            "UR STAY INN",
            "GOLDEN INN ROOMS",
            "SM COMFORTS BTM",
            "WESTERN KEYS HOTEL",
            "EYRIE NEST",
            "THE GRAND KRISHNA ROOMS"
        ]
    },
    {
        "id": "103604",
        "route_key": "route_4_tch_tcp",
        "name": "Route 4 - TCH & TCP (ID: 103604)",
        "color": "#7c3aed",  # Royal Purple
        "nominal_cap": 35,
        "max_load": 32,
        "hotels": [
            "THE CHANCERY HOTELS",
            "THE CHANCERY PAVILION"
        ]
    },
    {
        "id": "103605",
        "route_key": "route_5_nagawara",
        "name": "Route 5 - Nagawara (ID: 103605)",
        "color": "#0d9488",  # Teal Cyan
        "nominal_cap": 20,
        "max_load": 18,
        "hotels": [
            "SAI SUITES INN",
            "SRI SAI COMFORTS",
            "OLIVE NAGAWARA",
            "OCEAN SUITES",
            "ORCHID PARC",
            "RIVIDO MANAYATA",
            "TRUP GLOBAL KEMPAPUR NEW",
            "HOWARD JOHNSON",
            "FORTUNE COMFORTS",
            "OCTAVE JAMAYCA",
            "ATHULYA RESIDENCIES",
            "GOLDEN FORTUN INN",
            "SRI SAI SUITES",
            "GOLDEN VISTA",
            "HOTEL ERACREST"
        ]
    },
    {
        "id": "103606",
        "route_key": "route_6_indiranagar_shivajinagar",
        "name": "Route 6 - Indira Nagar / Shivaji Nagar (ID: 103606)",
        "color": "#2563eb",  # Sapphire Blue
        "nominal_cap": 40,
        "max_load": 36,
        "hotels": [
            "KALINGA HOSPITALITY",
            "REGENTA PALACE",
            "LOCUL CENTRAL",
            "PELICAN INN",
            "OCTAVE CHURCH INN CHH",
            "OCTAVE CRYSTAL HEIGHT",
            "LOCUL MIDTOWN",
            "Wandr - Kormangala",
            "SM STAY INN KORAMANGALA",
            "FORTY 1 HOSPITALITY",
            "BLUE BLISS HOTELS",
            "ATHASRI INN- SHIVAJINAGAR",
            "LOCUL UPTOWN",
            "OCTAVE STUDIO HOTEL - KORAMANGLA STU",
            "THE MOCANA BANYAN",
            "FORTUNE INN",
            "Wandr - Indiranagar",
            "Wandr - Ulsoor"
        ]
    },
    {
        "id": "103607",
        "route_key": "route_7_bel_road_airport",
        "name": "Route 7 - BEL Road & Airport Road (ID: 103607)",
        "color": "#ea580c",  # Bronze Orange
        "nominal_cap": 70,
        "max_load": 63,
        "hotels": [
            "MANDALA RESORTS",
            "OCTAVE ROYAL OPERA",
            "RAJ RESIDENCY",
            "THALASSA SPA",
            "URBAN NEST",
            "BRINDAVANA STAY",
            "AVORA TREE SUITES",
            "UK COMFORTS"
        ]
    }
]

def decode_polyline(polyline_str):
    index, lat, lng = 0, 0, 0
    coordinates = []
    length = len(polyline_str)
    while index < length:
        b, shift, result = 0, 0, 0
        while True:
            b = ord(polyline_str[index]) - 63
            index += 1
            result |= (b & 0x1f) << shift
            shift += 5
            if b < 0x20:
                break
        dlat = ~(result >> 1) if (result & 1) else (result >> 1)
        lat += dlat

        shift, result = 0, 0
        while True:
            b = ord(polyline_str[index]) - 63
            index += 1
            result |= (b & 0x1f) << shift
            shift += 5
            if b < 0x20:
                break
        dlng = ~(result >> 1) if (result & 1) else (result >> 1)
        lng += dlng

        coordinates.append([lat / 1e5, lng / 1e5])
    return coordinates

def get_google_token():
    creds = service_account.Credentials.from_service_account_file(
        "gcp_service_account.json",
        scopes=["https://www.googleapis.com/auth/cloud-platform"]
    )
    creds.refresh(Request())
    return creds.token

def call_google_compute_routes(token, origin, destination, intermediates):
    """Call Google Routes API computeRoutes to get exact road polyline for a fixed sequence of stops."""
    url = "https://routes.googleapis.com/directions/v2:computeRoutes"
    body = {
        "origin": {"location": {"latLng": {"latitude": origin["lat"], "longitude": origin["lon"]}}},
        "destination": {"location": {"latLng": {"latitude": destination["lat"], "longitude": destination["lon"]}}},
        "intermediates": [
            {"location": {"latLng": {"latitude": pt["lat"], "longitude": pt["lon"]}}}
            for pt in intermediates
        ],
        "travelMode": "DRIVE",
        "routingPreference": "TRAFFIC_AWARE"
    }

    req = urllib.request.Request(
        url,
        data=json.dumps(body).encode("utf-8"),
        headers={
            "Authorization": f"Bearer {token}",
            "Content-Type": "application/json",
            "X-Goog-FieldMask": "routes.duration,routes.distanceMeters,routes.polyline.encodedPolyline,routes.legs"
        },
        method="POST"
    )

    with urllib.request.urlopen(req, timeout=30) as resp:
        res = json.loads(resp.read().decode("utf-8"))

    return res.get("routes", [{}])[0]

def main():
    print("=" * 85)
    print("GENERATING MANUAL FLEET ROUTES WITH EXACT GOOGLE ROAD POLYLINES")
    print(f"Depot: {DEPOT_NAME} ({DEPOT['lat']}, {DEPOT['lon']})")
    print("=" * 85)

    with open("data/hotels.json") as f:
        hotels_data = json.load(f)

    hotel_map = {h["name"].upper().strip(): h for h in hotels_data}

    missing_ids = [h["name"] for h in hotels_data if not h.get("id")]
    if missing_ids:
        raise SystemExit(
            "Missing hotel ids in data/hotels.json. Run `node 09_ensure_hotel_ids.mjs` first:\n  "
            + "\n  ".join(missing_ids)
        )

    # Aliases
    hotel_map["CASA PICOSSA E-CITY"] = hotel_map.get("CASA PICCOSA E-CITY")
    hotel_map["HYATT WHITEFIELD MAHADEVPURA"] = hotel_map.get("HYATT CENTRIC WHITEFIELD BENGALURU")

    token = get_google_token()
    print("✅ Authenticated with Google Cloud API.\n")

    processed_routes = []
    manifest_rows = []

    # Shift start 07:00 AM IST
    today = datetime.now(IST).date()
    shift_start_dt = datetime(today.year, today.month, today.day, 7, 0, 0, tzinfo=IST)

    for r_idx, r_conf in enumerate(MANUAL_ROUTES_CONFIG, 1):
        print(f"Processing #{r_idx}: {r_conf['name']} ({len(r_conf['hotels'])} hotels)...")

        # Resolve hotel objects in exact sequence
        stop_points = []
        for h_name in r_conf["hotels"]:
            k = h_name.upper().strip()
            if k in hotel_map and hotel_map[k] is not None:
                stop_points.append(hotel_map[k])
            else:
                print(f"  ❌ Missing hotel: {h_name}")

        # Compute Google Route
        try:
            google_res = call_google_compute_routes(
                token,
                origin=DEPOT,
                destination=DEPOT,
                intermediates=[{"lat": p["lat"], "lon": p["lon"]} for p in stop_points]
            )
        except Exception as e:
            print(f"  ❌ Error calling Google Routes API for {r_conf['name']}: {e}")
            continue

        total_dist_m = google_res.get("distanceMeters", 0)
        total_dist_km = round(total_dist_m / 1000.0, 1)
        encoded_poly = google_res.get("polyline", {}).get("encodedPolyline", "")
        coords = decode_polyline(encoded_poly) if encoded_poly else []
        legs = google_res.get("legs", [])

        # Build stop itinerary with arrival/departure times
        current_time = shift_start_dt
        departure_hq = current_time.strftime("%I:%M %p")

        stops_info = []
        total_service_mins = 0
        total_bags = 0

        for s_idx, hotel in enumerate(stop_points):
            leg_duration_secs = 0
            if s_idx < len(legs):
                dur_str = legs[s_idx].get("duration", "0s").rstrip("s")
                leg_duration_secs = int(float(dur_str))

            arrival_dt = current_time + timedelta(seconds=leg_duration_secs)
            stop_mins = hotel.get("stop_mins", 21)
            departure_dt = arrival_dt + timedelta(minutes=stop_mins)
            current_time = departure_dt

            load_bags = hotel.get("load", 3)
            total_service_mins += stop_mins
            total_bags += load_bags

            arr_str = arrival_dt.strftime("%I:%M %p")
            dep_str = departure_dt.strftime("%I:%M %p")

            stops_info.append({
                "stop_number": s_idx + 1,
                "hotel_id": hotel["id"],
                "name": hotel["name"],
                "lat": hotel["lat"],
                "lon": hotel["lon"],
                "region": hotel["region"],
                "arrival_time": arr_str,
                "departure_time": dep_str,
                "stop_mins": stop_mins,
                "load_bags": load_bags
            })

            manifest_rows.append({
                "Route ID": r_conf["id"],
                "Route Name": r_conf["name"],
                "Stop": s_idx + 1,
                "Hotel ID": hotel["id"],
                "Hotel Name": hotel["name"],
                "Arrival Time": arr_str,
                "Departure Time": dep_str,
                "Service Mins": stop_mins,
                "Bags": load_bags,
                "Latitude": hotel["lat"],
                "Longitude": hotel["lon"],
                "Region": f"R{hotel['region']}"
            })

        # Return to HQ leg
        final_leg_duration_secs = 0
        if len(legs) > len(stop_points):
            dur_str = legs[-1].get("duration", "0s").rstrip("s")
            final_leg_duration_secs = int(float(dur_str))
        return_dt = current_time + timedelta(seconds=final_leg_duration_secs)
        return_hq = return_dt.strftime("%I:%M %p")

        total_drive_mins = round(sum(int(float(l.get("duration", "0s").rstrip("s"))) for l in legs) / 60.0)
        util_pct = round((total_bags / r_conf["max_load"]) * 100.0, 1)

        print(f"  -> Distance: {total_dist_km} km | Drive: {total_drive_mins}m | Shift: {departure_hq} -> {return_hq} | Bags: {total_bags}/{r_conf['max_load']}")

        processed_routes.append({
            "route_id": r_conf["id"],
            "route_key": r_conf["route_key"],
            "vehicle_label": r_conf["name"],
            "color": r_conf["color"],
            "nominal_cap": r_conf["nominal_cap"],
            "max_load": r_conf["max_load"],
            "departure_hq": departure_hq,
            "return_hq": return_hq,
            "total_hotels": len(stops_info),
            "total_dist_km": total_dist_km,
            "total_drive_mins": total_drive_mins,
            "total_service_mins": total_service_mins,
            "total_bags": total_bags,
            "capacity_utilization_pct": util_pct,
            "stops": stops_info,
            "path_coordinates": coords
        })

    # Save data/manual_routes.json
    with open("data/manual_routes.json", "w") as f:
        json.dump(processed_routes, f, indent=2)
    print("\n✅ Saved data/manual_routes.json")

    # Save data/manual_dispatch_manifest.csv
    manifest_df = pd.DataFrame(manifest_rows)
    manifest_df.to_csv("data/manual_dispatch_manifest.csv", index=False)
    print("✅ Saved data/manual_dispatch_manifest.csv")

    # Generate Folium Map overlaying manual routes onto region map
    build_folium_region_map(processed_routes)

def build_folium_region_map(routes):
    print("\n" + "=" * 85)
    print("BUILDING INTERACTIVE REGION MAP WITH MANUAL ROUTES OVERLAY")
    print("=" * 85)

    # 1. Base map centered on Bangalore
    m = folium.Map(
        location=[12.9716, 77.5946],
        zoom_start=11,
        tiles="OpenStreetMap",
        control_scale=True
    )

    # 2. Add BBMP Boundary
    bbmp_path = "data/bbmp_boundary.json"
    if os.path.exists(bbmp_path):
        with open(bbmp_path) as f:
            bbmp_geo = json.load(f)
        folium.GeoJson(
            bbmp_geo,
            name="BBMP City Boundary",
            style_function=lambda x: {
                "fillColor": "#000000",
                "fillOpacity": 0.02,
                "color": "#475569",
                "weight": 1.8,
                "dashArray": "5, 5"
            }
        ).add_to(m)

    # 3. Add 5 Operational Regions & H3 Hexagons
    region_colors = {
        0: "#dc2626",  # R0 South-East
        1: "#2563eb",  # R1 Central
        2: "#0d9488",  # R2 North & West
        3: "#16a34a",  # R3 East
        4: "#d97706"   # R4 South
    }
    region_names = {
        0: "R0 South-East (E-City, Sarjapur)",
        1: "R1 Central CBD & Indiranagar",
        2: "R2 North & West (Hebbal, Peenya)",
        3: "R3 East (Whitefield)",
        4: "R4 South (Jayanagar, Bannerghatta)"
    }

    import h3
    hex_map_path = "data/hex_map.json"
    if os.path.exists(hex_map_path):
        with open(hex_map_path) as f:
            hex_map = json.load(f)

        regions_group = folium.FeatureGroup(name="5 Operational Regions (H3 Hex Grid)", show=True)
        for h_id, reg_id in hex_map.items():
            boundary = h3.cell_to_boundary(h_id)
            color = region_colors.get(reg_id, "#64748b")
            r_name = region_names.get(reg_id, f"Region {reg_id}")
            folium.Polygon(
                locations=boundary,
                color=color,
                weight=1,
                fill=True,
                fill_color=color,
                fill_opacity=0.15,
                tooltip=f"<b>{r_name}</b><br>Hex: {h_id}"
            ).add_to(regions_group)
        regions_group.add_to(m)

    # 4. LinenGrass HQ Depot Marker
    depot_html = f"""
    <div style="background:#111827; color:#fff; border:2px solid #fbbf24; border-radius:50%; width:34px; height:34px; display:flex; align-items:center; justify-content:center; font-weight:bold; font-size:11px; box-shadow:0 3px 8px rgba(0,0,0,0.4);">
      HQ
    </div>
    """
    folium.Marker(
        location=[DEPOT["lat"], DEPOT["lon"]],
        icon=folium.DivIcon(html=depot_html, icon_size=(34, 34), icon_anchor=(17, 17)),
        tooltip=f"🏭 <b>{DEPOT_NAME}</b><br>All 8 manual routes depart & return here",
        popup=f"<b>{DEPOT_NAME}</b><br>Central Laundry Dispatch Depot"
    ).add_to(m)

    # 5. Add each of the 8 Manual Routes with exact road polylines and numbered stops
    for r in routes:
        r_group = folium.FeatureGroup(
            name=f"🚐 {r['vehicle_label']} ({r['total_dist_km']} km, {r['total_hotels']} stops)",
            show=True
        )

        # Road Polyline
        if r["path_coordinates"]:
            folium.PolyLine(
                locations=r["path_coordinates"],
                color=r["color"],
                weight=4.5,
                opacity=0.85,
                tooltip=f"<b>{r['vehicle_label']}</b><br>Distance: {r['total_dist_km']} km | Drive: {r['total_drive_mins']} mins<br>Shift: {r['departure_hq']} ➔ {r['return_hq']}"
            ).add_to(r_group)

        # Numbered Stop Badges
        for s in r["stops"]:
            stop_badge_html = f"""
            <div style="background:{r['color']}; color:#ffffff; border:1.5px solid #ffffff; border-radius:50%; width:22px; height:22px; display:flex; align-items:center; justify-content:center; font-weight:bold; font-size:10px; box-shadow:0 2px 4px rgba(0,0,0,0.35);">
              {s['stop_number']}
            </div>
            """
            folium.Marker(
                location=[s["lat"], s["lon"]],
                icon=folium.DivIcon(html=stop_badge_html, icon_size=(22, 22), icon_anchor=(11, 11)),
                tooltip=f"<b>#{s['stop_number']} {s['name']}</b><br>{r['vehicle_label']}<br>Arr: {s['arrival_time']} | Dep: {s['departure_time']}<br>Load: {s['load_bags']} bags | Stop: {s['stop_mins']}m",
                popup=f"""
                <div style="font-family:sans-serif; min-width:180px;">
                  <b style="color:{r['color']}">{r['vehicle_label']}</b><br>
                  <b>Stop #{s['stop_number']}: {s['name']}</b><br>
                  <hr style="margin:6px 0; border:none; border-top:1px solid #e2e8f0;">
                  ⏰ <b>Arrival:</b> {s['arrival_time']}<br>
                  ⏱️ <b>Departure:</b> {s['departure_time']}<br>
                  🧺 <b>Load:</b> {s['load_bags']} bags<br>
                  ⏳ <b>Service Duration:</b> {s['stop_mins']} mins<br>
                  📍 <b>Region:</b> R{s['region']}
                </div>
                """
            ).add_to(r_group)

        r_group.add_to(m)

    # 6. Add Layer Control & Fullscreen
    folium.LayerControl(position="topright", collapsed=False).add_to(m)
    plugins.Fullscreen(position="topleft").add_to(m)

    out_html = "manual_routes_region_map.html"
    m.save(out_html)
    print(f"✅ Generated standalone interactive map: {out_html}")

if __name__ == "__main__":
    main()
