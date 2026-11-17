import { and, desc, eq, sql } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import {
  getPlanDepots,
  getPlanLaundries,
  normalizeStopDays,
  type Plan,
  type PlanDepot,
  type PlanLaundry,
  type PlanVehicle,
} from "./plan";
import { db } from "./db";
import { facilities, hotels, plans, vehicles } from "../db/schema";
import { clearCityCache, getRegionMeta, registerCacheInvalidator } from "./cities";

export type PlanSummary = {
  id: string;
  name: string;
  status: string;
  version: number;
  updatedAt: string;
};

export type StoredPlan = {
  id: string;
  name: string;
  plan: Plan;
  version: number;
  updatedAt: string;
};

export type StoredPlanWithList = StoredPlan & {
  plans: PlanSummary[];
};

export type StoredPlanConflict = {
  conflict: true;
  current: StoredPlan | null;
};

function toSummary(row: {
  id: string;
  name: string;
  status: string;
  version: number;
  updatedAt: Date;
}): PlanSummary {
  return {
    id: row.id,
    name: row.name,
    status: row.status,
    version: row.version,
    updatedAt: row.updatedAt.toISOString(),
  };
}

/**
 * Region names are unique inside a city but not across cities, so the lookup
 * table is rebuilt per city.
 */
async function regionIdByName(
  cityId: string,
): Promise<Map<string, number>> {
  const regions = await getRegionMeta(cityId);
  const map = new Map<string, number>();
  for (const region of regions) {
    map.set(region.short_name, region.id);
    map.set(region.name, region.id);
  }
  return map;
}

async function mergeMasterData(cityId: string, plan: Plan): Promise<Plan> {
  const [hotelRows, vehicleRows, facilityRows] = await Promise.all([
    db.select().from(hotels).where(eq(hotels.cityId, cityId)),
    db.select().from(vehicles).where(eq(vehicles.cityId, cityId)),
    db.select().from(facilities).where(eq(facilities.cityId, cityId)),
  ]);

  const regionIds = await regionIdByName(cityId);

  const hotelById = new Map(hotelRows.map((hotel) => [hotel.id, hotel]));
  const vehicleById = new Map(
    vehicleRows.map((vehicle) => [vehicle.id, vehicle]),
  );

  // 1. Gather all referenced warehouse and laundry IDs in this plan
  const referencedDepotIds = new Set<string>();
  if (plan.depot?.id) referencedDepotIds.add(plan.depot.id);
  for (const route of plan.routes) {
    if (route.depot_id) referencedDepotIds.add(route.depot_id);
  }

  const referencedLaundryIds = new Set<string>();
  for (const route of plan.routes) {
    if (route.laundry_id) referencedLaundryIds.add(route.laundry_id);
  }

  // 2. Build warehouses (depots) from the facilities master.
  // Active master warehouses are available to every plan. Inactive master rows
  // stay available only when this plan already references them. If the master
  // is empty (for example before the seed has run), keep the plan's existing
  // warehouses so a missing seed does not strip route assignments.
  const masterDepotById = new Map(
    facilityRows
      .filter((facility) => facility.isWarehouse)
      .map((facility) => [facility.id, facility]),
  );
  const masterLaundryById = new Map(
    facilityRows
      .filter((facility) => facility.isLaundry)
      .map((facility) => [facility.id, facility]),
  );
  const hasMasterDepots = masterDepotById.size > 0;
  const hasMasterLaundries = masterLaundryById.size > 0;

  const depotsById = new Map<string, PlanDepot>();
  for (const depot of getPlanDepots(plan)) {
    const master = masterDepotById.get(depot.id);
    if (master) {
      if (master.isActive || referencedDepotIds.has(depot.id)) {
        depotsById.set(depot.id, {
          id: master.id,
          name: master.name,
          lat: master.latitude,
          lon: master.longitude,
          short_name: master.shortName,
          is_active: master.isActive,
        });
      }
    } else if (!hasMasterDepots || referencedDepotIds.has(depot.id)) {
      depotsById.set(depot.id, depot);
    }
  }
  for (const master of masterDepotById.values()) {
    if (
      (master.isActive || referencedDepotIds.has(master.id)) &&
      !depotsById.has(master.id)
    ) {
      depotsById.set(master.id, {
        id: master.id,
        name: master.name,
        lat: master.latitude,
        lon: master.longitude,
        short_name: master.shortName,
        is_active: master.isActive,
      });
    }
  }

  const planDepots = [...depotsById.values()];

  // Resolve primary warehouse (plan.depot). If the current primary is gone,
  // fall back to another available warehouse.
  let primaryDepot: PlanDepot | undefined = plan.depot
    ? planDepots.find((depot) => depot.id === plan.depot.id)
    : undefined;

  if (!primaryDepot && planDepots.length > 0) {
    primaryDepot = planDepots[0];
  }

  // Ensure primary depot is at the front of planDepots.
  if (primaryDepot) {
    const others = planDepots.filter(
      (depot) => depot.id !== primaryDepot!.id,
    );
    planDepots.length = 0;
    planDepots.push(primaryDepot, ...others);
  }

  const validDepotIds = new Set(planDepots.map((depot) => depot.id));

  // 3. Build laundries from the facilities master using the same rules.
  const laundriesById = new Map<string, PlanLaundry>();
  for (const laundry of getPlanLaundries(plan)) {
    const master = masterLaundryById.get(laundry.id);
    if (master) {
      if (master.isActive || referencedLaundryIds.has(laundry.id)) {
        laundriesById.set(laundry.id, {
          id: master.id,
          name: master.name,
          lat: master.latitude,
          lon: master.longitude,
          short_name: master.shortName,
          service_mins: master.serviceMins,
          is_active: master.isActive,
        });
      }
    } else if (!hasMasterLaundries || referencedLaundryIds.has(laundry.id)) {
      laundriesById.set(laundry.id, laundry);
    }
  }
  for (const master of masterLaundryById.values()) {
    if (
      (master.isActive || referencedLaundryIds.has(master.id)) &&
      !laundriesById.has(master.id)
    ) {
      laundriesById.set(master.id, {
        id: master.id,
        name: master.name,
        lat: master.latitude,
        lon: master.longitude,
        short_name: master.shortName,
        service_mins: master.serviceMins,
        is_active: master.isActive,
      });
    }
  }

  const planLaundries = [...laundriesById.values()];
  const validLaundryIds = new Set(
    planLaundries.map((laundry) => laundry.id),
  );

  // 4. Update routes:
  // - A route with an invalid warehouse ID falls back to the primary.
  // - An invalid laundry ID is cleared.
  // - Merge hotels
  const routes = plan.routes.map((route) => {
    const targetDepotId =
      route.depot_id && validDepotIds.has(route.depot_id)
        ? route.depot_id
        : primaryDepot?.id;

    const targetLaundryId =
      route.laundry_id && validLaundryIds.has(route.laundry_id)
        ? route.laundry_id
        : undefined;

    return {
      ...route,
      depot_id: targetDepotId,
      laundry_id: targetLaundryId,
      stops: route.stops.map((stop) => {
        const hotel = hotelById.get(stop.hotel_id);
        if (!hotel) return stop;

        const stopDays = normalizeStopDays(stop);
        const dailyBags = hotel.loadBags;
        const alternateBags = hotel.alternateLoadBags;

        return {
          ...stop,
          name: hotel.name,
          lat: hotel.latitude,
          lon: hotel.longitude,
          region: regionIds.get(hotel.regionName) ?? stop.region,
          service_mins: hotel.stopMins,
          load_bags: stopDays.length === 2 ? dailyBags : alternateBags,
          daily_load_bags: dailyBags,
          alternate_load_bags: alternateBags,
          rooms: hotel.rooms,
        };
      }),
    };
  });

  const planVehicles = (plan.vehicles ?? []).map((vehicle) => {
    const master = vehicleById.get(vehicle.id);
    if (!master) return vehicle;
    return {
      ...vehicle,
      name: master.name,
      nominal_cap: master.realCapacity,
      max_load: master.safeCapacity,
      color: master.color,
    };
  });

  const knownVehicleIds = new Set(planVehicles.map((vehicle) => vehicle.id));
  const missingVehicles: PlanVehicle[] = vehicleRows
    .filter((vehicle) => vehicle.isActive && !knownVehicleIds.has(vehicle.id))
    .map((vehicle) => ({
      id: vehicle.id,
      name: vehicle.name,
      nominal_cap: vehicle.realCapacity,
      max_load: vehicle.safeCapacity,
      color: vehicle.color,
    }));

  return {
    ...plan,
    depot: primaryDepot ?? plan.depot,
    depots: planDepots,
    laundries: planLaundries,
    routes,
    vehicles: [...planVehicles, ...missingVehicles],
  };
}

/**
 * Publishes a city's baseline plan the first time the city is opened.
 *
 * Plan ids are globally unique, but every pipeline run uses the same baseline
 * id. When another city already owns that id, this city's copy is namespaced
 * with its own slug so both baselines can coexist.
 */
export async function ensureDefaultPlan(
  cityId: string,
  baselinePlan: Plan | null,
): Promise<void> {
  if (!baselinePlan) return;

  const [existing] = await db
    .select({ id: plans.id })
    .from(plans)
    .where(eq(plans.cityId, cityId))
    .limit(1);
  if (existing) return;

  const [owner] = await db
    .select({ cityId: plans.cityId })
    .from(plans)
    .where(eq(plans.id, baselinePlan.plan_id))
    .limit(1);

  const id =
    owner && owner.cityId !== cityId
      ? `${cityId}-${baselinePlan.plan_id}`
      : baselinePlan.plan_id;

  await db
    .insert(plans)
    .values({
      id,
      cityId,
      name: baselinePlan.name,
      status: baselinePlan.status,
      data: { ...baselinePlan, plan_id: id },
      version: 1,
    })
    .onConflictDoNothing();
}

export async function listPlanSummaries(
  cityId: string,
): Promise<PlanSummary[]> {
  await ensureDefaultPlan(cityId, null);
  const rows = await db
    .select({
      id: plans.id,
      name: plans.name,
      status: plans.status,
      version: plans.version,
      updatedAt: plans.updatedAt,
    })
    .from(plans)
    .where(eq(plans.cityId, cityId))
    .orderBy(desc(plans.updatedAt));

  return rows.map(toSummary);
}

export async function getPlanById(
  cityId: string,
  id: string,
): Promise<StoredPlan | null> {
  const [row] = await db
    .select()
    .from(plans)
    .where(and(eq(plans.cityId, cityId), eq(plans.id, id)))
    .limit(1);

  if (!row) return null;

  return {
    id: row.id,
    name: row.name,
    plan: await mergeMasterData(cityId, { ...row.data, plan_id: row.id }),
    version: row.version,
    updatedAt: row.updatedAt.toISOString(),
  };
}

const PLAN_CACHE_TTL_MS = 60_000;
const initialPlanCache = new Map<
  string,
  { expiresAt: number; value: StoredPlanWithList }
>();

export function clearPlanCache(cityId?: string): void {
  if (cityId) {
    for (const key of Array.from(initialPlanCache.keys())) {
      if (key.startsWith(`${cityId}:`)) {
        initialPlanCache.delete(key);
      }
    }
  } else {
    initialPlanCache.clear();
  }
}

registerCacheInvalidator(clearPlanCache);

export async function getInitialPlan(
  cityId: string,
  baselinePlan: Plan | null,
  preferredId?: string,
): Promise<StoredPlanWithList> {
  const cacheKey = `${cityId}:${preferredId ?? "default"}`;
  const cached = initialPlanCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.value;
  }

  await ensureDefaultPlan(cityId, baselinePlan);
  const planList = await listPlanSummaries(cityId);
  const selected =
    (preferredId
      ? planList.find((candidate) => candidate.id === preferredId)
      : null) ?? planList[0];

  if (!selected) {
    throw new Error("Could not find a plan.");
  }

  const stored = await getPlanById(cityId, selected.id);
  if (!stored) {
    throw new Error("Could not load the selected plan.");
  }

  const result: StoredPlanWithList = { ...stored, plans: planList };
  initialPlanCache.set(cacheKey, {
    expiresAt: Date.now() + PLAN_CACHE_TTL_MS,
    value: result,
  });

  return result;
}

export async function createPlan(
  cityId: string,
  name: string,
  plan: Plan,
): Promise<StoredPlanWithList> {
  const trimmed = name.trim();
  if (!trimmed) throw new Error("A plan name is required.");
  if (trimmed.length > 120) {
    throw new Error("Plan name must be 120 characters or less.");
  }

  const id = `plan-${randomUUID()}`;
  const nextPlan: Plan = {
    ...plan,
    plan_id: id,
    name: trimmed,
    status: "draft",
  };

  const [row] = await db
    .insert(plans)
    .values({
      id,
      cityId,
      name: trimmed,
      status: "draft",
      data: nextPlan,
      version: 1,
    })
    .returning();

  clearCityCache(cityId);

  return {
    id: row.id,
    name: row.name,
    plan: row.data,
    version: row.version,
    updatedAt: row.updatedAt.toISOString(),
    plans: await listPlanSummaries(cityId),
  };
}

export async function updateStoredPlan(
  cityId: string,
  id: string,
  plan: Plan,
  expectedVersion: number,
): Promise<StoredPlan | StoredPlanConflict> {
  const nextPlan: Plan = { ...plan, plan_id: id };
  const [row] = await db
    .update(plans)
    .set({
      name: nextPlan.name,
      status: nextPlan.status,
      data: nextPlan,
      version: sql`${plans.version} + 1`,
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(plans.cityId, cityId),
        eq(plans.id, id),
        eq(plans.version, expectedVersion),
      ),
    )
    .returning();

  if (!row) {
    const current = await getPlanById(cityId, id);
    return { conflict: true, current };
  }

  clearCityCache(cityId);

  return {
    id: row.id,
    name: row.name,
    plan: row.data,
    version: row.version,
    updatedAt: row.updatedAt.toISOString(),
  };
}
