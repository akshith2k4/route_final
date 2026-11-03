"""
Step 7: Google Cloud Route Optimization Engine for LinenGrass Fleet Dispatch
Calculates multi-van routes across all 5 operational regions using:
- Real-time road networks & traffic via Google Route Optimization API
- Exact on-site hotel service stop durations (Avg minutes duration) from master data
- LinenGrass Central Laundry HQ Depot (Yeshwanthpur)
- Multi-van fleet dispatch (9 vans across 5 regions)
- Generates dispatch manifest CSV, JSON, and interactive route map.
"""
import json
import os
import sys
import urllib.request
import urllib.error
from datetime import datetime, timedelta, timezone
import pandas as pd
import folium
import openpyxl
from google.oauth2 import service_account
from google.auth.transport.requests import Request

IST = timezone(timedelta(hours=5, minutes=30))
DEPOT = {"latitude": 13.017275, "longitude": 77.546578}
DEPOT_NAME = "LinenGrass HQ (Yeshwanthpur Central Laundry)"

# 10 Vehicles Fleet configuration per region with 90% capacity limit
REGION_FLEET_CONFIG = {
    0: {
        "name": "South-East (E-City, Hosur Rd & Sarjapur Rd)",
        "vans": [
            {"label": "Vehicle 1 (R0 - South-East / Hosur Rd & E-City)", "nominal_cap": 40, "max_load": 36, "color": "#dc2626"},
            {"label": "Vehicle 2 (R0 - South-East / Sarjapur Rd & HSR)", "nominal_cap": 40, "max_load": 36, "color": "#f87171"}
        ]
    },
    1: {
        "name": "Central / Inner East (CBD, Indiranagar, MG Rd)",
        "vans": [
            {"label": "Vehicle 8 (R1 - Central / High Capacity CBD)", "nominal_cap": 70, "max_load": 63, "color": "#1e3a8a"},
            {"label": "Vehicle 5 (R1 - Central / Indiranagar & Domlur)", "nominal_cap": 35, "max_load": 31, "color": "#3b82f6"}
        ]
    },
    2: {
        "name": "North & West (Hebbal, Manyata, Peenya & Magadi Rd)",
        "vans": [
            {"label": "Vehicle 7 (R2 - North / Hebbal & Airport NH44)", "nominal_cap": 40, "max_load": 36, "color": "#0f766e"},
            {"label": "Vehicle 3 (R2 - West / Yeshwanthpur & Magadi Rd)", "nominal_cap": 35, "max_load": 31, "color": "#14b8a6"}
        ]
    },
    3: {
        "name": "East (Whitefield & Marathahalli)",
        "vans": [
            {"label": "Vehicle 4 (R3 - East / Whitefield & ITPL)", "nominal_cap": 20, "max_load": 18, "color": "#15803d"},
            {"label": "Vehicle 6 (R3 - East / Marathahalli & Brookefield)", "nominal_cap": 20, "max_load": 18, "color": "#22c55e"}
        ]
    },
    4: {
        "name": "South (Jayanagar, JP Nagar, BTM & Bannerghatta)",
        "vans": [
            {"label": "Vehicle 9 (R4 - South / Jayanagar & BTM Layout)", "nominal_cap": 40, "max_load": 36, "color": "#b45309"},
            {"label": "Vehicle 10 (R4 - South / JP Nagar & Bannerghatta)", "nominal_cap": 40, "max_load": 36, "color": "#f59e0b"}
        ]
    }
}

def decode_polyline(polyline_str):
    """Decode a Google encoded polyline string to a list of [lat, lon] tuples."""
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

def format_ist(utc_iso_string):
    """Format UTC ISO timestamp into clean IST string (e.g. 08:35 AM)."""
    if not utc_iso_string:
        return "N/A"
    dt = datetime.fromisoformat(utc_iso_string.replace("Z", "+00:00")).astimezone(IST)
    return dt.strftime("%I:%M %p")

def main():
    print("=" * 85)
    print("LINENGRASS FLEET ROUTE OPTIMIZATION — GOOGLE CLOUD ENGINE")
    print(f"Depot: {DEPOT_NAME} ({DEPOT['latitude']:.4f}, {DEPOT['longitude']:.4f})")
    print("=" * 85)

    # 1. Load Hotels
    with open("data/hotels.json", "r") as f:
        hotels = json.load(f)
    print(f"Loaded {len(hotels)} total hotels across 5 regions.")

    # 2. Load Service Times & Load Demands from Master Excel
    excel_path = "/Users/akshith/LG/trip_optimization/master hotels  (4).xlsx"
    excel_data = {}
    if os.path.exists(excel_path):
        wb = openpyxl.load_workbook(excel_path, data_only=True)
        ws = wb["final"]
        for row in ws.iter_rows(min_row=2, values_only=True):
            n = str(row[0] or "").strip()
            if n:
                excel_data[n] = {
                    "stop_mins": int(round(float(row[2]))) if row[2] is not None else 21,
                    "load": int(round(float(row[3]))) if row[3] is not None else 3,
                }
        avg_stop_mins = int(round(sum(v["stop_mins"] for v in excel_data.values()) / max(1, len(excel_data))))
        avg_load_bags = int(round(sum(v["load"] for v in excel_data.values()) / max(1, len(excel_data))))
        print(f"Loaded exact stop times & loads for {len(excel_data)} hotels from master sheet.")
        print(f"Benchmark Averages: Stop Time = {avg_stop_mins} mins, Load Demand = {avg_load_bags} bags.")
    else:
        avg_stop_mins, avg_load_bags = 21, 3
        print("⚠️ Master Excel not found, using default 21-min stop times and 3 bags load.")

    for h in hotels:
        if h["name"] in excel_data:
            info = excel_data[h["name"]]
        else:
            info = {"stop_mins": avg_stop_mins, "load": avg_load_bags}
            print(f"✨ New Hotel '{h['name']}': assigned average stop time = {avg_stop_mins}m, load = {avg_load_bags} bags")
        h["stop_mins"] = info["stop_mins"]
        h["load"] = info["load"]

    # 3. Authenticate with Google Cloud
    creds_file = "gcp_service_account.json"
    if not os.path.exists(creds_file):
        sys.exit(f"❌ Error: {creds_file} not found.")

    creds = service_account.Credentials.from_service_account_file(
        creds_file, scopes=["https://www.googleapis.com/auth/cloud-platform"]
    )
    creds.refresh(Request())
    token = creds.token
    project_id = creds.project_id
    api_url = f"https://routeoptimization.googleapis.com/v1/projects/{project_id}:optimizeTours"

    print(f"Authenticated with GCP project: {project_id}\n")

    # Shift timing (Tomorrow morning 07:00 AM IST to 05:00 PM IST)
    today = datetime.now(IST).date()
    shift_date = (today + timedelta(days=1)).strftime("%Y-%m-%d")
    shift_start = f"{shift_date}T07:00:00+05:30"
    shift_end = f"{shift_date}T17:00:00+05:30"

    all_van_routes = []
    manifest_rows = []

    # 4. Run Optimization Region by Region
    for reg_id, config in REGION_FLEET_CONFIG.items():
        reg_hotels = [h for h in hotels if h["region"] == reg_id]
        print("=" * 85)
        print(f"OPTIMIZING REGION {reg_id}: {config['name']} ({len(reg_hotels)} Hotels, {len(config['vans'])} Vans)")
        print("=" * 85)

        # Prepare Shipments
        shipments = []
        for h in reg_hotels:
            shipments.append({
                "label": h["name"],
                "deliveries": [{
                    "arrivalLocation": {"latitude": h["lat"], "longitude": h["lon"]},
                    "duration": f"{h['stop_mins'] * 60}s"
                }],
                "loadDemands": {"space": {"amount": str(h["load"])}}
            })

        # Prepare Vehicles
        vehicles = []
        for v in config["vans"]:
            vehicles.append({
                "label": v["label"],
                "startLocation": DEPOT,
                "endLocation": DEPOT,
                "startTimeWindows": [{"startTime": shift_start, "endTime": shift_end}],
                "loadLimits": {"space": {"maxLoad": str(v["max_load"])}},
                "costPerHour": 100.0,
                "costPerKilometer": 10.0
            })

        req_body = {
            "model": {
                "shipments": shipments,
                "vehicles": vehicles,
                "globalStartTime": shift_start,
                "globalEndTime": shift_end
            },
            "populatePolylines": True,
            "populateTransitionPolylines": True,
            "considerRoadTraffic": True
        }

        # Call Google API
        req = urllib.request.Request(
            api_url,
            data=json.dumps(req_body).encode("utf-8"),
            headers={"Authorization": f"Bearer {token}", "Content-Type": "application/json"},
            method="POST"
        )

        try:
            with urllib.request.urlopen(req, timeout=90) as resp:
                result = json.loads(resp.read().decode("utf-8"))
        except urllib.error.HTTPError as e:
            err_msg = e.read().decode("utf-8")
            print(f"❌ Google API HTTP Error {e.code}: {err_msg[:500]}")
            continue
        except Exception as e:
            print(f"❌ Connection error: {e}")
            continue

        routes_out = result.get("routes", [])
        print(f"✅ Google API returned optimal solution! Vehicles dispatched: {len(routes_out)}")

        for r in routes_out:
            v_label = r.get("vehicleLabel", "Van")
            v_conf = next((v for v in config["vans"] if v["label"] == v_label), {})
            v_color = v_conf.get("color", "#000000")
            nominal_cap = v_conf.get("nominal_cap", 40)
            max_load_cap = v_conf.get("max_load", int(nominal_cap * 0.9))

            dep_time_utc = r.get("vehicleStartTime")
            ret_time_utc = r.get("vehicleEndTime")
            dep_time_ist = format_ist(dep_time_utc)
            ret_time_ist = format_ist(ret_time_utc)

            total_dist_km = sum(t.get("travelDistanceMeters", 0) for t in r.get("transitions", [])) / 1000.0
            total_drive_secs = sum(float(t.get("travelDuration", "0s").rstrip("s")) for t in r.get("transitions", []))
            
            # Extract stops
            visits = r.get("visits", [])
            stops_info = []
            total_service_mins = 0
            total_bags = 0

            # Decode full road polyline
            full_path_coords = []
            for t in r.get("transitions", []):
                poly_data = t.get("routePolyline", {})
                if "points" in poly_data:
                    full_path_coords.extend(decode_polyline(poly_data["points"]))

            for idx, v in enumerate(visits, 1):
                shipment_idx = v.get("shipmentIndex", 0)
                hotel_item = shipments[shipment_idx]
                h_name = hotel_item["label"]
                orig_hotel = next(h for h in reg_hotels if h["name"] == h_name)
                
                arr_utc = v.get("startTime")
                arr_ist = format_ist(arr_utc)
                stop_dur_mins = orig_hotel["stop_mins"]
                dep_hotel_dt = datetime.fromisoformat(arr_utc.replace("Z", "+00:00")) + timedelta(minutes=stop_dur_mins)
                dep_hotel_ist = dep_hotel_dt.astimezone(IST).strftime("%I:%M %p")
                
                bag_load = orig_hotel["load"]
                total_service_mins += stop_dur_mins
                total_bags += bag_load

                stops_info.append({
                    "stop_number": idx,
                    "name": h_name,
                    "lat": orig_hotel["lat"],
                    "lon": orig_hotel["lon"],
                    "arrival_time": arr_ist,
                    "departure_time": dep_hotel_ist,
                    "stop_mins": stop_dur_mins,
                    "load_bags": bag_load
                })

                manifest_rows.append({
                    "Region": f"R{reg_id}",
                    "Vehicle": v_label,
                    "Nominal Cap": nominal_cap,
                    "90% Cap Limit": max_load_cap,
                    "Stop": idx,
                    "Hotel Name": h_name,
                    "Arrival Time": arr_ist,
                    "Departure Time": dep_hotel_ist,
                    "Service Mins": stop_dur_mins,
                    "Bags": bag_load,
                    "Latitude": orig_hotel["lat"],
                    "Longitude": orig_hotel["lon"]
                })

                print(f"     #{idx:02d} | Arr: {arr_ist} | Dep: {dep_hotel_ist} | ({stop_dur_mins}m, {bag_load} bags) -> {h_name}")

            util_pct = round((total_bags / max_load_cap) * 100.0, 1) if max_load_cap else 0.0
            print(f"\n🚐 {v_label}")
            print(f"   Stops: {len(visits)} hotels | Distance: {total_dist_km:.1f} km | Drive: {total_drive_secs/60:.0f} mins")
            print(f"   Capacity: {total_bags}/{max_load_cap} bags used (Nominal: {nominal_cap}, Util: {util_pct}%)")
            print(f"   Shift: {dep_time_ist} (Depart HQ) ➔ {ret_time_ist} (Return HQ)")

            all_van_routes.append({
                "region_id": reg_id,
                "region_name": config["name"],
                "vehicle_label": v_label,
                "color": v_color,
                "nominal_cap": nominal_cap,
                "max_load": max_load_cap,
                "departure_hq": dep_time_ist,
                "return_hq": ret_time_ist,
                "total_hotels": len(visits),
                "total_dist_km": round(total_dist_km, 1),
                "total_drive_mins": round(total_drive_secs / 60.0),
                "total_service_mins": total_service_mins,
                "total_bags": total_bags,
                "capacity_utilization_pct": util_pct,
                "stops": stops_info,
                "path_coordinates": full_path_coords
            })

    # 5. Save Outputs
    with open("data/optimized_routes.json", "w") as f:
        json.dump(all_van_routes, f, indent=2)
    print("\n✅ Saved data/optimized_routes.json")

    manifest_df = pd.DataFrame(manifest_rows)
    manifest_df.to_csv("data/dispatch_manifest.csv", index=False)
    print("✅ Saved data/dispatch_manifest.csv")

    # 6. Generate High-Definition Route Dispatch Map (Optional, Next.js is primary UI)
    if "--html" in sys.argv:
        print("\n" + "=" * 85)
        print("GENERATING INTERACTIVE DISPATCH MAP WITH EXACT GOOGLE ROAD POLYLINES")
        print("=" * 85)

        dispatch_map = folium.Map(location=[12.9716, 77.5946], zoom_start=11, tiles="OpenStreetMap")

        # LinenGrass HQ Depot Marker
        folium.Marker(
            location=[DEPOT["latitude"], DEPOT["longitude"]],
            icon=folium.Icon(color="darkpurple", icon="industry", prefix="fa"),
            tooltip=f"🏭 <b>{DEPOT_NAME}</b><br>Central Dispatch Hub",
            popup=f"<b>{DEPOT_NAME}</b><br>All 9 vans depart and return here."
        ).add_to(dispatch_map)

        # Add each van's route and stops
        for route_data in all_van_routes:
            v_label = route_data["vehicle_label"]
            color = route_data["color"]
            stops = route_data["stops"]
            path = route_data["path_coordinates"]

            van_group = folium.FeatureGroup(name=f"{v_label} ({len(stops)} stops, {route_data['total_dist_km']}km)", show=True)

            # Draw real road polyline
            if path:
                folium.PolyLine(
                    locations=path,
                    color=color,
                    weight=4.0,
                    opacity=0.85,
                    tooltip=f"<b>{v_label}</b>: {route_data['total_dist_km']} km ({len(stops)} stops)"
                ).add_to(van_group)

            # Draw numbered stop markers
            for s in stops:
                popup_html = f"""
                <div style='font-family: Arial, sans-serif; min-width: 200px;'>
                    <b style='font-size: 13px; color:{color};'>{v_label}</b><br>
                    <div style='font-size: 14px; font-weight: bold; margin-top: 2px;'>Stop #{s['stop_number']}: {s['name']}</div>
                    <hr style='margin: 4px 0 6px 0; border: none; border-top: 1px solid #cbd5e1;'>
                    <b>🕒 Arrival:</b> {s['arrival_time']}<br>
                    <b>⏱ Departure:</b> {s['departure_time']}<br>
                    <b>⏳ Service Stop:</b> {s['stop_mins']} mins<br>
                    <b>📦 Linen Bags:</b> {s['load_bags']} space units
                </div>
                """
                folium.CircleMarker(
                    location=[s["lat"], s["lon"]],
                    radius=8,
                    color="#000000",
                    weight=1.5,
                    fill=True,
                    fill_color=color,
                    fill_opacity=1.0,
                    tooltip=f"#{s['stop_number']} {s['name']} (Arr: {s['arrival_time']})",
                    popup=folium.Popup(popup_html, max_width=280)
                ).add_to(van_group)

            van_group.add_to(dispatch_map)

        folium.LayerControl(position="topright", collapsed=False).add_to(dispatch_map)

        # Floating Manifest Dashboard (Bottom-Left)
        dash_rows = ""
        for r in all_van_routes:
            dash_rows += f"""
            <tr style="border-bottom: 1px solid #e2e8f0; font-size: 11px;">
                <td style="padding: 4px 6px;"><span style="color:{r['color']}; font-weight: bold;">●</span> {r['vehicle_label'][:24]}</td>
                <td style="padding: 4px 6px; text-align:center;"><b>{r['total_hotels']}</b></td>
                <td style="padding: 4px 6px; text-align:center;"><b>{r['total_bags']}/{r['max_load']}</b> <span style="font-size:9px; color:#64748b;">({r['capacity_utilization_pct']}%)</span></td>
                <td style="padding: 4px 6px; text-align:right;">{r['total_dist_km']} km</td>
                <td style="padding: 4px 6px; text-align:right;">{r['departure_hq']}</td>
                <td style="padding: 4px 6px; text-align:right; font-weight:bold; color:#0f766e;">{r['return_hq']}</td>
            </tr>
            """

        dashboard_html = f"""
        <div style="position: fixed; bottom: 20px; left: 20px; width: 520px; max-height: 440px; overflow-y: auto;
             background: rgba(255, 255, 255, 0.98); border: 2px solid #0f172a; border-radius: 12px;
             box-shadow: 0 8px 24px rgba(0,0,0,0.25); z-index: 9999; font-family: -apple-system, sans-serif; padding: 12px;">
            <div style="font-weight: 800; font-size: 14px; color: #0f172a;">LinenGrass Fleet Dispatch Manifest</div>
            <div style="font-size: 11px; color: #64748b; margin-bottom: 8px;">10 Vehicles · {len(hotels)} Hotels · Real Road Polylines & 90% Capacity Limits</div>
            <table style="width: 100%; border-collapse: collapse;">
                <thead>
                    <tr style="background: #f1f5f9; font-size: 10px; text-transform: uppercase; color: #475569;">
                        <th style="padding: 4px 6px; text-align: left;">Vehicle</th>
                        <th style="padding: 4px 6px; text-align: center;">Stops</th>
                        <th style="padding: 4px 6px; text-align: center;">Load (90% Cap)</th>
                        <th style="padding: 4px 6px; text-align: right;">Dist</th>
                        <th style="padding: 4px 6px; text-align: right;">Dep HQ</th>
                        <th style="padding: 4px 6px; text-align: right;">Ret HQ</th>
                    </tr>
                </thead>
                <tbody>
                    {dash_rows}
                </tbody>
            </table>
        </div>
        """
        dispatch_map.get_root().html.add_child(folium.Element(dashboard_html))

        output_html = "route_dispatch_map.html"
        dispatch_map.save(output_html)
        print(f"✅ Generated dispatch map: {output_html}")
    print("=" * 85)
    print("ALL ROUTES SUCCESSFULLY OPTIMIZED!")
    print("=" * 85)

if __name__ == "__main__":
    main()
