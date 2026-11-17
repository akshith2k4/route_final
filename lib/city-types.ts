/**
 * Shared types for the multi-city model.
 *
 * A "city" is one operating geography: its own hotels, facilities, vehicles,
 * regions, travel matrix and route plan. Everything the app shows is scoped to
 * exactly one city, and every city owns its own numeric region indices.
 */

export type CitySettings = {
  /**
   * Operating shift of the city's fleet, as 24-hour "HH:MM" clocks.
   *
   * Vehicles leave the warehouse at `shiftStart` and every route is expected
   * back by `shiftEnd`. New manual routes and the baseline plan inherit these
   * values, so the manager only enters the city's hours once.
   */
  shiftStart?: string;
  shiftEnd?: string;
  /**
   * Region indices that count as adjacent to a vehicle's home region when the
   * studio optimizer scores territory. Keys are region indices as strings,
   * values are the adjacent region indices.
   *
   * Example for Bengaluru: `{ "0": ["4"], "1": ["0", "2", "4"], "3": ["0", "1"] }`
   */
  regionAdjacency?: Record<string, string[]>;
  /** Fallback average logistics speed in km/h for estimated legs. */
  fallbackSpeedKmh?: number;
  /** Straight-line to road-distance multiplier for estimated legs. */
  roadFactor?: number;
  /** Extra, city-specific display labels shown in the dispatch header. */
  dispatchSubtitle?: string;
};

export type City = {
  /** URL slug, for example "bengaluru". */
  id: string;
  name: string;
  displayName: string | null;
  centerLat: number;
  centerLon: number;
  defaultZoom: number;
  minZoom: number;
  maxZoom: number;
  timezone: string;
  h3Resolution: number;
  fallbackSpeedKmh: number;
  roadFactor: number;
  settings: CitySettings;
  isActive: boolean;
  sortOrder: number;
};

export type CityRegion = {
  cityId: string;
  /** Zero-based region index within the city. */
  regionIndex: number;
  code: string;
  name: string;
  shortName: string;
  mapLabel: string;
  tier: string | null;
  routeStatus: string | null;
  lotrRoute: string | null;
  color: string;
  keyAreas: string | null;
  areasList: string[];
  centerLat: number;
  centerLon: number;
  labelLat: number;
  labelLon: number;
  sortOrder: number;
  isActive: boolean;
};

/** The kinds of reference data the city pipeline publishes. */
export const CITY_DATASET_KINDS = [
  "hex_map",
  "travel_matrix",
  "plan_geometries",
  "optimized_routes",
  "manual_routes",
  "fleet",
  "baseline_plan",
] as const;

export type CityDatasetKind = (typeof CITY_DATASET_KINDS)[number];

export function isCityDatasetKind(value: string): value is CityDatasetKind {
  return (CITY_DATASET_KINDS as readonly string[]).includes(value);
}
