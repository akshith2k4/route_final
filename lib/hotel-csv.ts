/**
 * Hotel CSV import — mirrors the existing format exactly:
 *
 *   Hotel Name,Bags Demand,Assigned Route ID,Assigned Route Name,Stop Sequence,Region,Latitude,Longitude,Service Mins
 *
 * `Region` is a code such as R4. When it is blank or unknown, the hotel is
 * auto-assigned to the nearest region centre. Hotel ids come from the same
 * pipeline-09 slug logic used by `seed-city.ts`, so imports are stable.
 */
import { haversineKm, type RegionMeta } from "./coverage";
import { ensureHotelIds } from "./city-pipeline";
import type { HotelInput } from "./hotels";

export type HotelCsvRow = {
  line: number;
  name: string;
  bags: number;
  latitude: number;
  longitude: number;
  serviceMins: number;
  regionCode: string;
  rooms: number;
  routeId: string;
  routeName: string;
  errors: string[];
};

/** Splits one CSV line, honouring double-quoted fields and escaped quotes. */
function splitCsvLine(line: string): string[] {
  const cells: string[] = [];
  let current = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i += 1) {
    const char = line[i];
    if (char === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i += 1;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (char === "," && !inQuotes) {
      cells.push(current);
      current = "";
    } else {
      current += char;
    }
  }
  cells.push(current);
  return cells.map((cell) => cell.trim());
}

const HEADER_ALIASES: Record<string, string[]> = {
  name: ["hotel name", "name", "hotel"],
  bags: ["bags demand", "bags", "load bags", "daily bags", "load"],
  routeId: ["assigned route id", "route id"],
  routeName: ["assigned route name", "route name"],
  stopSequence: ["stop sequence", "stop"],
  region: ["region"],
  latitude: ["latitude", "lat"],
  longitude: ["longitude", "lon", "lng"],
  serviceMins: ["service mins", "service minutes", "stop mins", "stop minutes"],
  rooms: ["rooms", "rooms count"],
  address: ["address"],
};

function mapHeaders(header: string[]): Record<string, number> {
  const map: Record<string, number> = {};
  header.forEach((raw, index) => {
    const key = raw.toLowerCase().replace(/\s+/g, " ").trim();
    for (const [canonical, aliases] of Object.entries(HEADER_ALIASES)) {
      if (aliases.includes(key)) {
        map[canonical] = index;
        break;
      }
    }
  });
  return map;
}

function cell(row: string[], index: number | undefined): string {
  return index !== undefined ? row[index]?.trim() ?? "" : "";
}

function toNumber(value: string): number {
  if (!value) return Number.NaN;
  return Number(value.replace(/,/g, ""));
}

/** Parses the CSV text into normalized rows with per-line validation errors. */
export function parseHotelCsv(
  text: string,
  regions: RegionMeta[],
): { rows: HotelCsvRow[]; headers: string[]; error?: string } {
  const lines = text
    .replace(/^\uFEFF/, "")
    .split(/\r?\n/)
    .filter((line) => line.trim().length > 0);
  if (lines.length < 2) {
    return { rows: [], headers: [], error: "The CSV is empty or has no data rows." };
  }

  const headers = splitCsvLine(lines[0]);
  const index = mapHeaders(headers);
  const required = ["name", "bags", "latitude", "longitude", "serviceMins"];
  const missing = required.filter((key) => index[key] === undefined);
  if (missing.length > 0) {
    return {
      rows: [],
      headers,
      error: `Missing required column(s): ${missing.join(", ")}. Expected the standard hotel CSV format.`,
    };
  }

  const regionByCode = new Map(regions.map((region) => [region.code.toLowerCase(), region]));
  const rows: HotelCsvRow[] = [];

  for (let i = 1; i < lines.length; i += 1) {
    const values = splitCsvLine(lines[i]);
    const errors: string[] = [];
    const name = cell(values, index.name);
    const bags = toNumber(cell(values, index.bags));
    const latitude = toNumber(cell(values, index.latitude));
    const longitude = toNumber(cell(values, index.longitude));
    const serviceMins = toNumber(cell(values, index.serviceMins));
    const roomsRaw = cell(values, index.rooms);
    const rooms = roomsRaw ? toNumber(roomsRaw) : 0;
    const regionCode = cell(values, index.region);

    if (!name) errors.push("Hotel name is required.");
    else if (name.length > 120) errors.push("Hotel name is too long (max 120).");
    if (!Number.isFinite(bags) || bags < 0) errors.push("Bags must be a number ≥ 0.");
    if (!Number.isFinite(latitude) || latitude < -90 || latitude > 90) {
      errors.push("Latitude must be between -90 and 90.");
    }
    if (!Number.isFinite(longitude) || longitude < -180 || longitude > 180) {
      errors.push("Longitude must be between -180 and 180.");
    }
    if (!Number.isFinite(serviceMins) || serviceMins < 0) {
      errors.push("Service minutes must be a number ≥ 0.");
    }
    if (roomsRaw && (!Number.isFinite(rooms) || rooms < 0)) {
      errors.push("Rooms must be a number ≥ 0.");
    }

    let resolvedRegion = regionByCode.get(regionCode.toLowerCase());
    if (regionCode && !resolvedRegion) {
      errors.push(`Unknown region code "${regionCode}".`);
    }
    if (!resolvedRegion && Number.isFinite(latitude) && Number.isFinite(longitude) && regions.length > 0) {
      let best = regions[0];
      let bestDistance = Number.POSITIVE_INFINITY;
      for (const region of regions) {
        const distance = haversineKm(latitude, longitude, region.center.lat, region.center.lon);
        if (distance < bestDistance) {
          bestDistance = distance;
          best = region;
        }
      }
      resolvedRegion = best;
    }

    rows.push({
      line: i + 1,
      name,
      bags,
      latitude,
      longitude,
      serviceMins,
      regionCode: resolvedRegion?.code ?? regionCode,
      rooms: Number.isFinite(rooms) ? rooms : 0,
      routeId: cell(values, index.routeId),
      routeName: cell(values, index.routeName),
      errors,
    });
  }

  return { rows, headers };
}

export type ParsedHotel = {
  id: string;
  input: HotelInput;
  sourceLine: number;
};

/** Converts valid parsed rows into hotel inputs, assigning pipeline-09 ids. */
export function toHotelInputs(rows: HotelCsvRow[], regions: RegionMeta[]): ParsedHotel[] {
  const regionByCode = new Map(regions.map((region) => [region.code.toLowerCase(), region]));
  const valid = rows.filter((row) => row.errors.length === 0);
  const withIds = ensureHotelIds(valid.map((row) => ({ id: "", name: row.name })));

  return valid.map((row, index) => {
    const region = regionByCode.get(row.regionCode.toLowerCase());
    return {
      id: withIds[index].id,
      sourceLine: row.line,
      input: {
        name: row.name,
        address: null,
        latitude: row.latitude,
        longitude: row.longitude,
        regionName: region?.short_name ?? row.regionCode,
        stopMins: Math.round(row.serviceMins),
        loadBags: Math.round(row.bags),
        alternateLoadBags: Math.round(row.bags),
        rooms: Math.round(row.rooms),
        dayPlan: "daily",
      },
    };
  });
}

/** The canonical CSV template, matching the existing export. */
export const HOTEL_CSV_TEMPLATE =
  "Hotel Name,Bags Demand,Assigned Route ID,Assigned Route Name,Stop Sequence,Region,Latitude,Longitude,Service Mins\n";
