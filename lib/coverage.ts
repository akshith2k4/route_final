import { latLngToCell } from "h3-js";

export const H3_RESOLUTION = 7;
export const BENGALURU_CENTER = { lat: 12.9716, lon: 77.5946 };

export type RegionMeta = {
  id: number;
  code: string;
  name: string;
  short_name: string;
  tier: string;
  route_status: string;
  lotr_route: string;
  color: string;
  key_areas: string;
  areas_list: string[];
};

export type Hotel = {
  name: string;
  lat: number;
  lon: number;
  region: number;
  stop_mins: number;
  load: number;
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
  name: string;
  lat: number;
  lon: number;
  arrival_time: string;
  departure_time: string;
  stop_mins: number;
  load_bags: number;
};

export type DispatchRoute = {
  region_id: number;
  region_name: string;
  vehicle_label: string;
  color: string;
  nominal_cap: number;
  max_load: number;
  departure_hq: string;
  return_hq: string;
  total_hotels: number;
  total_dist_km: number;
  total_drive_mins: number;
  total_service_mins: number;
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

export function formatMins(mins: number): string {
  if (!mins || mins <= 0) return "0m";
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  if (h === 0) return `${m}m`;
  if (m === 0) return `${h}h`;
  return `${h}h ${m < 10 ? "0" : ""}${m}m`;
}

/** Hand-checked visual centres for the five region labels (from urban_centroids.csv). */
export const REGION_CENTERS: Record<number, { lat: number; lon: number }> = {
  0: { lat: 12.882914605295358, lon: 77.64500513464189 },
  1: { lat: 12.975316953872893, lon: 77.6055154047403 },
  2: { lat: 13.044628141029369, lon: 77.60090651569858 },
  3: { lat: 12.976705032915488, lon: 77.7142173486534 },
  4: { lat: 12.904112866412287, lon: 77.58571315594017 },
};

/** Label anchor points, nudged apart so the five map labels never collide. */
export const REGION_LABEL_POINTS: Record<number, { lat: number; lon: number }> =
  {
    0: { lat: 12.905, lon: 77.67 },
    1: { lat: 12.985, lon: 77.6 },
    2: { lat: 13.06, lon: 77.6 },
    3: { lat: 12.99, lon: 77.73 },
    4: { lat: 12.89, lon: 77.56 },
  };

export const REGION_MAP_LABELS: Record<number, string> = {
  0: "South-East",
  1: "Central",
  2: "North & West",
  3: "East",
  4: "South",
};

export function hotelKey(hotel: Hotel): string {
  return `${hotel.name}::${hotel.lat.toFixed(5)}::${hotel.lon.toFixed(5)}`;
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

export function nearestRegionId(lat: number, lon: number): number {
  let bestId = 0;
  let bestDistance = Number.POSITIVE_INFINITY;

  for (const [rawId, center] of Object.entries(REGION_CENTERS)) {
    const distance = haversineKm(lat, lon, center.lat, center.lon);
    if (distance < bestDistance) {
      bestDistance = distance;
      bestId = Number(rawId);
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
): CoordinateResult {
  let cell = "";
  let mappedRegion: number | undefined;

  try {
    cell = latLngToCell(lat, lon, H3_RESOLUTION);
    mappedRegion = hexMap[cell];
  } catch {
    cell = "";
  }

  const inside = mappedRegion !== undefined;
  let regionId = mappedRegion ?? nearestRegionId(lat, lon);

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
    centerDistanceKm: haversineKm(
      BENGALURU_CENTER.lat,
      BENGALURU_CENTER.lon,
      lat,
      lon,
    ),
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
