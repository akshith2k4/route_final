/**
 * Blank starter state for the onboarding wizard.
 *
 * A new city starts empty: the manager types its name, clicks the map to set
 * the centre, and places regions themselves. Generic defaults (zoom, H3,
 * road estimates, timezone) are kept so the map renders and the form is valid,
 * but no city or region is pre-authored.
 */
import type { DraftCityInput } from "./admin-cities";

export type RegionDraft = {
  /** Client-only stable id for React lists and map markers. */
  id: string;
  name: string;
  short_name: string;
  map_label: string;
  color: string;
  center: { lat: number; lon: number };
};

export type CityBasicsDraft = {
  name: string;
  display_name: string;
  slug: string;
  timezone: string;
  center: { lat: number; lon: number };
  default_zoom: number;
  min_zoom: number;
  max_zoom: number;
  h3_resolution: number;
  fallback_speed_kmh: number;
  road_factor: number;
};

export const REGION_COLOR_PALETTE = [
  "#EF4444",
  "#2563EB",
  "#0891B2",
  "#10B981",
  "#F59E0B",
  "#7C3AED",
  "#BE185D",
  "#4D7C0F",
];

export const TIMEZONE_OPTIONS = [
  "Asia/Kolkata",
  "Asia/Colombo",
  "Asia/Dhaka",
  "Asia/Karachi",
  "Asia/Kathmandu",
  "Asia/Dubai",
  "Asia/Riyadh",
  "Asia/Singapore",
  "Europe/London",
  "America/New_York",
  "UTC",
];

let regionIdCounter = 0;
export function nextRegionId(): string {
  regionIdCounter += 1;
  return `region-draft-${regionIdCounter}`;
}

/** Neutral starting point: no name, no regions, sensible generic defaults. */
export function emptyCityBasics(): CityBasicsDraft {
  return {
    name: "",
    display_name: "",
    slug: "",
    timezone: "Asia/Kolkata",
    center: { lat: 20.5937, lon: 78.9629 },
    default_zoom: 5,
    min_zoom: 3,
    max_zoom: 17,
    h3_resolution: 7,
    fallback_speed_kmh: 24,
    road_factor: 1.35,
  };
}

/**
 * The standard five-zone layout every new city starts with, positioned around
 * the city centre: North, South, East, West and Central. Names and colours are
 * neutral and fully editable — the manager renames them to the city's real
 * operational territories.
 */
export function standardZoneRegions(center: { lat: number; lon: number }): RegionDraft[] {
  // ~8 km offsets, longitude scaled so east/west match north/south on the ground.
  const latOffset = 0.075;
  const lonOffset = 0.075 / Math.max(0.2, Math.cos((center.lat * Math.PI) / 180));

  const zones: Omit<RegionDraft, "id">[] = [
    {
      name: "North Zone",
      short_name: "North",
      map_label: "North",
      color: "#0891B2",
      center: { lat: center.lat + latOffset, lon: center.lon },
    },
    {
      name: "South Zone",
      short_name: "South",
      map_label: "South",
      color: "#F59E0B",
      center: { lat: center.lat - latOffset, lon: center.lon },
    },
    {
      name: "East Zone",
      short_name: "East",
      map_label: "East",
      color: "#EF4444",
      center: { lat: center.lat, lon: center.lon + lonOffset },
    },
    {
      name: "West Zone",
      short_name: "West",
      map_label: "West",
      color: "#10B981",
      center: { lat: center.lat, lon: center.lon - lonOffset },
    },
    {
      name: "Central Zone",
      short_name: "Central",
      map_label: "Central",
      color: "#2563EB",
      center: { lat: center.lat, lon: center.lon },
    },
  ];

  return zones.map((zone) => ({ ...zone, id: nextRegionId() }));
}

/** Serializes wizard state into the payload the admin API accepts. */
export function toDraftCityInput(
  basics: CityBasicsDraft,
  regions: RegionDraft[],
): DraftCityInput {
  return {
    slug: basics.slug,
    name: basics.name,
    display_name: basics.display_name || null,
    center: basics.center,
    timezone: basics.timezone,
    default_zoom: basics.default_zoom,
    min_zoom: basics.min_zoom,
    max_zoom: basics.max_zoom,
    h3_resolution: basics.h3_resolution,
    fallback_speed_kmh: basics.fallback_speed_kmh,
    road_factor: basics.road_factor,
    regions: regions.map((region) => ({
      name: region.name,
      short_name: region.short_name,
      map_label: region.map_label,
      color: region.color,
      center: region.center,
      label_point: region.center,
    })),
  };
}

/**
 * Builds a `city.config.json` compatible with `scripts/seed-city.ts`, so a
 * wizard draft can also be handed to the offline pipeline unchanged.
 */
export function toCityConfigJson(
  basics: CityBasicsDraft,
  regions: RegionDraft[],
): Record<string, unknown> {
  return {
    slug: basics.slug,
    name: basics.name,
    display_name: basics.display_name || basics.name,
    center: basics.center,
    default_zoom: basics.default_zoom,
    min_zoom: basics.min_zoom,
    max_zoom: basics.max_zoom,
    timezone: basics.timezone,
    h3_resolution: basics.h3_resolution,
    fallback_speed_kmh: basics.fallback_speed_kmh,
    road_factor: basics.road_factor,
    settings: { region_adjacency: {} },
    regions: regions.map((region, index) => ({
      region_index: index,
      code: `R${index}`,
      name: region.name,
      short_name: region.short_name,
      map_label: region.map_label,
      tier: "",
      route_status: "Proposed",
      lotr_route: "",
      color: region.color,
      key_areas: "",
      areas_list: [],
      center: region.center,
      label_point: region.center,
      sort_order: index,
    })),
  };
}
