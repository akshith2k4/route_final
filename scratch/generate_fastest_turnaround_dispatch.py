"""
Generate Fastest Turnaround Dispatch Routes with Google Cloud Route Optimization API
Exact road polylines, traffic conditions, and IST arrival/departure times.
"""
import json
import os
import sys
import urllib.request
import urllib.error
from datetime import datetime, timedelta, timezone
import pandas as pd
import openpyxl
from google.oauth2 import service_account
from google.auth.transport.requests import Request

IST = timezone(timedelta(hours=5, minutes=30))
DEPOT = {"latitude": 13.017275, "longitude": 77.546578}
DEPOT_NAME = "LinenGrass HQ (Yeshwanthpur Central Laundry)"

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
    if not utc_iso_string:
        return "N/A"
    dt = datetime.fromisoformat(utc_iso_string.replace("Z", "+00:00")).astimezone(IST)
    return dt.strftime("%I:%M %p")

def main():
    print("=" * 85)
    print("GENERATING FASTEST TURNAROUND FLEET DISPATCH — GOOGLE CLOUD")
    print(f"Depot: {DEPOT_NAME}")
    print("Objective: FASTEST TURNAROUND (costPerHour: 1000, costPerTraveledHour: 500, costPerKm: 1)")
    print("=" * 85)

    with open("data/hotels.json") as f:
        hotels = json.load(f)

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
    for h in hotels:
        info = excel_data.get(h["name"], {"stop_mins": 21, "load": 3})
        h["stop_mins"] = info["stop_mins"]
        h["load"] = info["load"]

    creds_file = "gcp_service_account.json"
    creds = service_account.Credentials.from_service_account_file(
        creds_file, scopes=["https://www.googleapis.com/auth/cloud-platform"]
    )
    creds.refresh(Request())
    token = creds.token
    project_id = creds.project_id
    api_url = f"https://routeoptimization.googleapis.com/v1/projects/{project_id}:optimizeTours"

    today = datetime.now(IST).date()
    shift_date = (today + timedelta(days=1)).strftime("%Y-%m-%d")
    shift_start = f"{shift_date}T07:00:00+05:30"
    shift_end = f"{shift_date}T17:00:00+05:30"

    all_van_routes = []
    manifest_rows = []

    raw_google_responses = {}

    for reg_id, config in REGION_FLEET_CONFIG.items():
        reg_hotels = [h for h in hotels if h["region"] == reg_id]

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

        vehicles = []
        for v in config["vans"]:
            vehicles.append({
                "label": v["label"],
                "startLocation": DEPOT,
                "endLocation": DEPOT,
                "startTimeWindows": [{"startTime": shift_start, "endTime": shift_end}],
                "loadLimits": {"space": {"maxLoad": str(v["max_load"])}},
                "costPerHour": 1000.0,
                "costPerTraveledHour": 500.0,
                "costPerKilometer": 1.0
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

        req = urllib.request.Request(
            api_url,
            data=json.dumps(req_body).encode("utf-8"),
            headers={"Authorization": f"Bearer {token}", "Content-Type": "application/json"},
            method="POST"
        )

        with urllib.request.urlopen(req, timeout=90) as resp:
            result = json.loads(resp.read().decode("utf-8"))

        raw_google_responses[f"Region_{reg_id}_{config['name']}"] = result
        routes_out = result.get("routes", [])

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

            visits = r.get("visits", [])
            stops_info = []
            total_service_mins = 0
            total_bags = 0

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

            util_pct = round((total_bags / max_load_cap) * 100.0, 1) if max_load_cap else 0.0

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

    with open("data/optimized_routes_fastest.json", "w") as f:
        json.dump(all_van_routes, f, indent=2)
    print("✅ Saved data/optimized_routes_fastest.json")

    with open("data/google_raw_solution_fastest.json", "w") as f:
        json.dump(raw_google_responses, f, indent=2)
    print("✅ Saved data/google_raw_solution_fastest.json")

    manifest_df = pd.DataFrame(manifest_rows)
    manifest_df.to_csv("data/dispatch_manifest_fastest.csv", index=False)
    print("✅ Saved data/dispatch_manifest_fastest.csv")

if __name__ == "__main__":
    main()
