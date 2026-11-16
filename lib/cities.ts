import { asc, eq } from "drizzle-orm";
import { db } from "./db";
import { cities, cityDatasets, regions } from "../db/schema";
import type {
  City,
  CityDatasetKind,
  CityRegion,
} from "./city-types";
import type { RegionMeta } from "./coverage";

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

function toRegion(row: typeof regions.$inferSelect): CityRegion {
  return {
    cityId: row.cityId,
    regionIndex: row.regionIndex,
    code: row.code,
    name: row.name,
    shortName: row.shortName,
    mapLabel: row.mapLabel,
    tier: row.tier,
    routeStatus: row.routeStatus,
    lotrRoute: row.lotrRoute,
    color: row.color,
    keyAreas: row.keyAreas,
    areasList: row.areasList ?? [],
    centerLat: row.centerLat,
    centerLon: row.centerLon,
    labelLat: row.labelLat,
    labelLon: row.labelLon,
    sortOrder: row.sortOrder,
    isActive: row.isActive,
  };
}

/** All cities, ordered for the switcher. */
export async function listCities(): Promise<City[]> {
  const rows = await db
    .select()
    .from(cities)
    .where(eq(cities.isActive, true))
    .orderBy(asc(cities.sortOrder), asc(cities.name));
  return rows.map(toCity);
}

export async function getCity(slug: string): Promise<City | null> {
  const [row] = await db
    .select()
    .from(cities)
    .where(eq(cities.id, slug))
    .limit(1);
  return row ? toCity(row) : null;
}

export class CityNotFoundError extends Error {
  constructor(slug: string) {
    super(`Unknown city: ${slug}`);
    this.name = "CityNotFoundError";
  }
}

/** Resolves a city slug, or throws when the city does not exist. */
export async function requireCity(slug: string): Promise<City> {
  const city = await getCity(slug);
  if (!city) throw new CityNotFoundError(slug);
  return city;
}

/** The city used by `/` when no city segment is present. */
export async function getDefaultCity(): Promise<City | null> {
  const all = await listCities();
  return all[0] ?? null;
}

export async function listCityRegions(cityId: string): Promise<CityRegion[]> {
  const rows = await db
    .select()
    .from(regions)
    .where(eq(regions.cityId, cityId))
    .orderBy(asc(regions.sortOrder), asc(regions.regionIndex));
  return rows.map(toRegion);
}

/**
 * Converts the stored regions into the shape the map and dashboards already
 * consume. The numeric `id` stays the region index inside its city.
 */
export async function getRegionMeta(cityId: string): Promise<RegionMeta[]> {
  const rows = await listCityRegions(cityId);
  return rows.map((region) => ({
    id: region.regionIndex,
    code: region.code,
    name: region.name,
    short_name: region.shortName,
    map_label: region.mapLabel,
    tier: region.tier ?? "",
    route_status: region.routeStatus ?? "",
    lotr_route: region.lotrRoute ?? "",
    color: region.color,
    key_areas: region.keyAreas ?? "",
    areas_list: region.areasList,
    center: { lat: region.centerLat, lon: region.centerLon },
    label_point: { lat: region.labelLat, lon: region.labelLon },
  }));
}

/**
 * Dataset payloads are large (an optimized dispatch set is over a megabyte),
 * so they are cached in-process for a short window instead of being pulled
 * from the database on every request.
 */
const DATASET_CACHE_TTL_MS = 60_000;
const datasetCache = new Map<
  string,
  { expiresAt: number; value: unknown }
>();

function cacheKey(cityId: string, kind: string): string {
  return `${cityId}:${kind}`;
}

export async function getCityDataset<T>(
  cityId: string,
  kind: CityDatasetKind,
): Promise<T | null> {
  const key = cacheKey(cityId, kind);
  const cached = datasetCache.get(key);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.value as T;
  }

  const [row] = await db
    .select()
    .from(cityDatasets)
    .where(eq(cityDatasets.id, key))
    .limit(1);

  if (!row) return null;

  datasetCache.set(key, {
    expiresAt: Date.now() + DATASET_CACHE_TTL_MS,
    value: row.payload,
  });
  return row.payload as T;
}

/** All published datasets for a city, keyed by kind. */
export async function getCityDatasets(
  cityId: string,
): Promise<Partial<Record<CityDatasetKind, unknown>>> {
  const rows = await db
    .select()
    .from(cityDatasets)
    .where(eq(cityDatasets.cityId, cityId));

  const result: Partial<Record<CityDatasetKind, unknown>> = {};
  for (const row of rows) {
    result[row.kind as CityDatasetKind] = row.payload;
  }
  return result;
}

/** Drops the in-process dataset cache, for example after a re-seed. */
export function clearCityDatasetCache(): void {
  datasetCache.clear();
}
