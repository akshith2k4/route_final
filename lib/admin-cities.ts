/**
 * Admin-side city management for the onboarding wizard.
 *
 * The wizard creates cities as INACTIVE drafts: they are persisted (so the
 * manager's work is never lost) but stay out of the city switcher until the
 * full onboarding flow publishes them.
 */
import { asc, count, desc, eq } from "drizzle-orm";
import { db } from "./db";
import {
  cities,
  cityDatasets,
  facilities,
  hotels,
  plans,
  regions,
  vehicles,
} from "../db/schema";
import { clearCityDatasetCache, listCityRegions } from "./cities";
import type { City, CityRegion } from "./city-types";

export class AdminInputError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AdminInputError";
  }
}

export class AdminConflictError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AdminConflictError";
  }
}

export type DraftRegionInput = {
  name: string;
  short_name: string;
  map_label: string;
  color: string;
  center: { lat: number; lon: number };
  label_point?: { lat: number; lon: number };
};

export type DraftCityInput = {
  slug: string;
  name: string;
  display_name?: string | null;
  center: { lat: number; lon: number };
  timezone: string;
  default_zoom?: number;
  min_zoom?: number;
  max_zoom?: number;
  h3_resolution?: number;
  fallback_speed_kmh?: number;
  road_factor?: number;
  regions: DraftRegionInput[];
};

export type CityWithCounts = City & {
  counts: {
    regions: number;
    hotels: number;
    vehicles: number;
    facilities: number;
    plans: number;
  };
};

const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const COLOR_PATTERN = /^#[0-9a-fA-F]{6}$/;

function finiteNumber(value: unknown, fallback: number): number {
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function validLatLon(value: { lat: number; lon: number } | undefined): boolean {
  return (
    !!value &&
    Number.isFinite(value.lat) &&
    Number.isFinite(value.lon) &&
    value.lat >= -90 &&
    value.lat <= 90 &&
    value.lon >= -180 &&
    value.lon <= 180
  );
}

function validTimezone(timezone: string): boolean {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: timezone });
    return true;
  } catch {
    return false;
  }
}

/** Validates and normalizes the wizard payload, or throws AdminInputError. */
export function parseDraftCityInput(value: unknown): DraftCityInput {
  if (!value || typeof value !== "object") {
    throw new AdminInputError("Send a city payload.");
  }
  const body = value as Record<string, unknown>;

  const slug = String(body.slug ?? "").trim().toLowerCase();
  if (!SLUG_PATTERN.test(slug) || slug.length > 40) {
    throw new AdminInputError(
      "Slug must be lowercase letters, numbers and dashes (max 40 chars).",
    );
  }

  const name = String(body.name ?? "").trim();
  if (name.length < 2 || name.length > 80) {
    throw new AdminInputError("City name must be 2–80 characters.");
  }

  const displayNameRaw =
    body.display_name === null || body.display_name === undefined
      ? null
      : String(body.display_name).trim();
  if (displayNameRaw && displayNameRaw.length > 120) {
    throw new AdminInputError("Display name must be 120 characters or less.");
  }

  const center = body.center as { lat: number; lon: number } | undefined;
  if (!validLatLon(center)) {
    throw new AdminInputError("Pick a valid city centre on the map.");
  }

  const timezone = String(body.timezone ?? "").trim();
  if (!validTimezone(timezone)) {
    throw new AdminInputError("Choose a valid IANA timezone.");
  }

  const rawRegions = Array.isArray(body.regions) ? body.regions : [];
  if (rawRegions.length < 1 || rawRegions.length > 12) {
    throw new AdminInputError("Define between 1 and 12 regions.");
  }

  const regionsInput: DraftRegionInput[] = rawRegions.map((raw, index) => {
    const region = (raw ?? {}) as Record<string, unknown>;
    const regionName = String(region.name ?? "").trim();
    const shortName = String(region.short_name ?? "").trim();
    const mapLabel = String(region.map_label ?? "").trim();
    if (!regionName || regionName.length > 120) {
      throw new AdminInputError(`Region ${index + 1} needs a name (≤120 chars).`);
    }
    if (!shortName || shortName.length > 60) {
      throw new AdminInputError(
        `Region ${index + 1} needs a short name (≤60 chars).`,
      );
    }
    if (!mapLabel || mapLabel.length > 40) {
      throw new AdminInputError(
        `Region ${index + 1} needs a map label (≤40 chars).`,
      );
    }
    const color = String(region.color ?? "");
    if (!COLOR_PATTERN.test(color)) {
      throw new AdminInputError(`Region ${index + 1} needs a hex color.`);
    }
    const regionCenter = region.center as
      | { lat: number; lon: number }
      | undefined;
    if (!validLatLon(regionCenter)) {
      throw new AdminInputError(`Region ${index + 1} needs a valid centre.`);
    }
    const labelPoint = region.label_point as
      | { lat: number; lon: number }
      | undefined;
    return {
      name: regionName,
      short_name: shortName,
      map_label: mapLabel,
      color,
      center: { lat: regionCenter!.lat, lon: regionCenter!.lon },
      label_point: validLatLon(labelPoint)
        ? { lat: labelPoint!.lat, lon: labelPoint!.lon }
        : { lat: regionCenter!.lat, lon: regionCenter!.lon },
    };
  });

  const defaultZoom = Math.round(finiteNumber(body.default_zoom, 11));
  const minZoom = Math.round(finiteNumber(body.min_zoom, 9));
  const maxZoom = Math.round(finiteNumber(body.max_zoom, 17));
  if (minZoom < 3 || maxZoom > 19 || minZoom >= defaultZoom || defaultZoom >= maxZoom) {
    throw new AdminInputError("Zoom levels must satisfy min < default < max (3–19).");
  }

  const h3Resolution = Math.round(finiteNumber(body.h3_resolution, 7));
  if (h3Resolution < 5 || h3Resolution > 9) {
    throw new AdminInputError("H3 resolution must be between 5 and 9.");
  }

  const fallbackSpeed = finiteNumber(body.fallback_speed_kmh, 24);
  if (fallbackSpeed < 5 || fallbackSpeed > 80) {
    throw new AdminInputError("Fallback speed must be 5–80 km/h.");
  }

  const roadFactor = finiteNumber(body.road_factor, 1.35);
  if (roadFactor < 1 || roadFactor > 3) {
    throw new AdminInputError("Road factor must be between 1.0 and 3.0.");
  }

  return {
    slug,
    name,
    display_name: displayNameRaw || null,
    center: { lat: center!.lat, lon: center!.lon },
    timezone,
    default_zoom: defaultZoom,
    min_zoom: minZoom,
    max_zoom: maxZoom,
    h3_resolution: h3Resolution,
    fallback_speed_kmh: fallbackSpeed,
    road_factor: roadFactor,
    regions: regionsInput,
  };
}

function toCity(row: typeof cities.$inferSelect): City {
  return {
    id: row.id,
    name: row.name,
    displayName: row.displayName,
    centerLat: row.centerLat,
    centerLon: row.centerLon,
    defaultZoom: row.defaultZoom,
    minZoom: row.minZoom,
    maxZoom: row.maxZoom,
    timezone: row.timezone,
    h3Resolution: row.h3Resolution,
    fallbackSpeedKmh: row.fallbackSpeedKmh,
    roadFactor: row.roadFactor,
    settings: row.settings ?? {},
    isActive: row.isActive,
    sortOrder: row.sortOrder,
  };
}

/** Every city, including inactive drafts, with master-data counts. */
export async function listAllCitiesWithCounts(): Promise<CityWithCounts[]> {
  const [cityRows, regionCounts, hotelCounts, vehicleCounts, facilityCounts, planCounts] =
    await Promise.all([
      db.select().from(cities).orderBy(asc(cities.sortOrder), asc(cities.name)),
      db.select({ cityId: regions.cityId, n: count() }).from(regions).groupBy(regions.cityId),
      db.select({ cityId: hotels.cityId, n: count() }).from(hotels).groupBy(hotels.cityId),
      db.select({ cityId: vehicles.cityId, n: count() }).from(vehicles).groupBy(vehicles.cityId),
      db.select({ cityId: facilities.cityId, n: count() }).from(facilities).groupBy(facilities.cityId),
      db.select({ cityId: plans.cityId, n: count() }).from(plans).groupBy(plans.cityId),
    ]);

  const tally = (rows: { cityId: string; n: number }[]) =>
    new Map(rows.map((row) => [row.cityId, row.n]));
  const r = tally(regionCounts);
  const h = tally(hotelCounts);
  const v = tally(vehicleCounts);
  const f = tally(facilityCounts);
  const p = tally(planCounts);

  return cityRows.map((row) => ({
    ...toCity(row),
    counts: {
      regions: r.get(row.id) ?? 0,
      hotels: h.get(row.id) ?? 0,
      vehicles: v.get(row.id) ?? 0,
      facilities: f.get(row.id) ?? 0,
      plans: p.get(row.id) ?? 0,
    },
  }));
}

/**
 * Persists the wizard result as an inactive draft: the city registry entry
 * plus its regions. Hotels, fleet and datasets arrive in later phases.
 */
export async function createDraftCity(
  input: DraftCityInput,
): Promise<{ city: City; regions: CityRegion[] }> {
  const [existing] = await db
    .select({ id: cities.id })
    .from(cities)
    .where(eq(cities.id, input.slug))
    .limit(1);
  if (existing) {
    throw new AdminConflictError(`A city with slug "${input.slug}" already exists.`);
  }

  const [last] = await db
    .select({ sortOrder: cities.sortOrder })
    .from(cities)
    .orderBy(desc(cities.sortOrder))
    .limit(1);
  const sortOrder = (last?.sortOrder ?? 0) + 1;

  const [cityRow] = await db
    .insert(cities)
    .values({
      id: input.slug,
      name: input.name,
      displayName: input.display_name ?? null,
      centerLat: input.center.lat,
      centerLon: input.center.lon,
      defaultZoom: input.default_zoom ?? 11,
      minZoom: input.min_zoom ?? 9,
      maxZoom: input.max_zoom ?? 17,
      timezone: input.timezone,
      h3Resolution: input.h3_resolution ?? 7,
      fallbackSpeedKmh: input.fallback_speed_kmh ?? 24,
      roadFactor: input.road_factor ?? 1.35,
      settings: {},
      isActive: false,
      sortOrder,
    })
    .returning();

  try {
    await db.insert(regions).values(
      input.regions.map((region, index) => ({
        cityId: input.slug,
        regionIndex: index,
        code: `R${index}`,
        name: region.name,
        shortName: region.short_name,
        mapLabel: region.map_label,
        tier: null,
        routeStatus: "Proposed",
        lotrRoute: null,
        color: region.color,
        keyAreas: null,
        areasList: [],
        centerLat: region.center.lat,
        centerLon: region.center.lon,
        labelLat: region.label_point?.lat ?? region.center.lat,
        labelLon: region.label_point?.lon ?? region.center.lon,
        sortOrder: index,
        isActive: true,
      })),
    );
  } catch (error) {
    // Compensate: never leave a city without its regions.
    await db.delete(cities).where(eq(cities.id, input.slug));
    throw error;
  }

  return {
    city: toCity(cityRow),
    regions: await listCityRegions(input.slug),
  };
}

export async function getCityWithRegions(
  slug: string,
): Promise<{ city: City; regions: CityRegion[] } | null> {
  const [row] = await db.select().from(cities).where(eq(cities.id, slug)).limit(1);
  if (!row) return null;
  return { city: toCity(row), regions: await listCityRegions(slug) };
}

/**
 * Deletes a draft city. Active cities and cities that already hold
 * operational data are protected — the full management flow handles those.
 */
export async function deleteDraftCity(slug: string): Promise<boolean> {
  const [row] = await db.select().from(cities).where(eq(cities.id, slug)).limit(1);
  if (!row) return false;
  if (row.isActive) {
    throw new AdminConflictError("Deactivate the city before deleting it.");
  }

  const [hotelCount, vehicleCount, facilityCount, planCount, datasetCount] =
    await Promise.all([
      db.select({ n: count() }).from(hotels).where(eq(hotels.cityId, slug)),
      db.select({ n: count() }).from(vehicles).where(eq(vehicles.cityId, slug)),
      db.select({ n: count() }).from(facilities).where(eq(facilities.cityId, slug)),
      db.select({ n: count() }).from(plans).where(eq(plans.cityId, slug)),
      db.select({ n: count() }).from(cityDatasets).where(eq(cityDatasets.cityId, slug)),
    ]);

  const total =
    (hotelCount[0]?.n ?? 0) +
    (vehicleCount[0]?.n ?? 0) +
    (facilityCount[0]?.n ?? 0) +
    (planCount[0]?.n ?? 0) +
    (datasetCount[0]?.n ?? 0);
  if (total > 0) {
    throw new AdminConflictError(
      "This city already has operational data. Full deletion arrives with the complete onboarding flow.",
    );
  }

  // Regions cascade with the city row.
  await db.delete(cities).where(eq(cities.id, slug));
  clearCityDatasetCache();
  return true;
}
