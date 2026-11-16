/**
 * Starter presets for the onboarding wizard.
 *
 * The Delhi preset gives the manager a running start: sensible city basics
 * and five editable starter regions. Everything can be renamed, re-coloured,
 * moved or deleted in the wizard — it is a template, not a decision.
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

export const DELHI_BASICS: CityBasicsDraft = {
  name: "Delhi",
  display_name: "Delhi NCR",
  slug: "delhi",
  timezone: "Asia/Kolkata",
  center: { lat: 28.6139, lon: 77.209 },
  default_zoom: 11,
  min_zoom: 9,
  max_zoom: 17,
  h3_resolution: 7,
  fallback_speed_kmh: 24,
  road_factor: 1.35,
};

/** Approximate starter territories — the manager adjusts them on the map. */
export const DELHI_STARTER_REGIONS: Omit<RegionDraft, "id">[] = [
  {
    name: "Central Delhi: Connaught Place, Karol Bagh & Paharganj",
    short_name: "CP, Karol Bagh & Paharganj",
    map_label: "Central",
    color: "#2563EB",
    center: { lat: 28.6328, lon: 77.2197 },
  },
  {
    name: "South Delhi: Saket, Hauz Khas, GK & Vasant Kunj",
    short_name: "Saket, Hauz Khas & GK",
    map_label: "South",
    color: "#F59E0B",
    center: { lat: 28.5245, lon: 77.1855 },
  },
  {
    name: "West Delhi: Rajouri Garden, Punjabi Bagh & Janakpuri",
    short_name: "Rajouri Garden & Janakpuri",
    map_label: "West",
    color: "#0891B2",
    center: { lat: 28.6415, lon: 77.1209 },
  },
  {
    name: "North Delhi: Model Town, Rohini & Pitampura",
    short_name: "Model Town, Rohini & Pitampura",
    map_label: "North",
    color: "#10B981",
    center: { lat: 28.71, lon: 77.1 },
  },
  {
    name: "East Delhi: Laxmi Nagar, Preet Vihar & Mayur Vihar",
    short_name: "Laxmi Nagar & Mayur Vihar",
    map_label: "East",
    color: "#EF4444",
    center: { lat: 28.6304, lon: 77.2773 },
  },
];

export function delhiStarterRegions(): RegionDraft[] {
  return DELHI_STARTER_REGIONS.map((region) => ({
    ...region,
    id: nextRegionId(),
  }));
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
