const h3 = require('h3-js');
const hexMap = require('../data/hex_map.json');
const hotels = require('../data/hotels.json');
const regionMetadata = require('../data/region_metadata.json');

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

  // 1. Calculate H3 Hexagon (Res 7)
  const hexId = h3.latLngToCell(lat, lon, 7);

  // 2. Lookup Region
  let regionId = hexMap[hexId];
  let lookupType = "exact";
  let inOperationalFootprint = true;

  if (regionId === undefined) {
    inOperationalFootprint = false;
    // Find nearest hex in operational footprint
    let minGridDist = 999999;
    let nearestHex = null;
    const hexKeys = Object.keys(hexMap);
    for (const h of hexKeys) {
      const gdist = h3.gridDistance(h, hexId);
      if (gdist < minGridDist) {
        minGridDist = gdist;
        nearestHex = h;
      }
    }
    regionId = nearestHex ? hexMap[nearestHex] : 0;
    lookupType = `outside_footprint (nearest: ${minGridDist} hexes away)`;
  }

  const meta = (regionId !== undefined && regionMetadata[String(regionId)]) ? regionMetadata[String(regionId)] : null;

  let regionCode = meta ? meta.code : `R${regionId}`;
  let regionName = meta ? meta.name : `Region ${regionId}`;
  let shortName = meta ? meta.short_name : regionName;
  let lotrRoute = meta ? meta.lotr_route : "N/A";
  let keyAreas = meta ? meta.key_areas : "";
  let tier = meta ? meta.tier : "Operational Route";
  let color = meta ? meta.color : "#334155";

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
        region_id: h.region,
        region_code: `R${h.region}`
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
    in_operational_footprint: inOperationalFootprint,
    hexagon_id: hexId,
    hexagon_resolution: 7,
    lookup_type: lookupType,
    dist_from_bangalore_center_km: distCenter,
    nearest_hotel: nearestHotel,
    hexagon_boundary: boundary
  });
};
