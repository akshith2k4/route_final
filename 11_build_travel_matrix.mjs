import fs from "node:fs";

const HOTELS_PATH = "data/hotels.json";
const FLEET_PATH = "data/fleet.json";
const OUTPUT_PATH = "data/travel_matrix.json";
const BASE_URL = (process.env.OSRM_BASE_URL ?? "https://router.project-osrm.org").replace(/\/+$/, "");
const BLOCK_SIZE = 50;
const DELAY_MS = 400;
const MAX_ATTEMPTS = 4;
const EXPLICIT_DURATION_FACTOR = process.env.OSRM_DURATION_FACTOR
  ? Number(process.env.OSRM_DURATION_FACTOR)
  : null;
const CALIBRATE = process.env.OSRM_CALIBRATE === "1";

if (
  EXPLICIT_DURATION_FACTOR !== null &&
  (!Number.isFinite(EXPLICIT_DURATION_FACTOR) ||
    EXPLICIT_DURATION_FACTOR <= 0)
) {
  throw new Error("OSRM_DURATION_FACTOR must be a positive number");
}

const hotels = JSON.parse(fs.readFileSync(HOTELS_PATH, "utf8"));
const fleet = JSON.parse(fs.readFileSync(FLEET_PATH, "utf8"));

const fleetDepots =
  Array.isArray(fleet.depots) && fleet.depots.length > 0
    ? fleet.depots
    : [fleet.depot];
const depotPoints = fleetDepots.map((depot, index) => ({
  id: depot.id ?? `depot-${index}`,
  name: depot.name,
  lat: depot.latitude,
  lon: depot.longitude,
  kind: "depot",
}));
const primaryDepotId = depotPoints[0].id;

const fleetLaundries = Array.isArray(fleet.laundries) ? fleet.laundries : [];
const laundryPoints = fleetLaundries.map((laundry, index) => ({
  id: laundry.id ?? `laundry-${index}`,
  name: laundry.name,
  lat: laundry.latitude,
  lon: laundry.longitude,
  kind: "laundry",
}));

const points = [
  ...depotPoints,
  ...laundryPoints,
  ...[...hotels]
    .sort((a, b) => a.id.localeCompare(b.id))
    .map((hotel) => ({
      id: hotel.id,
      name: hotel.name,
      lat: hotel.lat,
      lon: hotel.lon,
      kind: "hotel",
    })),
];

const count = points.length;
const durations = Array.from({ length: count }, () => Array(count).fill(null));
const distances = Array.from({ length: count }, () => Array(count).fill(null));

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function blocksOfIndices(size) {
  const blocks = [];
  for (let start = 0; start < count; start += size) {
    blocks.push(
      Array.from(
        { length: Math.min(size, count - start) },
        (_, offset) => start + offset,
      ),
    );
  }
  return blocks;
}

const blocks = blocksOfIndices(BLOCK_SIZE);

async function fetchBlock(originIndices, destinationIndices) {
  const originCoords = originIndices.map(
    (index) => `${points[index].lon.toFixed(6)},${points[index].lat.toFixed(6)}`,
  );
  const destinationCoords = destinationIndices.map(
    (index) => `${points[index].lon.toFixed(6)},${points[index].lat.toFixed(6)}`,
  );
  const coords = [...originCoords, ...destinationCoords];
  const sources = originIndices.map((_, index) => index).join(";");
  const destinations = destinationIndices
    .map((_, index) => originIndices.length + index)
    .join(";");
  const url =
    `${BASE_URL}/table/v1/driving/${coords.join(";")}` +
    `?annotations=duration,distance&sources=${sources}&destinations=${destinations}`;

  let lastError = null;
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
    try {
      const response = await fetch(url, {
        headers: { "User-Agent": "route-final-osrm-matrix/1.0" },
        signal: AbortSignal.timeout(60_000),
      });
      if (!response.ok) {
        const body = (await response.text()).slice(0, 300);
        const error = new Error(
          `OSRM ${response.status} for ${originIndices.length}x${destinationIndices.length} block: ${body}`,
        );
        error.retryAfter = Number(response.headers.get("retry-after")) || null;
        throw error;
      }
      const payload = await response.json();
      if (payload.code !== "Ok") {
        throw new Error(`OSRM error: ${payload.code ?? "unknown"}`);
      }
      if (
        !Array.isArray(payload.durations) ||
        payload.durations.length !== originIndices.length
      ) {
        throw new Error("OSRM returned an unexpected duration matrix");
      }
      return payload;
    } catch (error) {
      lastError = error;
      if (attempt === MAX_ATTEMPTS) break;
      const wait = error.retryAfter
        ? error.retryAfter * 1000
        : Math.min(8000, 1000 * 2 ** (attempt - 1));
      console.warn(
        `  attempt ${attempt} failed (${error.message}); retrying in ${Math.round(wait / 1000)}s`,
      );
      await sleep(wait);
    }
  }
  throw lastError;
}

console.log(`OSRM matrix: ${count} points, ${blocks.length}x${blocks.length} blocks`);
console.log(`Base URL: ${BASE_URL}`);
console.log(
  `Duration factor: ${
    EXPLICIT_DURATION_FACTOR ??
    (CALIBRATE ? "auto-calibrate against the current plan" : 1)
  }`,
);

let requestCount = 0;
for (let blockRow = 0; blockRow < blocks.length; blockRow += 1) {
  for (let blockColumn = 0; blockColumn < blocks.length; blockColumn += 1) {
    const originIndices = blocks[blockRow];
    const destinationIndices = blocks[blockColumn];
    requestCount += 1;
    console.log(
      `  block ${requestCount}: origins ${originIndices[0]}-${originIndices[originIndices.length - 1]}, destinations ${destinationIndices[0]}-${destinationIndices[destinationIndices.length - 1]}`,
    );
    const payload = await fetchBlock(originIndices, destinationIndices);

    for (let row = 0; row < originIndices.length; row += 1) {
      for (let column = 0; column < destinationIndices.length; column += 1) {
        const origin = originIndices[row];
        const destination = destinationIndices[column];
        const duration = payload.durations[row]?.[column];
        const distance = payload.distances?.[row]?.[column];
        durations[origin][destination] =
          typeof duration === "number" ? Math.round(duration) : null;
        distances[origin][destination] =
          typeof distance === "number" ? Math.round(distance) : null;
      }
    }

    if (requestCount < blocks.length * blocks.length) {
      await sleep(DELAY_MS);
    }
  }
}

let missing = 0;
for (let row = 0; row < count; row += 1) {
  for (let column = 0; column < count; column += 1) {
    if (durations[row][column] === null || distances[row][column] === null) {
      missing += 1;
    }
  }
}

for (let index = 0; index < count; index += 1) {
  durations[index][index] = 0;
  distances[index][index] = 0;
}

function calibrateDurationFactor() {
  const planPath = "data/plan.json";
  const manualPath = "data/manual_routes.json";
  if (!fs.existsSync(planPath) || !fs.existsSync(manualPath)) {
    return { factor: 1, source: "default (no plan data)" };
  }

  const plan = JSON.parse(fs.readFileSync(planPath, "utf8"));
  const manualRoutes = JSON.parse(fs.readFileSync(manualPath, "utf8"));
  const pointIndex = new Map(points.map((point, index) => [point.id, index]));
  const manualByRoute = new Map(
    manualRoutes.map((route) => [route.route_id, route]),
  );

  let sumXY = 0;
  let sumXX = 0;
  let routeCount = 0;

  for (const route of plan.routes) {
    const manual = manualByRoute.get(route.route_id);
    if (!manual) continue;
    const depotId =
      route.depot_id && pointIndex.has(route.depot_id)
        ? route.depot_id
        : primaryDepotId;
    let rawSeconds = 0;
    let previousId = depotId;
    for (const stop of route.stops) {
      const from = pointIndex.get(previousId);
      const to = pointIndex.get(stop.hotel_id);
      if (from === undefined || to === undefined) continue;
      rawSeconds += durations[from][to] ?? 0;
      previousId = stop.hotel_id;
    }
    const from = pointIndex.get(previousId);
    const to = pointIndex.get(depotId);
    if (from !== undefined && to !== undefined) {
      rawSeconds += durations[from][to] ?? 0;
    }
    const rawMinutes = rawSeconds / 60;
    if (rawMinutes <= 0) continue;
    sumXY += rawMinutes * manual.total_drive_mins;
    sumXX += rawMinutes * rawMinutes;
    routeCount += 1;
  }

  if (sumXX === 0 || routeCount === 0) {
    return { factor: 1, source: "default (no calibration data)" };
  }

  return {
    factor: Math.round((sumXY / sumXX) * 1000) / 1000,
    source: `least-squares against data/manual_routes.json (${routeCount} routes, Google traffic baseline)`,
  };
}

const calibration =
  EXPLICIT_DURATION_FACTOR !== null
    ? {
        factor: EXPLICIT_DURATION_FACTOR,
        source: "OSRM_DURATION_FACTOR environment variable",
      }
    : CALIBRATE
      ? calibrateDurationFactor()
      : { factor: 1, source: "raw OSRM free-flow" };

const matrix = {
  schema_version: 1,
  provider: "osrm",
  base_url: BASE_URL,
  profile: "driving",
  traffic_aware: false,
  duration_factor: calibration.factor,
  duration_factor_source: calibration.source,
  generated_at: new Date().toISOString(),
  notes:
    "OSRM public demo uses free-flow travel times. duration_factor scales raw OSRM durations; regenerate with a traffic-aware provider for true traffic ETAs.",
  points,
  durations_s: durations,
  distances_m: distances,
  missing_pairs: missing,
};

fs.writeFileSync(OUTPUT_PATH, `${JSON.stringify(matrix)}\n`);

console.log("");
console.log(`Wrote ${OUTPUT_PATH}`);
console.log(
  `Duration factor: ${calibration.factor} (${calibration.source})`,
);
console.log(`Pairs: ${count * count}; missing: ${missing}`);
console.log(
  `Size: ${(fs.statSync(OUTPUT_PATH).size / 1024 / 1024).toFixed(2)} MB`,
);
