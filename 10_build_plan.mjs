import fs from "node:fs";

const HOTELS_PATH = "data/hotels.json";
const ROUTES_PATH = "data/manual_routes.json";
const FLEET_PATH = "data/fleet.json";
const DAY_PLAN_PATH = "data/day_plan.json";
const PLAN_PATH = "data/plan.json";

function normalizeName(value) {
  return value.toUpperCase().trim().replace(/\s+/g, " ");
}

function parseClock(value, fallback) {
  if (!value) return fallback;
  const match = String(value)
    .trim()
    .match(/^(\d{1,2}):(\d{2})(?::\d{2})?\s*(AM|PM)?$/i);
  if (!match) return fallback;
  let hours = Number(match[1]);
  const minutes = Number(match[2]);
  const suffix = match[3]?.toUpperCase();
  if (suffix) {
    hours %= 12;
    if (suffix === "PM") hours += 12;
  }
  return hours * 60 + minutes;
}

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

const hotels = JSON.parse(fs.readFileSync(HOTELS_PATH, "utf8"));
const manualRoutes = JSON.parse(fs.readFileSync(ROUTES_PATH, "utf8"));
const fleet = JSON.parse(fs.readFileSync(FLEET_PATH, "utf8"));
const dayPlan = JSON.parse(fs.readFileSync(DAY_PLAN_PATH, "utf8"));

const DAY_ALIASES = {
  "HYATT WHITEFIELD MAHADEVPURA": "HYATT CENTRIC WHITEFIELD BENGALURU",
  "CASA PICOSSA E CITY": "CASA PICCOSA E CITY",
  "WANDR 100FT INDIRANAGAR": "WANDR INDIRANAGAR",
};

function canonicalDayName(value) {
  const key = String(value)
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, " ")
    .trim();
  return DAY_ALIASES[key] ?? key;
}

const hotelByCanonicalName = new Map(
  hotels.map((hotel) => [canonicalDayName(hotel.name), hotel]),
);
const dayPlanByRoute = new Map(
  (dayPlan.routes ?? []).map((route) => [route.route_id, route]),
);

function dayIdsFor(names) {
  const ids = new Set();
  for (const name of names ?? []) {
    const hotel = hotelByCanonicalName.get(canonicalDayName(name));
    if (hotel) ids.add(hotel.id);
  }
  return ids;
}

const fleetDepots =
  Array.isArray(fleet.depots) && fleet.depots.length > 0
    ? fleet.depots
    : [fleet.depot];
const depots = fleetDepots.map((depot, index) => ({
  id: depot.id ?? `depot-${index}`,
  name: depot.name,
  lat: depot.latitude,
  lon: depot.longitude,
  ...(depot.short_name ? { short_name: depot.short_name } : {}),
}));
const primaryDepot = depots[0];

const fleetLaundries = Array.isArray(fleet.laundries) ? fleet.laundries : [];
const laundries = fleetLaundries.map((laundry, index) => ({
  id: laundry.id ?? `laundry-${index}`,
  name: laundry.name,
  lat: laundry.latitude,
  lon: laundry.longitude,
  ...(laundry.short_name ? { short_name: laundry.short_name } : {}),
  service_mins: laundry.service_mins ?? 0,
}));

const fleetVehicles = Array.isArray(fleet.vehicles)
  ? [...fleet.vehicles].sort((a, b) => Number(a.id) - Number(b.id))
  : [];
const vehicles = fleetVehicles.map((vehicle, index) => ({
  id: `vehicle-${vehicle.id ?? index + 1}`,
  name: vehicle.label ?? `Vehicle ${index + 1}`,
  nominal_cap: vehicle.nominal_capacity,
  max_load:
    vehicle.max_load_90pct ??
    Math.max(1, Math.floor(vehicle.nominal_capacity * 0.9)),
  ...(vehicle.color ? { color: vehicle.color } : {}),
}));

const byName = new Map();
for (const hotel of hotels) {
  if (!hotel.id) throw new Error(`Hotel has no id: ${hotel.name}`);
  const key = normalizeName(hotel.name);
  if (byName.has(key)) throw new Error(`Duplicate hotel name: ${hotel.name}`);
  byName.set(key, hotel);
}

const used = new Map();
const problems = [];

function resolveHotel(stop) {
  const exact = byName.get(normalizeName(stop.name));
  if (exact) return { hotel: exact, method: "name" };

  let nearest = null;
  let nearestKm = Number.POSITIVE_INFINITY;
  for (const hotel of hotels) {
    const distance = haversineKm(stop.lat, stop.lon, hotel.lat, hotel.lon);
    if (distance < nearestKm) {
      nearestKm = distance;
      nearest = hotel;
    }
  }
  if (nearest && nearestKm <= 0.25) {
    return { hotel: nearest, method: `nearest (${nearestKm.toFixed(3)} km)` };
  }
  return { hotel: null, method: `unmatched (${nearestKm.toFixed(3)} km)` };
}

const routes = manualRoutes.map((route) => {
  const dayRoute = dayPlanByRoute.get(route.route_id);
  const dailyIds = dayIdsFor(dayRoute?.daily_hotels);
  const day1Ids = dayIdsFor(dayRoute?.["Day 1_Full"]);
  const day2Ids = dayIdsFor(dayRoute?.["Day 2_Full"]);

  const stops = route.stops.map((stop) => {
    const { hotel, method } = resolveHotel(stop);
    if (!hotel) {
      problems.push(
        `${route.vehicle_label} stop ${stop.stop_number}: cannot match "${stop.name}"`,
      );
      return null;
    }
    if (used.has(hotel.id)) {
      problems.push(
        `Duplicate assignment for ${hotel.name} (${hotel.id}): ${used.get(hotel.id)} and ${route.vehicle_label}`,
      );
    }
    used.set(hotel.id, route.vehicle_label);
    if (method !== "name") {
      console.log(
        `  matched "${stop.name}" -> ${hotel.name} via ${method}`,
      );
    }
    const days = dailyIds.has(hotel.id)
      ? ["day1", "day2"]
      : [
          ...(day1Ids.has(hotel.id) ? ["day1"] : []),
          ...(day2Ids.has(hotel.id) ? ["day2"] : []),
        ];
    return {
      hotel_id: hotel.id,
      name: hotel.name,
      lat: hotel.lat,
      lon: hotel.lon,
      region: hotel.region,
      service_mins: hotel.stop_mins,
      load_bags: hotel.load,
      rooms: hotel.rooms ?? 0,
      days,
    };
  });

  return {
    route_id: route.route_id,
    route_key: route.route_key,
    name: route.vehicle_label,
    color: route.color,
    nominal_cap: route.nominal_cap,
    max_load: route.max_load,
    departure_min: parseClock(route.departure_hq, 7 * 60),
    stops: stops.filter(Boolean),
    depot_id: route.depot_id ?? primaryDepot.id,
    ...(route.laundry_id ? { laundry_id: route.laundry_id } : {}),
  };
});

const totalStops = routes.reduce((sum, route) => sum + route.stops.length, 0);
const totalBags = routes.reduce(
  (sum, route) => sum + route.stops.reduce((sub, stop) => sub + stop.load_bags, 0),
  0,
);
const unassigned = hotels.filter((hotel) => !used.has(hotel.id)).map((hotel) => hotel.id);

if (problems.length > 0) {
  console.error("Plan migration failed:");
  for (const problem of problems) console.error(`  - ${problem}`);
  process.exit(1);
}

if (totalStops !== hotels.length) {
  console.error(
    `Stop count mismatch: ${totalStops} route stops vs ${hotels.length} hotels`,
  );
  process.exit(1);
}

const plan = {
  schema_version: 1,
  plan_id: "manual-current",
  name: "Manual Dispatch Plan",
  status: "draft",
  created_at: new Date().toISOString(),
  source: "data/manual_routes.json",
  depot: primaryDepot,
  depots,
  laundries,
  vehicles,
  vehicles_version: 2,
  days_version: 1,
  shift: {
    start_min: 6 * 60 + 30,
    end_min: 16 * 60 + 30,
  },
  routes,
  unassigned_hotel_ids: unassigned,
};

fs.writeFileSync(PLAN_PATH, `${JSON.stringify(plan, null, 2)}\n`);

console.log(`Wrote ${PLAN_PATH}`);
console.log(`Routes: ${routes.length}; stops: ${totalStops}; bags: ${totalBags}`);
console.log(`Unassigned hotels: ${unassigned.length}`);
console.log("");
for (const route of routes) {
  const bags = route.stops.reduce((sum, stop) => sum + stop.load_bags, 0);
  console.log(
    `${route.route_id}  ${route.name.padEnd(58)} ${String(route.stops.length).padStart(2)} stops  ${String(bags).padStart(3)}/${route.max_load} bags`,
  );
}
