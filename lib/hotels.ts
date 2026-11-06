import { asc, eq } from "drizzle-orm";
import type { Hotel, RegionMeta } from "./coverage";
import { db } from "./db";
import { hotels, type HotelRow } from "../db/schema";

export const HOTEL_DAY_PLANS = ["daily", "day1", "day2"] as const;
export type HotelDayPlan = (typeof HOTEL_DAY_PLANS)[number];

export type HotelAdminItem = {
  id: string;
  name: string;
  address: string | null;
  latitude: number;
  longitude: number;
  regionName: string;
  stopMins: number;
  /** Bags per service when this hotel runs every day. */
  loadBags: number;
  /** Bags per service when this hotel runs on Day 1 or Day 2 only. */
  alternateLoadBags: number;
  rooms: number;
  dayPlan: HotelDayPlan;
  isActive: boolean;
};

export type HotelInput = {
  name: string;
  address: string | null;
  latitude: number;
  longitude: number;
  regionName: string;
  stopMins: number;
  loadBags: number;
  alternateLoadBags: number;
  rooms: number;
  dayPlan: HotelDayPlan;
};

export class HotelInputError extends Error {
  field?: keyof HotelInput;

  constructor(message: string, field?: keyof HotelInput) {
    super(message);
    this.name = "HotelInputError";
    this.field = field;
  }
}

export function isHotelDayPlan(value: unknown): value is HotelDayPlan {
  return (
    typeof value === "string" &&
    (HOTEL_DAY_PLANS as readonly string[]).includes(value)
  );
}

function toHotelAdminItem(row: HotelRow): HotelAdminItem {
  return {
    id: row.id,
    name: row.name,
    address: row.address,
    latitude: row.latitude,
    longitude: row.longitude,
    regionName: row.regionName,
    stopMins: row.stopMins,
    loadBags: row.loadBags,
    alternateLoadBags: row.alternateLoadBags,
    rooms: row.rooms,
    dayPlan: isHotelDayPlan(row.dayPlan) ? row.dayPlan : "daily",
    isActive: row.isActive,
  };
}

export async function getHotelRows(): Promise<HotelRow[]> {
  return db
    .select()
    .from(hotels)
    .where(eq(hotels.isActive, true))
    .orderBy(asc(hotels.name));
}

export async function getHotelAdminItems(): Promise<HotelAdminItem[]> {
  const rows = await db.select().from(hotels).orderBy(asc(hotels.name));
  return rows.map(toHotelAdminItem);
}

/**
 * Maps DB hotels into the numeric-region shape used by the coverage map.
 * region_name is stored as the region's short display name.
 */
export async function getCoverageHotels(
  regions: RegionMeta[],
): Promise<Hotel[]> {
  const rows = await getHotelRows();
  const regionIdByName = new Map<string, number>();

  for (const region of regions) {
    regionIdByName.set(region.short_name, region.id);
    regionIdByName.set(region.name, region.id);
  }

  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    lat: row.latitude,
    lon: row.longitude,
    region: regionIdByName.get(row.regionName) ?? 0,
    stop_mins: row.stopMins,
    load: row.dayPlan === "daily" ? row.loadBags : row.alternateLoadBags,
  }));
}

function requiredString(value: unknown, label: string, maxLength: number) {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new HotelInputError(`${label} is required.`);
  }
  const trimmed = value.trim();
  if (trimmed.length > maxLength) {
    throw new HotelInputError(`${label} must be ${maxLength} characters or less.`);
  }
  return trimmed;
}

function requiredNumber(value: unknown, label: string) {
  const number =
    typeof value === "number"
      ? value
      : typeof value === "string" && value.trim() !== ""
        ? Number(value)
        : Number.NaN;

  if (!Number.isFinite(number)) {
    throw new HotelInputError(`${label} must be a number.`);
  }
  return number;
}

function requiredInteger(value: unknown, label: string) {
  const number = requiredNumber(value, label);
  if (!Number.isInteger(number) || number < 0) {
    throw new HotelInputError(`${label} must be a whole number of 0 or more.`);
  }
  return number;
}

export function parseHotelInput(value: unknown): HotelInput {
  if (!value || typeof value !== "object") {
    throw new HotelInputError("Invalid hotel data.");
  }

  const candidate = value as Record<string, unknown>;
  const name = requiredString(candidate.name, "Hotel name", 120);
  const latitude = requiredNumber(candidate.latitude, "Latitude");
  const longitude = requiredNumber(candidate.longitude, "Longitude");
  const regionName = requiredString(candidate.regionName, "Region", 120);
  const stopMins = requiredInteger(candidate.stopMins, "Stop minutes");
  const loadBags = requiredInteger(
    candidate.loadBags ?? candidate.dailyLoadBags,
    "Daily bags",
  );
  const alternateLoadBags = requiredInteger(
    candidate.alternateLoadBags ?? candidate.loadBags ?? candidate.dailyLoadBags,
    "Alternate-day bags",
  );
  const rooms = requiredInteger(candidate.rooms, "Rooms");
  const dayPlan = candidate.dayPlan;

  if (latitude < -90 || latitude > 90) {
    throw new HotelInputError("Latitude must be between -90 and 90.");
  }
  if (longitude < -180 || longitude > 180) {
    throw new HotelInputError("Longitude must be between -180 and 180.");
  }
  if (!isHotelDayPlan(dayPlan)) {
    throw new HotelInputError("Choose Daily, Day 1 or Day 2.");
  }

  let address: string | null = null;
  if (candidate.address !== undefined && candidate.address !== null) {
    if (typeof candidate.address !== "string") {
      throw new HotelInputError("Address must be text.");
    }
    const trimmed = candidate.address.trim();
    if (trimmed.length > 300) {
      throw new HotelInputError("Address must be 300 characters or less.");
    }
    address = trimmed.length > 0 ? trimmed : null;
  }

  return {
    name,
    address,
    latitude,
    longitude,
    regionName,
    stopMins,
    loadBags,
    alternateLoadBags,
    rooms,
    dayPlan,
  };
}

function slugifyHotelName(name: string): string {
  return (
    name
      .normalize("NFKD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 64) || "hotel"
  );
}

async function nextHotelId(name: string): Promise<string> {
  const base = slugifyHotelName(name);
  let candidate = base;
  let suffix = 2;

  while (true) {
    const [existing] = await db
      .select({ id: hotels.id })
      .from(hotels)
      .where(eq(hotels.id, candidate))
      .limit(1);
    if (!existing) return candidate;
    candidate = `${base}-${suffix}`;
    suffix += 1;
  }
}

export async function createHotel(input: HotelInput): Promise<HotelAdminItem> {
  const id = await nextHotelId(input.name);
  const [row] = await db
    .insert(hotels)
    .values({
      id,
      ...input,
    })
    .returning();

  return toHotelAdminItem(row);
}

export async function updateHotel(
  id: string,
  input: HotelInput,
): Promise<HotelAdminItem | null> {
  const [row] = await db
    .update(hotels)
    .set({
      ...input,
      updatedAt: new Date(),
    })
    .where(eq(hotels.id, id))
    .returning();

  return row ? toHotelAdminItem(row) : null;
}

export async function deleteHotel(id: string): Promise<boolean> {
  const [row] = await db
    .delete(hotels)
    .where(eq(hotels.id, id))
    .returning({ id: hotels.id });

  return Boolean(row);
}
