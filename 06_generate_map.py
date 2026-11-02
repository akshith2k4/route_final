"""
Step 6: High-Definition LinenGrass 6-Region Operational Map with Interactive Area Explorer Box
Features:
- Exact 6 LinenGrass Operational Regions (LOTR schematic aligned)
- Continuous highway corridor ribbons extending out to outer hotels (Airport NH44, Hosur Rd/E-City, Magadi Rd)
- Interactive Right-Hand Region & Area Explorer Box:
  - Click any region tab (R0-R5) to view all covered localities and areas
  - Click any hexagon on the map to automatically view its region & areas
  - Scrollable hotel list with click-to-focus on map
  - "Focus Region on Map" smooth camera pan
- Top-Center Coordinate Search Bar:
  - Enter coordinates -> highlights hex, drops pin, and syncs right area explorer
- Floating Legend (Bottom-Left)
- BBMP City Limits Boundary
- Layer Controls (Bottom-Right)
"""
import folium
from folium import plugins
import geopandas as gpd
import pandas as pd
import joblib
import h3
import json
import shutil
from shapely.geometry import Polygon, mapping
from shapely.ops import unary_union

print("=" * 80)
print("GENERATING LINENGRASS 6-REGION HIGH-DEFINITION MAP WITH AREA EXPLORER")
print("=" * 80)

# 1. Load Data
with open('data/hotels.json', 'r') as f:
    hotels = json.load(f)

with open('data/region_metadata.json', 'r') as f:
    REGION_METADATA = json.load(f)

hex_map = joblib.load('hex_map_final.pkl')
centroids_df = pd.read_csv('urban_centroids.csv')

COLOR_PALETTE = {int(k): v['color'] for k, v in REGION_METADATA.items()}

# Precompute region bounding boxes for smooth map zooming
region_bounds = {}
for r in range(6):
    lats = [h['lat'] for h in hotels if h['region'] == r]
    lons = [h['lon'] for h in hotels if h['region'] == r]
    for hex_id, reg in hex_map.items():
        if reg == r:
            boundary = h3.cell_to_boundary(hex_id)
            for p in boundary:
                lats.append(p[0])
                lons.append(p[1])
    if lats and lons:
        region_bounds[r] = [[min(lats), min(lons)], [max(lats), max(lons)]]

BANGALORE_CENTER = [12.9716, 77.5946]
m = folium.Map(
    location=BANGALORE_CENTER,
    zoom_start=11,
    tiles="OpenStreetMap",
    control_scale=True
)

# 2. MAP INITIALIZATION (BBMP boundary marking removed as requested)


# 3. HEXAGONS (WITH CRISP BORDERS & PROPER REGION LABELS)
hex_group = folium.FeatureGroup(name="6 Operational Regions (Hexagons)", show=True)
region_hex_polys = {}

for h, r in hex_map.items():
    boundary = h3.cell_to_boundary(h)
    color = COLOR_PALETTE.get(r, "#64748b")
    meta = REGION_METADATA.get(str(r), {})
    r_name = meta.get('name', f'Region {r}')
    r_code = meta.get('code', f'R{r}')
    r_route = meta.get('lotr_route', '')
    
    poly = Polygon([(p[1], p[0]) for p in boundary])
    region_hex_polys.setdefault(r, []).append(poly)
    
    tooltip_html = f"<b>{r_name}</b> ({r_code})<br><span style='color:#475569;'>{r_route}</span><br>Click to view areas &bull; Hex: {h}"
    
    folium.Polygon(
        locations=boundary,
        color="#1e293b",
        weight=0.9,
        fill=True,
        fill_color=color,
        fill_opacity=0.55,
        tooltip=tooltip_html
    ).add_to(hex_group)

hex_group.add_to(m)

# 4. REGION BOUNDARIES (DARK SOLID LINES)
boundaries_group = folium.FeatureGroup(name="Region Boundaries (Dark Lines)", show=True)
for r, polys in region_hex_polys.items():
    merged_geom = unary_union(polys)
    meta = REGION_METADATA.get(str(r), {})
    r_name = meta.get('name', f'Region {r}')
    r_code = meta.get('code', f'R{r}')
    
    folium.GeoJson(
        mapping(merged_geom),
        style_function=lambda x: {
            "color": "#000000",
            "weight": 3.4,
            "fill": False,
            "opacity": 0.95
        },
        tooltip=f"Boundary: {r_name} ({r_code})"
    ).add_to(boundaries_group)
boundaries_group.add_to(m)

# 5. REGION CENTROIDS
centroid_group = folium.FeatureGroup(name="Region Centers & Hubs", show=True)
for _, c in centroids_df.iterrows():
    r = int(c['region'])
    meta = REGION_METADATA.get(str(r), {})
    r_name = meta.get('name', f'Region {r}')
    r_code = meta.get('code', f'R{r}')
    r_route = meta.get('lotr_route', '')
    color = COLOR_PALETTE.get(r, "#000000")
    hotel_count = int(c['count'])
    
    popup_html = f"""
    <div style='font-family: Arial, sans-serif; min-width: 240px;'>
        <b style='font-size: 14px; color: {color};'>{r_code} Operational Center</b><br>
        <div style='font-weight: bold; margin-top: 2px;'>{r_name}</div>
        <div style='color: #4b5563; font-size: 12px; margin-bottom: 6px;'>{r_route}</div>
        <hr style='margin: 4px 0 6px 0; border: none; border-top: 1px solid #d1d5db;'>
        <b>Active Hotels in Route:</b> {hotel_count}<br>
        <b>Key Areas:</b> {meta.get('key_areas', '')}<br>
        <button onclick="selectRegion({r}, true)" style="margin-top:8px; width:100%; background:{color}; color:#ffffff; border:none; border-radius:6px; padding:6px 0; font-size:11px; font-weight:700; cursor:pointer;">
            📍 Explore Region {r_code} Areas & Localities
        </button>
    </div>
    """
    
    folium.CircleMarker(
        location=[c['lat'], c['lon']],
        radius=9,
        color="#000000",
        weight=2.5,
        fill=True,
        fill_color=color,
        fill_opacity=1.0,
        popup=folium.Popup(popup_html, max_width=300),
        tooltip=f"Center: {r_name} ({r_code}) - {hotel_count} Hotels"
    ).add_to(centroid_group)
centroid_group.add_to(m)

# 6. HOTELS LAYER (ALL 100 WITH RICH POPUPS)
hotels_group = folium.FeatureGroup(name="All 100 Hotels", show=True)
hotel_list_js = []

from math import radians, sin, cos, atan2, sqrt
def haversine_calc(lat1, lon1, lat2, lon2):
    R = 6371
    dlat = radians(lat2 - lat1); dlon = radians(lon2 - lon1)
    a = sin(dlat/2)**2 + cos(radians(lat1)) * cos(radians(lat2)) * sin(dlon/2)**2
    return 2 * R * atan2(sqrt(a), sqrt(1-a))

for idx, h in enumerate(hotels):
    r = int(h['region'])
    meta = REGION_METADATA.get(str(r), {})
    color = COLOR_PALETTE.get(r, "#000000")
    r_name = meta.get('name', f"Region {r}")
    r_code = meta.get('code', f"R{r}")
    r_route = meta.get('lotr_route', "")
    tier = meta.get('tier', "Operational Route")
    dist_center = haversine_calc(BANGALORE_CENTER[0], BANGALORE_CENTER[1], h['lat'], h['lon'])
    
    hotel_list_js.append({
        "id": idx,
        "name": h['name'],
        "lat": float(h['lat']),
        "lon": float(h['lon']),
        "region": r,
        "region_code": r_code,
        "region_name": r_name,
        "lotr_route": r_route,
        "dist_center_km": round(dist_center, 1)
    })
    
    popup_html = f"""
    <div style='font-family: Arial, sans-serif; min-width: 240px;'>
        <h4 style='margin: 0 0 4px 0; color: #111827; font-size: 14px;'>{h['name']}</h4>
        <hr style='margin: 4px 0 6px 0; border: none; border-top: 1px solid #d1d5db;'>
        <b>Region:</b> <span style='color: {color}; font-weight: bold;'>{r_name}</span><br>
        <b>Code:</b> <span style='background:#f1f5f9; padding:1px 4px; border-radius:3px; font-weight:bold;'>{r_code}</span><br>
        <b>LinenGrass Route:</b> <span style='color:#0f766e; font-weight:600;'>{r_route}</span><br>
        <b>Tier:</b> {tier}<br>
        <b>Coordinates:</b> {h['lat']:.4f}, {h['lon']:.4f}<br>
        <b>Dist from Center:</b> {dist_center:.1f} km<br>
        <button onclick="selectRegion({r}, false)" style="margin-top:8px; width:100%; background:{color}; color:#ffffff; border:none; border-radius:6px; padding:6px 0; font-size:11px; font-weight:700; cursor:pointer;">
            📍 View Region {r_code} Areas & Localities
        </button>
    </div>
    """
    
    folium.CircleMarker(
        location=[h['lat'], h['lon']],
        radius=7.5,
        color="#000000",
        weight=2.0,
        fill=True,
        fill_color=color,
        fill_opacity=1.0,
        popup=folium.Popup(popup_html, max_width=320),
        tooltip=f"🏨 {h['name']} → {r_name} ({r_code})"
    ).add_to(hotels_group)
hotels_group.add_to(m)

# 7. FLOATING LEGEND (BOTTOM-LEFT)
legend_html = f"""
<div style="position: fixed; 
     bottom: 25px; left: 25px; width: 330px; max-height: 380px; overflow-y: auto;
     background-color: rgba(255, 255, 255, 0.97); z-index:9999; font-size:12px;
     border:2px solid #0f172a; border-radius: 12px; padding: 14px; box-shadow: 0 8px 24px rgba(0,0,0,0.22);">
     
     <div style="font-weight: 800; font-size: 14px; margin-bottom: 2px; color: #0f172a;">LinenGrass Route System</div>
     <div style="font-size: 11px; color: #64748b; margin-bottom: 6px;">6 Unified Operational Regions (100 Hotels)</div>
     
     <div style="margin-bottom: 8px; font-size: 11px; color: #475569;">
         <span style="border-bottom: 3px solid #000000; padding-bottom: 2px;">━━</span> <b>Region Boundaries</b>
     </div>
     
     <hr style="margin: 6px 0; border-top: 1px solid #cbd5e1;">
     <div style="font-weight: 700; color: #0f172a; margin-bottom: 6px; font-size: 11px; text-transform: uppercase; letter-spacing: 0.5px;">Click a Route to View Areas</div>
     
     <div style="margin-bottom: 4px; cursor: pointer;" onclick="selectRegion(0, true)"><i style="background:{COLOR_PALETTE[0]}; width:13px; height:13px; display:inline-block; border-radius:3px; border:1px solid #000; vertical-align:middle; margin-right:4px;"></i> <b>R0:</b> South-East (Koramangala, HSR & E-City) <span style="color:#0f766e; font-weight:700;">[42]</span></div>
     <div style="margin-bottom: 4px; cursor: pointer;" onclick="selectRegion(1, true)"><i style="background:{COLOR_PALETTE[1]}; width:13px; height:13px; display:inline-block; border-radius:3px; border:1px solid #000; vertical-align:middle; margin-right:4px;"></i> <b>R1:</b> Central (CBD, Indiranagar & MG Road) <span style="color:#0f766e; font-weight:700;">[17]</span></div>
     <div style="margin-bottom: 4px; cursor: pointer;" onclick="selectRegion(2, true)"><i style="background:{COLOR_PALETTE[2]}; width:13px; height:13px; display:inline-block; border-radius:3px; border:1px solid #000; vertical-align:middle; margin-right:4px;"></i> <b>R2:</b> North (Hebbal, Manyata & Airport) <span style="color:#0f766e; font-weight:700;">[17]</span></div>
     <div style="margin-bottom: 4px; cursor: pointer;" onclick="selectRegion(3, true)"><i style="background:{COLOR_PALETTE[3]}; width:13px; height:13px; display:inline-block; border-radius:3px; border:1px solid #000; vertical-align:middle; margin-right:4px;"></i> <b>R3:</b> East (Whitefield & Marathahalli) <span style="color:#0f766e; font-weight:700;">[6]</span></div>
     <div style="margin-bottom: 4px; cursor: pointer;" onclick="selectRegion(4, true)"><i style="background:{COLOR_PALETTE[4]}; width:13px; height:13px; display:inline-block; border-radius:3px; border:1px solid #000; vertical-align:middle; margin-right:4px;"></i> <b>R4:</b> South-West (JP Nagar & Kanakapura) <span style="color:#0f766e; font-weight:700;">[12]</span></div>
     <div style="margin-bottom: 4px; cursor: pointer;" onclick="selectRegion(5, true)"><i style="background:{COLOR_PALETTE[5]}; width:13px; height:13px; display:inline-block; border-radius:3px; border:1px solid #000; vertical-align:middle; margin-right:4px;"></i> <b>R5:</b> North-West (Yeshwanthpur HQ & Magadi) <span style="color:#0f766e; font-weight:700;">[6]</span></div>
</div>
"""
m.get_root().html.add_child(folium.Element(legend_html))

# 8. EMBED H3 LIBRARY SCRIPT
m.get_root().header.add_child(folium.Element('<script src="https://unpkg.com/h3-js@4.1.0/dist/h3-js.umd.js"></script>'))

# 9. JSON DATA ENCODINGS (WITH UTF-8 ENSURE_ASCII=FALSE)
map_name = m.get_name()
hex_map_json = json.dumps(hex_map)
region_meta_json = json.dumps(REGION_METADATA, ensure_ascii=False)
hotel_list_json = json.dumps(hotel_list_js, ensure_ascii=False)
region_bounds_json = json.dumps(region_bounds)

# 10. INTERACTIVE RIGHT-HAND REGION & AREA EXPLORER BOX + TOP SEARCH BAR
explorer_and_search_html = f"""
<!-- Top-Center New Hotel Coordinate Search Bar -->
<div id="new-hotel-search-bar" style="position: fixed; 
     top: 16px; left: calc(50% - 190px); transform: translateX(-50%); width: 560px; max-width: 58vw; z-index: 99990; 
     font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;">
     
     <div style="background: #ffffff; border: 2px solid #0f172a; border-radius: 30px; 
                 box-shadow: 0 8px 25px rgba(0,0,0,0.25); display: flex; align-items: center; 
                 padding: 5px 8px 5px 16px;">
         
         <span style="font-size: 16px; margin-right: 8px;">📍</span>
         
         <input type="text" id="hotel-coord-input" 
                placeholder="Enter Coordinates: e.g. 12.9352, 77.6145" 
                style="flex: 1; border: none; outline: none; font-size: 13px; color: #0f172a; font-weight: 500; background: transparent;">
         
         <button id="btn-search-hotel" onclick="processHotelCoordinate()" 
                 style="background: #0f172a; color: #ffffff; border: none; padding: 8px 18px; 
                        border-radius: 20px; font-size: 12px; font-weight: 700; cursor: pointer; transition: background 0.2s; white-space: nowrap;">
             Find Region
         </button>
         
         <button onclick="clearHotelSearch()" title="Clear search"
                 style="background: transparent; color: #64748b; border: none; padding: 4px 8px; font-size: 18px; cursor: pointer; margin-left: 2px;">
             &times;
         </button>
     </div>
     
     <!-- Search Results Popup Card -->
     <div id="hotel-result-card" style="display: none; margin-top: 8px; background: rgba(255, 255, 255, 0.98); 
          border: 2px solid #0f172a; border-radius: 12px; padding: 14px; 
          box-shadow: 0 10px 30px rgba(0,0,0,0.3); backdrop-filter: blur(8px);">
     </div>
</div>

<!-- ========================================================================= -->
<!-- RIGHT-HAND REGION & AREA EXPLORER BOX (CLICK TO SEE AREAS IN IT)           -->
<!-- ========================================================================= -->
<div id="region-area-explorer-panel" style="position: fixed; 
     top: 16px; right: 16px; width: 375px; max-width: calc(100vw - 32px); max-height: calc(100vh - 32px); 
     background: rgba(255, 255, 255, 0.98); border: 2px solid #0f172a; border-radius: 16px; 
     box-shadow: 0 12px 36px rgba(0,0,0,0.28); z-index: 99999; 
     font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
     display: flex; flex-direction: column; overflow: hidden; backdrop-filter: blur(8px);">

     <!-- Panel Header -->
     <div style="background: #0f172a; color: #ffffff; padding: 12px 16px; display: flex; align-items: center; justify-content: space-between;">
         <div>
             <div style="font-weight: 800; font-size: 15px; letter-spacing: 0.3px; display: flex; align-items: center; gap: 6px;">
                 <span>🗺️</span> Region & Area Explorer
             </div>
             <div style="font-size: 11px; color: #94a3b8; margin-top: 2px;">
                 Click a region below to see all covered areas
             </div>
         </div>
         <button id="btn-toggle-explorer" onclick="toggleExplorerPanel()" title="Minimize / Expand"
                 style="background: #1e293b; color: #ffffff; border: 1px solid #334155; border-radius: 6px; 
                        padding: 3px 8px; font-size: 13px; font-weight: bold; cursor: pointer;">
             —
         </button>
     </div>

     <!-- Panel Content Body (Scrollable) -->
     <div id="explorer-body" style="padding: 14px; overflow-y: auto; flex: 1;">
         
         <!-- Region Switcher Tabs (6 Buttons) -->
         <div style="margin-bottom: 12px;">
             <div style="font-size: 11px; font-weight: 700; color: #64748b; text-transform: uppercase; margin-bottom: 6px; letter-spacing: 0.5px;">
                 Select Operational Region:
             </div>
             <div style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 6px;">
                 <button class="region-tab-btn" id="tab-btn-0" onclick="selectRegion(0, true)" 
                         style="background:#f8fafc; border:2px solid #cbd5e1; border-radius:8px; padding:6px 4px; font-size:12px; font-weight:700; cursor:pointer; text-align:center; transition: all 0.15s;">
                     <span style="color:#C0392B;">R0</span> <span style="font-size:10px; color:#64748b; font-weight:500;">(42)</span>
                 </button>
                 <button class="region-tab-btn" id="tab-btn-1" onclick="selectRegion(1, true)" 
                         style="background:#f8fafc; border:2px solid #cbd5e1; border-radius:8px; padding:6px 4px; font-size:12px; font-weight:700; cursor:pointer; text-align:center; transition: all 0.15s;">
                     <span style="color:#1A365D;">R1</span> <span style="font-size:10px; color:#64748b; font-weight:500;">(17)</span>
                 </button>
                 <button class="region-tab-btn" id="tab-btn-2" onclick="selectRegion(2, true)" 
                         style="background:#f8fafc; border:2px solid #cbd5e1; border-radius:8px; padding:6px 4px; font-size:12px; font-weight:700; cursor:pointer; text-align:center; transition: all 0.15s;">
                     <span style="color:#1E5F74;">R2</span> <span style="font-size:10px; color:#64748b; font-weight:500;">(17)</span>
                 </button>
                 <button class="region-tab-btn" id="tab-btn-3" onclick="selectRegion(3, true)" 
                         style="background:#f8fafc; border:2px solid #cbd5e1; border-radius:8px; padding:6px 4px; font-size:12px; font-weight:700; cursor:pointer; text-align:center; transition: all 0.15s;">
                     <span style="color:#137547;">R3</span> <span style="font-size:10px; color:#64748b; font-weight:500;">(6)</span>
                 </button>
                 <button class="region-tab-btn" id="tab-btn-4" onclick="selectRegion(4, true)" 
                         style="background:#f8fafc; border:2px solid #cbd5e1; border-radius:8px; padding:6px 4px; font-size:12px; font-weight:700; cursor:pointer; text-align:center; transition: all 0.15s;">
                     <span style="color:#D97706;">R4</span> <span style="font-size:10px; color:#64748b; font-weight:500;">(12)</span>
                 </button>
                 <button class="region-tab-btn" id="tab-btn-5" onclick="selectRegion(5, true)" 
                         style="background:#f8fafc; border:2px solid #cbd5e1; border-radius:8px; padding:6px 4px; font-size:12px; font-weight:700; cursor:pointer; text-align:center; transition: all 0.15s;">
                     <span style="color:#5B21B6;">R5</span> <span style="font-size:10px; color:#64748b; font-weight:500;">(6)</span>
                 </button>
             </div>
         </div>

         <!-- Selected Region Hero Card -->
         <div id="region-hero-card" style="border: 2px solid #e2e8f0; border-radius: 12px; padding: 12px; margin-bottom: 12px; background: #f8fafc;">
             <!-- Dynamic content filled by selectRegion() -->
         </div>

         <!-- Areas & Localities Section (User Request Highlight) -->
         <div style="margin-bottom: 12px;">
             <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom: 6px;">
                 <div style="font-size: 11px; font-weight: 700; color: #0f172a; text-transform: uppercase; letter-spacing: 0.5px; display:flex; align-items:center; gap:4px;">
                     <span>📍</span> Localities & Areas Covered
                 </div>
                 <span id="areas-count-badge" style="font-size:10px; background:#e2e8f0; color:#334155; font-weight:700; padding:1px 6px; border-radius:10px;">0</span>
             </div>
             
             <div id="areas-chip-container" style="display: flex; flex-direction: column; gap: 5px; max-height: 190px; overflow-y: auto; padding-right: 2px;">
                 <!-- Populated by JS -->
             </div>
         </div>

         <!-- Hotels In This Region (Interactive with click-to-fly) -->
         <div>
             <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom: 6px;">
                 <div style="font-size: 11px; font-weight: 700; color: #0f172a; text-transform: uppercase; letter-spacing: 0.5px; display:flex; align-items:center; gap:4px;">
                     <span>🏨</span> Hotels in Region
                 </div>
                 <span id="hotels-count-badge" style="font-size:10px; background:#0f766e; color:#ffffff; font-weight:700; padding:1px 6px; border-radius:10px;">0</span>
             </div>

             <div id="hotels-list-container" style="display: flex; flex-direction: column; gap: 4px; max-height: 160px; overflow-y: auto; padding-right: 2px;">
                 <!-- Populated by JS -->
             </div>
         </div>

     </div>
</div>

<script>
window.addEventListener('DOMContentLoaded', function() {{
    var map = {map_name};
    var hexMap = {hex_map_json};
    var regionMeta = {region_meta_json};
    var hotelList = {hotel_list_json};
    var regionBounds = {region_bounds_json};
    
    var currentActiveRegion = 0;
    var hotelMarker = null;
    var hotelHexPolygon = null;
    
    function haversineDist(lat1, lon1, lat2, lon2) {{
        var R = 6371;
        var dLat = (lat2 - lat1) * Math.PI / 180;
        var dLon = (lon2 - lon1) * Math.PI / 180;
        var a = Math.sin(dLat/2) * Math.sin(dLat/2) +
                Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
                Math.sin(dLon/2) * Math.sin(dLon/2);
        return 2 * R * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
    }}
    
    // Toggle Explorer Minimization
    window.toggleExplorerPanel = function() {{
        var body = document.getElementById('explorer-body');
        var btn = document.getElementById('btn-toggle-explorer');
        if (body.style.display === 'none') {{
            body.style.display = 'block';
            btn.innerHTML = '—';
        }} else {{
            body.style.display = 'none';
            btn.innerHTML = '+';
        }}
    }};
    
    // Select Region Function (Updates Right Box and zooms map optionally)
    window.selectRegion = function(regId, shouldFly) {{
        currentActiveRegion = regId;
        var meta = regionMeta[String(regId)];
        if (!meta) return;
        
        var regColor = meta.color || "#0f172a";
        
        // 1. Update Tab Buttons styling
        for (var i = 0; i < 6; i++) {{
            var btn = document.getElementById('tab-btn-' + i);
            if (btn) {{
                if (i === regId) {{
                    btn.style.background = regColor;
                    btn.style.borderColor = "#0f172a";
                    btn.style.color = "#ffffff";
                    btn.innerHTML = '<span style="color:#ffffff;">R' + i + '</span> <span style="font-size:10px; color:#e2e8f0;">(' + getRegionHotelCount(i) + ')</span>';
                }} else {{
                    var m = regionMeta[String(i)];
                    var c = m ? m.color : "#64748b";
                    btn.style.background = "#f8fafc";
                    btn.style.borderColor = "#cbd5e1";
                    btn.innerHTML = '<span style="color:' + c + ';">R' + i + '</span> <span style="font-size:10px; color:#64748b;">(' + getRegionHotelCount(i) + ')</span>';
                }}
            }}
        }}
        
        // 2. Update Hero Card
        var hero = document.getElementById('region-hero-card');
        var hexCount = getRegionHexCount(regId);
        var hotelCount = getRegionHotelCount(regId);
        
        hero.innerHTML = 
            '<div style="display:flex; justify-content:space-between; align-items:flex-start; margin-bottom:6px;">' +
            '  <div>' +
            '    <div style="font-size:10px; text-transform:uppercase; font-weight:800; color:' + regColor + '; letter-spacing:0.5px;">ACTIVE REGION</div>' +
            '    <div style="font-size:15px; font-weight:800; color:#0f172a; margin-top:1px;">' + meta.name + '</div>' +
            '  </div>' +
            '  <span style="background:' + regColor + '; color:#ffffff; font-size:12px; font-weight:800; padding:3px 8px; border-radius:12px;">' +
            '    ' + meta.code + '' +
            '  </span>' +
            '</div>' +
            '<div style="font-size:11px; color:#0f766e; font-weight:700; margin-bottom:8px;">🚚 ' + meta.lotr_route + '</div>' +
            '<div style="display:grid; grid-template-columns:repeat(3, 1fr); gap:4px; font-size:11px; background:#ffffff; padding:6px; border-radius:6px; border:1px solid #e2e8f0; text-align:center; margin-bottom:8px;">' +
            '  <div><b>Hotels:</b> ' + hotelCount + '</div>' +
            '  <div><b>Hexagons:</b> ' + hexCount + '</div>' +
            '  <div><b>Tier:</b> ' + (meta.tier === "Urban Core" ? "Core" : "Corridor") + '</div>' +
            '</div>' +
            '<button onclick="zoomToRegion(' + regId + ')" style="width:100%; background:#ffffff; color:#0f172a; border:1px solid #0f172a; border-radius:6px; padding:5px 0; font-size:11px; font-weight:700; cursor:pointer; display:flex; align-items:center; justify-content:center; gap:4px;">' +
            '  <span>🔍</span> Focus Region on Map' +
            '</button>';
            
        // 3. Populate Areas & Localities List
        var areasContainer = document.getElementById('areas-chip-container');
        var areasCountBadge = document.getElementById('areas-count-badge');
        var areasList = meta.areas_list || [];
        areasCountBadge.innerText = areasList.length;
        
        var areasHtml = '';
        for (var a = 0; a < areasList.length; a++) {{
            areasHtml += 
                '<div style="background:#ffffff; border:1px solid #cbd5e1; border-left:3.5px solid ' + regColor + '; padding:5px 8px; border-radius:5px; font-size:11.5px; font-weight:600; color:#1e293b; display:flex; align-items:center; gap:5px;">' +
                '  <span style="color:' + regColor + '; font-size:10px;">●</span> ' + areasList[a] +
                '</div>';
        }}
        areasContainer.innerHTML = areasHtml;
        
        // 4. Populate Hotels in this Region
        var hotelsContainer = document.getElementById('hotels-list-container');
        var hotelsCountBadge = document.getElementById('hotels-count-badge');
        var regHotels = hotelList.filter(function(h) {{ return h.region === regId; }});
        hotelsCountBadge.innerText = regHotels.length;
        
        var hotelsHtml = '';
        for (var h = 0; h < regHotels.length; h++) {{
            var hotel = regHotels[h];
            hotelsHtml += 
                '<div onclick="focusHotel(' + hotel.lat + ', ' + hotel.lon + ')" ' +
                '     style="background:#ffffff; border:1px solid #e2e8f0; border-radius:6px; padding:5px 8px; font-size:11px; cursor:pointer; display:flex; justify-content:space-between; align-items:center; transition:background 0.15s;" ' +
                '     onmouseover="this.style.background=\\'#f1f5f9\\'" onmouseout="this.style.background=\\'#ffffff\\'">' +
                '  <span style="font-weight:700; color:#0f172a; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; max-width:230px;">' +
                '    🏨 ' + hotel.name +
                '  </span>' +
                '  <span style="color:#64748b; font-size:10px; font-weight:500;">' + hotel.dist_center_km + 'km</span>' +
                '</div>';
        }}
        hotelsContainer.innerHTML = hotelsHtml;
        
        if (shouldFly) {{
            window.zoomToRegion(regId);
        }}
    }};
    
    function getRegionHotelCount(r) {{
        return hotelList.filter(function(h) {{ return h.region === r; }}).length;
    }}
    
    function getRegionHexCount(r) {{
        var count = 0;
        for (var h in hexMap) {{
            if (hexMap[h] === r) count++;
        }}
        return count;
    }}
    
    window.zoomToRegion = function(regId) {{
        var b = regionBounds[String(regId)];
        if (b) {{
            map.flyToBounds(b, {{ padding: [60, 60], duration: 1.2 }});
        }}
    }};
    
    window.focusHotel = function(lat, lon) {{
        map.flyTo([lat, lon], 14, {{ duration: 1.0 }});
        map.eachLayer(function(layer) {{
            if (layer.getLatLng && layer._latlng) {{
                if (Math.abs(layer._latlng.lat - lat) < 0.0001 && Math.abs(layer._latlng.lng - lon) < 0.0001) {{
                    layer.openPopup();
                }}
            }}
        }});
    }};
    
    // Map Click Listener -> Auto-Select Region in Explorer when any hexagon is clicked
    map.on('click', function(e) {{
        var hexId = h3.latLngToCell(e.latlng.lat, e.latlng.lng, 7);
        var regId = hexMap[hexId];
        if (regId !== undefined) {{
            window.selectRegion(regId, false);
        }}
    }});
    
    // Top Coordinate Search Handler
    window.processHotelCoordinate = function() {{
        var inputVal = document.getElementById('hotel-coord-input').value.trim();
        if (!inputVal) {{
            alert("Please enter hotel coordinates (e.g. 12.9352, 77.6145)");
            return;
        }}
        
        var parts = inputVal.split(/[,\\s]+/);
        if (parts.length < 2) {{
            alert("Invalid format! Please enter Latitude and Longitude (e.g. 12.9352, 77.6145)");
            return;
        }}
        
        var lat = parseFloat(parts[0]);
        var lon = parseFloat(parts[1]);
        if (isNaN(lat) || isNaN(lon)) {{
            alert("Latitude and Longitude must be numbers!");
            return;
        }}
        
        var hexId = h3.latLngToCell(lat, lon, 7);
        var regionId = hexMap[hexId];
        var inFootprint = (regionId !== undefined);
        
        if (regionId === undefined) {{
            var minDistHex = 999999;
            var nearestH = null;
            var keys = Object.keys(hexMap);
            for (var k = 0; k < keys.length; k++) {{
                var gd = h3.gridDistance(keys[k], hexId);
                if (gd < minDistHex) {{
                    minDistHex = gd;
                    nearestH = keys[k];
                }}
            }}
            regionId = nearestH ? hexMap[nearestH] : 0;
        }}
        
        var meta = (regionId !== undefined && regionMeta[String(regionId)]) ? regionMeta[String(regionId)] : null;
        var regionName = meta ? meta.name : ("Region " + regionId);
        var regionCode = meta ? meta.code : ("R" + regionId);
        var lotrRoute = meta ? meta.lotr_route : "N/A";
        var regColor = meta ? meta.color : "#334155";
        
        var boundary = h3.cellToBoundary(hexId);
        var distCenter = haversineDist(12.9716, 77.5946, lat, lon).toFixed(1);
        
        var nearestHotel = null;
        var minDist = 999999;
        for (var i = 0; i < hotelList.length; i++) {{
            var d = haversineDist(lat, lon, hotelList[i].lat, hotelList[i].lon);
            if (d < minDist) {{
                minDist = d;
                nearestHotel = hotelList[i];
            }}
        }}
        
        if (hotelMarker) {{ map.removeLayer(hotelMarker); }}
        if (hotelHexPolygon) {{ map.removeLayer(hotelHexPolygon); }}
        
        hotelHexPolygon = L.polygon(boundary, {{
            color: "#f59e0b",
            weight: 4.5,
            fillColor: "#fef08a",
            fillOpacity: 0.65,
            dashArray: "6, 6"
        }}).addTo(map);
        
        hotelMarker = L.circleMarker([lat, lon], {{
            radius: 9,
            color: "#000000",
            weight: 3.5,
            fillColor: "#f59e0b",
            fillOpacity: 1.0
        }}).addTo(map);
        
        var footprintBadge = inFootprint 
            ? "<span style='background:#dcfce7; color:#15803d; padding:2px 6px; border-radius:4px; font-weight:bold; font-size:11px;'>✅ Inside Active Operational Footprint</span>"
            : "<span style='background:#fee2e2; color:#b91c1c; padding:2px 6px; border-radius:4px; font-weight:bold; font-size:11px;'>⚠️ Outside Footprint (Nearest Route Assigned)</span>";
            
        var popupHtml = "<div style='font-family: Arial; font-size: 13px; min-width: 230px;'>" +
                        "<div style='font-size:15px; font-weight:700; color:#0f172a; margin-bottom:4px;'>🏨 New Hotel Location</div>" +
                        "<div style='margin-bottom:6px;'>" + footprintBadge + "</div>" +
                        "<hr style='margin:4px 0 8px 0;'>" +
                        "<b>Assigned Region:</b> <span style='color:" + regColor + "; font-weight:bold; font-size:13px;'>" + regionName + "</span><br>" +
                        "<b>Code:</b> <span style='background:#f1f5f9; padding:2px 5px; border-radius:4px; font-weight:bold;'>" + regionCode + "</span><br>" +
                        "<b>LinenGrass Route:</b> <span style='color:#0f766e; font-weight:600;'>{r_route}</span><br>" +
                        "<b>Coordinates:</b> " + lat.toFixed(5) + ", " + lon.toFixed(5) + "<br>" +
                        "<b>Nearest Hotel:</b> " + nearestHotel.name + " (" + minDist.toFixed(2) + " km away, " + nearestHotel.region_code + ")<br>" +
                        "<b>Dist to Center:</b> " + distCenter + " km" +
                        "</div>";
        hotelMarker.bindPopup(popupHtml).openPopup();
        
        map.flyTo([lat, lon], 12);
        
        var card = document.getElementById('hotel-result-card');
        card.style.display = 'block';
        card.innerHTML = 
            "<div style='display:flex; justify-content:space-between; align-items:flex-start; margin-bottom:8px;'>" +
            "  <div>" +
            "    <div style='font-size:10px; text-transform:uppercase; font-weight:700; color:#64748b;'>IDENTIFIED REGION</div>" +
            "    <div style='font-size:15px; font-weight:800; color:" + regColor + "; margin-top:2px;'>" + regionName + "</div>" +
            "    <div style='font-size:11px; color:#0f766e; font-weight:700; margin-top:1px;'>🚚 " + lotrRoute + "</div>" +
            "    <div style='margin-top:3px;'>" + footprintBadge + "</div>" +
            "  </div>" +
            "  <span style='background:" + regColor + "; color:white; font-size:12px; font-weight:700; padding:3px 10px; border-radius:12px;'>" +
            "    " + regionCode + "" +
            "  </span>" +
            "</div>" +
            "<div style='display:grid; grid-template-columns: 1fr 1fr; gap:6px; font-size:11px; background:#f8fafc; padding:8px; border-radius:6px; border:1px solid #e2e8f0;'>" +
            "  <div><b>⬡ Hex:</b> <code>" + hexId + "</code></div>" +
            "  <div><b>🎯 Dist Center:</b> " + distCenter + " km</div>" +
            "  <div style='grid-column: span 2;'><b>🏨 Nearest:</b> " + nearestHotel.name + " (" + minDist.toFixed(2) + " km, " + nearestHotel.region_code + ")</div>" +
            "</div>";
            
        // Also sync the right explorer box to this identified region!
        window.selectRegion(regionId, false);
    }};
    
    window.clearHotelSearch = function() {{
        document.getElementById('hotel-coord-input').value = '';
        document.getElementById('hotel-result-card').style.display = 'none';
        if (hotelMarker) {{ map.removeLayer(hotelMarker); hotelMarker = null; }}
        if (hotelHexPolygon) {{ map.removeLayer(hotelHexPolygon); hotelHexPolygon = null; }}
    }};
    
    document.getElementById('hotel-coord-input').addEventListener('keypress', function(e) {{
        if (e.key === 'Enter') {{
            processHotelCoordinate();
        }}
    }});
    
    // Default initialization to Region 0
    window.selectRegion(0, false);
}});
</script>
"""
m.get_root().html.add_child(folium.Element(explorer_and_search_html))

# 11. Move Layer Control to bottom right so it doesn't overlap the right explorer box
folium.LayerControl(position='bottomright', collapsed=True).add_to(m)

# 12. Save Map and Copy to index.html
output_map_path = "bmr_hotel_regions_map.html"
m.save(output_map_path)
shutil.copyfile("bmr_hotel_regions_map.html", "index.html")
print(f"✅ Generated map: {output_map_path}")
print(f"✅ Synced to: index.html")
