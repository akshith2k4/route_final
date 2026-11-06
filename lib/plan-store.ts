import { and, desc, eq, sql } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import planJson from "../data/plan.json";
import regionMetadataJson from "../data/region_metadata.json";
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

const BASELINE_PLAN = planJson as Plan;

const regionIdByName = new Map<string, number>();
for (const region of Object.values(regionMetadataJson) as {
  id: number;
  name: string;
  short_name: string;
}[]) {
  regionIdByName.set(region.short_name, region.id);
  regionIdByName.set(region.name, region.id);
}

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

async function mergeMasterData(plan: Plan): Promise<Plan> {
  const [hotelRows, vehicleRows, facilityRows] = await Promise.all([
    db.select().from(hotels),
    db.select().from(vehicles),
    db.select().from(facilities),
  ]);

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
          region: regionIdByName.get(hotel.regionName) ?? stop.region,
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

async function ensureDefaultPlan(): Promise<void> {
  const [existing] = await db.select({ id: plans.id }).from(plans).limit(1);
  if (existing) return;

  await db
    .insert(plans)
    .values({
      id: BASELINE_PLAN.plan_id,
      name: BASELINE_PLAN.name,
      status: BASELINE_PLAN.status,
      data: BASELINE_PLAN,
      version: 1,
    })
    .onConflictDoNothing();
}

export async function listPlanSummaries(): Promise<PlanSummary[]> {
  await ensureDefaultPlan();
  const rows = await db
    .select({
      id: plans.id,
      name: plans.name,
      status: plans.status,
      version: plans.version,
      updatedAt: plans.updatedAt,
    })
    .from(plans)
    .orderBy(desc(plans.updatedAt));

  return rows.map(toSummary);
}

export async function getPlanById(id: string): Promise<StoredPlan | null> {
  const [row] = await db
    .select()
    .from(plans)
    .where(eq(plans.id, id))
    .limit(1);

  if (!row) return null;

  return {
    id: row.id,
    name: row.name,
    plan: await mergeMasterData({ ...row.data, plan_id: row.id }),
    version: row.version,
    updatedAt: row.updatedAt.toISOString(),
  };
}

export async function getInitialPlan(
  preferredId?: string,
): Promise<StoredPlanWithList> {
  const plans = await listPlanSummaries();
  const selected =
    (preferredId
      ? plans.find((candidate) => candidate.id === preferredId)
      : null) ?? plans[0];

  if (!selected) {
    throw new Error("Could not find a plan.");
  }

  const stored = await getPlanById(selected.id);
  if (!stored) {
    throw new Error("Could not load the selected plan.");
  }

  return { ...stored, plans };
}

export async function createPlan(
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
      name: trimmed,
      status: "draft",
      data: nextPlan,
      version: 1,
    })
    .returning();

  return {
    id: row.id,
    name: row.name,
    plan: row.data,
    version: row.version,
    updatedAt: row.updatedAt.toISOString(),
    plans: await listPlanSummaries(),
  };
}

export async function updateStoredPlan(
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
    .where(and(eq(plans.id, id), eq(plans.version, expectedVersion)))
    .returning();

  if (!row) {
    const current = await getPlanById(id);
    return { conflict: true, current };
  }

  return {
    id: row.id,
    name: row.name,
    plan: row.data,
    version: row.version,
    updatedAt: row.updatedAt.toISOString(),
  };
}
