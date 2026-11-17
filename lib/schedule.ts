/**
 * Pure stop-time scheduler: fills arrival/departure from the travel matrix
 * (OSRM × Google-calibrated factor). This module has no Node-only imports so
 * it can be shared by server context and client-facing utilities.
 */
import { haversineKm, type DispatchRoute } from "./coverage";
import type { PlanDepot, TravelMatrix } from "./plan";
import { clockToMinutes, formatClock, minutesToClock } from "./clock";

export type SchedulePoint = { id: string | null; lat: number; lon: number };
export type ScheduleOptions = { fallbackSpeedKmh: number; roadFactor: number };

export function estimateLeg(
  matrix: TravelMatrix | null,
  indexById: Map<string, number>,
  options: ScheduleOptions,
  from: SchedulePoint,
  to: SchedulePoint,
): { mins: number; km: number } {
  if (matrix && from.id && to.id) {
    const fromIndex = indexById.get(from.id);
    const toIndex = indexById.get(to.id);
    if (fromIndex !== undefined && toIndex !== undefined) {
      const seconds = matrix.durations_s[fromIndex]?.[toIndex];
      const meters = matrix.distances_m[fromIndex]?.[toIndex];
      if (typeof seconds === "number") {
        const factor =
          matrix.duration_factor && matrix.duration_factor > 0
            ? matrix.duration_factor
            : 1;
        return {
          mins: Math.max(1, Math.round((seconds * factor) / 60)),
          km:
            typeof meters === "number"
              ? meters / 1000
              : haversineKm(from.lat, from.lon, to.lat, to.lon),
        };
      }
    }
  }
  const km = haversineKm(from.lat, from.lon, to.lat, to.lon) * options.roadFactor;
  return {
    mins: Math.max(3, Math.round((km / Math.max(1, options.fallbackSpeedKmh)) * 60)),
    km,
  };
}

function scheduleRouteWithLegs(
  route: DispatchRoute,
  depot: PlanDepot | undefined,
  legFor: (from: SchedulePoint, to: SchedulePoint) => { mins: number; km: number },
): DispatchRoute {
  if (route.stops.length === 0) return route;

  const start = depot ?? {
    id: route.stops[0].hotel_id ?? "depot-primary",
    name: "Depot",
    lat: route.stops[0].lat,
    lon: route.stops[0].lon,
  };

  let current = clockToMinutes(route.departure_hq || "07:00");
  let totalDrive = 0;
  let totalKm = 0;
  let previous: SchedulePoint = { id: start.id, lat: start.lat, lon: start.lon };

  const stops = route.stops.map((stop) => {
    const to = { id: stop.hotel_id ?? null, lat: stop.lat, lon: stop.lon };
    const drive = legFor(previous, to);
    current += drive.mins;
    totalDrive += drive.mins;
    totalKm += drive.km;
    const arrival = current;
    current += stop.stop_mins;
    previous = to;
    return {
      ...stop,
      arrival_time: formatClock(minutesToClock(arrival)),
      departure_time: formatClock(minutesToClock(current)),
    };
  });

  const returnDrive = legFor(previous, {
    id: start.id,
    lat: start.lat,
    lon: start.lon,
  });
  current += returnDrive.mins;
  totalDrive += returnDrive.mins;
  totalKm += returnDrive.km;

  const totalBags = stops.reduce((sum, stop) => sum + stop.load_bags, 0);
  return {
    ...route,
    stops,
    departure_hq: formatClock(route.departure_hq || "07:00"),
    return_hq: formatClock(minutesToClock(current)),
    total_hotels: stops.length,
    total_bags: totalBags,
    total_dist_km: Number(totalKm.toFixed(1)),
    total_drive_mins: totalDrive,
    total_service_mins: stops.reduce((sum, stop) => sum + stop.stop_mins, 0),
    capacity_utilization_pct:
      route.max_load > 0 ? Math.round((totalBags / route.max_load) * 100) : 0,
  };
}

/**
 * Fills stop times from the travel matrix (OSRM × Google-calibrated factor).
 * Existing times are preserved; use the Google variant to recompute them.
 */
export function scheduleDispatchRoutes(
  routes: DispatchRoute[],
  depot: PlanDepot | undefined,
  matrix: TravelMatrix | null,
  options: ScheduleOptions,
): DispatchRoute[] {
  const indexById = new Map(
    (matrix?.points ?? []).map((point, index) => [point.id, index]),
  );
  return routes.map((route) =>
    route.stops.some((stop) => stop.arrival_time)
      ? route
      : scheduleRouteWithLegs(route, depot, (from, to) =>
          estimateLeg(matrix, indexById, options, from, to),
        ),
  );
}
