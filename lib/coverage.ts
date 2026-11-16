import { latLngToCell } from "h3-js";

/** Default H3 resolution when a city does not override it. */
/** H3 resolution used when a city has not published its own. */
export const DEFAULT_H3_RESOLUTION = 7;

export type RegionMeta = {
  /** Region index inside its city. */
  id: number;
  code: string;
  name: string;
  short_name: string;
  /** Short label drawn on the map. */
  map_label: string;
  tier: string;
  route_status: string;
  lotr_route: string;
  color: string;
  key_areas: string;
  areas_list: string[];
  /** Visual centre of the region, used for nearest-region lookups. */
  center: { lat: number; lon: number };
  /** Label anchor point, nudged apart so map labels never collide. */
  label_point: { lat: number; lon: number };
};

export type Hotel = {
  id: string;
  name: string;
  lat: number;
  lon: number;
  region: number;
  stop_mins: number;
  load: number;
  locality?: string;
  bags_normal?: number;
  bags?: number;
};

export type HexMap = Record<string, number>;

export type CoordinateResult = {
  lat: number;
  lon: number;
  cell: string;
  inside: boolean;
  regionId: number;
  nearestHotel: Hotel | null;
  nearestDistanceKm: number;
  centerDistanceKm: number;
};

export type ParsedCoordinate =
  | { ok: true; lat: number; lon: number }
  | { ok: false; error: string };

export type DispatchStop = {
  stop_number: number;
  hotel_id?: string;
  name: string;
  lat: number;
  lon: number;
  arrival_time: string;
  departure_time: string;
  stop_mins: number;
  load_bags: number;
  region?: number;
  address_locality?: string;
};

export type DispatchRoute = {
  route_id?: string;
  vehicle_id?: number;
  region_id?: number;
  region_name?: string;
  vehicle_label: string;
  color: string;
  nominal_cap: number;
  nominal_capacity?: number;
  max_load: number;
  max_load_90pct?: number;
  departure_hq?: string;
  return_hq?: string;
  total_hotels: number;
  total_dist_km: number;
  total_drive_mins: number;
  total_service_mins: number;
  shift_duration_mins?: number;
  total_bags: number;
  capacity_utilization_pct: number;
  stops: DispatchStop[];
  path_coordinates: [number, number][];
};

export type FleetDepot = {
  name: string;
  latitude: number;
  longitude: number;
};

export type StudioDepot = {
  id: string;
  name: string;
  latitude: number;
  longitude: number;
  isPrimary?: boolean;
};

/**
 * The per-city fleet definition published by the offline pipeline. Each city
 * owns its own warehouses, laundries and vehicles.
 */
export type CityFleet = {
  depot?: {
    name: string;
    latitude: number;
    longitude: number;
  };
  depots?: {
    id: string;
    name: string;
    latitude: number;
    longitude: number;
    short_name?: string;
  }[];
  laundries?: {
    id: string;
    name: string;
    latitude: number;
    longitude: number;
    short_name?: string;
    service_mins?: number;
  }[];
  safety_buffer_pct?: number;
  vehicles?: {
    id: number;
    label: string;
    region_id: number;
    region_name: string;
    sector: string;
    nominal_capacity: number;
    max_load_90pct?: number;
    color: string;
    depot_id?: string;
    departure_time?: string;
    return_time?: string;
  }[];
};

export type StudioVehicle = {
  id: number;
  label: string;
  region_id: number;
  region_name: string;
  sector: string;
  color: string;
  enabled: boolean;
  nominal_capacity: number;
  max_load: number;
  depot_id: string;
  departure_time: string;
  return_time: string;
};

export type HotelPriority = "VIP" | "High" | "Normal" | "Flexible";

export type StudioHotelSetting = {
  name: string;
  selected: boolean;
  timeWindowEnabled: boolean;
  earliestArrival: string;
  latestArrival: string;
  priority: HotelPriority;
  customBags?: number;
  customStopMins?: number;
};

export type StudioShiftSetting = {
  earliestDeparture: string;
  latestReturn: string;
  lunchBreakEnabled: boolean;
  lunchDurationMins: number;
  lunchWindowStart: string;
  lunchWindowEnd: string;
};

export const DEFAULT_SHIFT_SETTINGS: StudioShiftSetting = {
  earliestDeparture: "07:00",
  latestReturn: "17:00",
  lunchBreakEnabled: true,
  lunchDurationMins: 45,
  lunchWindowStart: "12:30",
  lunchWindowEnd: "14:00",
};



export function formatMins(mins: number): string {
  if (!mins || mins <= 0) return "0m";
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  if (h === 0) return `${m}m`;
  if (m === 0) return `${h}h`;
  return `${h}h ${m < 10 ? "0" : ""}${m}m`;
}

/**
 * Warehouses a city dispatches from. The primary warehouse is the first
 * entry, matching the depot ordering in the fleet definition.
 */
export function fleetDepots(fleet: CityFleet | null | undefined): StudioDepot[] {
  const depots = fleet?.depots ?? [];
  if (depots.length > 0) {
    return depots.map((depot, index) => ({
      id: depot.id,
      name: depot.name,
      latitude: depot.latitude,
      longitude: depot.longitude,
      isPrimary: index === 0,
    }));
  }
  if (fleet?.depot) {
    return [
      {
        id: "depot-primary",
        name: fleet.depot.name,
        latitude: fleet.depot.latitude,
        longitude: fleet.depot.longitude,
        isPrimary: true,
      },
    ];
  }
  return [];
}

/** Vehicles a city can dispatch, with the fleet's 90% safe load applied. */
export function fleetVehicles(
  fleet: CityFleet | null | undefined,
): StudioVehicle[] {
  const vehicles = fleet?.vehicles ?? [];
  if (vehicles.length === 0) return [];

  const primaryDepotId = fleet?.depots?.[0]?.id ?? "depot-primary";
  const safetyBuffer = fleet?.safety_buffer_pct ?? 90;

  return vehicles.map((vehicle) => ({
    id: vehicle.id,
    label: vehicle.label,
    region_id: vehicle.region_id,
    region_name: vehicle.region_name,
    sector: vehicle.sector,
    color: vehicle.color,
    enabled: true,
    nominal_capacity: vehicle.nominal_capacity,
    max_load:
      vehicle.max_load_90pct ??
      Math.max(
        1,
        Math.floor((vehicle.nominal_capacity * safetyBuffer) / 100),
      ),
    depot_id: vehicle.depot_id ?? primaryDepotId,
    departure_time: vehicle.departure_time ?? "07:00",
    return_time: vehicle.return_time ?? "17:00",
  }));
}

export function hotelKey(hotel: Hotel): string {
  return hotel.id || `${hotel.name}::${hotel.lat.toFixed(5)}::${hotel.lon.toFixed(5)}`;
}

export function haversineKm(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number,
): number {
  const radius = 6371;
  const toRad = (value: number) => (value * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;

  return radius * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/** The region whose centre is closest to a coordinate. */
export function nearestRegionId(
  lat: number,
  lon: number,
  regions: RegionMeta[],
): number {
  let bestId = regions[0]?.id ?? 0;
  let bestDistance = Number.POSITIVE_INFINITY;

  for (const region of regions) {
    const distance = haversineKm(lat, lon, region.center.lat, region.center.lon);
    if (distance < bestDistance) {
      bestDistance = distance;
      bestId = region.id;
    }
  }

  return bestId;
}

export function parseCoordinate(input: string): ParsedCoordinate {
  const matches = input.match(/-?\d+(?:\.\d+)?/g);

  if (!matches || matches.length !== 2) {
    return {
      ok: false,
      error: "Enter one latitude and one longitude, separated by a comma.",
    };
  }

  const lat = Number(matches[0]);
  const lon = Number(matches[1]);

  if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
    return { ok: false, error: "Those coordinates don’t look numeric." };
  }

  if (lat < -90 || lat > 90) {
    return { ok: false, error: "Latitude must sit between -90 and 90." };
  }

  if (lon < -180 || lon > 180) {
    return { ok: false, error: "Longitude must sit between -180 and 180." };
  }

  return { ok: true, lat, lon };
}

export function resolveCoordinate(
  lat: number,
  lon: number,
  hexMap: HexMap,
  hotels: Hotel[],
  regions: RegionMeta[],
  center: { lat: number; lon: number },
  h3Resolution: number = DEFAULT_H3_RESOLUTION,
): CoordinateResult {
  let cell = "";
  let mappedRegion: number | undefined;

  try {
    cell = latLngToCell(lat, lon, h3Resolution);
    mappedRegion = hexMap[cell];
  } catch {
    cell = "";
  }

  const inside = mappedRegion !== undefined;
  let regionId = mappedRegion ?? nearestRegionId(lat, lon, regions);

  if (!regions.some((region) => region.id === regionId)) {
    regionId = regions[0]?.id ?? 0;
  }

  let nearestHotel: Hotel | null = null;
  let nearestDistanceKm = Number.POSITIVE_INFINITY;

  for (const hotel of hotels) {
    const distance = haversineKm(lat, lon, hotel.lat, hotel.lon);
    if (distance < nearestDistanceKm) {
      nearestDistanceKm = distance;
      nearestHotel = hotel;
    }
  }

  return {
    lat,
    lon,
    cell,
    inside,
    regionId,
    nearestHotel,
    nearestDistanceKm,
    centerDistanceKm: haversineKm(center.lat, center.lon, lat, lon),
  };
}

export function formatDistance(km: number): string {
  if (!Number.isFinite(km)) return "—";
  if (km < 1) return `${Math.round(km * 1000)} m`;
  return `${km.toFixed(km < 10 ? 2 : 1)} km`;
}

export function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}
