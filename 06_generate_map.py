"""
Step 6: Enhanced BMR Hotel Clustering & Corridor Map with Proper Identifiable Region Names
Features:
- BMR 50km Outer Boundary Circle around the entire operational system
- Thick dark separation boundaries between all regions
- High-contrast, rich colors matching LinenGrass design palette
- All 100 Hotels prominently visible with rich tooltips & popups
- Crisp hexagon grid lines
- BBMP City Limits boundary outline
- Master Region Metadata (Identifiable Names, Codes, LOTR routes, Key Areas)
- Prominent Top-Center Search Bar: Enter new hotel coordinates (lat, lon) ->
  Instantly highlights the hotel point, its exact H3 hexagon, and shows its assigned region name,
  LOTR route, key localities, operational tier, and nearest existing hotel.
"""
import folium
from folium import plugins
import geopandas as gpd
import pandas as pd
import joblib
import h3
import json
from shapely.geometry import Polygon, mapping
from shapely.ops import unary_union

# ---- Load Data ----
df_urban = pd.read_csv('hotels_urban_clustered.csv')
df_outer = pd.read_csv('hotels_outer_clustered.csv')
gdf_bbmp = gpd.read_file('bbmp.geojson')
hex_map = joblib.load('hex_map_final.pkl')
corridor_to_id = joblib.load('corridor_to_id_final.pkl')
id_to_corridor = {v: k for k, v in corridor_to_id.items()}
centroids_df = pd.read_csv('urban_centroids.csv')

with open('data/region_metadata.json', 'r') as f:
    REGION_METADATA = json.load(f)

COLOR_PALETTE = {int(k): v['color'] for k, v in REGION_METADATA.items()}

BANGALORE_CENTER = [12.9716, 77.5946]
m = folium.Map(
    location=BANGALORE_CENTER,
    zoom_start=10,
    tiles="OpenStreetMap",
    control_scale=True
)

# 1. BMR 50KM CIRCLE
bmr_circle_group = folium.FeatureGroup(name="BMR 50 km Outer Circle", show=True)
folium.Circle(
    location=BANGALORE_CENTER,
    radius=50000,
    color="#000000",
    weight=4.0,
    dash_array="12, 10",
    fill=False,
    popup="<b>BMR 50 km Radius Boundary</b><br>Full BMR Operational Limit",
    tooltip="BMR 50 km Outer Boundary Circle"
).add_to(bmr_circle_group)

folium.CircleMarker(
    location=BANGALORE_CENTER,
    radius=5,
    color="#000000",
    weight=2,
    fill=True,
    fill_color="#ffffff",
    popup="Bangalore Center (12.9716, 77.5946)",
    tooltip="Bangalore Center"
).add_to(bmr_circle_group)
bmr_circle_group.add_to(m)

# 2. BBMP BOUNDARY
bbmp_group = folium.FeatureGroup(name="BBMP City Limits", show=True)
folium.GeoJson(
    gdf_bbmp,
    style_function=lambda feature: {
        "fillColor": "#2563eb",
        "fillOpacity": 0.05,
        "color": "#1d4ed8",
        "weight": 3.0,
        "dashArray": "6, 6"
    },
    tooltip="BBMP City Limits Boundary"
).add_to(bbmp_group)
bbmp_group.add_to(m)

# 3. HEXAGONS (WITH CRISP BORDERS & PROPER REGION LABELS)
urban_hex_group = folium.FeatureGroup(name="Urban Hexagons (R0-R7)", show=True)
outer_hex_group = folium.FeatureGroup(name="Outer Corridor Hexagons (R10-R22)", show=True)
region_hex_polys = {}

for h, r in hex_map.items():
    boundary = h3.cell_to_boundary(h)
    color = COLOR_PALETTE.get(r, "#64748b")
    is_urban = (r < 10)
    meta = REGION_METADATA.get(str(r), {})
    r_name = meta.get('name', f'Region {r}')
    r_code = meta.get('code', f'R{r}')
    r_route = meta.get('lotr_route', '')
    
    poly = Polygon([(p[1], p[0]) for p in boundary])
    region_hex_polys.setdefault(r, []).append(poly)
    
    tooltip_html = f"<b>{r_name}</b> ({r_code})<br><span style='color:#475569;'>{r_route}</span><br>Hex: {h}"
    
    folium.Polygon(
        locations=boundary,
        color="#1e293b",
        weight=0.9,
        fill=True,
        fill_color=color,
        fill_opacity=0.55 if is_urban else 0.45,
        tooltip=tooltip_html
    ).add_to(urban_hex_group if is_urban else outer_hex_group)

urban_hex_group.add_to(m)
outer_hex_group.add_to(m)

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
            "weight": 3.2,
            "fill": False,
            "opacity": 0.95
        },
        tooltip=f"Boundary: {r_name} ({r_code})"
    ).add_to(boundaries_group)
boundaries_group.add_to(m)

# 5. URBAN REGION CENTROIDS
centroid_group = folium.FeatureGroup(name="Urban Region Centroids", show=True)
for _, c in centroids_df.iterrows():
    r = int(c['region'])
    meta = REGION_METADATA.get(str(r), {})
    r_name = meta.get('name', f'Urban R{r}')
    r_code = meta.get('code', f'Urban-R{r}')
    r_route = meta.get('lotr_route', '')
    color = COLOR_PALETTE.get(r, "#000000")
    
    popup_html = f"""
    <div style='font-family: Arial, sans-serif; min-width: 230px;'>
        <b style='font-size: 14px; color: {color};'>{r_code} Centroid</b><br>
        <div style='font-weight: bold; margin-top: 2px;'>{r_name}</div>
        <div style='color: #4b5563; font-size: 12px; margin-bottom: 6px;'>{r_route}</div>
        <hr style='margin: 4px 0 6px 0; border: none; border-top: 1px solid #d1d5db;'>
        <b>Hotels in cluster:</b> {int(c['count'])}<br>
        <b>Key Areas:</b> {meta.get('key_areas', '')}
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
        tooltip=f"Centroid: {r_name} ({r_code})"
    ).add_to(centroid_group)
centroid_group.add_to(m)

# 6. HOTELS LAYER (ALL 100 WITH PROPER NAMES)
hotels_group = folium.FeatureGroup(name="Hotels (100)", show=True)
df_all_hotels = pd.concat([
    df_urban.assign(is_outer=False, final_region=df_urban['region_urban']),
    df_outer.assign(is_outer=True, final_region=df_outer['region_outer'])
], ignore_index=True)
df_all_hotels.loc[df_all_hotels['name'] == 'UK COMFORTS', 'final_region'] = 2

hotel_list_js = []
for _, h_row in df_all_hotels.iterrows():
    r = int(h_row['final_region'])
    meta = REGION_METADATA.get(str(r), {})
    color = COLOR_PALETTE.get(r, "#000000")
    is_outer = h_row['is_outer']
    r_name = meta.get('name', f"Region {r}")
    r_code = meta.get('code', f"R{r}")
    r_route = meta.get('lotr_route', "")
    
    hotel_list_js.append({
        "name": h_row['name'],
        "lat": float(h_row['lat']),
        "lon": float(h_row['lon']),
        "region": r,
        "region_code": r_code,
        "region_name": r_name,
        "lotr_route": r_route
    })
    
    popup_html = f"""
    <div style='font-family: Arial, sans-serif; min-width: 240px;'>
        <h4 style='margin: 0 0 4px 0; color: #111827; font-size: 14px;'>{h_row['name']}</h4>
        <hr style='margin: 4px 0 6px 0; border: none; border-top: 1px solid #d1d5db;'>
        <b>Region:</b> <span style='color: {color}; font-weight: bold;'>{r_name}</span><br>
        <b>Code:</b> <span style='background:#f1f5f9; padding:1px 4px; border-radius:3px; font-weight:bold;'>{r_code}</span><br>
        <b>LinenGrass Route:</b> <span style='color:#0f766e; font-weight:600;'>{r_route}</span><br>
        <b>Tier:</b> {'Outer Corridor (Outside BBMP)' if is_outer else 'Urban Core (Inside BBMP)'}<br>
        <b>Coordinates:</b> {h_row['lat']:.4f}, {h_row['lon']:.4f}<br>
        <b>Dist from Center:</b> {h_row['dist_center_km']:.1f} km
    </div>
    """
    
    folium.CircleMarker(
        location=[h_row['lat'], h_row['lon']],
        radius=7.5,
        color="#000000",
        weight=2.0,
        fill=True,
        fill_color=color,
        fill_opacity=1.0,
        popup=folium.Popup(popup_html, max_width=320),
        tooltip=f"🏨 {h_row['name']} → {r_name} ({r_code})"
    ).add_to(hotels_group)
hotels_group.add_to(m)

# 7. FLOATING LEGEND (BOTTOM-LEFT WITH IDENTIFIABLE NAMES)
legend_html = f"""
<div style="position: fixed; 
     bottom: 25px; left: 25px; width: 310px; max-height: 420px; overflow-y: auto;
     background-color: rgba(255, 255, 255, 0.97); z-index:9999; font-size:12px;
     border:2px solid #0f172a; border-radius: 10px; padding: 14px; box-shadow: 0 8px 24px rgba(0,0,0,0.25);">
     
     <div style="font-weight: 800; font-size: 15px; margin-bottom: 4px; color: #0f172a;">LinenGrass Region Map</div>
     <div style="margin-bottom: 8px; font-size: 11px; color: #475569;">
         <span style="border-bottom: 3px dashed #000000; padding-bottom: 2px;">━━</span> <b>BMR 50km Limit</b> &nbsp;|&nbsp;
         <span style="border-bottom: 3px solid #000000; padding-bottom: 2px;">━━</span> <b>Region Boundaries</b>
     </div>
     
     <hr style="margin: 6px 0; border-top: 1px solid #cbd5e1;">
     <div style="font-weight: 700; color: #0f172a; margin-bottom: 6px; font-size: 12px; text-transform: uppercase; letter-spacing: 0.5px;">Urban Core Regions (86 Hotels)</div>
     
     <div style="margin-bottom: 3px;"><i style="background:{COLOR_PALETTE[0]}; width:12px; height:12px; display:inline-block; border-radius:3px; border:1px solid #000;"></i> <b>R0:</b> South (BTM & Hulimavu) <span style="color:#64748b;">[15]</span></div>
     <div style="margin-bottom: 3px;"><i style="background:{COLOR_PALETTE[1]}; width:12px; height:12px; display:inline-block; border-radius:3px; border:1px solid #000;"></i> <b>R1:</b> Central (CBD, Indiranagar & MG) <span style="color:#64748b;">[17]</span></div>
     <div style="margin-bottom: 3px;"><i style="background:{COLOR_PALETTE[2]}; width:12px; height:12px; display:inline-block; border-radius:3px; border:1px solid #000;"></i> <b>R2:</b> North (Hebbal & Manyata) <span style="color:#64748b;">[16]</span></div>
     <div style="margin-bottom: 3px;"><i style="background:{COLOR_PALETTE[3]}; width:12px; height:12px; display:inline-block; border-radius:3px; border:1px solid #000;"></i> <b>R3:</b> East (Whitefield & Marathahalli) <span style="color:#64748b;">[6]</span></div>
     <div style="margin-bottom: 3px;"><i style="background:{COLOR_PALETTE[4]}; width:12px; height:12px; display:inline-block; border-radius:3px; border:1px solid #000;"></i> <b>R4:</b> South-West (JP Nagar & Jayanagar) <span style="color:#64748b;">[8]</span></div>
     <div style="margin-bottom: 3px;"><i style="background:{COLOR_PALETTE[5]}; width:12px; height:12px; display:inline-block; border-radius:3px; border:1px solid #000;"></i> <b>R5:</b> North-West (Yeshwanthpur & Peenya) <span style="color:#64748b;">[5]</span></div>
     <div style="margin-bottom: 3px;"><i style="background:{COLOR_PALETTE[6]}; width:12px; height:12px; display:inline-block; border-radius:3px; border:1px solid #000;"></i> <b>R6:</b> South-East (Koramangala & HSR) <span style="color:#64748b;">[15]</span></div>
     <div style="margin-bottom: 3px;"><i style="background:{COLOR_PALETTE[7]}; width:12px; height:12px; display:inline-block; border-radius:3px; border:1px solid #000;"></i> <b>R7:</b> Far South (Kanakapura Rd) <span style="color:#64748b;">[4]</span></div>
     
     <hr style="margin: 8px 0 6px 0; border-top: 1px solid #cbd5e1;">
     <div style="font-weight: 700; color: #0f172a; margin-bottom: 6px; font-size: 12px; text-transform: uppercase; letter-spacing: 0.5px;">Active Outer Corridors (14 Hotels)</div>
     <div style="margin-bottom: 3px;"><i style="background:{COLOR_PALETTE[11]}; width:12px; height:12px; display:inline-block; border-radius:3px; border:1px solid #000;"></i> <b>R11:</b> Outer North (Devanahalli Airport) <span style="color:#64748b;">[1]</span></div>
     <div style="margin-bottom: 3px;"><i style="background:{COLOR_PALETTE[19]}; width:12px; height:12px; display:inline-block; border-radius:3px; border:1px solid #000;"></i> <b>R19:</b> Outer West (Magadi Road) <span style="color:#64748b;">[1]</span></div>
     <div style="margin-bottom: 3px;"><i style="background:{COLOR_PALETTE[22]}; width:12px; height:12px; display:inline-block; border-radius:3px; border:1px solid #000;"></i> <b>R22:</b> Outer South (E-City & Attibele) <span style="color:#64748b;">[12]</span></div>
</div>
"""
m.get_root().html.add_child(folium.Element(legend_html))

# 8. EMBED H3 LIBRARY SCRIPT
m.get_root().header.add_child(folium.Element('<script src="https://unpkg.com/h3-js@4.1.0/dist/h3-js.umd.js"></script>'))

# 9. DEDICATED NEW HOTEL COORDINATE SEARCH BAR (TOP CENTER)
map_name = m.get_name()
hex_map_json = json.dumps(hex_map)
region_meta_json = json.dumps(REGION_METADATA)
hotel_list_json = json.dumps(hotel_list_js)

search_box_html = f"""
<!-- Top-Center New Hotel Coordinate Search Bar -->
<div id="new-hotel-search-bar" style="position: fixed; 
     top: 16px; left: 50%; transform: translateX(-50%); width: 620px; max-width: 92vw; z-index: 99999; 
     font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;">
     
     <div style="background: #ffffff; border: 2px solid #0f172a; border-radius: 30px; 
                 box-shadow: 0 8px 25px rgba(0,0,0,0.28); display: flex; align-items: center; 
                 padding: 6px 8px 6px 18px;">
         
         <span style="font-size: 18px; margin-right: 10px;">📍</span>
         
         <input type="text" id="hotel-coord-input" 
                placeholder="Enter Hotel Coordinates: e.g. 12.9352, 77.6145" 
                style="flex: 1; border: none; outline: none; font-size: 14px; color: #0f172a; font-weight: 500; background: transparent;">
         
         <button id="btn-search-hotel" onclick="processHotelCoordinate()" 
                 style="background: #0f172a; color: #ffffff; border: none; padding: 10px 22px; 
                        border-radius: 22px; font-size: 13px; font-weight: 700; cursor: pointer; transition: background 0.2s; white-space: nowrap;">
             Find Region & Route
         </button>
         
         <button onclick="clearHotelSearch()" title="Clear search"
                 style="background: transparent; color: #64748b; border: none; padding: 6px 10px; font-size: 18px; cursor: pointer; margin-left: 2px;">
             &times;
         </button>
     </div>
     
     <!-- Results Card Popup right below search bar -->
     <div id="hotel-result-card" style="display: none; margin-top: 10px; background: rgba(255, 255, 255, 0.98); 
          border: 2px solid #0f172a; border-radius: 12px; padding: 16px; 
          box-shadow: 0 10px 30px rgba(0,0,0,0.3); backdrop-filter: blur(8px);">
     </div>
</div>

<script>
window.addEventListener('DOMContentLoaded', function() {{
    var map = {map_name};
    var hexMap = {hex_map_json};
    var regionMeta = {region_meta_json};
    var hotelList = {hotel_list_json};
    
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
    
    window.processHotelCoordinate = function() {{
        var inputVal = document.getElementById('hotel-coord-input').value.trim();
        if (!inputVal) {{
            alert("Please enter hotel coordinates (e.g. 12.9352, 77.6145)");
            return;
        }}
        
        var parts = inputVal.split(/[,\\s]+/);
        if (parts.length < 2) {{
            alert("Invalid format! Please enter Latitude and Longitude separated by a comma or space (e.g. 12.9352, 77.6145)");
            return;
        }}
        
        var lat = parseFloat(parts[0]);
        var lon = parseFloat(parts[1]);
        
        if (isNaN(lat) || isNaN(lon)) {{
            alert("Latitude and Longitude must be numbers!");
            return;
        }}
        
        // 1. Calculate H3 Hexagon
        var hexId = h3.latLngToCell(lat, lon, 7);
        
        // 2. Region Lookup from Metadata
        var regionId = hexMap[hexId];
        var meta = (regionId !== undefined && regionMeta[String(regionId)]) ? regionMeta[String(regionId)] : null;
        
        var regionName = "Outside BMR 50km";
        var regionCode = "UNMAPPED";
        var lotrRoute = "N/A";
        var tier = "Outside BMR 50km";
        var keyAreas = "";
        var regColor = "#334155";
        
        if (meta) {{
            regionName = meta.name;
            regionCode = meta.code;
            lotrRoute = meta.lotr_route;
            tier = meta.tier;
            keyAreas = meta.key_areas;
            regColor = meta.color;
        }} else if (regionId !== undefined) {{
            regionName = "Region " + regionId;
            regionCode = "R" + regionId;
        }}
        
        // 3. Hexagon boundary vertices
        var boundary = h3.cellToBoundary(hexId);
        
        // 4. Distances
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
        
        // Clear previous marker & hex
        if (hotelMarker) {{ map.removeLayer(hotelMarker); }}
        if (hotelHexPolygon) {{ map.removeLayer(hotelHexPolygon); }}
        
        // Draw the exact H3 Hexagon in bright gold with thick dashed border
        hotelHexPolygon = L.polygon(boundary, {{
            color: "#f59e0b",
            weight: 4.5,
            fillColor: "#fef08a",
            fillOpacity: 0.65,
            dashArray: "6, 6"
        }}).addTo(map);
        
        // Drop high-visibility New Hotel pin
        hotelMarker = L.circleMarker([lat, lon], {{
            radius: 9,
            color: "#000000",
            weight: 3.5,
            fillColor: "#f59e0b",
            fillOpacity: 1.0
        }}).addTo(map);
        
        // Popup
        var popupHtml = "<div style='font-family: Arial; font-size: 13px; min-width: 220px;'>" +
                        "<div style='font-size:15px; font-weight:700; color:#0f172a; margin-bottom:4px;'>🏨 New Hotel Location</div>" +
                        "<hr style='margin:4px 0 8px 0;'>" +
                        "<b>Assigned Region:</b> <span style='color:" + regColor + "; font-weight:bold; font-size:13px;'>" + regionName + "</span><br>" +
                        "<b>Code:</b> <span style='background:#f1f5f9; padding:2px 5px; border-radius:4px; font-weight:bold;'>" + regionCode + "</span><br>" +
                        "<b>LinenGrass Route:</b> <span style='color:#0f766e; font-weight:600;'>" + lotrRoute + "</span><br>" +
                        "<b>Tier:</b> " + tier + "<br>" +
                        "<b>Hexagon ID:</b> <code>" + hexId + "</code><br>" +
                        "<b>Coordinates:</b> " + lat.toFixed(5) + ", " + lon.toFixed(5) + "<br>" +
                        "<b>Nearest Hotel:</b> " + nearestHotel.name + " (" + minDist.toFixed(2) + " km away)<br>" +
                        "<b>Dist to Center:</b> " + distCenter + " km" +
                        "</div>";
        hotelMarker.bindPopup(popupHtml).openPopup();
        
        // Pan and zoom smoothly to new hotel
        map.flyTo([lat, lon], 12);
        
        // Show result card below input bar
        var card = document.getElementById('hotel-result-card');
        card.style.display = 'block';
        card.innerHTML = 
            "<div style='display:flex; justify-content:space-between; align-items:flex-start; margin-bottom:10px;'>" +
            "  <div>" +
            "    <div style='font-size:11px; text-transform:uppercase; font-weight:700; color:#64748b; letter-spacing:0.5px;'>IDENTIFIED REGION ASSIGNMENT</div>" +
            "    <div style='font-size:17px; font-weight:800; color:" + regColor + "; margin-top:2px;'>" + regionName + "</div>" +
            "    <div style='font-size:12px; color:#0f766e; font-weight:700; margin-top:2px;'>🚚 " + lotrRoute + "</div>" +
            "    <div style='font-size:12px; color:#475569; font-weight:500; margin-top:1px;'>" + tier + (keyAreas ? " &bull; <i>" + keyAreas + "</i>" : "") + "</div>" +
            "  </div>" +
            "  <span style='background:" + regColor + "; color:white; font-size:12px; font-weight:700; padding:4px 10px; border-radius:14px; white-space:nowrap;'>" +
            "    " + regionCode + "" +
            "  </span>" +
            "</div>" +
            "<div style='display:grid; grid-template-columns: 1fr 1fr; gap:8px; font-size:12px; background:#f8fafc; padding:10px; border-radius:8px; border:1px solid #e2e8f0;'>" +
            "  <div><b>⬡ H3 Hexagon:</b> <code style='background:#e2e8f0; padding:2px 4px; border-radius:4px;'>" + hexId + "</code></div>" +
            "  <div><b>🎯 Dist to Center:</b> " + distCenter + " km</div>" +
            "  <div style='grid-column: span 2;'><b>🏨 Nearest Known Hotel:</b> " + nearestHotel.name + " (" + minDist.toFixed(2) + " km away, " + nearestHotel.region_code + ")</div>" +
            "</div>";
    }};
    
    window.clearHotelSearch = function() {{
        document.getElementById('hotel-coord-input').value = '';
        document.getElementById('hotel-result-card').style.display = 'none';
        if (hotelMarker) {{ map.removeLayer(hotelMarker); hotelMarker = null; }}
        if (hotelHexPolygon) {{ map.removeLayer(hotelHexPolygon); hotelHexPolygon = null; }}
    }};
    
    // Allow pressing Enter key in the input box
    document.getElementById('hotel-coord-input').addEventListener('keypress', function(e) {{
        if (e.key === 'Enter') {{
            processHotelCoordinate();
        }}
    }});
}});
</script>
"""
m.get_root().html.add_child(folium.Element(search_box_html))

# Layer Controls
folium.LayerControl(collapsed=False).add_to(m)

# Save
output_map_path = "bmr_hotel_regions_map.html"
m.save(output_map_path)
print(f"✅ Generated map with proper region names & coordinate search: {output_map_path}")
