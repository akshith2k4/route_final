export const PLAN_SCHEMA_VERSION = 1;
export const MATRIX_SCHEMA_VERSION = 1;

export type PlanDepot = {
  id: string;
  name: string;
  lat: number;
  lon: number;
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
};

export type Plan = {
  schema_version: number;
  plan_id: string;
  name: string;
  status: "draft" | "published";
  created_at?: string;
  source?: string;
  depot: PlanDepot;
  shift: PlanShift;
  routes: PlanRoute[];
  unassigned_hotel_ids?: string[];
};

export type MatrixPoint = {
  id: string;
  name: string;
  lat: number;
  lon: number;
  kind: "depot" | "hotel";
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
  capacity_utilization_pct: number;
  departure_hq: string;
  return_hq: string;
  return_min: number;
  stops: ComputedStop[];
  estimated_legs: number;
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

function round1(value: number): number {
  return Math.round(value * 10) / 10;
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

export function createMatrixLookup(matrix: TravelMatrix): MatrixLookup {
  const pointsById = new Map(matrix.points.map((point) => [point.id, point]));
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

export function computeRoute(
  plan: Plan,
  route: PlanRoute,
  matrixOrLookup: TravelMatrix | MatrixLookup,
): ComputedRoute {
  const lookup = "leg" in matrixOrLookup ? matrixOrLookup : createMatrixLookup(matrixOrLookup);

  let cursorS = route.departure_min * 60;
  let previousId = plan.depot.id;
  let driveS = 0;
  let distanceM = 0;
  let serviceMins = 0;
  let bags = 0;
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

  const returnLeg = lookup.leg(previousId, plan.depot.id);
  if (returnLeg.estimated) estimatedLegs += 1;
  cursorS += returnLeg.durationS;
  driveS += returnLeg.durationS;
  distanceM += returnLeg.distanceM;

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
    capacity_utilization_pct:
      route.max_load > 0 ? round1((bags / route.max_load) * 100) : 0,
    departure_hq: formatClock(route.departure_min),
    return_hq: formatClock(cursorS / 60),
    return_min: Math.round(cursorS / 60),
    stops,
    estimated_legs: estimatedLegs,
  };
}

export function computePlan(plan: Plan, matrix: TravelMatrix): PlanComputation {
  const lookup = createMatrixLookup(matrix);
  const routes = plan.routes.map((route) => computeRoute(plan, route, lookup));
  const issues = validateComputedPlan(plan, routes);
  const totals: PlanTotals = {
    routes: routes.length,
    hotels: routes.reduce((sum, route) => sum + route.total_hotels, 0),
    bags: routes.reduce((sum, route) => sum + route.total_bags, 0),
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

    if (route.stops.length === 0) {
      issues.push({
        severity: "warning",
        code: "empty_route",
        message: `${route.name} has no stops.`,
        route_id: route.route_id,
      });
    }

    if (route.total_bags > route.nominal_cap) {
      issues.push({
        severity: "error",
        code: "over_nominal_capacity",
        message: `${route.name} carries ${route.total_bags} bags, above the vehicle capacity of ${route.nominal_cap}.`,
        route_id: route.route_id,
      });
    } else if (route.total_bags > route.max_load) {
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
  const lookup =
    "leg" in matrixOrLookup ? matrixOrLookup : createMatrixLookup(matrixOrLookup);

  let bestIndex = route.stops.length;
  let bestDeltaS = Number.POSITIVE_INFINITY;
  let bestDeltaM = Number.POSITIVE_INFINITY;

  for (let index = 0; index <= route.stops.length; index += 1) {
    const previousId =
      index === 0 ? plan.depot.id : route.stops[index - 1].hotel_id;
    const nextId =
      index === route.stops.length
        ? plan.depot.id
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
  if (projectedBags > targetRoute.nominal_cap) {
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
