"""
Step 8: Generate Unified Route Dispatch & Operational Regions Interactive Map
Combines:
- 5 Operational Regions (189 H3 Hexagons & Solid Dissolved Borders)
- 10-Vehicle Turn-by-Turn Road Polylines from Google Route Optimization API
- 102 Numbered Hotel Stop Markers with exact ETAs, stop durations & bag loads
- LinenGrass HQ Central Laundry Depot (Yeshwanthpur)
- Interactive Feature Toggles:
  - Toggle Regions (Hexagons) ON/OFF
  - Toggle Region Outer Borders ON/OFF
  - Toggle Route Polylines ON/OFF
  - Toggle Hotel Stop Badges ON/OFF
  - Toggle Depot Hub ON/OFF
  - Toggle BBMP Boundary ON/OFF
  - Filter by Region (All, R0, R1, R2, R3, R4)
  - Individual Vehicle ON/OFF Toggles
  - Collapsible Manifest Drawer with vehicle zoom/focus
"""
import json
import os
import h3
import geopandas as gpd
from shapely.geometry import Polygon, mapping
from shapely.ops import unary_union

DEPOT = {"latitude": 13.017275, "longitude": 77.546578, "name": "LinenGrass HQ (Yeshwanthpur Central Laundry)"}

def main():
    print("=" * 80)
    print("BUILDING UNIFIED ROUTE DISPATCH & OPERATIONAL REGIONS INTERACTIVE MAP")
    print("=" * 80)

    # 1. Load Data
    with open("data/hex_map.json", "r") as f:
        hex_map = json.load(f)

    with open("data/region_metadata.json", "r") as f:
        region_metadata = json.load(f)

    with open("data/hotels.json", "r") as f:
        hotels = json.load(f)

    with open("data/optimized_routes.json", "r") as f:
        routes = json.load(f)

    # 2. Build Hexagons GeoJSON
    hex_features = []
    region_hex_polys = {}

    for hex_id, reg_id in hex_map.items():
        boundary = h3.cell_to_boundary(hex_id)  # [(lat, lon), ...]
        coords = [[p[1], p[0]] for p in boundary] # [[lon, lat], ...]
        coords.append(coords[0]) # close ring
        
        poly = Polygon(coords)
        region_hex_polys.setdefault(reg_id, []).append(poly)

        meta = region_metadata.get(str(reg_id), {})
        hex_features.append({
            "type": "Feature",
            "geometry": {
                "type": "Polygon",
                "coordinates": [coords]
            },
            "properties": {
                "hex_id": hex_id,
                "region_id": reg_id,
                "region_name": meta.get("name", f"Region {reg_id}"),
                "region_code": meta.get("code", f"R{reg_id}"),
                "color": meta.get("color", "#64748b"),
                "lotr_route": meta.get("lotr_route", ""),
                "key_areas": meta.get("key_areas", "")
            }
        })

    hex_geojson = {"type": "FeatureCollection", "features": hex_features}
    print(f"✅ Built {len(hex_features)} hexagon features")

    # 3. Build Dissolved Region Boundaries GeoJSON
    boundary_features = []
    for reg_id, polys in region_hex_polys.items():
        merged = unary_union(polys)
        meta = region_metadata.get(str(reg_id), {})
        boundary_features.append({
            "type": "Feature",
            "geometry": mapping(merged),
            "properties": {
                "region_id": reg_id,
                "region_name": meta.get("name", f"Region {reg_id}"),
                "region_code": meta.get("code", f"R{reg_id}"),
                "color": meta.get("color", "#000000")
            }
        })
    boundary_geojson = {"type": "FeatureCollection", "features": boundary_features}
    print(f"✅ Built {len(boundary_features)} dissolved region boundaries")

    # 4. Build BBMP Boundary GeoJSON (Simplified)
    if os.path.exists("bbmp.geojson"):
        gdf = gpd.read_file("bbmp.geojson")
        union_geom = gdf.union_all() if hasattr(gdf, 'union_all') else gdf.unary_union
        simplified = union_geom.simplify(0.001)
        bbmp_geojson = {
            "type": "Feature",
            "geometry": mapping(simplified),
            "properties": {"name": "BBMP Municipal Limit"}
        }
        print("✅ Built simplified BBMP municipal boundary")
    else:
        bbmp_geojson = None

    # 5. Build HTML Page with Leaflet and Rich Controls
    html_content = generate_html_page(
        hex_geojson=hex_geojson,
        boundary_geojson=boundary_geojson,
        bbmp_geojson=bbmp_geojson,
        region_metadata=region_metadata,
        routes=routes,
        hotels=hotels,
        depot=DEPOT
    )

    output_file = "route_dispatch_regions_map.html"
    with open(output_file, "w", encoding="utf-8") as f:
        f.write(html_content)

    print(f"\n✅ Successfully generated unified interactive map: {output_file}")
    print("=" * 80)

def generate_html_page(hex_geojson, boundary_geojson, bbmp_geojson, region_metadata, routes, hotels, depot):
    total_vans = len(routes)
    total_hotels = len(hotels)
    total_bags = sum(r["total_bags"] for r in routes)
    total_max_load = sum(r["max_load"] for r in routes)
    fleet_util = round((total_bags / total_max_load) * 100, 1)
    total_dist = round(sum(r["total_dist_km"] for r in routes), 1)

    hex_json_str = json.dumps(hex_geojson)
    boundary_json_str = json.dumps(boundary_geojson)
    bbmp_json_str = json.dumps(bbmp_geojson) if bbmp_geojson else "null"
    routes_json_str = json.dumps(routes)
    hotels_json_str = json.dumps(hotels)
    meta_json_str = json.dumps(region_metadata)
    depot_json_str = json.dumps(depot)

    return f"""<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>LinenGrass Dispatch & Operational Regions</title>
    <!-- Leaflet CSS & JS -->
    <link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" />
    <script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
    <!-- Google Fonts -->
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
    <link href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&family=JetBrains+Mono:wght@400;500;700&display=swap" rel="stylesheet">
    <style>
        :root {{
            --bg-glass: rgba(255, 255, 255, 0.94);
            --bg-glass-dark: rgba(15, 23, 42, 0.92);
            --border-glass: rgba(226, 232, 240, 0.9);
            --text-primary: #0f172a;
            --text-secondary: #475569;
            --text-muted: #94a3b8;
            --accent-green: #10b981;
            --accent-blue: #3b82f6;
            --shadow-subtle: 0 4px 16px -1px rgba(0, 0, 0, 0.1), 0 2px 6px -1px rgba(0, 0, 0, 0.06);
            --shadow-float: 0 16px 36px -4px rgba(15, 23, 42, 0.18), 0 6px 12px -2px rgba(15, 23, 42, 0.08);
        }}

        * {{
            box-sizing: border-box;
            margin: 0;
            padding: 0;
        }}

        body {{
            font-family: 'Plus Jakarta Sans', -apple-system, BlinkMacSystemFont, sans-serif;
            color: var(--text-primary);
            background: #0f172a;
            height: 100vh;
            width: 100vw;
            overflow: hidden;
        }}

        #map {{
            height: 100vh;
            width: 100vw;
            z-index: 1;
        }}

        /* TOP NAVIGATION / STATUS BAR */
        .top-navbar {{
            position: fixed;
            top: 16px;
            left: 20px;
            right: 20px;
            height: 58px;
            background: var(--bg-glass);
            backdrop-filter: blur(16px);
            -webkit-backdrop-filter: blur(16px);
            border: 1px solid var(--border-glass);
            border-radius: 16px;
            box-shadow: var(--shadow-float);
            z-index: 1000;
            display: flex;
            align-items: center;
            justify-content: space-between;
            padding: 0 20px;
        }}

        .brand-cluster {{
            display: flex;
            align-items: center;
            gap: 12px;
        }}

        .brand-badge {{
            background: linear-gradient(135deg, #0f766e, #047857);
            color: white;
            font-size: 14px;
            font-weight: 800;
            padding: 6px 12px;
            border-radius: 10px;
            display: flex;
            align-items: center;
            gap: 6px;
            letter-spacing: -0.3px;
        }}

        .brand-title {{
            font-size: 14px;
            font-weight: 800;
            color: #0f172a;
            letter-spacing: -0.2px;
        }}

        .brand-sub {{
            font-size: 11px;
            color: #64748b;
            font-weight: 500;
        }}

        /* METRICS CHIPS */
        .metrics-strip {{
            display: flex;
            align-items: center;
            gap: 8px;
        }}

        .metric-chip {{
            display: flex;
            align-items: center;
            gap: 6px;
            background: #f8fafc;
            border: 1px solid #e2e8f0;
            padding: 5px 10px;
            border-radius: 8px;
            font-size: 12px;
            font-weight: 600;
            color: #334155;
        }}

        .metric-chip span.val {{
            color: #0f172a;
            font-weight: 800;
        }}

        .metric-chip .indicator {{
            width: 7px;
            height: 7px;
            border-radius: 50%;
            background: var(--accent-green);
        }}

        .nav-actions {{
            display: flex;
            align-items: center;
            gap: 10px;
        }}

        .action-btn {{
            background: #ffffff;
            border: 1px solid #cbd5e1;
            padding: 6px 12px;
            border-radius: 8px;
            font-size: 12px;
            font-weight: 700;
            color: #1e293b;
            cursor: pointer;
            transition: all 0.15s ease;
            display: flex;
            align-items: center;
            gap: 5px;
        }}

        .action-btn:hover {{
            background: #f1f5f9;
            border-color: #94a3b8;
        }}

        /* FLOATING LAYER CONTROL DOCK (TOP-LEFT UNDER NAVBAR) */
        .layer-dock {{
            position: fixed;
            top: 86px;
            left: 20px;
            width: 330px;
            background: var(--bg-glass);
            backdrop-filter: blur(16px);
            -webkit-backdrop-filter: blur(16px);
            border: 1px solid var(--border-glass);
            border-radius: 16px;
            box-shadow: var(--shadow-float);
            z-index: 1000;
            padding: 14px;
        }}

        .dock-header {{
            display: flex;
            align-items: center;
            justify-content: space-between;
            margin-bottom: 12px;
            padding-bottom: 8px;
            border-bottom: 1px solid #e2e8f0;
        }}

        .dock-title {{
            font-size: 13px;
            font-weight: 800;
            color: #0f172a;
            display: flex;
            align-items: center;
            gap: 6px;
            text-transform: uppercase;
            letter-spacing: 0.5px;
        }}

        /* SECTOR SELECTOR PILLS */
        .sector-filter-label {{
            font-size: 11px;
            font-weight: 700;
            color: #64748b;
            margin-bottom: 6px;
            text-transform: uppercase;
        }}

        .sector-pills {{
            display: flex;
            flex-wrap: wrap;
            gap: 5px;
            margin-bottom: 14px;
        }}

        .sector-pill {{
            padding: 4px 9px;
            border-radius: 6px;
            font-size: 11px;
            font-weight: 700;
            border: 1px solid #cbd5e1;
            background: #ffffff;
            color: #334155;
            cursor: pointer;
            transition: all 0.15s ease;
        }}

        .sector-pill:hover {{
            border-color: #0f766e;
            background: #f0fdfa;
        }}

        .sector-pill.active {{
            background: #0f172a;
            color: #ffffff;
            border-color: #0f172a;
        }}

        /* TOGGLE SWITCHES */
        .toggle-group {{
            display: flex;
            flex-direction: column;
            gap: 9px;
        }}

        .toggle-row {{
            display: flex;
            align-items: center;
            justify-content: space-between;
            font-size: 12px;
            font-weight: 600;
            color: #1e293b;
        }}

        .toggle-row span.label {{
            display: flex;
            align-items: center;
            gap: 8px;
        }}

        .toggle-row span.icon {{
            font-size: 13px;
            display: inline-block;
            width: 18px;
            text-align: center;
        }}

        /* SWITCH TOGGLE STYLING */
        .switch {{
            position: relative;
            display: inline-block;
            width: 36px;
            height: 20px;
        }}

        .switch input {{
            opacity: 0;
            width: 0;
            height: 0;
        }}

        .slider {{
            position: absolute;
            cursor: pointer;
            top: 0;
            left: 0;
            right: 0;
            bottom: 0;
            background-color: #cbd5e1;
            transition: .2s;
            border-radius: 20px;
        }}

        .slider:before {{
            position: absolute;
            content: "";
            height: 14px;
            width: 14px;
            left: 3px;
            bottom: 3px;
            background-color: white;
            transition: .2s;
            border-radius: 50%;
            box-shadow: 0 1px 3px rgba(0,0,0,0.3);
        }}

        input:checked + .slider {{
            background-color: #0f766e;
        }}

        input:checked + .slider:before {{
            transform: translateX(16px);
        }}

        /* FLOATING MANIFEST & VEHICLE DOCK (BOTTOM-LEFT) */
        .manifest-dock {{
            position: fixed;
            bottom: 20px;
            left: 20px;
            width: 480px;
            max-height: 430px;
            background: var(--bg-glass);
            backdrop-filter: blur(16px);
            -webkit-backdrop-filter: blur(16px);
            border: 1px solid var(--border-glass);
            border-radius: 16px;
            box-shadow: var(--shadow-float);
            z-index: 1000;
            display: flex;
            flex-direction: column;
            overflow: hidden;
            transition: max-height 0.25s ease;
        }}

        .manifest-dock.collapsed {{
            max-height: 48px;
        }}

        .manifest-header {{
            padding: 12px 16px;
            background: rgba(255, 255, 255, 0.95);
            border-bottom: 1px solid #e2e8f0;
            display: flex;
            align-items: center;
            justify-content: space-between;
            cursor: pointer;
            user-select: none;
        }}

        .manifest-title-group {{
            display: flex;
            align-items: center;
            gap: 8px;
        }}

        .manifest-title {{
            font-size: 13px;
            font-weight: 800;
            color: #0f172a;
        }}

        .manifest-count {{
            font-size: 11px;
            background: #e2e8f0;
            color: #475569;
            padding: 2px 7px;
            border-radius: 10px;
            font-weight: 700;
        }}

        .manifest-controls {{
            display: flex;
            align-items: center;
            gap: 8px;
        }}

        .mini-btn {{
            background: none;
            border: 1px solid #cbd5e1;
            padding: 3px 8px;
            border-radius: 6px;
            font-size: 10px;
            font-weight: 700;
            color: #475569;
            cursor: pointer;
        }}

        .mini-btn:hover {{
            background: #f1f5f9;
        }}

        .vehicle-scroll-area {{
            overflow-y: auto;
            max-height: 370px;
            padding: 8px;
            display: flex;
            flex-direction: column;
            gap: 6px;
        }}

        .vehicle-card {{
            background: #ffffff;
            border: 1px solid #e2e8f0;
            border-radius: 10px;
            padding: 9px 12px;
            display: flex;
            align-items: center;
            justify-content: space-between;
            transition: all 0.15s ease;
            cursor: pointer;
        }}

        .vehicle-card:hover {{
            border-color: #94a3b8;
            box-shadow: 0 2px 8px rgba(0,0,0,0.06);
            transform: translateY(-1px);
        }}

        .vehicle-card.muted {{
            opacity: 0.45;
            background: #f8fafc;
        }}

        .v-left {{
            display: flex;
            align-items: center;
            gap: 10px;
        }}

        .v-color-dot {{
            width: 12px;
            height: 12px;
            border-radius: 4px;
            flex-shrink: 0;
        }}

        .v-info {{
            display: flex;
            flex-direction: column;
            gap: 2px;
        }}

        .v-name {{
            font-size: 12px;
            font-weight: 800;
            color: #0f172a;
        }}

        .v-meta {{
            font-size: 10.5px;
            color: #64748b;
            display: flex;
            gap: 8px;
        }}

        .v-badge {{
            background: #f1f5f9;
            border-radius: 4px;
            padding: 1px 5px;
            font-weight: 700;
        }}

        .v-right {{
            display: flex;
            align-items: center;
            gap: 12px;
            text-align: right;
        }}

        .v-stats {{
            display: flex;
            flex-direction: column;
            gap: 1px;
        }}

        .v-shift {{
            font-size: 11px;
            font-weight: 700;
            color: #0f766e;
            font-family: 'JetBrains Mono', monospace;
        }}

        .v-load {{
            font-size: 10px;
            font-weight: 700;
            color: #475569;
        }}

        /* LEAFLET CUSTOM POPUP */
        .leaflet-popup-content-wrapper {{
            border-radius: 14px;
            box-shadow: var(--shadow-float);
            padding: 0;
            border: 1px solid #cbd5e1;
            overflow: hidden;
        }}

        .leaflet-popup-content {{
            margin: 0 !important;
            padding: 14px;
            font-family: 'Plus Jakarta Sans', sans-serif;
            min-width: 260px;
        }}

        .popup-header {{
            display: flex;
            align-items: center;
            justify-content: space-between;
            margin-bottom: 6px;
        }}

        .popup-badge {{
            font-size: 10px;
            font-weight: 800;
            text-transform: uppercase;
            padding: 2px 7px;
            border-radius: 6px;
            color: white;
        }}

        .popup-hotel-title {{
            font-size: 14px;
            font-weight: 800;
            color: #0f172a;
            margin-bottom: 8px;
            line-height: 1.3;
        }}

        .popup-grid {{
            display: grid;
            grid-template-columns: 1fr 1fr;
            gap: 6px;
            background: #f8fafc;
            border: 1px solid #e2e8f0;
            border-radius: 8px;
            padding: 8px;
            margin-bottom: 8px;
            font-size: 11px;
        }}

        .grid-item-label {{
            color: #64748b;
            font-weight: 600;
            margin-bottom: 1px;
        }}

        .grid-item-val {{
            color: #0f172a;
            font-weight: 700;
            font-family: 'JetBrains Mono', monospace;
        }}

        /* CUSTOM STOP PIN BADGE */
        .stop-badge {{
            background: white;
            border: 2px solid #000;
            border-radius: 50%;
            display: flex;
            align-items: center;
            justify-content: center;
            font-size: 10px;
            font-weight: 800;
            color: #000;
            box-shadow: 0 2px 6px rgba(0,0,0,0.3);
            transition: transform 0.15s ease;
        }}

        .stop-badge:hover {{
            transform: scale(1.25);
            z-index: 9999 !important;
        }}

        /* PULSING HQ DEPOT */
        .depot-marker {{
            width: 24px;
            height: 24px;
            border-radius: 50%;
            background: #4c1d95;
            border: 3px solid #ffffff;
            box-shadow: 0 0 0 4px rgba(76, 29, 149, 0.4), 0 4px 12px rgba(0,0,0,0.4);
            display: flex;
            align-items: center;
            justify-content: center;
            color: white;
            font-size: 12px;
            animation: pulse-ring 2s infinite;
        }}

        @keyframes pulse-ring {{
            0% {{ box-shadow: 0 0 0 0 rgba(76, 29, 149, 0.6), 0 4px 12px rgba(0,0,0,0.4); }}
            70% {{ box-shadow: 0 0 0 10px rgba(76, 29, 149, 0), 0 4px 12px rgba(0,0,0,0.4); }}
            100% {{ box-shadow: 0 0 0 0 rgba(76, 29, 149, 0), 0 4px 12px rgba(0,0,0,0.4); }}
        }}
    </style>
</head>
<body>

    <!-- TOP NAVIGATION BAR -->
    <div class="top-navbar">
        <div class="brand-cluster">
            <div class="brand-badge">
                <span>🧺</span> LinenGrass
            </div>
            <div>
                <div class="brand-title">Fleet Dispatch & Regional Operations</div>
                <div class="brand-sub">5 Operational Regions · 10 Vehicles · Real Google Turn-by-Turn Paths</div>
            </div>
        </div>

        <div class="metrics-strip">
            <div class="metric-chip">
                <span class="indicator"></span>
                <span>Active Fleet:</span>
                <span class="val">{total_vans} Vans</span>
            </div>
            <div class="metric-chip">
                <span>Hotels:</span>
                <span class="val">{total_hotels} Properties</span>
            </div>
            <div class="metric-chip">
                <span>Load:</span>
                <span class="val">{total_bags}/{total_max_load} Bags ({fleet_util}%)</span>
            </div>
            <div class="metric-chip">
                <span>Distance:</span>
                <span class="val">{total_dist} km</span>
            </div>
        </div>

        <div class="nav-actions">
            <button class="action-btn" onclick="resetMapView()">⟲ Reset View</button>
            <a href="bmr_hotel_regions_map.html" target="_blank" style="text-decoration:none;">
                <button class="action-btn">🗺️ Regions Explorer</button>
            </a>
            <a href="data/dispatch_manifest.csv" download style="text-decoration:none;">
                <button class="action-btn" style="background:#0f172a; color:#fff; border-color:#0f172a;">📥 Manifest CSV</button>
            </a>
        </div>
    </div>

    <!-- FLOATING FEATURE TOGGLES & SECTOR SELECTOR -->
    <div class="layer-dock">
        <div class="dock-header">
            <div class="dock-title">
                <span>⚙️</span> Feature Controls
            </div>
            <span style="font-size: 10px; color: #64748b; font-weight: 700;">TOGGLE ON/OFF</span>
        </div>

        <div class="sector-filter-label">Filter Operational Sector</div>
        <div class="sector-pills">
            <button class="sector-pill active" onclick="filterSector('all')">All (102)</button>
            <button class="sector-pill" onclick="filterSector(0)">R0: SE (27)</button>
            <button class="sector-pill" onclick="filterSector(1)">R1: CBD (17)</button>
            <button class="sector-pill" onclick="filterSector(2)">R2: N/W (23)</button>
            <button class="sector-pill" onclick="filterSector(3)">R3: East (7)</button>
            <button class="sector-pill" onclick="filterSector(4)">R4: South (28)</button>
        </div>

        <div class="toggle-group">
            <div class="toggle-row">
                <span class="label"><span class="icon">⬡</span> Operational Regions (Hexagons)</span>
                <label class="switch">
                    <input type="checkbox" id="toggle-hexagons" checked onchange="toggleLayer('hexagons', this.checked)">
                    <span class="slider"></span>
                </label>
            </div>
            <div class="toggle-row">
                <span class="label"><span class="icon">⬛</span> Region Solid Boundaries</span>
                <label class="switch">
                    <input type="checkbox" id="toggle-boundaries" checked onchange="toggleLayer('boundaries', this.checked)">
                    <span class="slider"></span>
                </label>
            </div>
            <div class="toggle-row">
                <span class="label"><span class="icon">🛣️</span> Vehicle Route Paths (Polylines)</span>
                <label class="switch">
                    <input type="checkbox" id="toggle-routes" checked onchange="toggleLayer('routes', this.checked)">
                    <span class="slider"></span>
                </label>
            </div>
            <div class="toggle-row">
                <span class="label"><span class="icon">📍</span> Hotel Stop Pins (102 Stops)</span>
                <label class="switch">
                    <input type="checkbox" id="toggle-stops" checked onchange="toggleLayer('stops', this.checked)">
                    <span class="slider"></span>
                </label>
            </div>
            <div class="toggle-row">
                <span class="label"><span class="icon">🏭</span> Central Depot HQ (Yeshwanthpur)</span>
                <label class="switch">
                    <input type="checkbox" id="toggle-depot" checked onchange="toggleLayer('depot', this.checked)">
                    <span class="slider"></span>
                </label>
            </div>
            <div class="toggle-row">
                <span class="label"><span class="icon">🏛️</span> BBMP Municipal Limit</span>
                <label class="switch">
                    <input type="checkbox" id="toggle-bbmp" onchange="toggleLayer('bbmp', this.checked)">
                    <span class="slider"></span>
                </label>
            </div>
        </div>
    </div>

    <!-- FLOATING MANIFEST & INDIVIDUAL VEHICLE TOGGLE DRAWER (BOTTOM-LEFT) -->
    <div class="manifest-dock" id="manifest-dock">
        <div class="manifest-header" onclick="toggleManifestCollapse()">
            <div class="manifest-title-group">
                <span>🚐</span>
                <div class="manifest-title">Fleet Vehicles & Dispatch Routes</div>
                <div class="manifest-count">10 Vans</div>
            </div>
            <div class="manifest-controls" onclick="event.stopPropagation()">
                <button class="mini-btn" onclick="toggleAllVehicles(true)">Show All</button>
                <button class="mini-btn" onclick="toggleAllVehicles(false)">Hide All</button>
                <button class="mini-btn" onclick="toggleManifestCollapse()" id="collapse-btn">_</button>
            </div>
        </div>

        <div class="vehicle-scroll-area" id="vehicle-list">
            <!-- Dynamically populated via JS -->
        </div>
    </div>

    <!-- LEAFLET MAP CONTAINER -->
    <div id="map"></div>

    <script>
        // Data injected from Python
        const hexGeoJSON = {hex_json_str};
        const boundaryGeoJSON = {boundary_json_str};
        const bbmpGeoJSON = {bbmp_json_str};
        const routesData = {routes_json_str};
        const hotelsData = {hotels_json_str};
        const regionMeta = {meta_json_str};
        const depotData = {depot_json_str};

        const BANGALORE_CENTER = [12.9716, 77.5946];
        const DEFAULT_ZOOM = 11;

        // Initialize Map
        const map = L.map('map', {{
            center: BANGALORE_CENTER,
            zoom: DEFAULT_ZOOM,
            zoomControl: false
        }});

        L.control.zoom({{ position: 'bottomright' }}).addTo(map);

        // Standard OpenStreetMap basemap
        L.tileLayer('https://tile.openstreetmap.org/{{z}}/{{x}}/{{y}}.png', {{
            attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
            maxZoom: 19
        }}).addTo(map);

        // LAYER GROUPS
        const layers = {{
            hexagons: L.layerGroup().addTo(map),
            boundaries: L.layerGroup().addTo(map),
            routes: L.layerGroup().addTo(map),
            stops: L.layerGroup().addTo(map),
            depot: L.layerGroup().addTo(map),
            bbmp: L.layerGroup() // off by default
        }};

        // Vehicle layer mapping: vehicleLabel -> {{ routePolyline, stopMarkers: [] }}
        const vehicleLayers = {{}};
        let activeSector = 'all';

        // 1. Render BBMP Boundary (if available)
        if (bbmpGeoJSON) {{
            L.geoJSON(bbmpGeoJSON, {{
                style: {{
                    color: '#64748b',
                    weight: 2.0,
                    dashArray: '5, 5',
                    fill: false,
                    opacity: 0.6
                }}
            }}).addTo(layers.bbmp);
        }}

        // 2. Render Hexagons
        const hexLayerObj = L.geoJSON(hexGeoJSON, {{
            style: function(feat) {{
                return {{
                    fillColor: feat.properties.color,
                    fillOpacity: 0.28,
                    color: feat.properties.color,
                    weight: 0.8,
                    opacity: 0.8
                }};
            }},
            onEachFeature: function(feat, layer) {{
                const p = feat.properties;
                layer.bindTooltip(
                    `<b>${{p.region_name}}</b> (${{p.region_code}})<br>` +
                    `<span style='color:#64748b;'>${{p.lotr_route}}</span><br>` +
                    `<small>Key: ${{p.key_areas.substring(0, 40)}}...</small>`,
                    {{ sticky: true }}
                );
            }}
        }}).addTo(layers.hexagons);

        // 3. Render Region Perimeter Boundaries
        L.geoJSON(boundaryGeoJSON, {{
            style: function(feat) {{
                return {{
                    color: '#0f172a',
                    weight: 3.2,
                    fill: false,
                    opacity: 0.95
                }};
            }},
            onEachFeature: function(feat, layer) {{
                layer.bindTooltip(`<b>${{feat.properties.region_name}} Boundary</b>`, {{ sticky: true }});
            }}
        }}).addTo(layers.boundaries);

        // 4. Render Depot Hub Marker
        const depotIcon = L.divIcon({{
            className: 'depot-marker',
            html: '🏭',
            iconSize: [26, 26],
            iconAnchor: [13, 13]
        }});

        L.marker([depotData.latitude, depotData.longitude], {{ icon: depotIcon }})
            .bindPopup(`
                <div class="popup-header">
                    <span class="popup-badge" style="background:#4c1d95;">Central Hub</span>
                </div>
                <div class="popup-hotel-title">${{depotData.name}}</div>
                <div style="font-size: 11px; color:#475569; line-height: 1.4;">
                    Primary LinenGrass laundry dispatch facility. All 10 fleet vehicles depart at 07:00 AM and return here.
                </div>
            `)
            .addTo(layers.depot);

        // 5. Render Vehicles & Stops
        const vehicleListContainer = document.getElementById('vehicle-list');

        routesData.forEach((r, vIndex) => {{
            const vLabel = r.vehicle_label;
            const color = r.color;
            const regId = r.region_id;

            // Route Polyline
            const polyline = L.polyline(r.path_coordinates, {{
                color: color,
                weight: 4.5,
                opacity: 0.9,
                lineCap: 'round',
                lineJoin: 'round'
            }}).addTo(layers.routes);

            polyline.bindTooltip(
                `<b>${{vLabel}}</b><br>` +
                `${{r.total_hotels}} stops · ${{r.total_dist_km}} km · Shift: ${{r.departure_hq}} - ${{r.return_hq}}`,
                {{ sticky: true }}
            );

            // Stops Markers
            const stopMarkers = [];
            r.stops.forEach(s => {{
                const stopHtml = `<div class="stop-badge" style="background:${{color}}; color:#fff; border-color:#0f172a; width:22px; height:22px;">${{s.stop_number}}</div>`;
                const stopIcon = L.divIcon({{
                    className: 'custom-stop-icon',
                    html: stopHtml,
                    iconSize: [22, 22],
                    iconAnchor: [11, 11]
                }});

                const marker = L.marker([s.lat, s.lon], {{ icon: stopIcon }});
                
                const popupContent = `
                    <div class="popup-header">
                        <span class="popup-badge" style="background:${{color}};">${{vLabel.split('(')[0].trim()}}</span>
                        <span style="font-size:11px; font-weight:800; color:#475569;">Stop #${{s.stop_number}} of ${{r.total_hotels}}</span>
                    </div>
                    <div class="popup-hotel-title">${{s.name}}</div>
                    <div class="popup-grid">
                        <div>
                            <div class="grid-item-label">Arrival:</div>
                            <div class="grid-item-val">${{s.arrival_time}}</div>
                        </div>
                        <div>
                            <div class="grid-item-label">Departure:</div>
                            <div class="grid-item-val">${{s.departure_time}}</div>
                        </div>
                        <div>
                            <div class="grid-item-label">Stop Duration:</div>
                            <div class="grid-item-val">${{s.stop_mins}} mins</div>
                        </div>
                        <div>
                            <div class="grid-item-label">Linen Bags:</div>
                            <div class="grid-item-val">${{s.load_bags}} space units</div>
                        </div>
                    </div>
                    <div style="font-size:10px; color:#64748b;">
                        <b>Region:</b> ${{r.region_name}} (R${{regId}})<br>
                        <b>GPS:</b> ${{s.lat.toFixed(5)}}, ${{s.lon.toFixed(5)}}
                    </div>
                `;

                marker.bindPopup(popupContent);
                marker.addTo(layers.stops);
                stopMarkers.push(marker);
            }});

            vehicleLayers[vLabel] = {{
                region_id: regId,
                polyline: polyline,
                stops: stopMarkers,
                visible: true,
                data: r
            }};

            // Add Card in Bottom Manifest Drawer
            const vCard = document.createElement('div');
            vCard.className = 'vehicle-card';
            vCard.id = `v-card-${{vIndex}}`;
            vCard.innerHTML = `
                <div class="v-left">
                    <input type="checkbox" checked onclick="toggleSingleVehicle('${{vLabel}}', this.checked, event)" style="cursor:pointer;">
                    <div class="v-color-dot" style="background:${{color}};"></div>
                    <div class="v-info">
                        <div class="v-name">${{vLabel.split('(')[0].trim()}} <span class="v-badge">R${{regId}}</span></div>
                        <div class="v-meta">
                            <span>${{r.total_hotels}} stops</span>
                            <span>•</span>
                            <span>${{r.total_dist_km}} km</span>
                            <span>•</span>
                            <span>${{r.total_drive_mins}}m drive</span>
                        </div>
                    </div>
                </div>
                <div class="v-right">
                    <div class="v-stats">
                        <div class="v-shift">${{r.departure_hq}} - ${{r.return_hq}}</div>
                        <div class="v-load">${{r.total_bags}}/${{r.max_load}} bags (${{r.capacity_utilization_pct}}%)</div>
                    </div>
                    <button class="mini-btn" onclick="focusVehicle('${{vLabel}}', event)">🔍</button>
                </div>
            `;

            vCard.onclick = () => focusVehicle(vLabel);
            vehicleListContainer.appendChild(vCard);
        }});

        // 6. TOGGLE FUNCTIONS
        function toggleLayer(layerKey, isChecked) {{
            if (isChecked) {{
                map.addLayer(layers[layerKey]);
            }} else {{
                map.removeLayer(layers[layerKey]);
            }}
        }}

        function toggleSingleVehicle(vLabel, isVisible, e) {{
            if (e) e.stopPropagation();
            const vObj = vehicleLayers[vLabel];
            if (!vObj) return;

            vObj.visible = isVisible;
            if (isVisible) {{
                layers.routes.addLayer(vObj.polyline);
                vObj.stops.forEach(m => layers.stops.addLayer(m));
            }} else {{
                layers.routes.removeLayer(vObj.polyline);
                vObj.stops.forEach(m => layers.stops.removeLayer(m));
            }}

            // Update card styling
            const card = Array.from(document.querySelectorAll('.vehicle-card')).find(c => c.innerHTML.includes(vLabel.split('(')[0].trim()));
            if (card) {{
                if (isVisible) card.classList.remove('muted');
                else card.classList.add('muted');
            }}
        }}

        function toggleAllVehicles(showAll) {{
            Object.keys(vehicleLayers).forEach(vLabel => {{
                const vObj = vehicleLayers[vLabel];
                if (activeSector === 'all' || vObj.region_id === activeSector) {{
                    vObj.visible = showAll;
                    if (showAll) {{
                        layers.routes.addLayer(vObj.polyline);
                        vObj.stops.forEach(m => layers.stops.addLayer(m));
                    }} else {{
                        layers.routes.removeLayer(vObj.polyline);
                        vObj.stops.forEach(m => layers.stops.removeLayer(m));
                    }}
                }}
            }});

            document.querySelectorAll('.vehicle-card input[type="checkbox"]').forEach(cb => {{
                cb.checked = showAll;
            }});

            document.querySelectorAll('.vehicle-card').forEach(card => {{
                if (showAll) card.classList.remove('muted');
                else card.classList.add('muted');
            }});
        }}

        function focusVehicle(vLabel, e) {{
            if (e) e.stopPropagation();
            const vObj = vehicleLayers[vLabel];
            if (!vObj) return;

            // Ensure visible
            if (!vObj.visible) {{
                toggleSingleVehicle(vLabel, true);
                const cb = Array.from(document.querySelectorAll('.vehicle-card input')).find(c => c.getAttribute('onclick')?.includes(vLabel));
                if (cb) cb.checked = true;
            }}

            map.fitBounds(vObj.polyline.getBounds(), {{ padding: [60, 60], maxZoom: 14 }});
        }}

        function filterSector(sector) {{
            activeSector = sector;

            // Update UI pills
            document.querySelectorAll('.sector-pill').forEach(btn => {{
                if ((sector === 'all' && btn.innerText.includes('All')) ||
                    (sector !== 'all' && btn.innerText.includes(`R${{sector}}`))) {{
                    btn.classList.add('active');
                }} else {{
                    btn.classList.remove('active');
                }}
            }});

            // Filter Hexagons & Boundaries
            hexLayerObj.eachLayer(layer => {{
                const reg = layer.feature.properties.region_id;
                if (sector === 'all' || reg === sector) {{
                    layer.setStyle({{ opacity: 0.8, fillOpacity: 0.32 }});
                }} else {{
                    layer.setStyle({{ opacity: 0.05, fillOpacity: 0.02 }});
                }}
            }});

            // Filter Vehicles and Stops
            const bounds = L.latLngBounds([]);

            Object.keys(vehicleLayers).forEach(vLabel => {{
                const vObj = vehicleLayers[vLabel];
                const matches = (sector === 'all' || vObj.region_id === sector);
                
                if (matches) {{
                    layers.routes.addLayer(vObj.polyline);
                    vObj.stops.forEach(m => layers.stops.addLayer(m));
                    vObj.visible = true;
                    bounds.extend(vObj.polyline.getBounds());
                }} else {{
                    layers.routes.removeLayer(vObj.polyline);
                    vObj.stops.forEach(m => layers.stops.removeLayer(m));
                    vObj.visible = false;
                }}
            }});

            // Update manifest card list visibility
            document.querySelectorAll('.vehicle-card').forEach(card => {{
                const cardReg = card.querySelector('.v-badge').innerText.replace('R', '');
                if (sector === 'all' || parseInt(cardReg) === sector) {{
                    card.style.display = 'flex';
                    card.classList.remove('muted');
                    card.querySelector('input').checked = true;
                }} else {{
                    card.style.display = 'none';
                }}
            }});

            if (sector !== 'all' && bounds.isValid()) {{
                map.fitBounds(bounds, {{ padding: [70, 70] }});
            }} else if (sector === 'all') {{
                resetMapView();
            }}
        }}

        function resetMapView() {{
            map.setView(BANGALORE_CENTER, DEFAULT_ZOOM);
        }}

        function toggleManifestCollapse() {{
            const dock = document.getElementById('manifest-dock');
            dock.classList.toggle('collapsed');
            const btn = document.getElementById('collapse-btn');
            btn.innerText = dock.classList.contains('collapsed') ? '▲' : '_';
        }}

        window.addEventListener('load', function() {{
            setTimeout(function() {{
                map.invalidateSize();
            }}, 200);
        }});
        setTimeout(function() {{
            map.invalidateSize();
        }}, 600);
    </script>
</body>
</html>
"""

if __name__ == "__main__":
    main()
