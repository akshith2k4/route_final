import json
import os
import sys
import urllib.request
import urllib.error
from datetime import datetime, timedelta, timezone
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

def format_ist(utc_iso_string):
    if not utc_iso_string:
        return "N/A"
    dt = datetime.fromisoformat(utc_iso_string.replace("Z", "+00:00")).astimezone(IST)
    return dt.strftime("%I:%M %p")

def run():
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

    print("Running Google Route Optimization with FASTEST TURNAROUND OBJECTIVE:")
    print(" - costPerHour: 1000.0 (aggressive penalty on shift duration / late return)")
    print(" - costPerTraveledHour: 500.0 (penalty on slow traffic crawling)")
    print(" - costPerKilometer: 1.0 (negligible penalty on distance, prioritize speed over distance)")
    print("=" * 85)

    fastest_routes = []

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
                # FASTEST TURNAROUND OBJECTIVE WEIGHTS:
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
            "populatePolylines": False,
            "populateTransitionPolylines": False,
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

        for r in result.get("routes", []):
            v_label = r.get("vehicleLabel", "Van")
            dep_time_ist = format_ist(r.get("vehicleStartTime"))
            ret_time_ist = format_ist(r.get("vehicleEndTime"))
            total_dist_km = sum(t.get("travelDistanceMeters", 0) for t in r.get("transitions", [])) / 1000.0
            total_drive_secs = sum(float(t.get("travelDuration", "0s").rstrip("s")) for t in r.get("transitions", []))
            
            # calculate shift span in minutes
            dt_start = datetime.fromisoformat(r.get("vehicleStartTime").replace("Z", "+00:00"))
            dt_end = datetime.fromisoformat(r.get("vehicleEndTime").replace("Z", "+00:00"))
            shift_span_mins = int(round((dt_end - dt_start).total_seconds() / 60.0))
            
            visits = r.get("visits", [])
            total_bags = 0
            for v in visits:
                s_idx = v.get("shipmentIndex", 0)
                h_name = shipments[s_idx]["label"]
                orig_h = next(h for h in reg_hotels if h["name"] == h_name)
                total_bags += orig_h["load"]

            fastest_routes.append({
                "region_id": reg_id,
                "vehicle_label": v_label,
                "dep": dep_time_ist,
                "ret": ret_time_ist,
                "shift_span_mins": shift_span_mins,
                "dist_km": round(total_dist_km, 1),
                "drive_mins": int(round(total_drive_secs / 60.0)),
                "stops": len(visits),
                "bags": total_bags
            })

    print("\nRESULTS WITH FASTEST TURNAROUND:")
    print("-" * 85)
    tot_km = sum(r["dist_km"] for r in fastest_routes)
    tot_drive = sum(r["drive_mins"] for r in fastest_routes)
    tot_shift = sum(r["shift_span_mins"] for r in fastest_routes)
    print(f"Total Dispatched: {len(fastest_routes)} vans")
    print(f"Total Road Distance: {tot_km:.1f} km")
    print(f"Total Drive Time: {tot_drive} mins ({tot_drive/60:.1f} hrs)")
    print(f"Total Shift Span: {tot_shift} mins ({tot_shift/60:.1f} hrs)")
    print("-" * 85)
    for r in fastest_routes:
        print(f"{r['vehicle_label'][:45]:45} | Dep: {r['dep']} | Ret: {r['ret']} ({r['shift_span_mins']:3d}m) | Dist: {r['dist_km']:5.1f}km | Drive: {r['drive_mins']:3d}m | Stops: {r['stops']:2d}")

if __name__ == "__main__":
    run()
