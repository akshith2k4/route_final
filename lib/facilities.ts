import { asc, eq } from "drizzle-orm";
import { db } from "./db";
import { facilities, plans, vehicles, type FacilityRow } from "../db/schema";
import type { Plan } from "./plan";

export type FacilityAdminItem = {
  id: string;
  name: string;
  shortName: string;
  address: string | null;
  latitude: number;
  longitude: number;
  isWarehouse: boolean;
  isLaundry: boolean;
  serviceMins: number;
  isActive: boolean;
  usedByRouteCount: number;
  usedByPlans: string[];
};

export type FacilityInput = {
  name: string;
  shortName: string;
  address: string | null;
  latitude: number;
  longitude: number;
  isWarehouse: boolean;
  isLaundry: boolean;
  serviceMins: number;
  isActive: boolean;
};

export class FacilityInputError extends Error {
  field?: keyof FacilityInput;

  constructor(message: string, field?: keyof FacilityInput) {
    super(message);
    this.name = "FacilityInputError";
    this.field = field;
  }
}

export class FacilityConflictError extends Error {
  plans: string[];
  vehicles: string[];

  constructor(message: string, plans: string[] = [], vehicles: string[] = []) {
    super(message);
    this.name = "FacilityConflictError";
    this.plans = plans;
    this.vehicles = vehicles;
  }
}

function requiredString(
  value: unknown,
  label: string,
  maxLength: number,
  field?: keyof FacilityInput,
): string {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new FacilityInputError(`${label} is required.`, field);
  }
  const trimmed = value.trim();
  if (trimmed.length > maxLength) {
    throw new FacilityInputError(
      `${label} must be ${maxLength} characters or less.`,
      field,
    );
  }
  return trimmed;
}

function optionalString(
  value: unknown,
  label: string,
  maxLength: number,
  field?: keyof FacilityInput,
): string | null {
  if (value === undefined || value === null) return null;
  if (typeof value !== "string") {
    throw new FacilityInputError(`${label} must be text.`, field);
  }
  const trimmed = value.trim();
  if (trimmed.length > maxLength) {
    throw new FacilityInputError(
      `${label} must be ${maxLength} characters or less.`,
      field,
    );
  }
  return trimmed.length > 0 ? trimmed : null;
}

function requiredCoordinate(
  value: unknown,
  label: string,
  min: number,
  max: number,
  field?: keyof FacilityInput,
): number {
  const number =
    typeof value === "number"
      ? value
      : typeof value === "string" && value.trim() !== ""
        ? Number(value)
        : Number.NaN;

  if (!Number.isFinite(number) || number < min || number > max) {
    throw new FacilityInputError(
      `${label} must be a number between ${min} and ${max}.`,
      field,
    );
  }
  return number;
}

function booleanValue(
  value: unknown,
  label: string,
  fallback: boolean,
  field?: keyof FacilityInput,
): boolean {
  if (value === undefined || value === null) return fallback;
  if (typeof value === "boolean") return value;
  if (value === "true") return true;
  if (value === "false") return false;
  throw new FacilityInputError(`${label} must be true or false.`, field);
}

function requiredInteger(
  value: unknown,
  label: string,
  min: number,
  max: number,
  field?: keyof FacilityInput,
): number {
  const number =
    typeof value === "number"
      ? value
      : typeof value === "string" && value.trim() !== ""
        ? Number(value)
        : Number.NaN;

  if (!Number.isInteger(number) || number < min || number > max) {
    throw new FacilityInputError(
      `${label} must be a whole number between ${min} and ${max}.`,
      field,
    );
  }
  return number;
}

export function parseFacilityInput(value: unknown): FacilityInput {
  if (!value || typeof value !== "object") {
    throw new FacilityInputError("Invalid facility data.");
  }

  const candidate = value as Record<string, unknown>;
  const name = requiredString(candidate.name, "Facility name", 120, "name");

  let shortName = optionalString(
    candidate.shortName,
    "Short name",
    16,
    "shortName",
  );
  if (!shortName) {
    shortName = name
      .split(/\s+/)
      .map((word) => word[0])
      .filter(Boolean)
      .join("")
      .toUpperCase()
      .slice(0, 8);
    if (!shortName) shortName = name.slice(0, 8);
  }

  const address = optionalString(candidate.address, "Address", 300, "address");
  const latitude = requiredCoordinate(
    candidate.latitude,
    "Latitude",
    -90,
    90,
    "latitude",
  );
  const longitude = requiredCoordinate(
    candidate.longitude,
    "Longitude",
    -180,
    180,
    "longitude",
  );

  const isWarehouse = booleanValue(
    candidate.isWarehouse,
    "Warehouse role",
    false,
    "isWarehouse",
  );
  const isLaundry = booleanValue(
    candidate.isLaundry,
    "Laundry role",
    false,
    "isLaundry",
  );

  if (!isWarehouse && !isLaundry) {
    throw new FacilityInputError(
      "A facility must be configured as a Warehouse, a Laundry, or both.",
      "isWarehouse",
    );
  }

  const serviceMins = isLaundry
    ? requiredInteger(
        candidate.serviceMins ?? 180,
        "Service minutes",
        0,
        1440,
        "serviceMins",
      )
    : 180;

  const isActive = booleanValue(
    candidate.isActive,
    "Active status",
    true,
    "isActive",
  );

  return {
    name,
    shortName,
    address,
    latitude,
    longitude,
    isWarehouse,
    isLaundry,
    serviceMins,
    isActive,
  };
}

function slugify(name: string): string {
  return (
    name
      .normalize("NFKD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 50) || "facility"
  );
}

export async function nextFacilityId(
  name: string,
  isWarehouse: boolean,
  isLaundry: boolean,
): Promise<string> {
  const slug = slugify(name);
  const prefix =
    isWarehouse && !isLaundry
      ? "depot-"
      : isLaundry && !isWarehouse
        ? "laundry-"
        : "facility-";

  const base = `${prefix}${slug}`;
  let candidate = base;
  let suffix = 2;

  while (true) {
    const [existing] = await db
      .select({ id: facilities.id })
      .from(facilities)
      .where(eq(facilities.id, candidate))
      .limit(1);
    if (!existing) return candidate;
    candidate = `${base}-${suffix}`;
    suffix += 1;
  }
}

export type FacilityUsage = {
  isUsed: boolean;
  usedAsWarehouse: boolean;
  usedAsLaundry: boolean;
  planNames: string[];
  vehicleNames: string[];
  routeCount: number;
  message?: string;
};

export async function checkFacilityUsage(id: string): Promise<FacilityUsage> {
  const [allPlans, allVehicles] = await Promise.all([
    db.select({ id: plans.id, name: plans.name, data: plans.data }).from(plans),
    db
      .select({ id: vehicles.id, name: vehicles.name, depotId: vehicles.depotId })
      .from(vehicles),
  ]);

  const usedPlanNamesSet = new Set<string>();
  let usedAsWarehouse = false;
  let usedAsLaundry = false;
  let routeCount = 0;

  for (const p of allPlans) {
    const planData = p.data as Plan;
    let planUsed = false;

    if (planData.depot?.id === id) {
      planUsed = true;
      usedAsWarehouse = true;
    }

    for (const route of planData.routes ?? []) {
      if (route.depot_id === id) {
        planUsed = true;
        usedAsWarehouse = true;
        routeCount += 1;
      }
      if (route.laundry_id === id) {
        planUsed = true;
        usedAsLaundry = true;
        routeCount += 1;
      }
    }

    if (planUsed) {
      usedPlanNamesSet.add(p.name);
    }
  }

  const matchingVehicles = allVehicles
    .filter((v) => v.depotId === id)
    .map((v) => v.name);

  if (matchingVehicles.length > 0) {
    usedAsWarehouse = true;
  }

  const planNames = Array.from(usedPlanNamesSet);
  const isUsed = planNames.length > 0 || matchingVehicles.length > 0;

  let message: string | undefined;
  if (isUsed) {
    const parts: string[] = [];
    if (planNames.length > 0) {
      parts.push(`plan${planNames.length > 1 ? "s" : ""} ${planNames.map((n) => `"${n}"`).join(", ")}`);
    }
    if (matchingVehicles.length > 0) {
      parts.push(`vehicle${matchingVehicles.length > 1 ? "s" : ""} ${matchingVehicles.map((n) => `"${n}"`).join(", ")}`);
    }
    message = `Used by ${parts.join(" and ")}. Deactivate it instead.`;
  }

  return {
    isUsed,
    usedAsWarehouse,
    usedAsLaundry,
    planNames,
    vehicleNames: matchingVehicles,
    routeCount,
    message,
  };
}

export async function getFacilityRows(): Promise<FacilityRow[]> {
  return db.select().from(facilities).orderBy(asc(facilities.name));
}

export async function getWarehouseFacilities(
  includeInactive = false,
): Promise<FacilityRow[]> {
  const rows = await getFacilityRows();
  return rows.filter(
    (facility) =>
      facility.isWarehouse && (includeInactive || facility.isActive),
  );
}

export async function getLaundryFacilities(): Promise<FacilityRow[]> {
  const rows = await getFacilityRows();
  return rows.filter((f) => f.isLaundry && f.isActive);
}

export async function getFacilityAdminItems(): Promise<FacilityAdminItem[]> {
  const [rows, allPlans, allVehicles] = await Promise.all([
    getFacilityRows(),
    db.select({ id: plans.id, name: plans.name, data: plans.data }).from(plans),
    db.select({ id: vehicles.id, depotId: vehicles.depotId }).from(vehicles),
  ]);

  return rows.map((row) => {
    let routeCount = 0;
    const planNamesSet = new Set<string>();

    for (const p of allPlans) {
      const planData = p.data as Plan;
      let planUsed = false;
      if (planData.depot?.id === row.id) {
        planUsed = true;
      }
      for (const route of planData.routes ?? []) {
        if (route.depot_id === row.id || (!route.depot_id && planData.depot?.id === row.id)) {
          routeCount += 1;
          planUsed = true;
        }
        if (route.laundry_id === row.id) {
          routeCount += 1;
          planUsed = true;
        }
      }
      if (planUsed) {
        planNamesSet.add(p.name);
      }
    }

    const hasVehicles = allVehicles.some((v) => v.depotId === row.id);
    if (hasVehicles) {
      planNamesSet.add("Fleet Depot");
    }

    return {
      id: row.id,
      name: row.name,
      shortName: row.shortName,
      address: row.address,
      latitude: row.latitude,
      longitude: row.longitude,
      isWarehouse: row.isWarehouse,
      isLaundry: row.isLaundry,
      serviceMins: row.serviceMins,
      isActive: row.isActive,
      usedByRouteCount: routeCount,
      usedByPlans: Array.from(planNamesSet),
    };
  });
}

export async function getFacilityById(
  id: string,
): Promise<FacilityAdminItem | null> {
  const items = await getFacilityAdminItems();
  return items.find((f) => f.id === id) ?? null;
}

export async function createFacility(
  input: FacilityInput,
): Promise<FacilityAdminItem> {
  const id = await nextFacilityId(input.name, input.isWarehouse, input.isLaundry);
  const [row] = await db
    .insert(facilities)
    .values({
      id,
      ...input,
    })
    .returning();

  return {
    id: row.id,
    name: row.name,
    shortName: row.shortName,
    address: row.address,
    latitude: row.latitude,
    longitude: row.longitude,
    isWarehouse: row.isWarehouse,
    isLaundry: row.isLaundry,
    serviceMins: row.serviceMins,
    isActive: row.isActive,
    usedByRouteCount: 0,
    usedByPlans: [],
  };
}

export async function updateFacility(
  id: string,
  input: FacilityInput,
): Promise<FacilityAdminItem | null> {
  const existing = await getFacilityById(id);
  if (!existing) return null;

  // Check role removal restrictions
  const usage = await checkFacilityUsage(id);
  if (!input.isWarehouse && usage.usedAsWarehouse) {
    throw new FacilityConflictError(
      `Cannot remove Warehouse role while this facility is in use as a depot. ${usage.message ?? ""}`,
      usage.planNames,
      usage.vehicleNames,
    );
  }
  if (!input.isLaundry && usage.usedAsLaundry) {
    throw new FacilityConflictError(
      `Cannot remove Laundry role while this facility is in use as a laundry. ${usage.message ?? ""}`,
      usage.planNames,
      usage.vehicleNames,
    );
  }

  const [row] = await db
    .update(facilities)
    .set({
      ...input,
      updatedAt: new Date(),
    })
    .where(eq(facilities.id, id))
    .returning();

  if (!row) return null;
  return getFacilityById(id);
}

export async function deleteFacility(id: string): Promise<boolean> {
  const usage = await checkFacilityUsage(id);
  if (usage.isUsed) {
    throw new FacilityConflictError(
      usage.message ?? "Facility is in use. Deactivate it instead.",
      usage.planNames,
      usage.vehicleNames,
    );
  }

  const [deleted] = await db
    .delete(facilities)
    .where(eq(facilities.id, id))
    .returning({ id: facilities.id });

  return Boolean(deleted);
}

