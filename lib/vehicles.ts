import { and, asc, eq } from "drizzle-orm";
import { db } from "./db";
import { vehicles, type VehicleRow } from "../db/schema";
import { clearCityCache } from "./cities";

const VEHICLE_COLORS = [
  "#1d4ed8",
  "#0f766e",
  "#b45309",
  "#7c3aed",
  "#be185d",
  "#0369a1",
  "#4d7c0f",
  "#c2410c",
];

export type VehicleAdminItem = {
  id: string;
  name: string;
  realCapacity: number;
  safeCapacity: number;
  color: string;
  regionId: number | null;
  regionName: string | null;
  sector: string | null;
  depotId: string;
  departureTime: string;
  returnTime: string;
  isActive: boolean;
};

export type VehicleInput = {
  name: string;
  realCapacity: number;
  color: string;
  regionId: number | null;
  regionName: string | null;
  sector: string | null;
  depotId: string;
  departureTime: string;
  returnTime: string;
  isActive: boolean;
};

export class VehicleInputError extends Error {
  field?: keyof VehicleInput;

  constructor(message: string, field?: keyof VehicleInput) {
    super(message);
    this.name = "VehicleInputError";
    this.field = field;
  }
}

function toVehicleAdminItem(row: VehicleRow): VehicleAdminItem {
  return {
    id: row.id,
    name: row.name,
    realCapacity: row.realCapacity,
    safeCapacity: row.safeCapacity,
    color: row.color,
    regionId: row.regionId,
    regionName: row.regionName,
    sector: row.sector,
    depotId: row.depotId,
    departureTime: row.departureTime,
    returnTime: row.returnTime,
    isActive: row.isActive,
  };
}

export async function getVehicleRows(cityId: string): Promise<VehicleRow[]> {
  return db
    .select()
    .from(vehicles)
    .where(eq(vehicles.cityId, cityId))
    .orderBy(asc(vehicles.name));
}

export async function getVehicleAdminItems(
  cityId: string,
): Promise<VehicleAdminItem[]> {
  return (await getVehicleRows(cityId)).map(toVehicleAdminItem);
}

export async function getVehicleById(
  cityId: string,
  id: string,
): Promise<VehicleAdminItem | null> {
  const [row] = await db
    .select()
    .from(vehicles)
    .where(and(eq(vehicles.cityId, cityId), eq(vehicles.id, id)))
    .limit(1);
  return row ? toVehicleAdminItem(row) : null;
}

function requiredString(value: unknown, label: string, maxLength: number) {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new VehicleInputError(`${label} is required.`);
  }
  const trimmed = value.trim();
  if (trimmed.length > maxLength) {
    throw new VehicleInputError(
      `${label} must be ${maxLength} characters or less.`,
    );
  }
  return trimmed;
}

function requiredInteger(value: unknown, label: string, min: number) {
  const number =
    typeof value === "number"
      ? value
      : typeof value === "string" && value.trim() !== ""
        ? Number(value)
        : Number.NaN;

  if (!Number.isInteger(number) || number < min) {
    throw new VehicleInputError(
      `${label} must be a whole number of ${min} or more.`,
    );
  }
  return number;
}

function optionalString(value: unknown, label: string, maxLength: number) {
  if (value === undefined || value === null) return null;
  if (typeof value !== "string") {
    throw new VehicleInputError(`${label} must be text.`);
  }
  const trimmed = value.trim();
  if (trimmed.length > maxLength) {
    throw new VehicleInputError(
      `${label} must be ${maxLength} characters or less.`,
    );
  }
  return trimmed.length > 0 ? trimmed : null;
}

function optionalRegionId(value: unknown) {
  if (value === undefined || value === null || value === "") return null;
  const number =
    typeof value === "number" ? value : Number(value);
  if (!Number.isInteger(number) || number < 0) {
    throw new VehicleInputError("Region must be a valid region.");
  }
  return number;
}

function clockValue(value: unknown, label: string, fallback: string) {
  if (value === undefined || value === null || value === "") return fallback;
  const text = String(value).trim();
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(text)) {
    throw new VehicleInputError(`${label} must use HH:MM time.`);
  }
  return text;
}

function colorValue(value: unknown, fallback: string) {
  if (value === undefined || value === null || value === "") return fallback;
  const text = String(value).trim();
  if (!/^#[0-9a-f]{6}$/i.test(text)) {
    throw new VehicleInputError("Color must be a hex value like #3b82f6.");
  }
  return text;
}

export function parseVehicleInput(
  value: unknown,
  fallbackColor = VEHICLE_COLORS[0],
): VehicleInput {
  if (!value || typeof value !== "object") {
    throw new VehicleInputError("Invalid vehicle data.");
  }

  const candidate = value as Record<string, unknown>;
  const name = requiredString(candidate.name, "Vehicle name", 120);
  const realCapacity = requiredInteger(
    candidate.realCapacity ?? candidate.capacity,
    "Capacity",
    1,
  );
  const color = colorValue(candidate.color, fallbackColor);
  const regionId = optionalRegionId(candidate.regionId);
  const regionName = optionalString(candidate.regionName, "Region name", 120);
  const sector = optionalString(candidate.sector, "Sector", 120);
  const depotId =
    optionalString(candidate.depotId, "Depot", 120) ?? "depot-primary";
  const departureTime = clockValue(
    candidate.departureTime,
    "Departure time",
    "07:00",
  );
  const returnTime = clockValue(candidate.returnTime, "Return time", "17:00");
  const isActive =
    candidate.isActive === undefined ? true : Boolean(candidate.isActive);

  return {
    name,
    realCapacity,
    color,
    regionId,
    regionName,
    sector,
    depotId,
    departureTime,
    returnTime,
    isActive,
  };
}

function nextColor(seed: number): string {
  return VEHICLE_COLORS[seed % VEHICLE_COLORS.length];
}

async function nextVehicleId(cityId: string): Promise<string> {
  const base = `vehicle-${Date.now()}`;
  let candidate = base;
  let suffix = 2;

  while (true) {
    const [existing] = await db
      .select({ id: vehicles.id })
      .from(vehicles)
      .where(and(eq(vehicles.cityId, cityId), eq(vehicles.id, candidate)))
      .limit(1);
    if (!existing) return candidate;
    candidate = `${base}-${suffix}`;
    suffix += 1;
  }
}

export async function createVehicle(
  cityId: string,
  input: VehicleInput,
): Promise<VehicleAdminItem> {
  const existing = await db
    .select({ id: vehicles.id })
    .from(vehicles)
    .where(eq(vehicles.cityId, cityId));
  const id = await nextVehicleId(cityId);
  const [row] = await db
    .insert(vehicles)
    .values({
      cityId,
      id,
      ...input,
      color: input.color || nextColor(existing.length),
    })
    .returning();

  clearCityCache(cityId);
  return toVehicleAdminItem(row);
}

export async function updateVehicle(
  cityId: string,
  id: string,
  input: VehicleInput,
): Promise<VehicleAdminItem | null> {
  const [row] = await db
    .update(vehicles)
    .set({
      ...input,
      updatedAt: new Date(),
    })
    .where(and(eq(vehicles.cityId, cityId), eq(vehicles.id, id)))
    .returning();

  if (row) {
    clearCityCache(cityId);
  }
  return row ? toVehicleAdminItem(row) : null;
}

export async function deleteVehicle(
  cityId: string,
  id: string,
): Promise<boolean> {
  const [row] = await db
    .delete(vehicles)
    .where(and(eq(vehicles.cityId, cityId), eq(vehicles.id, id)))
    .returning({ id: vehicles.id });

  if (row) {
    clearCityCache(cityId);
  }
  return Boolean(row);
}
