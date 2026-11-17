/**
 * In-app city generation: reads the city's DB masters, runs the pipeline
 * library, and publishes the results into `city_datasets`. This is what the
 * wizard's "Generate" step and the Plan Canvas "publish" action call, so a
 * city is generated entirely in-app.
 */
import { and, eq } from "drizzle-orm";
import { db } from "./db";
import { cities, cityDatasets, plans } from "../db/schema";
import {
  clearCityDatasetCache,
  getCity,
  getCityDataset,
  getRegionMeta,
  requireCity,
} from "./cities";
import { getCoverageHotels } from "./hotels";
import { getFacilityRows } from "./facilities";
import { getVehicleRows } from "./vehicles";
import type { City } from "./city-types";
import type { MatrixPoint, Plan, PlanDepot, PlanLaundry, TravelMatrix } from "./plan";
import {
  DEFAULT_SHIFT_SETTINGS,
  type DispatchRoute,
  type StudioDepot,
  type StudioShiftSetting,
  type StudioVehicle,
} from "./coverage";
import { getGoogleAccessToken } from "./google-auth";
import { isoWithOffset, localDateString } from "./timezone";
import {
  buildBaselinePlan,
  buildGeometries,
  buildHexMap,
  buildTravelMatrix,
  matrixPointsFromMasters,
  planToDispatchRoutes,
} from "./city-pipeline";
import { scheduleDispatchRoutesWithGoogle } from "./google-schedule";

async function writeDataset(cityId: string, kind: string, payload: unknown): Promise<void> {
  const id = `${cityId}:${kind}`;
  await db
    .insert(cityDatasets)
    .values({ id, cityId, kind, payload: payload as never, generatedAt: new Date() })
    .onConflictDoUpdate({
      target: cityDatasets.id,
      set: { payload: payload as never, generatedAt: new Date(), updatedAt: new Date() },
    });
  clearCityDatasetCache();
}

type CityMasters = {
  city: Awaited<ReturnType<typeof requireCity>>;
  regions: Awaited<ReturnType<typeof getRegionMeta>>;
  hotels: Awaited<ReturnType<typeof getCoverageHotels>>;
  depots: StudioDepot[];
  planDepots: PlanDepot[];
  laundries: PlanLaundry[];
  vehicles: StudioVehicle[];
};

async function loadMasters(cityId: string): Promise<CityMasters> {
  const city = await requireCity(cityId);
  const regions = await getRegionMeta(cityId);
  const hotels = await getCoverageHotels(cityId, regions);
  const [facilityRows, vehicleRows] = await Promise.all([
    getFacilityRows(cityId),
    getVehicleRows(cityId),
  ]);

  const warehouses = facilityRows.filter((f) => f.isWarehouse && f.isActive);
  const laundries: PlanLaundry[] = facilityRows
    .filter((f) => f.isLaundry && f.isActive)
    .map((f) => ({
      id: f.id,
      name: f.name,
      lat: f.latitude,
      lon: f.longitude,
      short_name: f.shortName,
      service_mins: f.serviceMins,
    }));

  const planDepots: PlanDepot[] = warehouses.map((f) => ({
    id: f.id,
    name: f.name,
    lat: f.latitude,
    lon: f.longitude,
    short_name: f.shortName,
  }));
  const depots: StudioDepot[] = planDepots.map((d, i) => ({
    id: d.id,
    name: d.name,
    latitude: d.lat,
    longitude: d.lon,
    isPrimary: i === 0,
  }));

  const vehicles: StudioVehicle[] = vehicleRows
    .filter((v) => v.isActive)
    .map((v, index) => ({
      id: index + 1,
      label: v.name,
      region_id: v.regionId ?? 0,
      region_name: v.regionName ?? "",
      sector: v.sector ?? "",
      color: v.color,
      enabled: true,
      nominal_capacity: v.realCapacity,
      max_load: v.safeCapacity,
      depot_id: v.depotId,
      departure_time: v.departureTime,
      return_time: v.returnTime,
    }));

  return { city, regions, hotels, depots, planDepots, laundries, vehicles };
}

/**
 * City-level shift hours seed the solver and every generated plan. Cities
 * onboarded before shift timing existed fall back to the standard 07:00–17:00.
 */
export function cityShiftSettings(city: City): StudioShiftSetting {
  return {
    ...DEFAULT_SHIFT_SETTINGS,
    earliestDeparture:
      city.settings.shiftStart ?? DEFAULT_SHIFT_SETTINGS.earliestDeparture,
    latestReturn: city.settings.shiftEnd ?? DEFAULT_SHIFT_SETTINGS.latestReturn,
  };
}

/**
 * Calibrates the OSRM matrix against Google's traffic-aware Routes API.
 *
 * OSRM returns free-flow times. Google's traffic-aware durations are often
 * 1.3–2.5x longer in Indian cities. Sampling a handful of representative legs
 * and storing one factor keeps per-stop arrival times realistic without
 * calling Google for every leg on every request. An existing non-1 factor
 * (for example the offline Bengaluru calibration) is preserved.
 */
async function calibrateMatrixWithGoogle(
  matrix: TravelMatrix,
  city: City,
): Promise<TravelMatrix> {
  if (matrix.duration_factor && matrix.duration_factor !== 1) return matrix;
  if (!matrix.points || matrix.points.length < 4) return matrix;

  const indexById = new Map(matrix.points.map((point, index) => [point.id, index]));
  const step = Math.max(1, Math.floor(matrix.points.length / 8));
  const sampled = matrix.points.filter((_, index) => index % step === 0).slice(0, 8);

  const pairs: { from: MatrixPoint; to: MatrixPoint; osrmSeconds: number }[] = [];
  for (let index = 0; index < sampled.length; index += 1) {
    const from = sampled[index];
    const to = sampled[(index + 3) % sampled.length];
    if (!from || !to || from.id === to.id) continue;
    const fromIndex = indexById.get(from.id);
    const toIndex = indexById.get(to.id);
    const seconds =
      fromIndex !== undefined && toIndex !== undefined
        ? matrix.durations_s[fromIndex]?.[toIndex]
        : null;
    const meters =
      fromIndex !== undefined && toIndex !== undefined
        ? matrix.distances_m[fromIndex]?.[toIndex]
        : null;
    if (typeof seconds === "number" && seconds > 120 && (meters ?? 0) > 2_000) {
      pairs.push({ from, to, osrmSeconds: seconds });
    }
  }
  if (pairs.length < 3) return matrix;

  let token: string;
  try {
    ({ token } = await getGoogleAccessToken(
      "https://www.googleapis.com/auth/cloud-platform",
    ));
  } catch {
    return matrix;
  }

  const dateStr = localDateString(
    city.timezone,
    new Date(Date.now() + 24 * 60 * 60 * 1000),
  );
  const departureTime = isoWithOffset(city.timezone, dateStr, "08:00");

  let googleSeconds = 0;
  let osrmSeconds = 0;
  let count = 0;

  for (const pair of pairs) {
    try {
      const response = await fetch(
        "https://routes.googleapis.com/directions/v2:computeRoutes",
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
            "X-Goog-FieldMask": "routes.duration",
          },
          body: JSON.stringify({
            origin: {
              location: {
                latLng: { latitude: pair.from.lat, longitude: pair.from.lon },
              },
            },
            destination: {
              location: {
                latLng: { latitude: pair.to.lat, longitude: pair.to.lon },
              },
            },
            travelMode: "DRIVE",
            routingPreference: "TRAFFIC_AWARE",
            departureTime,
          }),
        },
      );
      if (!response.ok) continue;
      const data = await response.json();
      const seconds = Number(
        String(data.routes?.[0]?.duration ?? "0s").replace("s", ""),
      );
      if (seconds > 0) {
        googleSeconds += seconds;
        osrmSeconds += pair.osrmSeconds;
        count += 1;
      }
    } catch {
      // try the next pair
    }
    await new Promise((resolve) => setTimeout(resolve, 200));
  }

  if (count < 3 || osrmSeconds <= 0) return matrix;
  const factor = Math.min(3, Math.max(1, googleSeconds / osrmSeconds));
  return {
    ...matrix,
    duration_factor: Number(factor.toFixed(2)),
    notes: `${matrix.notes ? `${matrix.notes} · ` : ""}Google-calibrated traffic factor ${factor.toFixed(2)}`,
  };
}

/** Step: coverage hex map from hotels + regions + facilities. */
export async function generateHexMap(cityId: string): Promise<{ cells: number }> {
  const { city, regions, hotels, planDepots, laundries } = await loadMasters(cityId);
  const hexMap = buildHexMap(
    hotels,
    regions,
    city.h3Resolution,
    // Facilities are part of the operational footprint: the warehouse must
    // always sit inside a region's territory, even when it is outside the
    // hotel cluster.
    [
      ...planDepots.map((depot) => ({ lat: depot.lat, lon: depot.lon })),
      ...laundries.map((laundry) => ({ lat: laundry.lat, lon: laundry.lon })),
    ],
  );
  await writeDataset(cityId, "hex_map", hexMap);
  return { cells: Object.keys(hexMap).length };
}

/** Step: solver-built baseline plan (works with no manual routes). */
export async function generateBaselinePlan(cityId: string): Promise<{ routes: number; unassigned: number }> {
  const masters = await loadMasters(cityId);
  if (masters.planDepots.length === 0) {
    throw new Error("Add at least one active warehouse before generating a plan.");
  }
  if (masters.vehicles.length === 0) {
    throw new Error(
      "Add at least one vehicle in the Vehicles dashboard before generating the baseline plan.",
    );
  }
  const plan = buildBaselinePlan({
    hotels: masters.hotels,
    vehicles: masters.vehicles,
    depots: masters.depots,
    laundries: masters.laundries,
    shift: cityShiftSettings(masters.city),
    roadFactor: masters.city.roadFactor,
    avgSpeedKmh: masters.city.fallbackSpeedKmh,
    regionAdjacency: masters.city.settings.regionAdjacency,
  });
  // Only the baseline is generated. Manual routes stay empty on purpose so the
  // manager builds them in the Manual tab; publishing then feeds both views.
  await writeDataset(cityId, "baseline_plan", plan);
  return { routes: plan.routes.length, unassigned: plan.unassigned_hotel_ids?.length ?? 0 };
}

/** Step: resumable OSRM travel matrix. */
export async function generateTravelMatrix(
  cityId: string,
  budgetMs?: number,
): Promise<{ complete: boolean; filledPairs: number; totalPairs: number }> {
  const masters = await loadMasters(cityId);
  const points = matrixPointsFromMasters(masters.hotels, masters.planDepots, masters.laundries);
  if (points.length === 0) throw new Error("No hotels or facilities to build a matrix from.");
  const existing = await getCityDataset<TravelMatrix>(cityId, "travel_matrix");
  const progress = await buildTravelMatrix(points, { existing, budgetMs });
  const matrix = progress.complete
    ? await calibrateMatrixWithGoogle(progress.matrix, masters.city)
    : progress.matrix;
  await writeDataset(cityId, "travel_matrix", matrix);
  return { complete: progress.complete, filledPairs: progress.filledPairs, totalPairs: progress.totalPairs };
}

/** Step: resumable OSRM route geometries for the current baseline plan. */
export async function generateGeometries(
  cityId: string,
  budgetMs?: number,
): Promise<{ complete: boolean; done: number; total: number }> {
  const plan = await getCityDataset<Plan>(cityId, "baseline_plan");
  if (!plan) throw new Error("Generate a baseline plan first.");
  const existing = await getCityDataset<{ routes?: Record<string, [number, number][]> }>(
    cityId,
    "plan_geometries",
  );
  const progress = await buildGeometries(plan, { existing: existing?.routes ?? null, budgetMs });
  await writeDataset(cityId, "plan_geometries", {
    schema_version: 1,
    provider: "osrm",
    generated_at: new Date().toISOString(),
    routes: progress.routes,
  });
  return { complete: progress.complete, done: progress.done, total: progress.total };
}

/**
 * Publishes an edited Plan (from the Manual builder or Plan Canvas) as the
 * city's manual dispatch. It updates the datasets *and* the stored plan row so
 * the Plan Canvas, Manual tab and coverage atlas all agree.
 *
 * Plan ids are globally unique; if another city already owns this plan id, the
 * published copy is namespaced with its own city slug.
 */
export async function publishPlanAsManual(cityId: string, plan: Plan): Promise<void> {
  const city = await requireCity(cityId);

  const requestedId = plan.plan_id || "manual-current";
  const [owner] = await db
    .select({ cityId: plans.cityId })
    .from(plans)
    .where(eq(plans.id, requestedId))
    .limit(1);
  const planId =
    owner && owner.cityId !== cityId ? `${cityId}-${requestedId}` : requestedId;

  const stored: Plan = { ...plan, plan_id: planId };
  const [existing] = await db
    .select({ version: plans.version })
    .from(plans)
    .where(and(eq(plans.cityId, cityId), eq(plans.id, planId)))
    .limit(1);

  if (existing) {
    await db
      .update(plans)
      .set({
        name: stored.name,
        status: stored.status,
        data: stored as never,
        version: existing.version + 1,
        updatedAt: new Date(),
      })
      .where(and(eq(plans.cityId, cityId), eq(plans.id, planId)));
  } else {
    await db.insert(plans).values({
      id: planId,
      cityId,
      name: stored.name,
      status: stored.status,
      data: stored as never,
      version: 1,
    });
  }

  const matrix = await getCityDataset<TravelMatrix>(cityId, "travel_matrix");
  const dispatchRoutes = await scheduleDispatchRoutesWithGoogle(
    planToDispatchRoutes(stored),
    stored.depot,
    matrix,
    {
      fallbackSpeedKmh: city.fallbackSpeedKmh,
      roadFactor: city.roadFactor,
      timezone: city.timezone,
    },
  );

  await writeDataset(cityId, "baseline_plan", stored);
  await writeDataset(cityId, "manual_routes", dispatchRoutes);
}

/**
 * Recomputes stop times for existing manual routes with Google traffic.
 * Used when a city was published before per-leg Google scheduling existed.
 */
export async function rescheduleManualRoutes(
  cityId: string,
): Promise<{ routes: number }> {
  const masters = await loadMasters(cityId);
  const manual = await getCityDataset<DispatchRoute[]>(cityId, "manual_routes");
  if (!manual || manual.length === 0) return { routes: 0 };
  const matrix = await getCityDataset<TravelMatrix>(cityId, "travel_matrix");
  const scheduled = await scheduleDispatchRoutesWithGoogle(
    manual,
    masters.planDepots[0],
    matrix,
    {
      fallbackSpeedKmh: masters.city.fallbackSpeedKmh,
      roadFactor: masters.city.roadFactor,
      timezone: masters.city.timezone,
    },
  );
  await writeDataset(cityId, "manual_routes", scheduled);
  return { routes: scheduled.length };
}

/** Flips a city live (or back to draft). */
export async function setCityActive(cityId: string, isActive: boolean): Promise<void> {
  const city = await getCity(cityId);
  if (!city) throw new Error("City not found.");
  await db.update(cities).set({ isActive, updatedAt: new Date() }).where(eq(cities.id, cityId));
}
