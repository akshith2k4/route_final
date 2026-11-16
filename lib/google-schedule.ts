/**
 * Google Routes scheduler, server-only. Recomputes every leg with the
 * traffic-aware Routes API at the leg's actual departure time, falling back
 * to the calibrated matrix when Google is unavailable or quota-limited.
 */
import { haversineKm, type DispatchRoute, type DispatchStop } from "./coverage";
import type { PlanDepot, TravelMatrix } from "./plan";
import { clockToMinutes, formatClock, minutesToClock } from "./clock";
import { getGoogleAccessToken } from "./google-auth";
import { isoWithOffset, localDateString } from "./timezone";
import {
  estimateLeg,
  scheduleDispatchRoutes,
  type ScheduleOptions,
  type SchedulePoint,
} from "./schedule";

/**
 * Schedules every leg with the Google Routes API (traffic-aware), using each
 * leg's actual departure time. Falls back to the calibrated matrix per leg if
 * Google is unavailable or quota-limited. This is the accurate publish path.
 */
export async function scheduleDispatchRoutesWithGoogle(
  routes: DispatchRoute[],
  depot: PlanDepot | undefined,
  matrix: TravelMatrix | null,
  options: ScheduleOptions & { timezone: string },
): Promise<DispatchRoute[]> {
  let token: string | null = null;
  try {
    ({ token } = await getGoogleAccessToken(
      "https://www.googleapis.com/auth/cloud-platform",
    ));
  } catch {
    token = null;
  }
  if (!token) return scheduleDispatchRoutes(routes, depot, matrix, options);

  // Safety valve for very large cities: per-leg Google calls are great for
  // normal onboarding, but 150+ legs would exceed a serverless request.
  const legCount = routes.reduce(
    (sum, route) => sum + route.stops.length + 1,
    0,
  );
  if (legCount > 150) {
    return scheduleDispatchRoutes(routes, depot, matrix, options);
  }

  const indexById = new Map(
    (matrix?.points ?? []).map((point, index) => [point.id, index]),
  );
  const dateStr = localDateString(
    options.timezone,
    new Date(Date.now() + 24 * 60 * 60 * 1000),
  );

  async function googleLeg(
    from: SchedulePoint,
    to: SchedulePoint,
    atMinutes: number,
  ): Promise<{ mins: number; km: number } | null> {
    if (!token) return null;
    try {
      const response = await fetch(
        "https://routes.googleapis.com/directions/v2:computeRoutes",
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
            "X-Goog-FieldMask": "routes.duration,routes.distanceMeters",
          },
          body: JSON.stringify({
            origin: {
              location: { latLng: { latitude: from.lat, longitude: from.lon } },
            },
            destination: {
              location: { latLng: { latitude: to.lat, longitude: to.lon } },
            },
            travelMode: "DRIVE",
            routingPreference: "TRAFFIC_AWARE",
            departureTime: isoWithOffset(
              options.timezone,
              dateStr,
              minutesToClock(atMinutes),
            ),
          }),
        },
      );
      if (!response.ok) return null;
      const data = await response.json();
      const routeData = data.routes?.[0];
      const seconds = Number(
        String(routeData?.duration ?? "0s").replace("s", ""),
      );
      if (!Number.isFinite(seconds) || seconds <= 0) return null;
      const meters = Number(routeData?.distanceMeters ?? 0);
      return {
        mins: Math.max(1, Math.round(seconds / 60)),
        km:
          meters > 0
            ? meters / 1000
            : haversineKm(from.lat, from.lon, to.lat, to.lon),
      };
    } catch {
      return null;
    }
  }

  const results: DispatchRoute[] = [];
  for (const route of routes) {
    if (route.stops.length === 0) {
      results.push(route);
      continue;
    }

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
    const scheduled: DispatchStop[] = [];

    for (const stop of route.stops) {
      const to = { id: stop.hotel_id ?? null, lat: stop.lat, lon: stop.lon };
      const google = await googleLeg(previous, to, current);
      const drive =
        google ?? estimateLeg(matrix, indexById, options, previous, to);
      current += drive.mins;
      totalDrive += drive.mins;
      totalKm += drive.km;
      const arrival = current;
      current += stop.stop_mins;
      scheduled.push({
        ...stop,
        arrival_time: formatClock(minutesToClock(arrival)),
        departure_time: formatClock(minutesToClock(current)),
      });
      previous = to;
      await new Promise((resolve) => setTimeout(resolve, 120));
    }

    const returnTo = { id: start.id, lat: start.lat, lon: start.lon };
    const returnGoogle = await googleLeg(previous, returnTo, current);
    const returnDrive =
      returnGoogle ?? estimateLeg(matrix, indexById, options, previous, returnTo);
    current += returnDrive.mins;
    totalDrive += returnDrive.mins;
    totalKm += returnDrive.km;

    const totalBags = scheduled.reduce((sum, stop) => sum + stop.load_bags, 0);
    results.push({
      ...route,
      stops: scheduled,
      departure_hq: formatClock(route.departure_hq || "07:00"),
      return_hq: formatClock(minutesToClock(current)),
      total_hotels: scheduled.length,
      total_bags: totalBags,
      total_dist_km: Number(totalKm.toFixed(1)),
      total_drive_mins: totalDrive,
      total_service_mins: scheduled.reduce((sum, stop) => sum + stop.stop_mins, 0),
      capacity_utilization_pct:
        route.max_load > 0 ? Math.round((totalBags / route.max_load) * 100) : 0,
    });
  }

  return results;
}
