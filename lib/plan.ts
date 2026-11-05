export const PLAN_SCHEMA_VERSION = 1;
export const PLAN_VEHICLES_VERSION = 2;
export const MATRIX_SCHEMA_VERSION = 1;

export const PLAN_DRAFT_STORAGE_KEY = "linengrass.plan-canvas.v1";
export const PLAN_IMPORT_BACKUP_KEY = "linengrass.plan-canvas.pre-import";

export type PlanDepot = {
  id: string;
  name: string;
  lat: number;
  lon: number;
  /** Compact label for map pins and route badges, e.g. "HQ" or "WH2". */
  short_name?: string;
};

export type PlanLaundry = {
  id: string;
  name: string;
  lat: number;
  lon: number;
  /** Compact label for map pins and route badges. */
  short_name?: string;
  /** Minutes the vehicle spends at the laundry. */
  service_mins: number;
};

export type PlanVehicle = {
  id: string;
  name: string;
  nominal_cap: number;
  /** Safe load, normally 90% of the nominal capacity. */
  max_load: number;
  color?: string;
};

export type PlanShift = {
  start_min: number;
  end_min: number;
};

export type PlanStop = {
  hotel_id: string;
  name: string;
  lat: number;
  lon: number;
  region: number;
  service_mins: number;
  load_bags: number;
  /** Number of guest rooms at this hotel. Missing values are treated as 0. */
  rooms?: number;
};

export type PlanRoute = {
  route_id: string;
  route_key: string;
  name: string;
  color: string;
  nominal_cap: number;
  max_load: number;
  departure_min: number;
  stops: PlanStop[];
  /** Warehouse this route starts from and returns to. Missing values use the plan's primary depot. */
  depot_id?: string;
  /** Optional laundry visited after the last hotel, before returning to the warehouse. */
  laundry_id?: string | null;
  /** Vehicle from the plan's fleet inventory. Missing values use manual capacity. */
  vehicle_id?: string | null;
  is_custom?: boolean;
};

export type Plan = {
  schema_version: number;
  plan_id: string;
  name: string;
  status: "draft" | "published";
  created_at?: string;
  source?: string;
  /** Primary warehouse, kept for older drafts and consumers. */
  depot: PlanDepot;
  /** All warehouses a route can be assigned to. */
  depots?: PlanDepot[];
  /** Laundries a route can visit after its last hotel. */
  laundries?: PlanLaundry[];
  /** Vehicles available to routes. */
  vehicles?: PlanVehicle[];
  /** One-time fleet numbering version. */
  vehicles_version?: number;
  shift: PlanShift;
  routes: PlanRoute[];
  unassigned_hotel_ids?: string[];
};

export type MatrixPoint = {
  id: string;
  name: string;
  lat: number;
  lon: number;
  kind: "depot" | "laundry" | "hotel";
};

export type TravelMatrix = {
  schema_version: number;
  provider: string;
  base_url?: string;
  profile?: string;
  traffic_aware: boolean;
  duration_factor?: number;
  generated_at: string;
  notes?: string;
  points: MatrixPoint[];
  durations_s: (number | null)[][];
  distances_m: (number | null)[][];
  missing_pairs?: number;
};

export type ComputedStop = PlanStop & {
  stop_number: number;
  arrival_min: number;
  departure_min: number;
  arrival_time: string;
  departure_time: string;
  leg_drive_mins: number;
  leg_distance_km: number;
};

export type ComputedRoute = {
  route_id: string;
  route_key: string;
  name: string;
  color: string;
  nominal_cap: number;
  max_load: number;
  departure_min: number;
  total_hotels: number;
  total_dist_km: number;
  total_drive_mins: number;
  total_service_mins: number;
  total_bags: number;
  total_rooms: number;
  capacity_utilization_pct: number;
  depot_id: string;
  depot_name: string;
  laundry_id: string | null;
  laundry_name: string | null;
  laundry_service_mins: number;
  laundry_arrival_min: number | null;
  laundry_arrival_time: string | null;
  laundry_departure_min: number | null;
  laundry_departure_time: string | null;
  departure_hq: string;
  return_hq: string;
  return_min: number;
  stops: ComputedStop[];
  estimated_legs: number;
  is_custom?: boolean;
};

export type PlanIssueSeverity = "error" | "warning";

export type PlanIssue = {
  severity: PlanIssueSeverity;
  code: string;
  message: string;
  route_id?: string;
  stop_id?: string;
};

export type PlanTotals = {
  routes: number;
  hotels: number;
  bags: number;
  rooms: number;
  distance_km: number;
  drive_mins: number;
  service_mins: number;
};

export type PlanComputation = {
  routes: ComputedRoute[];
  issues: PlanIssue[];
  totals: PlanTotals;
};

export type MatrixLeg = {
  durationS: number;
  distanceM: number;
  estimated: boolean;
};

export type MatrixLookup = {
  leg: (fromId: string, toId: string) => MatrixLeg;
  point: (id: string) => MatrixPoint | undefined;
};

const FALLBACK_SPEED_KMH = 24;
const FALLBACK_ROAD_FACTOR = 1.35;

export const DEFAULT_DEPOT_ID = "depot-yeshwanthpur";
export const SECOND_DEPOT_ID = "depot-second-warehouse";

function round1(value: number): number {
  return Math.round(value * 10) / 10;
}

/** All warehouses in a plan, including the legacy primary depot. */
export function getPlanDepots(plan: Plan): PlanDepot[] {
  const depots: PlanDepot[] = [];
  if (plan.depot) depots.push(plan.depot);
  for (const depot of plan.depots ?? []) {
    if (!depots.some((candidate) => candidate.id === depot.id)) {
      depots.push(depot);
    }
  }
  return depots;
}

/** Resolves a warehouse by id, falling back to the plan's primary depot. */
export function resolveDepot(plan: Plan, depotId?: string): PlanDepot {
  const depots = getPlanDepots(plan);
  const requested = depotId
    ? depots.find((depot) => depot.id === depotId)
    : undefined;
  const primary =
    depots.find((depot) => depot.id === plan.depot?.id) ?? depots[0];
  if (!primary) throw new Error("Plan has no warehouse configured");
  return requested ?? primary;
}

/** The warehouse id a route actually uses. */
export function routeDepotId(plan: Plan, route: PlanRoute): string {
  const depots = getPlanDepots(plan);
  if (route.depot_id && depots.some((depot) => depot.id === route.depot_id)) {
    return route.depot_id;
  }
  return plan.depot?.id ?? depots[0]?.id ?? DEFAULT_DEPOT_ID;
}

/** The warehouse a route starts from and returns to. */
export function routeDepot(plan: Plan, route: PlanRoute): PlanDepot {
  return resolveDepot(plan, routeDepotId(plan, route));
}

/** Compact warehouse label for pins and badges. */
export function depotLabel(depot: PlanDepot): string {
  return depot.short_name?.trim() || depot.name;
}

/** All laundries configured for the plan. */
export function getPlanLaundries(plan: Plan): PlanLaundry[] {
  return plan.laundries ?? [];
}

/** Resolves a route's laundry, or null when it returns straight to the warehouse. */
export function resolveLaundry(
  plan: Plan,
  route: PlanRoute,
): PlanLaundry | null {
  if (!route.laundry_id) return null;
  return (
    getPlanLaundries(plan).find(
      (laundry) => laundry.id === route.laundry_id,
    ) ?? null
  );
}

/** The laundry id a route actually uses, or null for a direct return. */
export function routeLaundryId(
  plan: Plan,
  route: PlanRoute,
): string | null {
  return resolveLaundry(plan, route)?.id ?? null;
}

/** Compact laundry label for pins and badges. */
export function laundryLabel(laundry: PlanLaundry): string {
  return laundry.short_name?.trim() || laundry.name;
}

/** All vehicles configured for the plan. */
export function getPlanVehicles(plan: Plan): PlanVehicle[] {
  return plan.vehicles ?? [];
}

/** Vehicles in natural order: Vehicle 1, Vehicle 2, ..., Vehicle 10. */
export function sortVehicles(vehicles: PlanVehicle[]): PlanVehicle[] {
  return [...vehicles].sort((a, b) =>
    a.name.localeCompare(b.name, undefined, {
      numeric: true,
      sensitivity: "base",
    }),
  );
}

/** Resolves the vehicle assigned to a route, or null for manual capacity. */
export function resolveVehicle(
  plan: Plan,
  route: PlanRoute,
): PlanVehicle | null {
  if (!route.vehicle_id) return null;
  return (
    getPlanVehicles(plan).find(
      (vehicle) => vehicle.id === route.vehicle_id,
    ) ?? null
  );
}

/** Every route currently using a vehicle. */
export function routesUsingVehicle(
  plan: Plan,
  vehicleId: string,
): PlanRoute[] {
  return plan.routes.filter((route) => route.vehicle_id === vehicleId);
}

/** Safe load for a capacity, matching the 90% fleet rule. */
export function safeLoadForCapacity(capacity: number): number {
  return Math.max(1, Math.floor(capacity * 0.9));
}

export type PlanSummary = {
  routes: number;
  stops: number;
  bags: number;
  rooms: number;
  vehicles: number;
  depots: number;
  laundries: number;
  customRoutes: number;
  unassigned: number;
};

export function summarizePlan(plan: Plan): PlanSummary {
  return {
    routes: plan.routes.length,
    stops: plan.routes.reduce((sum, route) => sum + route.stops.length, 0),
    bags: plan.routes.reduce(
      (sum, route) =>
        sum + route.stops.reduce((child, stop) => child + stop.load_bags, 0),
      0,
    ),
    rooms: plan.routes.reduce(
      (sum, route) =>
        sum + route.stops.reduce((child, stop) => child + (stop.rooms ?? 0), 0),
      0,
    ),
    vehicles: getPlanVehicles(plan).length,
    depots: getPlanDepots(plan).length,
    laundries: getPlanLaundries(plan).length,
    customRoutes: plan.routes.filter((route) => route.is_custom).length,
    unassigned: plan.unassigned_hotel_ids?.length ?? 0,
  };
}

function requireNumber(value: unknown, label: string): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new Error(`${label} is missing or invalid.`);
  }
  return value;
}

function requireString(value: unknown, label: string): string {
  if (typeof value !== "string" || !value.trim()) {
    throw new Error(`${label} is missing or invalid.`);
  }
  return value;
}

/**
 * Validates a shared plan file before it is allowed to replace a local draft.
 * It intentionally accepts the exported wrapper fields (for example
 * `exported_at`) and only reads the plan fields it needs.
 */
export function parsePlanDraft(value: unknown): Plan {
  if (!value || typeof value !== "object") {
    throw new Error("This file is not a shared plan.");
  }
  const candidate = value as Partial<Plan>;
  if (candidate.schema_version !== PLAN_SCHEMA_VERSION) {
    throw new Error(
      `Unsupported plan version: ${String(candidate.schema_version)}.`,
    );
  }
  if (!candidate.depot || typeof candidate.depot !== "object") {
    throw new Error("The shared plan has no warehouse.");
  }
  const depot = candidate.depot as PlanDepot;
  requireString(depot.id, "Warehouse id");
  requireString(depot.name, "Warehouse name");
  requireNumber(depot.lat, "Warehouse latitude");
  requireNumber(depot.lon, "Warehouse longitude");

  const shift = candidate.shift ?? { start_min: 390, end_min: 990 };
  requireNumber(shift.start_min, "Shift start");
  requireNumber(shift.end_min, "Shift end");

  if (!Array.isArray(candidate.routes)) {
    throw new Error("The shared plan has no routes.");
  }

  for (const route of candidate.routes) {
    if (!route || typeof route !== "object") {
      throw new Error("The shared plan contains an invalid route.");
    }
    const name = route.name || route.route_id || "Unnamed route";
    requireString(route.route_id, `Route id (${name})`);
    requireString(route.name, `Route name (${name})`);
    requireString(route.color, `Route color (${name})`);
    requireNumber(route.nominal_cap, `Vehicle capacity (${name})`);
    requireNumber(route.max_load, `Safe load (${name})`);
    requireNumber(route.departure_min, `Departure time (${name})`);
    if (!Array.isArray(route.stops)) {
      throw new Error(`Route stops (${name}) are missing.`);
    }
    for (const stop of route.stops) {
      if (!stop || typeof stop !== "object") {
        throw new Error(`Route ${name} contains an invalid stop.`);
      }
      requireString(stop.hotel_id, `Hotel id on ${name}`);
      requireString(stop.name, `Hotel name on ${name}`);
      requireNumber(stop.lat, `${stop.name} latitude`);
      requireNumber(stop.lon, `${stop.name} longitude`);
      requireNumber(stop.service_mins, `${stop.name} service time`);
      requireNumber(stop.load_bags, `${stop.name} bags`);
      if (stop.rooms !== undefined) {
        requireNumber(stop.rooms, `${stop.name} rooms`);
      }
    }
  }

  if (candidate.unassigned_hotel_ids !== undefined) {
    if (!Array.isArray(candidate.unassigned_hotel_ids)) {
      throw new Error("Unassigned hotel ids are invalid.");
    }
  }

  return {
    ...(candidate as Plan),
    plan_id: candidate.plan_id || "imported-plan",
    name: candidate.name || "Imported plan",
    status: candidate.status === "published" ? "published" : "draft",
    shift: {
      start_min: shift.start_min,
      end_min: shift.end_min,
    },
    routes: candidate.routes.map((route) => ({
      ...route,
      route_key: route.route_key || route.route_id.replace(/-/g, "_"),
      stops: route.stops.map((stop) => ({ ...stop, rooms: stop.rooms ?? 0 })),
    })),
  };
}

/**
 * Upgrades a persisted draft to the current warehouse shape. Existing routes
 * keep their assignment; missing assignments inherit the primary depot, and
 * warehouses introduced by the current plan are merged into the draft.
 */
export function migratePlanDepots(plan: Plan, reference: Plan): Plan {
  const referenceDepots = getPlanDepots(reference);
  const referenceById = new Map(
    referenceDepots.map((depot) => [depot.id, depot]),
  );
  const depots: PlanDepot[] = [];
  for (const depot of getPlanDepots(plan)) {
    const current = referenceById.get(depot.id);
    depots.push(
      current
        ? {
            ...depot,
            name: current.name,
            lat: current.lat,
            lon: current.lon,
            short_name: current.short_name,
          }
        : depot,
    );
  }
  for (const depot of referenceDepots) {
    if (!depots.some((candidate) => candidate.id === depot.id)) {
      depots.push(depot);
    }
  }

  const fallbackId =
    plan.depot?.id ?? reference.depot?.id ?? depots[0]?.id ?? DEFAULT_DEPOT_ID;
  const primary =
    depots.find((depot) => depot.id === plan.depot?.id) ??
    depots.find((depot) => depot.id === fallbackId) ??
    depots[0];

  // Backfill room counts for drafts saved before rooms were introduced.
  // Room counts are reference data (never user-edited), so the current plan
  // wins when it has a value; this also heals drafts backfilled as 0 while
  // the page was served with stale data.
  const roomsByHotelId = new Map<string, number>();
  for (const route of reference.routes) {
    for (const stop of route.stops) {
      if (typeof stop.rooms === "number") roomsByHotelId.set(stop.hotel_id, stop.rooms);
    }
  }

  // Merge laundries added after the draft was saved, refreshing coordinates
  // and service times from the current plan.
  const referenceLaundries = getPlanLaundries(reference);
  const referenceLaundryById = new Map(
    referenceLaundries.map((laundry) => [laundry.id, laundry]),
  );
  const laundries: PlanLaundry[] = [];
  for (const laundry of getPlanLaundries(plan)) {
    const current = referenceLaundryById.get(laundry.id);
    laundries.push(
      current
        ? {
            ...laundry,
            name: current.name,
            lat: current.lat,
            lon: current.lon,
            short_name: current.short_name,
            service_mins: current.service_mins,
          }
        : laundry,
    );
  }
  for (const laundry of referenceLaundries) {
    if (!laundries.some((candidate) => candidate.id === laundry.id)) {
      laundries.push(laundry);
    }
  }

  // Vehicles are user-managed: seed them only when the draft predates the
  // fleet inventory. Routes start unassigned and the user picks a vehicle.
  let vehicles: PlanVehicle[];
  const vehicleIdByRoute = new Map<string, string | null>();
  if (Array.isArray(plan.vehicles)) {
    vehicles = plan.vehicles;
    for (const route of plan.routes) {
      vehicleIdByRoute.set(route.route_id, route.vehicle_id ?? null);
    }
  } else {
    vehicles = reference.vehicles ?? [];
    for (const route of plan.routes) {
      vehicleIdByRoute.set(route.route_id, null);
    }
  }
  const vehicleById = new Map(
    vehicles.map((vehicle) => [vehicle.id, vehicle]),
  );
  vehicles = sortVehicles(vehicles);

  return {
    ...plan,
    depot: primary ?? plan.depot,
    depots,
    laundries,
    vehicles,
    vehicles_version: PLAN_VEHICLES_VERSION,
    routes: plan.routes.map((route) => {
      const requestedVehicleId = vehicleIdByRoute.get(route.route_id) ?? null;
      const vehicle = requestedVehicleId
        ? vehicleById.get(requestedVehicleId)
        : undefined;
      return {
        ...route,
        depot_id:
          route.depot_id &&
          depots.some((depot) => depot.id === route.depot_id)
            ? route.depot_id
            : fallbackId,
        laundry_id:
          route.laundry_id &&
          laundries.some((laundry) => laundry.id === route.laundry_id)
            ? route.laundry_id
            : undefined,
        vehicle_id: vehicle ? vehicle.id : undefined,
        nominal_cap: vehicle ? vehicle.nominal_cap : route.nominal_cap,
        max_load: vehicle ? vehicle.max_load : route.max_load,
        stops: route.stops.map((stop) => ({
          ...stop,
          rooms:
            roomsByHotelId.get(stop.hotel_id) ??
            (typeof stop.rooms === "number" ? stop.rooms : 0),
        })),
      };
    }),
  };
}

export function haversineKm(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number,
): number {
  const radius = 6371;
  const toRad = (value: number) => (value * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return radius * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/** Parses "07:00 AM", "7:00 PM", "17:00", or "17:00:00" into minutes after midnight. */
export function parseClock(value: string): number {
  const match = String(value)
    .trim()
    .match(/^(\d{1,2}):(\d{2})(?::\d{2})?\s*(AM|PM)?$/i);
  if (!match) {
    throw new Error(`Invalid clock value: ${value}`);
  }

  let hours = Number(match[1]);
  const minutes = Number(match[2]);
  const suffix = match[3]?.toUpperCase();

  if (!Number.isInteger(hours) || !Number.isInteger(minutes) || minutes > 59) {
    throw new Error(`Invalid clock value: ${value}`);
  }

  if (suffix) {
    if (hours < 1 || hours > 12) {
      throw new Error(`Invalid clock value: ${value}`);
    }
    hours %= 12;
    if (suffix === "PM") hours += 12;
  } else if (hours > 23) {
    throw new Error(`Invalid clock value: ${value}`);
  }

  return hours * 60 + minutes;
}

/** Formats minutes after midnight as an IST-style "07:00 AM" label. */
export function formatClock(totalMinutes: number): string {
  const normalized =
    ((Math.round(totalMinutes) % (24 * 60)) + 24 * 60) % (24 * 60);
  const hours24 = Math.floor(normalized / 60);
  const minutes = normalized % 60;
  const suffix = hours24 >= 12 ? "PM" : "AM";
  const hours12 = hours24 % 12 || 12;
  return `${String(hours12).padStart(2, "0")}:${String(minutes).padStart(
    2,
    "0",
  )} ${suffix}`;
}

export function formatDuration(totalMinutes: number): string {
  const rounded = Math.max(0, Math.round(totalMinutes));
  const hours = Math.floor(rounded / 60);
  const minutes = rounded % 60;
  if (hours === 0) return `${minutes}m`;
  if (minutes === 0) return `${hours}h`;
  return `${hours}h ${String(minutes).padStart(2, "0")}m`;
}

export function createMatrixLookup(
  matrix: TravelMatrix,
  extraPoints: MatrixPoint[] = [],
): MatrixLookup {
  const pointsById = new Map(matrix.points.map((point) => [point.id, point]));
  for (const point of extraPoints) {
    if (!pointsById.has(point.id)) pointsById.set(point.id, point);
  }
  const indexById = new Map(
    matrix.points.map((point, index) => [point.id, index]),
  );
  const factor =
    Number.isFinite(matrix.duration_factor) && (matrix.duration_factor ?? 0) > 0
      ? (matrix.duration_factor as number)
      : 1;

  return {
    point(id: string) {
      return pointsById.get(id);
    },
    leg(fromId: string, toId: string): MatrixLeg {
      if (fromId === toId) {
        return { durationS: 0, distanceM: 0, estimated: false };
      }

      const from = pointsById.get(fromId);
      const to = pointsById.get(toId);
      if (!from || !to) {
        throw new Error(`Unknown point in travel matrix: ${fromId} -> ${toId}`);
      }

      const fromIndex = indexById.get(fromId);
      const toIndex = indexById.get(toId);

      if (fromIndex !== undefined && toIndex !== undefined) {
        const duration = matrix.durations_s[fromIndex]?.[toIndex];
        const distance = matrix.distances_m[fromIndex]?.[toIndex];
        if (
          typeof duration === "number" &&
          typeof distance === "number" &&
          (duration > 0 || distance > 0)
        ) {
          return {
            durationS: Math.round(duration * factor),
            distanceM: distance,
            estimated: false,
          };
        }
      }

      const straightKm = haversineKm(from.lat, from.lon, to.lat, to.lon);
      const roadKm = straightKm * FALLBACK_ROAD_FACTOR;
      return {
        durationS: Math.round((roadKm / FALLBACK_SPEED_KMH) * 3600),
        distanceM: Math.round(roadKm * 1000),
        estimated: true,
      };
    },
  };
}

/** Every hotel on the plan, including hotels added after the matrix was built. */
function planStopPoints(plan: Plan): MatrixPoint[] {
  const points: MatrixPoint[] = [];
  const seen = new Set<string>();
  for (const route of plan.routes) {
    for (const stop of route.stops) {
      if (seen.has(stop.hotel_id)) continue;
      seen.add(stop.hotel_id);
      points.push({
        id: stop.hotel_id,
        name: stop.name,
        lat: stop.lat,
        lon: stop.lon,
        kind: "hotel",
      });
    }
  }
  return points;
}

/**
 * Uses the matrix for known points and falls back to straight-line estimates
 * for hotels added from the Plan Canvas. Those legs are flagged as estimated.
 */
function createPlanLookup(
  plan: Plan,
  matrixOrLookup: TravelMatrix | MatrixLookup,
): MatrixLookup {
  return "leg" in matrixOrLookup
    ? matrixOrLookup
    : createMatrixLookup(matrixOrLookup, planStopPoints(plan));
}

export function computeRoute(
  plan: Plan,
  route: PlanRoute,
  matrixOrLookup: TravelMatrix | MatrixLookup,
): ComputedRoute {
  const lookup = createPlanLookup(plan, matrixOrLookup);
  const depot = routeDepot(plan, route);

  let cursorS = route.departure_min * 60;
  let previousId = depot.id;
  let driveS = 0;
  let distanceM = 0;
  let serviceMins = 0;
  let bags = 0;
  let rooms = 0;
  let estimatedLegs = 0;
  const stops: ComputedStop[] = [];

  for (let index = 0; index < route.stops.length; index += 1) {
    const stop = route.stops[index];
    const leg = lookup.leg(previousId, stop.hotel_id);
    if (leg.estimated) estimatedLegs += 1;

    cursorS += leg.durationS;
    const arrivalS = cursorS;
    cursorS += stop.service_mins * 60;
    const departureS = cursorS;

    driveS += leg.durationS;
    distanceM += leg.distanceM;
    serviceMins += stop.service_mins;
    bags += stop.load_bags;
    rooms += stop.rooms ?? 0;

    stops.push({
      ...stop,
      stop_number: index + 1,
      arrival_min: Math.round(arrivalS / 60),
      departure_min: Math.round(departureS / 60),
      arrival_time: formatClock(arrivalS / 60),
      departure_time: formatClock(departureS / 60),
      leg_drive_mins: Math.round(leg.durationS / 60),
      leg_distance_km: round1(leg.distanceM / 1000),
    });

    previousId = stop.hotel_id;
  }

  const laundry = resolveLaundry(plan, route);
  let laundryArrivalMin: number | null = null;
  let laundryDepartureMin: number | null = null;
  let laundryServiceMins = 0;

  const endId = laundry?.id ?? depot.id;
  const dropLeg = lookup.leg(previousId, endId);
  if (dropLeg.estimated) estimatedLegs += 1;
  cursorS += dropLeg.durationS;
  driveS += dropLeg.durationS;
  distanceM += dropLeg.distanceM;

  if (laundry) {
    laundryArrivalMin = Math.round(cursorS / 60);
    laundryServiceMins = laundry.service_mins;
    cursorS += laundry.service_mins * 60;
    laundryDepartureMin = Math.round(cursorS / 60);
    if (laundry.id !== depot.id) {
      const toDepot = lookup.leg(laundry.id, depot.id);
      if (toDepot.estimated) estimatedLegs += 1;
      cursorS += toDepot.durationS;
      driveS += toDepot.durationS;
      distanceM += toDepot.distanceM;
    }
  }

  return {
    route_id: route.route_id,
    route_key: route.route_key,
    name: route.name,
    color: route.color,
    nominal_cap: route.nominal_cap,
    max_load: route.max_load,
    departure_min: route.departure_min,
    total_hotels: stops.length,
    total_dist_km: round1(distanceM / 1000),
    total_drive_mins: Math.round(driveS / 60),
    total_service_mins: serviceMins,
    total_bags: bags,
    total_rooms: rooms,
    capacity_utilization_pct:
      route.max_load > 0 ? round1((bags / route.max_load) * 100) : 0,
    depot_id: depot.id,
    depot_name: depot.name,
    laundry_id: laundry?.id ?? null,
    laundry_name: laundry?.name ?? null,
    laundry_service_mins: laundryServiceMins,
    laundry_arrival_min: laundryArrivalMin,
    laundry_arrival_time:
      laundryArrivalMin === null ? null : formatClock(laundryArrivalMin),
    laundry_departure_min: laundryDepartureMin,
    laundry_departure_time:
      laundryDepartureMin === null ? null : formatClock(laundryDepartureMin),
    departure_hq: formatClock(route.departure_min),
    return_hq: formatClock(cursorS / 60),
    return_min: Math.round(cursorS / 60),
    stops,
    estimated_legs: estimatedLegs,
    is_custom: route.is_custom,
  };
}

export function computePlan(plan: Plan, matrix: TravelMatrix): PlanComputation {
  const lookup = createMatrixLookup(matrix, planStopPoints(plan));
  const routes = plan.routes.map((route) => computeRoute(plan, route, lookup));
  const issues = validateComputedPlan(plan, routes);
  const totals: PlanTotals = {
    routes: routes.length,
    hotels: routes.reduce((sum, route) => sum + route.total_hotels, 0),
    bags: routes.reduce((sum, route) => sum + route.total_bags, 0),
    rooms: routes.reduce((sum, route) => sum + route.total_rooms, 0),
    distance_km: round1(
      routes.reduce((sum, route) => sum + route.total_dist_km, 0),
    ),
    drive_mins: routes.reduce((sum, route) => sum + route.total_drive_mins, 0),
    service_mins: routes.reduce(
      (sum, route) => sum + route.total_service_mins,
      0,
    ),
  };
  return { routes, issues, totals };
}

export function validateComputedPlan(
  plan: Plan,
  routes: ComputedRoute[],
): PlanIssue[] {
  const issues: PlanIssue[] = [];
  const hotelAssignments = new Map<string, string>();

  for (const route of routes) {
    const routeStops = new Set<string>();

    for (const stop of route.stops) {
      if (routeStops.has(stop.hotel_id)) {
        issues.push({
          severity: "error",
          code: "duplicate_stop_in_route",
          message: `${stop.name} appears more than once on ${route.name}.`,
          route_id: route.route_id,
          stop_id: stop.hotel_id,
        });
      }
      routeStops.add(stop.hotel_id);

      const previousRoute = hotelAssignments.get(stop.hotel_id);
      if (previousRoute) {
        issues.push({
          severity: "error",
          code: "duplicate_hotel_assignment",
          message: `${stop.name} is assigned to both ${previousRoute} and ${route.name}.`,
          route_id: route.route_id,
          stop_id: stop.hotel_id,
        });
      } else {
        hotelAssignments.set(stop.hotel_id, route.name);
      }
    }

    if (route.stops.length === 0 && !route.is_custom) {
      issues.push({
        severity: "warning",
        code: "empty_route",
        message: `${route.name} has no stops.`,
        route_id: route.route_id,
      });
    }

    const planRoute = plan.routes.find(
      (candidate) => candidate.route_id === route.route_id,
    );
    const hasVehicle = planRoute
      ? resolveVehicle(plan, planRoute) !== null
      : false;
    if (hasVehicle && route.total_bags > route.nominal_cap) {
      issues.push({
        severity: "error",
        code: "over_nominal_capacity",
        message: `${route.name} carries ${route.total_bags} bags, above the vehicle capacity of ${route.nominal_cap}.`,
        route_id: route.route_id,
      });
    } else if (hasVehicle && route.total_bags > route.max_load) {
      issues.push({
        severity: "warning",
        code: "over_safe_capacity",
        message: `${route.name} carries ${route.total_bags} bags, above the safe load of ${route.max_load}.`,
        route_id: route.route_id,
      });
    }

    if (route.return_min > plan.shift.end_min) {
      issues.push({
        severity: "warning",
        code: "shift_overrun",
        message: `${route.name} returns at ${route.return_hq}, after the ${formatClock(
          plan.shift.end_min,
        )} shift end.`,
        route_id: route.route_id,
      });
    }

    if (route.departure_min < plan.shift.start_min) {
      issues.push({
        severity: "warning",
        code: "departure_before_shift",
        message: `${route.name} departs at ${route.departure_hq}, before the ${formatClock(
          plan.shift.start_min,
        )} shift start.`,
        route_id: route.route_id,
      });
    }

    if (route.estimated_legs > 0) {
      issues.push({
        severity: "warning",
        code: "estimated_legs",
        message: `${route.name} uses fallback estimates for ${route.estimated_legs} leg${
          route.estimated_legs === 1 ? "" : "s"
        }.`,
        route_id: route.route_id,
      });
    }
  }

  if (plan.unassigned_hotel_ids && plan.unassigned_hotel_ids.length > 0) {
    issues.push({
      severity: "warning",
      code: "unassigned_hotels",
      message: `${plan.unassigned_hotel_ids.length} hotel${
        plan.unassigned_hotel_ids.length === 1 ? " is" : "s are"
      } not assigned to any route.`,
    });
  }

  const vehicleAssignments = new Map<string, string[]>();
  for (const route of plan.routes) {
    if (!route.vehicle_id) continue;
    const assigned = vehicleAssignments.get(route.vehicle_id) ?? [];
    assigned.push(route.name);
    vehicleAssignments.set(route.vehicle_id, assigned);
  }
  const vehicleIssues: PlanIssue[] = [];
  const routesWithoutVehicle = plan.routes.filter(
    (route) => !route.vehicle_id && route.stops.length > 0,
  );
  if (routesWithoutVehicle.length > 0) {
    vehicleIssues.push({
      severity: "warning",
      code: "no_vehicle",
      message: `${routesWithoutVehicle.length} route${
        routesWithoutVehicle.length === 1 ? " has" : "s have"
      } no vehicle assigned.`,
    });
  }
  for (const [vehicleId, routeNames] of vehicleAssignments) {
    if (routeNames.length <= 1) continue;
    const vehicle = getPlanVehicles(plan).find(
      (candidate) => candidate.id === vehicleId,
    );
    vehicleIssues.push({
      severity: "warning",
      code: "vehicle_double_booked",
      message: `${vehicle?.name ?? vehicleId} is assigned to ${routeNames.join(
        " and ",
      )}.`,
    });
  }
  issues.unshift(...vehicleIssues);

  return issues;
}

export function findRoute(
  plan: Plan,
  routeId: string,
): PlanRoute | undefined {
  return plan.routes.find((route) => route.route_id === routeId);
}

export function findStop(
  plan: Plan,
  hotelId: string,
): { route: PlanRoute; index: number; stop: PlanStop } | null {
  for (const route of plan.routes) {
    const index = route.stops.findIndex((stop) => stop.hotel_id === hotelId);
    if (index >= 0) {
      return { route, index, stop: route.stops[index] };
    }
  }
  return null;
}

/** Moves a stop within one route. Indices are zero-based and refer to the original list. */
export function reorderStops(
  plan: Plan,
  routeId: string,
  fromIndex: number,
  toIndex: number,
): Plan {
  const route = findRoute(plan, routeId);
  if (!route) throw new Error(`Unknown route: ${routeId}`);
  if (!Number.isInteger(fromIndex) || !Number.isInteger(toIndex)) {
    throw new Error("Stop indices must be integers");
  }
  if (fromIndex < 0 || fromIndex >= route.stops.length) {
    throw new Error(`Stop index out of range: ${fromIndex}`);
  }
  if (toIndex < 0 || toIndex >= route.stops.length) {
    throw new Error(`Stop index out of range: ${toIndex}`);
  }
  if (fromIndex === toIndex) return plan;

  const stops = [...route.stops];
  const [moved] = stops.splice(fromIndex, 1);
  stops.splice(toIndex, 0, moved);

  return {
    ...plan,
    routes: plan.routes.map((candidate) =>
      candidate.route_id === routeId ? { ...candidate, stops } : candidate,
    ),
  };
}

export function cheapestInsertionIndex(
  plan: Plan,
  route: PlanRoute,
  stop: PlanStop,
  matrixOrLookup: TravelMatrix | MatrixLookup,
): number {
  const lookup = createPlanLookup(plan, matrixOrLookup);
  const depotId = routeDepotId(plan, route);
  const laundryId = routeLaundryId(plan, route);
  const endId = laundryId ?? depotId;

  let bestIndex = route.stops.length;
  let bestDeltaS = Number.POSITIVE_INFINITY;
  let bestDeltaM = Number.POSITIVE_INFINITY;

  for (let index = 0; index <= route.stops.length; index += 1) {
    const previousId =
      index === 0 ? depotId : route.stops[index - 1].hotel_id;
    const nextId =
      index === route.stops.length
        ? endId
        : route.stops[index].hotel_id;

    const base = lookup.leg(previousId, nextId);
    const toStop = lookup.leg(previousId, stop.hotel_id);
    const fromStop = lookup.leg(stop.hotel_id, nextId);
    const deltaS = toStop.durationS + fromStop.durationS - base.durationS;
    const deltaM = toStop.distanceM + fromStop.distanceM - base.distanceM;

    if (deltaS < bestDeltaS || (deltaS === bestDeltaS && deltaM < bestDeltaM)) {
      bestIndex = index;
      bestDeltaS = deltaS;
      bestDeltaM = deltaM;
    }
  }

  return bestIndex;
}

/**
 * Removes a hotel stop from its current route and inserts it into another route.
 * Pass `targetIndex` to place it exactly; omit it to use cheapest insertion.
 * Passing the stop's current route is treated as a reorder.
 */
export function moveStop(
  plan: Plan,
  hotelId: string,
  targetRouteId: string,
  targetIndex?: number,
  matrix?: TravelMatrix,
): Plan {
  const found = findStop(plan, hotelId);
  if (!found) throw new Error(`Stop is not assigned to any route: ${hotelId}`);

  const targetRoute = findRoute(plan, targetRouteId);
  if (!targetRoute) throw new Error(`Unknown route: ${targetRouteId}`);

  if (found.route.route_id === targetRouteId) {
    if (targetIndex === undefined) {
      throw new Error("targetIndex is required when moving within the same route");
    }
    return reorderStops(plan, targetRouteId, found.index, targetIndex);
  }

  if (targetRoute.stops.some((stop) => stop.hotel_id === hotelId)) {
    throw new Error(`Stop is already on ${targetRoute.name}: ${hotelId}`);
  }

  const stop = found.stop;
  const targetBags = targetRoute.stops.reduce(
    (sum, candidate) => sum + candidate.load_bags,
    0,
  );
  const projectedBags = targetBags + stop.load_bags;
  if (
    resolveVehicle(plan, targetRoute) !== null &&
    projectedBags > targetRoute.nominal_cap
  ) {
    throw new Error(
      `${targetRoute.name} cannot take ${stop.name}: ${projectedBags} bags would exceed its ${targetRoute.nominal_cap}-bag vehicle limit.`,
    );
  }

  const sourceStops = found.route.stops.filter(
    (candidate) => candidate.hotel_id !== hotelId,
  );

  let insertIndex = targetIndex;
  if (insertIndex === undefined) {
    if (!matrix) throw new Error("A travel matrix is required for cheapest insertion");
    insertIndex = cheapestInsertionIndex(plan, targetRoute, stop, matrix);
  }
  if (
    !Number.isInteger(insertIndex) ||
    insertIndex < 0 ||
    insertIndex > targetRoute.stops.length
  ) {
    throw new Error(`Target index out of range: ${insertIndex}`);
  }

  const targetStops = [...targetRoute.stops];
  targetStops.splice(insertIndex, 0, stop);

  return {
    ...plan,
    routes: plan.routes.map((route) => {
      if (route.route_id === found.route.route_id) {
        return { ...route, stops: sourceStops };
      }
      if (route.route_id === targetRouteId) {
        return { ...route, stops: targetStops };
      }
      return route;
    }),
  };
}

const CUSTOM_ROUTE_COLORS = [
  "#2563eb",
  "#0d9488",
  "#b45309",
  "#7c3aed",
  "#be185d",
  "#0369a1",
  "#4d7c0f",
  "#c2410c",
];

function nextCustomRouteId(plan: Plan): string {
  const base = Date.now();
  let stamp = base;
  while (plan.routes.some((route) => route.route_id === `custom-${stamp}`)) {
    stamp += 1;
  }
  return `custom-${stamp}`;
}

function pickCustomRouteColor(plan: Plan): string {
  const used = new Set(plan.routes.map((route) => route.color.toLowerCase()));
  const available = CUSTOM_ROUTE_COLORS.find(
    (color) => !used.has(color.toLowerCase()),
  );
  return (
    available ??
    CUSTOM_ROUTE_COLORS[plan.routes.length % CUSTOM_ROUTE_COLORS.length]
  );
}

export type CreateRouteInput = {
  name: string;
  capacity: number;
  departure_min?: number;
  color?: string;
  /** Warehouse this route starts from and returns to. Defaults to the primary depot. */
  depot_id?: string;
  /** Optional vehicle from the plan's fleet inventory. Its capacity wins. */
  vehicle_id?: string | null;
};

/**
 * Appends an empty custom route. The new route is always the last item in
 * `plan.routes`, so callers can select it by reading the final element.
 */
export function createRoute(plan: Plan, input: CreateRouteInput): Plan {
  const name = input.name.trim();
  if (!name) throw new Error("A route name is required");

  const capacity = input.capacity;
  if (
    !Number.isFinite(capacity) ||
    !Number.isInteger(capacity) ||
    capacity < 1
  ) {
    throw new Error("Vehicle capacity must be a whole number of at least 1 bag");
  }

  const departureMin = input.departure_min ?? 7 * 60;
  if (
    !Number.isFinite(departureMin) ||
    !Number.isInteger(departureMin) ||
    departureMin < 0 ||
    departureMin >= 24 * 60
  ) {
    throw new Error("Departure time must be within the day");
  }

  const routeId = nextCustomRouteId(plan);
  if (input.depot_id && !getPlanDepots(plan).some((depot) => depot.id === input.depot_id)) {
    throw new Error(`Unknown warehouse: ${input.depot_id}`);
  }
  const depot = resolveDepot(plan, input.depot_id);
  const vehicle = input.vehicle_id
    ? getPlanVehicles(plan).find((candidate) => candidate.id === input.vehicle_id)
    : null;
  if (input.vehicle_id && !vehicle) {
    throw new Error(`Unknown vehicle: ${input.vehicle_id}`);
  }
  if (vehicle) {
    const assignedElsewhere = routesUsingVehicle(plan, vehicle.id);
    if (assignedElsewhere.length > 0) {
      throw new Error(
        `${vehicle.name} is already allocated to ${assignedElsewhere
          .map((candidate) => candidate.name)
          .join(" and ")}.`,
      );
    }
  }
  const nominalCap = vehicle ? vehicle.nominal_cap : capacity;
  const route: PlanRoute = {
    route_id: routeId,
    route_key: routeId.replace(/-/g, "_"),
    name,
    color: input.color ?? pickCustomRouteColor(plan),
    nominal_cap: nominalCap,
    max_load: vehicle ? vehicle.max_load : safeLoadForCapacity(capacity),
    departure_min: departureMin,
    stops: [],
    depot_id: depot.id,
    vehicle_id: vehicle?.id,
    is_custom: true,
  };

  return { ...plan, routes: [...plan.routes, route] };
}

function routeTravelSeconds(
  depotId: string,
  stops: PlanStop[],
  lookup: MatrixLookup,
  laundryId?: string | null,
): number {
  let total = 0;
  let previousId = depotId;
  for (const stop of stops) {
    total += lookup.leg(previousId, stop.hotel_id).durationS;
    previousId = stop.hotel_id;
  }
  const endId = laundryId ?? depotId;
  total += lookup.leg(previousId, endId).durationS;
  if (laundryId && laundryId !== depotId) {
    total += lookup.leg(laundryId, depotId).durationS;
  }
  return total;
}

function sameStopOrder(a: PlanStop[], b: PlanStop[]): boolean {
  return (
    a.length === b.length &&
    a.every((stop, index) => stop.hotel_id === b[index].hotel_id)
  );
}

/** Improves a single route's stop order with a 2-opt pass. Never worsens it. */
function twoOptStops(
  depotId: string,
  stops: PlanStop[],
  lookup: MatrixLookup,
  laundryId?: string | null,
): PlanStop[] {
  if (stops.length < 3) return stops;

  let best = [...stops];
  let bestSeconds = routeTravelSeconds(depotId, best, lookup, laundryId);
  let improved = true;

  while (improved) {
    improved = false;
    for (let start = 0; start < best.length - 1; start += 1) {
      for (let end = start + 1; end < best.length; end += 1) {
        const candidate = [
          ...best.slice(0, start),
          ...best.slice(start, end + 1).reverse(),
          ...best.slice(end + 1),
        ];
        const candidateSeconds = routeTravelSeconds(
          depotId,
          candidate,
          lookup,
          laundryId,
        );
        if (candidateSeconds < bestSeconds) {
          best = candidate;
          bestSeconds = candidateSeconds;
          improved = true;
        }
      }
    }
  }

  return best;
}

/** Reorders one route's stops with 2-opt while preserving its hotel set. */
export function optimizeRouteOrder(
  plan: Plan,
  routeId: string,
  matrixOrLookup: TravelMatrix | MatrixLookup,
): Plan {
  const route = findRoute(plan, routeId);
  if (!route) throw new Error(`Unknown route: ${routeId}`);
  if (route.stops.length < 3) return plan;

  const lookup = createPlanLookup(plan, matrixOrLookup);
  const optimized = twoOptStops(
    routeDepotId(plan, route),
    route.stops,
    lookup,
    routeLaundryId(plan, route),
  );
  if (sameStopOrder(route.stops, optimized)) return plan;

  return {
    ...plan,
    routes: plan.routes.map((candidate) =>
      candidate.route_id === routeId
        ? { ...candidate, stops: optimized }
        : candidate,
    ),
  };
}

/**
 * Moves a route to another warehouse. With a matrix, the stop order is also
 * re-polished with 2-opt from the new start/end point in the same step.
 */
export function reassignRouteDepot(
  plan: Plan,
  routeId: string,
  depotId: string,
  matrixOrLookup?: TravelMatrix | MatrixLookup,
): Plan {
  const route = findRoute(plan, routeId);
  if (!route) throw new Error(`Unknown route: ${routeId}`);
  if (!getPlanDepots(plan).some((depot) => depot.id === depotId)) {
    throw new Error(`Unknown warehouse: ${depotId}`);
  }
  if (routeDepotId(plan, route) === depotId && route.depot_id === depotId) {
    return plan;
  }

  let next: Plan = {
    ...plan,
    routes: plan.routes.map((candidate) =>
      candidate.route_id === routeId
        ? { ...candidate, depot_id: depotId }
        : candidate,
    ),
  };

  if (matrixOrLookup && route.stops.length >= 3) {
    next = optimizeRouteOrder(next, routeId, matrixOrLookup);
  }

  return next;
}

/**
 * Sets or clears a route's laundry. With a matrix, the stop order is
 * re-polished with 2-opt from the new end point in the same step.
 */
export function setRouteLaundry(
  plan: Plan,
  routeId: string,
  laundryId: string | null,
  matrixOrLookup?: TravelMatrix | MatrixLookup,
): Plan {
  const route = findRoute(plan, routeId);
  if (!route) throw new Error(`Unknown route: ${routeId}`);
  if (
    laundryId &&
    !getPlanLaundries(plan).some((laundry) => laundry.id === laundryId)
  ) {
    throw new Error(`Unknown laundry: ${laundryId}`);
  }
  if ((route.laundry_id ?? null) === laundryId) return plan;

  let next: Plan = {
    ...plan,
    routes: plan.routes.map((candidate) =>
      candidate.route_id === routeId
        ? {
            ...candidate,
            laundry_id: laundryId ?? undefined,
          }
        : candidate,
    ),
  };

  if (matrixOrLookup && route.stops.length >= 3) {
    next = optimizeRouteOrder(next, routeId, matrixOrLookup);
  }

  return next;
}

const VEHICLE_COLORS = [
  "#1d4ed8",
  "#0f766e",
  "#b45309",
  "#7c3aed",
  "#be185d",
  "#0369a1",
  "#4d7c0f",
  "#c2410c",
];

function nextVehicleId(plan: Plan): string {
  const base = Date.now();
  let stamp = base;
  while (getPlanVehicles(plan).some((vehicle) => vehicle.id === `vehicle-${stamp}`)) {
    stamp += 1;
  }
  return `vehicle-${stamp}`;
}

function pickVehicleColor(plan: Plan): string {
  const used = new Set(
    getPlanVehicles(plan).map((vehicle) => vehicle.color?.toLowerCase()),
  );
  const available = VEHICLE_COLORS.find(
    (color) => !used.has(color.toLowerCase()),
  );
  return (
    available ??
    VEHICLE_COLORS[getPlanVehicles(plan).length % VEHICLE_COLORS.length]
  );
}

export type AddVehicleInput = {
  name: string;
  capacity: number;
  color?: string;
};

/** Adds a vehicle to the plan's fleet inventory. */
export function addVehicle(plan: Plan, input: AddVehicleInput): Plan {
  const name = input.name.trim();
  if (!name) throw new Error("A vehicle name is required");
  const capacity = input.capacity;
  if (!Number.isInteger(capacity) || capacity < 1) {
    throw new Error("Vehicle capacity must be a whole number of at least 1 bag");
  }

  const vehicle: PlanVehicle = {
    id: nextVehicleId(plan),
    name,
    nominal_cap: capacity,
    max_load: safeLoadForCapacity(capacity),
    color: input.color ?? pickVehicleColor(plan),
  };

  return { ...plan, vehicles: [...getPlanVehicles(plan), vehicle] };
}

export type UpdateVehicleInput = {
  name?: string;
  capacity?: number;
  color?: string;
};

/**
 * Updates a vehicle. Capacity changes propagate to every route using it, and
 * the caller is responsible for warning when a route's load exceeds the new
 * capacity (the plan validation will still flag it).
 */
export function updateVehicle(
  plan: Plan,
  vehicleId: string,
  input: UpdateVehicleInput,
): Plan {
  const vehicle = getPlanVehicles(plan).find(
    (candidate) => candidate.id === vehicleId,
  );
  if (!vehicle) throw new Error(`Unknown vehicle: ${vehicleId}`);

  const name = input.name === undefined ? vehicle.name : input.name.trim();
  if (!name) throw new Error("A vehicle name is required");

  const capacity =
    input.capacity === undefined ? vehicle.nominal_cap : input.capacity;
  if (!Number.isInteger(capacity) || capacity < 1) {
    throw new Error("Vehicle capacity must be a whole number of at least 1 bag");
  }

  const nextVehicle: PlanVehicle = {
    ...vehicle,
    name,
    nominal_cap: capacity,
    max_load: safeLoadForCapacity(capacity),
    color: input.color ?? vehicle.color,
  };
  const capacityChanged =
    nextVehicle.nominal_cap !== vehicle.nominal_cap ||
    nextVehicle.max_load !== vehicle.max_load;

  return {
    ...plan,
    vehicles: getPlanVehicles(plan).map((candidate) =>
      candidate.id === vehicleId ? nextVehicle : candidate,
    ),
    routes: capacityChanged
      ? plan.routes.map((route) =>
          route.vehicle_id === vehicleId
            ? {
                ...route,
                nominal_cap: nextVehicle.nominal_cap,
                max_load: nextVehicle.max_load,
              }
            : route,
        )
      : plan.routes,
  };
}

/** Assigns a vehicle to a route, or clears it for manual capacity. */
export function assignVehicleToRoute(
  plan: Plan,
  routeId: string,
  vehicleId: string | null,
): Plan {
  const route = findRoute(plan, routeId);
  if (!route) throw new Error(`Unknown route: ${routeId}`);
  if ((route.vehicle_id ?? null) === vehicleId) return plan;

  if (vehicleId === null) {
    return {
      ...plan,
      routes: plan.routes.map((candidate) =>
        candidate.route_id === routeId
          ? { ...candidate, vehicle_id: undefined }
          : candidate,
      ),
    };
  }

  const vehicle = getPlanVehicles(plan).find(
    (candidate) => candidate.id === vehicleId,
  );
  if (!vehicle) throw new Error(`Unknown vehicle: ${vehicleId}`);
  const assignedElsewhere = routesUsingVehicle(plan, vehicleId).filter(
    (candidate) => candidate.route_id !== routeId,
  );
  if (assignedElsewhere.length > 0) {
    throw new Error(
      `${vehicle.name} is already allocated to ${assignedElsewhere
        .map((candidate) => candidate.name)
        .join(" and ")}.`,
    );
  }

  return {
    ...plan,
    routes: plan.routes.map((candidate) =>
      candidate.route_id === routeId
        ? {
            ...candidate,
            vehicle_id: vehicle.id,
            nominal_cap: vehicle.nominal_cap,
            max_load: vehicle.max_load,
          }
        : candidate,
    ),
  };
}

/** Removes an unassigned vehicle from the inventory. */
export function deleteVehicle(plan: Plan, vehicleId: string): Plan {
  const vehicle = getPlanVehicles(plan).find(
    (candidate) => candidate.id === vehicleId,
  );
  if (!vehicle) throw new Error(`Unknown vehicle: ${vehicleId}`);
  const assigned = routesUsingVehicle(plan, vehicleId);
  if (assigned.length > 0) {
    throw new Error(
      `${vehicle.name} is assigned to ${assigned.map((route) => route.name).join(" and ")}. Reassign those routes first.`,
    );
  }

  return {
    ...plan,
    vehicles: getPlanVehicles(plan).filter(
      (candidate) => candidate.id !== vehicleId,
    ),
  };
}

/**
 * Moves a batch of existing hotels onto one route. The move is atomic: if the
 * projected load exceeds the target vehicle capacity, nothing changes. Stops
 * are placed with cheapest insertion and the target route is polished with
 * 2-opt; every other route keeps its current stop order.
 */
export function addStopsToRoute(
  plan: Plan,
  routeId: string,
  hotelIds: string[],
  matrixOrLookup: TravelMatrix | MatrixLookup,
): Plan {
  const route = findRoute(plan, routeId);
  if (!route) throw new Error(`Unknown route: ${routeId}`);

  const requestedIds = [...new Set(hotelIds)];
  if (requestedIds.length === 0) return plan;

  const existingIds = new Set(route.stops.map((stop) => stop.hotel_id));
  const selected: PlanStop[] = [];

  for (const hotelId of requestedIds) {
    if (existingIds.has(hotelId)) {
      const existing = route.stops.find((stop) => stop.hotel_id === hotelId);
      throw new Error(
        `${existing?.name ?? hotelId} is already on ${route.name}.`,
      );
    }
    const found = findStop(plan, hotelId);
    if (!found) {
      throw new Error(`Hotel is not assigned to any route: ${hotelId}`);
    }
    selected.push(found.stop);
  }

  const currentBags = route.stops.reduce(
    (sum, stop) => sum + stop.load_bags,
    0,
  );
  const addedBags = selected.reduce((sum, stop) => sum + stop.load_bags, 0);
  const projectedBags = currentBags + addedBags;
  if (
    resolveVehicle(plan, route) !== null &&
    projectedBags > route.nominal_cap
  ) {
    throw new Error(
      `${route.name} cannot take ${requestedIds.length} hotel${
        requestedIds.length === 1 ? "" : "s"
      }: ${projectedBags} bags would exceed its ${route.nominal_cap}-bag vehicle limit.`,
    );
  }

  const lookup = createPlanLookup(plan, matrixOrLookup);
  const selectedIds = new Set(requestedIds);

  let targetStops = [...route.stops];
  for (const stop of selected) {
    const insertIndex = cheapestInsertionIndex(
      plan,
      { ...route, stops: targetStops },
      stop,
      lookup,
    );
    targetStops.splice(insertIndex, 0, stop);
  }
  targetStops = twoOptStops(
    routeDepotId(plan, route),
    targetStops,
    lookup,
    routeLaundryId(plan, route),
  );

  return {
    ...plan,
    routes: plan.routes.map((candidate) => {
      if (candidate.route_id === routeId) {
        return { ...candidate, stops: targetStops };
      }
      if (candidate.stops.some((stop) => selectedIds.has(stop.hotel_id))) {
        return {
          ...candidate,
          stops: candidate.stops.filter(
            (stop) => !selectedIds.has(stop.hotel_id),
          ),
        };
      }
      return candidate;
    }),
  };
}

export type NewHotelInput = {
  name: string;
  lat: number;
  lon: number;
  region: number;
  service_mins: number;
  load_bags: number;
  rooms?: number;
};

function nextCustomHotelId(plan: Plan, name: string): string {
  const base =
    name
      .toLowerCase()
      .normalize("NFKD")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 48) || "hotel";
  const used = new Set(
    plan.routes.flatMap((route) => route.stops.map((stop) => stop.hotel_id)),
  );
  let id = `custom-${base}`;
  let suffix = 2;
  while (used.has(id)) {
    id = `custom-${base}-${suffix}`;
    suffix += 1;
  }
  return id;
}

/**
 * Adds a brand-new hotel (not from the master hotel list) to one route and
 * places it with cheapest insertion. The hotel is part of the plan draft only.
 */
export function addNewHotelToRoute(
  plan: Plan,
  routeId: string,
  input: NewHotelInput,
  matrix: TravelMatrix,
): { plan: Plan; stop: PlanStop } {
  const route = findRoute(plan, routeId);
  if (!route) throw new Error(`Unknown route: ${routeId}`);

  const name = input.name.trim();
  if (!name) throw new Error("A hotel name is required.");
  if (!Number.isFinite(input.lat) || input.lat < -90 || input.lat > 90) {
    throw new Error("Latitude must be between -90 and 90.");
  }
  if (!Number.isFinite(input.lon) || input.lon < -180 || input.lon > 180) {
    throw new Error("Longitude must be between -180 and 180.");
  }
  if (!Number.isInteger(input.region) || input.region < 0) {
    throw new Error("Choose a region for this hotel.");
  }
  if (!Number.isInteger(input.service_mins) || input.service_mins < 0) {
    throw new Error("Service time must be a whole number of minutes.");
  }
  if (!Number.isInteger(input.load_bags) || input.load_bags < 0) {
    throw new Error("Bags must be a whole number.");
  }
  const rooms = input.rooms ?? 0;
  if (!Number.isInteger(rooms) || rooms < 0) {
    throw new Error("Rooms must be a whole number.");
  }

  const currentBags = route.stops.reduce(
    (sum, stop) => sum + stop.load_bags,
    0,
  );
  if (
    resolveVehicle(plan, route) !== null &&
    currentBags + input.load_bags > route.nominal_cap
  ) {
    throw new Error(
      `${route.name} would carry ${currentBags + input.load_bags} bags, above its ${route.nominal_cap}-bag vehicle limit.`,
    );
  }

  const stop: PlanStop = {
    hotel_id: nextCustomHotelId(plan, name),
    name,
    lat: input.lat,
    lon: input.lon,
    region: input.region,
    service_mins: input.service_mins,
    load_bags: input.load_bags,
    rooms,
  };

  const lookup = createMatrixLookup(matrix, [
    ...planStopPoints(plan),
    {
      id: stop.hotel_id,
      name: stop.name,
      lat: stop.lat,
      lon: stop.lon,
      kind: "hotel",
    },
  ]);
  const insertIndex = cheapestInsertionIndex(plan, route, stop, lookup);
  const stops = [...route.stops];
  stops.splice(insertIndex, 0, stop);
  const optimized = twoOptStops(
    routeDepotId(plan, route),
    stops,
    lookup,
    routeLaundryId(plan, route),
  );

  return {
    plan: {
      ...plan,
      routes: plan.routes.map((candidate) =>
        candidate.route_id === routeId
          ? { ...candidate, stops: optimized }
          : candidate,
      ),
    },
    stop,
  };
}

export type DeleteRouteOptions = {
  /**
   * Plan whose routes and stop positions are restored when a non-empty custom
   * route is deleted. Without it, hotels leave their routes but remain in the
   * plan as unassigned.
   */
  restoreFrom?: Plan;
};

/**
 * Deletes a custom route at any time. When the route has stops, they return to
 * their original routes and positions from `restoreFrom` (normally the
 * baseline plan). Baseline routes remain protected.
 */
export function deleteRoute(
  plan: Plan,
  routeId: string,
  options: DeleteRouteOptions = {},
): Plan {
  const route = findRoute(plan, routeId);
  if (!route) throw new Error(`Unknown route: ${routeId}`);
  if (!route.is_custom) {
    throw new Error(`${route.name} is a baseline route and cannot be deleted.`);
  }

  const restoredIds = new Set(route.stops.map((stop) => stop.hotel_id));
  const unassigned = new Set(plan.unassigned_hotel_ids ?? []);
  const placed = new Set<string>();
  const restoreFrom = options.restoreFrom;

  const routes = plan.routes
    .filter((candidate) => candidate.route_id !== routeId)
    .map((candidate) => {
      if (!restoreFrom || restoredIds.size === 0) return candidate;

      const original = restoreFrom.routes.find(
        (source) => source.route_id === candidate.route_id,
      );
      if (!original) return candidate;

      const originalIndexById = new Map(
        original.stops.map((stop, index) => [stop.hotel_id, index]),
      );
      const returning = route.stops
        .filter((stop) => originalIndexById.has(stop.hotel_id))
        .map((stop) => ({
          stop,
          index: originalIndexById.get(stop.hotel_id) as number,
        }))
        .sort((a, b) => a.index - b.index);

      if (returning.length === 0) return candidate;

      const stops = [...candidate.stops];
      for (const { stop, index } of returning) {
        stops.splice(Math.min(index, stops.length), 0, stop);
        placed.add(stop.hotel_id);
      }
      return { ...candidate, stops };
    });

  for (const hotelId of restoredIds) {
    if (placed.has(hotelId)) unassigned.delete(hotelId);
    else unassigned.add(hotelId);
  }

  return {
    ...plan,
    routes,
    unassigned_hotel_ids:
      route.stops.length > 0
        ? [...unassigned]
        : plan.unassigned_hotel_ids,
  };
}
