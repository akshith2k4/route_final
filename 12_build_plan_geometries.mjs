import fs from "node:fs";

const PLAN_PATH = "data/plan.json";
const OUTPUT_PATH = "data/plan_geometries.json";
const BASE_URL = (process.env.OSRM_BASE_URL ?? "https://router.project-osrm.org").replace(/\/+$/, "");
const DELAY_MS = 400;

const plan = JSON.parse(fs.readFileSync(PLAN_PATH, "utf8"));

function haversineKm(lat1, lon1, lat2, lon2) {
  const radius = 6371;
  const toRad = (value) => (value * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return radius * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function simplify(points, minMeters = 35, maxPoints = 450) {
  if (points.length <= 2) return points;
  const kept = [points[0]];
  for (let index = 1; index < points.length - 1; index += 1) {
    const previous = kept[kept.length - 1];
    const point = points[index];
    if (haversineKm(previous[0], previous[1], point[0], point[1]) * 1000 >= minMeters) {
      kept.push(point);
    }
  }
  kept.push(points[points.length - 1]);

  if (kept.length <= maxPoints) return kept;
  const sampled = [kept[0]];
  const step = (kept.length - 1) / (maxPoints - 1);
  for (let index = 1; index < maxPoints - 1; index += 1) {
    sampled.push(kept[Math.round(index * step)]);
  }
  sampled.push(kept[kept.length - 1]);
  return sampled;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchGeometry(route) {
  const points = [
    [plan.depot.lat, plan.depot.lon],
    ...route.stops.map((stop) => [stop.lat, stop.lon]),
    [plan.depot.lat, plan.depot.lon],
  ];
  if (points.length < 3) return null;

  const coords = points.map(([lat, lon]) => `${lon.toFixed(6)},${lat.toFixed(6)}`).join(";");
  const url = `${BASE_URL}/route/v1/driving/${coords}?overview=full&geometries=geojson&steps=false`;

  let lastError = null;
  for (let attempt = 1; attempt <= 4; attempt += 1) {
    try {
      const response = await fetch(url, {
        headers: { "User-Agent": "route-final-plan-geometry/1.0" },
        signal: AbortSignal.timeout(60_000),
      });
      if (!response.ok) {
        const body = (await response.text()).slice(0, 200);
        throw new Error(`OSRM ${response.status}: ${body}`);
      }
      const payload = await response.json();
      if (payload.code !== "Ok" || !payload.routes?.[0]?.geometry?.coordinates) {
        throw new Error(`OSRM error: ${payload.code ?? "missing geometry"}`);
      }
      return payload.routes[0].geometry.coordinates.map(([lon, lat]) => [lat, lon]);
    } catch (error) {
      lastError = error;
      if (attempt === 4) break;
      await sleep(1000 * 2 ** (attempt - 1));
    }
  }
  throw lastError;
}

const geometries = {};
for (const route of plan.routes) {
  try {
    const geometry = await fetchGeometry(route);
    if (!geometry) {
      console.warn(`  ${route.route_id}: skipped (no stops)`);
      continue;
    }
    geometries[route.route_id] = simplify(geometry);
    console.log(
      `  ${route.route_id}: ${geometry.length} -> ${geometries[route.route_id].length} points`,
    );
  } catch (error) {
    console.warn(`  ${route.route_id}: failed (${error.message})`);
  }
  await sleep(DELAY_MS);
}

const output = {
  schema_version: 1,
  provider: "osrm",
  base_url: BASE_URL,
  generated_at: new Date().toISOString(),
  routes: geometries,
};

fs.writeFileSync(OUTPUT_PATH, `${JSON.stringify(output)}\n`);
console.log(`Wrote ${OUTPUT_PATH}`);
console.log(`Routes: ${Object.keys(geometries).length}/${plan.routes.length}`);
console.log(
  `Size: ${(fs.statSync(OUTPUT_PATH).size / 1024).toFixed(0)} KB`,
);
