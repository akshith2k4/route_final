import { and, desc, eq, sql } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import planJson from "../data/plan.json";
import regionMetadataJson from "../data/region_metadata.json";
import { normalizeStopDays, type Plan, type PlanVehicle } from "./plan";
import { db } from "./db";
import { hotels, plans, vehicles } from "../db/schema";

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
  const [hotelRows, vehicleRows] = await Promise.all([
    db.select().from(hotels),
    db.select().from(vehicles),
  ]);

  const hotelById = new Map(hotelRows.map((hotel) => [hotel.id, hotel]));
  const vehicleById = new Map(
    vehicleRows.map((vehicle) => [vehicle.id, vehicle]),
  );

  const routes = plan.routes.map((route) => ({
    ...route,
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
  }));

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
