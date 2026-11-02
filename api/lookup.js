const h3 = require('h3-js');
const hexMap = require('../data/hex_map.json');
const corridorToId = require('../data/corridor_to_id.json');
const hotels = require('../data/hotels.json');

const regionMetadata = require('../data/region_metadata.json');

const idToCorridor = {};
for (const [name, id] of Object.entries(corridorToId)) {
  idToCorridor[id] = name;
}

function haversine(lat1, lon1, lat2, lon2) {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
            Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
            Math.sin(dLon/2) * Math.sin(dLon/2);
  return 2 * R * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
}

module.exports = (req, res) => {
  // Enable CORS
  res.setHeader('Access-Control-Allow-Credentials', true);
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
  res.setHeader('Access-Control-Allow-Headers', 'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version');

  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  let lat, lon;
  if (req.method === 'POST') {
    const body = req.body || {};
    lat = parseFloat(body.lat || body.latitude);
    lon = parseFloat(body.lon || body.lng || body.longitude);
  } else {
    lat = parseFloat(req.query.lat || req.query.latitude);
    lon = parseFloat(req.query.lon || req.query.lng || req.query.longitude);
  }

  if (isNaN(lat) || isNaN(lon)) {
    return res.status(400).json({
      status: "error",
      message: "Please provide valid numeric lat and lon parameters (e.g. ?lat=12.9352&lon=77.6145)"
    });
  }

  // 1. Calculate H3 Hexagon
  const hexId = h3.latLngToCell(lat, lon, 7);

  // 2. Lookup Region
  let regionId = hexMap[hexId];
  let lookupType = "exact";

  if (regionId === undefined) {
    lookupType = "outside_50km_bmr";
  }

  const isUrban = (regionId !== undefined && regionId < 10);
  const meta = (regionId !== undefined && regionMetadata[String(regionId)]) ? regionMetadata[String(regionId)] : null;

  let regionCode = "UNMAPPED";
  let regionName = "Outside BMR 50km";
  let shortName = "Outside BMR";
  let lotrRoute = "N/A";
  let keyAreas = "";
  let tier = "Unmapped / Outside 50km";
  let color = "#334155";

  if (meta) {
    regionCode = meta.code;
    regionName = meta.name;
    shortName = meta.short_name;
    lotrRoute = meta.lotr_route;
    keyAreas = meta.key_areas;
    tier = meta.tier;
    color = meta.color;
  } else if (regionId !== undefined) {
    if (isUrban) {
      regionCode = `Urban-R${regionId}`;
      regionName = `Urban Region ${regionId}`;
      tier = "Urban Core (Inside BBMP)";
    } else {
      const cname = idToCorridor[regionId] || `Corridor ${regionId}`;
      regionCode = `Outer-R${regionId}`;
      regionName = `R${regionId}: ${cname}`;
      tier = "Outer Highway Corridor (BMR)";
    }
  }

  // 3. Hexagon Boundary
  const boundary = h3.cellToBoundary(hexId);

  // 4. Distances
  const distCenter = parseFloat(haversine(12.9716, 77.5946, lat, lon).toFixed(2));

  // 5. Nearest Hotel
  let nearestHotel = null;
  let minDist = 999999;
  for (const h of hotels) {
    const d = haversine(lat, lon, h.lat, h.lon);
    if (d < minDist) {
      minDist = d;
      nearestHotel = {
        name: h.name,
        distance_km: parseFloat(d.toFixed(2)),
        region_id: h.region
      };
    }
  }

  return res.status(200).json({
    status: "success",
    input_coordinates: { lat, lon },
    region_id: regionId !== undefined ? regionId : null,
    region_code: regionCode,
    region_name: regionName,
    short_name: shortName,
    lotr_route: lotrRoute,
    key_areas: keyAreas,
    tier: tier,
    color: color,
    hexagon_id: hexId,
    hexagon_resolution: 7,
    lookup_type: lookupType,
    dist_from_bangalore_center_km: distCenter,
    nearest_hotel: nearestHotel,
    hexagon_boundary: boundary
  });
};
