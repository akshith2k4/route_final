/**
 * In-app city generation: reads the city's DB masters, runs the pipeline
 * library, and publishes the results into `city_datasets`. This is what the
 * wizard's "Generate" step and the Plan Canvas "publish" action call, so a
 * city never needs the offline scripts.
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
import type { Plan, PlanDepot, PlanLaundry, TravelMatrix } from "./plan";
import type { StudioDepot, StudioVehicle } from "./coverage";
import {
  buildBaselinePlan,
  buildGeometries,
  buildHexMap,
  buildTravelMatrix,
  matrixPointsFromMasters,
  planToDispatchRoutes,
} from "./city-pipeline";

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

/** Step: coverage hex map from hotels + regions. */
export async function generateHexMap(cityId: string): Promise<{ cells: number }> {
  const { city, regions, hotels } = await loadMasters(cityId);
  const hexMap = buildHexMap(hotels, regions, city.h3Resolution);
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
  await writeDataset(cityId, "travel_matrix", progress.matrix);
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
  await requireCity(cityId);

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

  await writeDataset(cityId, "baseline_plan", stored);
  await writeDataset(cityId, "manual_routes", planToDispatchRoutes(stored));
}

/** Flips a city live (or back to draft). */
export async function setCityActive(cityId: string, isActive: boolean): Promise<void> {
  const city = await getCity(cityId);
  if (!city) throw new Error("City not found.");
  await db.update(cities).set({ isActive, updatedAt: new Date() }).where(eq(cities.id, cityId));
}
