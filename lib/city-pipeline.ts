/**
 * City pipeline, server-side.
 *
 * These are the in-process equivalents of the offline scripts
 * (09_ensure_hotel_ids, 10_build_plan, 11_build_travel_matrix,
 * 12_build_plan_geometries). The admin wizard and the seed script both call
 * these, so there is a single code path and no offline dependency.
 *
 * The OSRM-backed builders are *resumable*: they accept an existing partial
 * result, fill what they can within a time budget, and report completion so a
 * serverless request never runs too long. The client loops until complete.
 */
import { cellToLatLng, gridDisk, latLngToCell, polygonToCells } from "h3-js";
import {
  DEFAULT_SHIFT_SETTINGS,
  haversineKm,
  type DispatchRoute,
  type DispatchStop,
  type HexMap,
  type Hotel,
  type RegionMeta,
  type StudioDepot,
  type StudioHotelSetting,
  type StudioShiftSetting,
  type StudioVehicle,
} from "./coverage";
import { runStudioOptimization } from "./studio-optimizer";
import type {
  MatrixPoint,
  Plan,
  PlanDepot,
  PlanLaundry,
  PlanRoute,
  PlanStop,
  PlanVehicle,
  TravelMatrix,
} from "./plan";

const DEFAULT_OSRM_BASE_URL = "https://router.project-osrm.org";
const OSRM_BLOCK_SIZE = 50;
const OSRM_DELAY_MS = 350;
const OSRM_MAX_ATTEMPTS = 4;

export function osrmBaseUrl(): string {
  return (process.env.OSRM_BASE_URL ?? DEFAULT_OSRM_BASE_URL).replace(/\/+$/, "");
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/* ------------------------------------------------------------------ */
/* 09 — hotel ids                                                      */
/* ------------------------------------------------------------------ */

function slugify(value: string): string {
  return value
    .normalize("NFKD")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-{2,}/g, "-");
}

/** Guarantees a unique, url-safe id for every hotel (port of script 09). */
export function ensureHotelIds<T extends { id?: string; name: string }>(
  hotels: T[],
): T[] {
  const seen = new Set<string>();
  return hotels.map((hotel) => {
    let id = typeof hotel.id === "string" && hotel.id.trim() ? hotel.id.trim() : "";
    if (!id) id = slugify(hotel.name) || "hotel";
    const base = id;
    let suffix = 2;
    while (seen.has(id)) {
      id = `${base}-${suffix}`;
      suffix += 1;
    }
    seen.add(id);
    return { ...hotel, id };
  });
}

/* ------------------------------------------------------------------ */
/* hex map                                                             */
/* ------------------------------------------------------------------ */

/** Approximates a circle as a closed lat/lon polygon for `polygonToCells`. */
function circlePolygon(
  center: { lat: number; lon: number },
  radiusKm: number,
  steps = 72,
): [number, number][] {
  const latDelta = radiusKm / 111.32;
  const lonDelta =
    radiusKm / (111.32 * Math.max(0.05, Math.cos((center.lat * Math.PI) / 180)));
  const points: [number, number][] = [];
  for (let i = 0; i < steps; i += 1) {
    const angle = (2 * Math.PI * i) / steps;
    points.push([
      center.lat + latDelta * Math.sin(angle),
      center.lon + lonDelta * Math.cos(angle),
    ]);
  }
  points.push(points[0]);
  return points;
}

/**
 * Builds a continuous coverage hex map. The city is covered as one filled
 * area around its hotels and region centres — not isolated hotel dots — so the
 * atlas shows unbroken territories. Hotel cells keep their assigned region;
 * every other cell goes to the nearest region centre.
 */
export function buildHexMap(
  hotels: Hotel[],
  regions: RegionMeta[],
  resolution: number,
): HexMap {
  const hexMap: HexMap = {};
  if (regions.length === 0) return hexMap;

  const nearestRegion = (lat: number, lon: number): number => {
    let best = regions[0];
    let bestDistance = Number.POSITIVE_INFINITY;
    for (const region of regions) {
      const distance = haversineKm(lat, lon, region.center.lat, region.center.lon);
      if (distance < bestDistance) {
        bestDistance = distance;
        best = region;
      }
    }
    return best.id;
  };

  // Hotel cells are authoritative: they belong to the region the manager set.
  for (const hotel of hotels) {
    try {
      hexMap[latLngToCell(hotel.lat, hotel.lon, resolution)] = hotel.region;
    } catch {
      // ignore invalid coordinates
    }
  }

  const points = [
    ...hotels.map((hotel) => ({ lat: hotel.lat, lon: hotel.lon })),
    ...regions.map((region) => region.center),
  ];

  let cells: string[] = [];
  if (points.length > 0) {
    const centroid = points.reduce(
      (acc, point) => ({ lat: acc.lat + point.lat, lon: acc.lon + point.lon }),
      { lat: 0, lon: 0 },
    );
    centroid.lat /= points.length;
    centroid.lon /= points.length;

    // Cover everything the city touches, plus a small margin.
    const radiusKm =
      Math.max(
        ...points.map((point) =>
          haversineKm(centroid.lat, centroid.lon, point.lat, point.lon),
        ),
      ) + 2;

    try {
      cells = polygonToCells([circlePolygon(centroid, radiusKm)], resolution, false);
    } catch {
      cells = [];
    }

    // Fallback if the polygon fill fails.
    if (cells.length === 0) {
      try {
        const origin = latLngToCell(centroid.lat, centroid.lon, resolution);
        const k = Math.max(1, Math.ceil(radiusKm / 1.4));
        cells = gridDisk(origin, k);
      } catch {
        cells = [];
      }
    }
  }

  for (const cell of cells) {
    if (hexMap[cell] !== undefined) continue;
    const [lat, lon] = cellToLatLng(cell);
    hexMap[cell] = nearestRegion(lat, lon);
  }

  return hexMap;
}

/* ------------------------------------------------------------------ */
/* baseline plan (solver) + converters                                 */
/* ------------------------------------------------------------------ */

export type BaselinePlanInput = {
  hotels: Hotel[];
  vehicles: StudioVehicle[];
  depots: StudioDepot[];
  laundries?: PlanLaundry[];
  shift?: StudioShiftSetting;
  roadFactor?: number;
  avgSpeedKmh?: number;
  regionAdjacency?: Record<string, string[]>;
  planId?: string;
  name?: string;
};

function timeToMin(value: string, fallback: number): number {
  const match = /^(\d{1,2}):(\d{2})$/.exec(value ?? "");
  if (!match) return fallback;
  return Number(match[1]) * 60 + Number(match[2]);
}

/** Converts solver output (DispatchRoute[]) into an editable Plan. */
export function dispatchRoutesToPlan(
  routes: DispatchRoute[],
  input: {
    depots: PlanDepot[];
    laundries?: PlanLaundry[];
    vehicles?: PlanVehicle[];
    shift?: StudioShiftSetting;
    planId?: string;
    name?: string;
  },
): Plan {
  const shift = input.shift ?? DEFAULT_SHIFT_SETTINGS;
  const primary = input.depots[0];

  const planRoutes: PlanRoute[] = routes.map((route, index) => {
    const stops: PlanStop[] = route.stops.map((stop) => ({
      hotel_id: stop.hotel_id ?? slugify(stop.name),
      name: stop.name,
      lat: stop.lat,
      lon: stop.lon,
      region: stop.region ?? 0,
      service_mins: stop.stop_mins,
      load_bags: stop.load_bags,
      days: ["day1", "day2"],
    }));
    return {
      route_id: route.route_id ?? `route-${index + 1}`,
      route_key: route.route_id ?? `route-${index + 1}`,
      name: route.vehicle_label,
      color: route.color,
      nominal_cap: route.nominal_cap,
      max_load: route.max_load,
      departure_min: timeToMin(route.departure_hq ?? "", timeToMin(shift.earliestDeparture, 7 * 60)),
      stops,
      depot_id: primary?.id,
      laundry_id: null,
    };
  });

  const assigned = new Set(planRoutes.flatMap((route) => route.stops.map((s) => s.hotel_id)));

  return {
    schema_version: 1,
    plan_id: input.planId ?? "manual-current",
    name: input.name ?? "Manual Dispatch Plan",
    status: "draft",
    created_at: new Date().toISOString(),
    source: "studio-solver",
    depot: primary,
    depots: input.depots,
    laundries: input.laundries ?? [],
    vehicles: input.vehicles ?? [],
    vehicles_version: 2,
    days_version: 1,
    shift: {
      start_min: timeToMin(shift.earliestDeparture, 7 * 60),
      end_min: timeToMin(shift.latestReturn, 17 * 60),
    },
    routes: planRoutes,
    unassigned_hotel_ids: [],
  };
}

/**
 * Generates a starting baseline plan with the local studio solver, so a city
 * with NO hand-authored manual routes still opens with a sensible dispatch.
 */
export function buildBaselinePlan(input: BaselinePlanInput): Plan {
  const hotelSettings: Record<string, StudioHotelSetting> = {};
  for (const hotel of input.hotels) {
    hotelSettings[hotel.name] = {
      name: hotel.name,
      selected: true,
      timeWindowEnabled: false,
      earliestArrival: "08:00",
      latestArrival: "13:00",
      priority: "Normal",
      customBags: hotel.load,
    };
  }

  const result = runStudioOptimization({
    hotels: input.hotels,
    hotelSettings,
    vehicles: input.vehicles,
    depots: input.depots,
    shiftSettings: input.shift ?? DEFAULT_SHIFT_SETTINGS,
    roadFactor: input.roadFactor,
    avgSpeedKmh: input.avgSpeedKmh,
    regionAdjacency: input.regionAdjacency,
  });

  const plan = dispatchRoutesToPlan(result.routes, {
    depots: input.depots.map((depot) => ({
      id: depot.id,
      name: depot.name,
      lat: depot.latitude,
      lon: depot.longitude,
    })),
    laundries: input.laundries,
    vehicles: input.vehicles.map((vehicle) => ({
      id: `vehicle-${vehicle.id}`,
      name: vehicle.label,
      nominal_cap: vehicle.nominal_capacity,
      max_load: vehicle.max_load,
      color: vehicle.color,
    })),
    shift: input.shift,
    planId: input.planId,
    name: input.name,
  });

  plan.unassigned_hotel_ids = result.unassignedHotels.map((entry) => entry.hotel.id);
  return plan;
}

/** Renders an editable Plan back into dispatch routes for the Manual tab. */
export function planToDispatchRoutes(plan: Plan): DispatchRoute[] {
  const depotById = new Map((plan.depots ?? [plan.depot]).map((d) => [d.id, d]));
  return plan.routes.map((route) => {
    const stops: DispatchStop[] = route.stops.map((stop, index) => ({
      stop_number: index + 1,
      hotel_id: stop.hotel_id,
      name: stop.name,
      lat: stop.lat,
      lon: stop.lon,
      arrival_time: "",
      departure_time: "",
      stop_mins: stop.service_mins,
      load_bags: stop.load_bags,
      region: stop.region,
    }));
    const totalBags = stops.reduce((sum, s) => sum + s.load_bags, 0);
    const totalService = stops.reduce((sum, s) => sum + s.stop_mins, 0);
    return {
      route_id: route.route_id,
      vehicle_label: route.name,
      color: route.color,
      nominal_cap: route.nominal_cap,
      max_load: route.max_load,
      departure_hq: minToClock(route.departure_min),
      total_hotels: stops.length,
      total_dist_km: 0,
      total_drive_mins: 0,
      total_service_mins: totalService,
      total_bags: totalBags,
      capacity_utilization_pct: route.max_load > 0 ? Math.round((totalBags / route.max_load) * 100) : 0,
      stops,
      path_coordinates: [],
    };
  });
}

function minToClock(min: number): string {
  const h = Math.floor(min / 60) % 24;
  const m = min % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

/* ------------------------------------------------------------------ */
/* 11 — travel matrix (resumable)                                      */
/* ------------------------------------------------------------------ */

export function matrixPointsFromMasters(
  hotels: Hotel[],
  depots: PlanDepot[],
  laundries: PlanLaundry[],
): MatrixPoint[] {
  return [
    ...depots.map((depot) => ({ id: depot.id, name: depot.name, lat: depot.lat, lon: depot.lon, kind: "depot" as const })),
    ...laundries.map((laundry) => ({ id: laundry.id, name: laundry.name, lat: laundry.lat, lon: laundry.lon, kind: "laundry" as const })),
    ...hotels.map((hotel) => ({ id: hotel.id, name: hotel.name, lat: hotel.lat, lon: hotel.lon, kind: "hotel" as const })),
  ];
}

function blocksOfIndices(count: number, size: number): number[][] {
  const blocks: number[][] = [];
  for (let start = 0; start < count; start += size) {
    blocks.push(Array.from({ length: Math.min(size, count - start) }, (_, i) => start + i));
  }
  return blocks;
}

async function fetchTableBlock(
  baseUrl: string,
  points: MatrixPoint[],
  origins: number[],
  destinations: number[],
): Promise<{ durations: (number | null)[][]; distances: (number | null)[][] }> {
  const coords = [
    ...origins.map((i) => `${points[i].lon.toFixed(6)},${points[i].lat.toFixed(6)}`),
    ...destinations.map((i) => `${points[i].lon.toFixed(6)},${points[i].lat.toFixed(6)}`),
  ];
  const sources = origins.map((_, i) => i).join(";");
  const dests = destinations.map((_, i) => origins.length + i).join(";");
  const url = `${baseUrl}/table/v1/driving/${coords.join(";")}?annotations=duration,distance&sources=${sources}&destinations=${dests}`;

  let lastError: unknown = null;
  for (let attempt = 1; attempt <= OSRM_MAX_ATTEMPTS; attempt += 1) {
    try {
      const response = await fetch(url, {
        headers: { "User-Agent": "route-final-osrm-matrix/1.0" },
        signal: AbortSignal.timeout(60_000),
      });
      if (!response.ok) {
        const body = (await response.text()).slice(0, 200);
        throw new Error(`OSRM ${response.status}: ${body}`);
      }
      const payload = await response.json();
      if (payload.code !== "Ok" || !Array.isArray(payload.durations)) {
        throw new Error(`OSRM error: ${payload.code ?? "bad matrix"}`);
      }
      return { durations: payload.durations, distances: payload.distances ?? [] };
    } catch (error) {
      lastError = error;
      if (attempt === OSRM_MAX_ATTEMPTS) break;
      await sleep(Math.min(8000, 1000 * 2 ** (attempt - 1)));
    }
  }
  throw lastError;
}

export type MatrixProgress = {
  matrix: TravelMatrix;
  complete: boolean;
  filledPairs: number;
  totalPairs: number;
};

/**
 * Fills the travel matrix within a time budget. Pass the previously stored
 * matrix as `existing` to resume; returns complete=true when every pair is set.
 */
export async function buildTravelMatrix(
  points: MatrixPoint[],
  options: {
    baseUrl?: string;
    existing?: TravelMatrix | null;
    budgetMs?: number;
    durationFactor?: number;
  } = {},
): Promise<MatrixProgress> {
  const baseUrl = options.baseUrl ?? osrmBaseUrl();
  const budgetMs = options.budgetMs ?? 8000;
  const count = points.length;
  const started = Date.now();

  const durations: (number | null)[][] =
    options.existing?.durations_s?.length === count
      ? options.existing.durations_s.map((row) => [...row])
      : Array.from({ length: count }, () => Array(count).fill(null));
  const distances: (number | null)[][] =
    options.existing?.distances_m?.length === count
      ? options.existing.distances_m.map((row) => [...row])
      : Array.from({ length: count }, () => Array(count).fill(null));

  const blocks = blocksOfIndices(count, OSRM_BLOCK_SIZE);
  let filledPairs = 0;
  const totalPairs = count * count;

  const blockMissing = (origins: number[], dests: number[]): boolean =>
    origins.some((o) => dests.some((d) => durations[o][d] === null));

  outer: for (const origins of blocks) {
    for (const dests of blocks) {
      if (!blockMissing(origins, dests)) continue;
      if (Date.now() - started > budgetMs) break outer;
      const payload = await fetchTableBlock(baseUrl, points, origins, dests);
      for (let r = 0; r < origins.length; r += 1) {
        for (let c = 0; c < dests.length; c += 1) {
          const o = origins[r];
          const d = dests[c];
          const dur = payload.durations[r]?.[c];
          const dist = payload.distances[r]?.[c];
          durations[o][d] = typeof dur === "number" ? Math.round(dur) : null;
          distances[o][d] = typeof dist === "number" ? Math.round(dist) : null;
        }
      }
      await sleep(OSRM_DELAY_MS);
    }
  }

  for (let i = 0; i < count; i += 1) {
    durations[i][i] = 0;
    distances[i][i] = 0;
  }
  for (let r = 0; r < count; r += 1) {
    for (let c = 0; c < count; c += 1) {
      if (durations[r][c] !== null) filledPairs += 1;
    }
  }

  const matrix: TravelMatrix = {
    schema_version: 1,
    provider: "osrm",
    base_url: baseUrl,
    profile: "driving",
    traffic_aware: false,
    duration_factor: options.durationFactor ?? options.existing?.duration_factor ?? 1,
    generated_at: new Date().toISOString(),
    points,
    durations_s: durations,
    distances_m: distances,
    missing_pairs: totalPairs - filledPairs,
  };

  return { matrix, complete: filledPairs >= totalPairs, filledPairs, totalPairs };
}

/* ------------------------------------------------------------------ */
/* 12 — plan geometries (resumable)                                    */
/* ------------------------------------------------------------------ */

function simplify(points: [number, number][], minMeters = 35, maxPoints = 450): [number, number][] {
  if (points.length <= 2) return points;
  const kept: [number, number][] = [points[0]];
  for (let i = 1; i < points.length - 1; i += 1) {
    const prev = kept[kept.length - 1];
    if (haversineKm(prev[0], prev[1], points[i][0], points[i][1]) * 1000 >= minMeters) {
      kept.push(points[i]);
    }
  }
  kept.push(points[points.length - 1]);
  if (kept.length <= maxPoints) return kept;
  const sampled: [number, number][] = [kept[0]];
  const step = (kept.length - 1) / (maxPoints - 1);
  for (let i = 1; i < maxPoints - 1; i += 1) sampled.push(kept[Math.round(i * step)]);
  sampled.push(kept[kept.length - 1]);
  return sampled;
}

async function fetchRouteGeometry(
  baseUrl: string,
  coords: [number, number][],
): Promise<[number, number][] | null> {
  if (coords.length < 3) return null;
  const url = `${baseUrl}/route/v1/driving/${coords
    .map(([lat, lon]) => `${lon.toFixed(6)},${lat.toFixed(6)}`)
    .join(";")}?overview=full&geometries=geojson&steps=false`;
  let lastError: unknown = null;
  for (let attempt = 1; attempt <= OSRM_MAX_ATTEMPTS; attempt += 1) {
    try {
      const response = await fetch(url, {
        headers: { "User-Agent": "route-final-plan-geometry/1.0" },
        signal: AbortSignal.timeout(60_000),
      });
      if (!response.ok) throw new Error(`OSRM ${response.status}`);
      const payload = await response.json();
      if (payload.code !== "Ok" || !payload.routes?.[0]?.geometry?.coordinates) {
        throw new Error(`OSRM error: ${payload.code ?? "missing geometry"}`);
      }
      return payload.routes[0].geometry.coordinates.map(([lon, lat]: [number, number]) => [lat, lon]);
    } catch (error) {
      lastError = error;
      if (attempt === OSRM_MAX_ATTEMPTS) break;
      await sleep(1000 * 2 ** (attempt - 1));
    }
  }
  throw lastError;
}

export type GeometryProgress = {
  routes: Record<string, [number, number][]>;
  complete: boolean;
  done: number;
  total: number;
};

/** Fetches road shapes for plan routes within a time budget; resumable. */
export async function buildGeometries(
  plan: Plan,
  options: {
    baseUrl?: string;
    existing?: Record<string, [number, number][]> | null;
    budgetMs?: number;
  } = {},
): Promise<GeometryProgress> {
  const baseUrl = options.baseUrl ?? osrmBaseUrl();
  const budgetMs = options.budgetMs ?? 8000;
  const started = Date.now();
  const routes: Record<string, [number, number][]> = { ...(options.existing ?? {}) };

  const depots = plan.depots?.length ? plan.depots : [plan.depot];
  const laundries = plan.laundries ?? [];
  const total = plan.routes.length;
  let done = Object.keys(routes).length;

  for (const route of plan.routes) {
    if (routes[route.route_id]) continue;
    if (Date.now() - started > budgetMs) break;
    const depot = depots.find((d) => d.id === route.depot_id) ?? plan.depot ?? depots[0];
    const laundry = route.laundry_id ? laundries.find((l) => l.id === route.laundry_id) ?? null : null;
    const coords: [number, number][] = [
      [depot.lat, depot.lon],
      ...route.stops.map((s) => [s.lat, s.lon] as [number, number]),
      ...(laundry ? [[laundry.lat, laundry.lon] as [number, number]] : []),
      [depot.lat, depot.lon],
    ];
    try {
      const geometry = await fetchRouteGeometry(baseUrl, coords);
      if (geometry) {
        routes[route.route_id] = simplify(geometry);
        done += 1;
      }
    } catch {
      // leave missing; a later pass can retry
    }
    await sleep(OSRM_DELAY_MS);
  }

  return { routes, complete: done >= total, done, total };
}
