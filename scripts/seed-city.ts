/**
 * Seeds one city into the database from its folder under `data/cities/<slug>`.
 *
 * The folder is the authored source of truth produced by the offline pipeline.
 * This script publishes it: the city registry entry, its regions, the
 * reference datasets, and the master hotels, warehouses, laundries and
 * vehicles.
 *
 * Usage:
 *   npm run db:seed:city -- bengaluru
 */
import fs from "node:fs";
import path from "node:path";
import { sql } from "drizzle-orm";
import { db } from "../lib/db";
import {
  cities,
  cityDatasets,
  facilities,
  hotels,
  regions,
  vehicles,
  type NewHotelRow,
} from "../db/schema";
import { clearCityDatasetCache } from "../lib/cities";
import { ensureDefaultPlan } from "../lib/plan-store";
import type { Plan } from "../lib/plan";

type CityConfig = {
  slug: string;
  name: string;
  display_name?: string;
  center: { lat: number; lon: number };
  default_zoom?: number;
  min_zoom?: number;
  max_zoom?: number;
  timezone?: string;
  h3_resolution?: number;
  fallback_speed_kmh?: number;
  road_factor?: number;
  settings?: Record<string, unknown>;
  regions: {
    region_index: number;
    code: string;
    name: string;
    short_name: string;
    map_label: string;
    tier?: string;
    route_status?: string;
    lotr_route?: string;
    color: string;
    key_areas?: string;
    areas_list?: string[];
    center: { lat: number; lon: number };
    label_point: { lat: number; lon: number };
    sort_order?: number;
  }[];
};

type SourceHotel = {
  id: string;
  name: string;
  lat: number;
  lon: number;
  region: number;
  stop_mins: number;
  load: number;
  rooms?: number;
};

type SourceFleet = {
  depots?: {
    id: string;
    name: string;
    latitude: number;
    longitude: number;
    short_name?: string;
    address?: string;
  }[];
  laundries?: {
    id: string;
    name: string;
    latitude: number;
    longitude: number;
    short_name?: string;
    address?: string;
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

type SourcePlan = {
  routes: { stops: { hotel_id: string; days?: string[] }[] }[];
};

const DATA_ROOT = path.join(process.cwd(), "data", "cities");

function readJson<T>(file: string): T | null {
  const full = path.join(DATA_ROOT, file);
  if (!fs.existsSync(full)) return null;
  return JSON.parse(fs.readFileSync(full, "utf8")) as T;
}

function dayPlanFromDays(days: string[] | undefined): NewHotelRow["dayPlan"] {
  const requested = new Set(days ?? ["day1", "day2"]);
  const day1 = requested.has("day1");
  const day2 = requested.has("day2");
  if (day1 && day2) return "daily";
  if (day1) return "day1";
  if (day2) return "day2";
  return "daily";
}

async function main() {
  const slug = process.argv[2] ?? "bengaluru";
  const folder = path.join(DATA_ROOT, slug);
  const configPath = path.join(folder, "city.config.json");

  if (!fs.existsSync(configPath)) {
    throw new Error(
      `No city config found at ${configPath}. Create data/cities/${slug}/city.config.json first.`,
    );
  }

  const config = JSON.parse(fs.readFileSync(configPath, "utf8")) as CityConfig;
  const cityId = config.slug ?? slug;

  // 1. City registry entry.
  await db
    .insert(cities)
    .values({
      id: cityId,
      name: config.name,
      displayName: config.display_name ?? null,
      centerLat: config.center.lat,
      centerLon: config.center.lon,
      defaultZoom: config.default_zoom ?? 11,
      minZoom: config.min_zoom ?? 9,
      maxZoom: config.max_zoom ?? 17,
      timezone: config.timezone ?? "Asia/Kolkata",
      h3Resolution: config.h3_resolution ?? 7,
      fallbackSpeedKmh: config.fallback_speed_kmh ?? 24,
      roadFactor: config.road_factor ?? 1.35,
      settings: (config.settings ?? {}) as never,
      isActive: true,
      sortOrder: 0,
    })
    .onConflictDoUpdate({
      target: cities.id,
      set: {
        name: sql`excluded.name`,
        displayName: sql`excluded.display_name`,
        centerLat: sql`excluded.center_lat`,
        centerLon: sql`excluded.center_lon`,
        defaultZoom: sql`excluded.default_zoom`,
        minZoom: sql`excluded.min_zoom`,
        maxZoom: sql`excluded.max_zoom`,
        timezone: sql`excluded.timezone`,
        h3Resolution: sql`excluded.h3_resolution`,
        fallbackSpeedKmh: sql`excluded.fallback_speed_kmh`,
        roadFactor: sql`excluded.road_factor`,
        settings: sql`excluded.settings`,
        updatedAt: sql`now()`,
      },
    });
  console.log(`Seeded city ${cityId}`);

  // 2. Regions.
  await db
    .insert(regions)
    .values(
      config.regions.map((region) => ({
        cityId,
        regionIndex: region.region_index,
        code: region.code,
        name: region.name,
        shortName: region.short_name,
        mapLabel: region.map_label,
        tier: region.tier ?? null,
        routeStatus: region.route_status ?? null,
        lotrRoute: region.lotr_route ?? null,
        color: region.color,
        keyAreas: region.key_areas ?? null,
        areasList: region.areas_list ?? [],
        centerLat: region.center.lat,
        centerLon: region.center.lon,
        labelLat: region.label_point.lat,
        labelLon: region.label_point.lon,
        sortOrder: region.sort_order ?? region.region_index,
        isActive: true,
      })),
    )
    .onConflictDoUpdate({
      target: [regions.cityId, regions.regionIndex],
      set: {
        code: sql`excluded.code`,
        name: sql`excluded.name`,
        shortName: sql`excluded.short_name`,
        mapLabel: sql`excluded.map_label`,
        tier: sql`excluded.tier`,
        routeStatus: sql`excluded.route_status`,
        lotrRoute: sql`excluded.lotr_route`,
        color: sql`excluded.color`,
        keyAreas: sql`excluded.key_areas`,
        areasList: sql`excluded.areas_list`,
        centerLat: sql`excluded.center_lat`,
        centerLon: sql`excluded.center_lon`,
        labelLat: sql`excluded.label_lat`,
        labelLon: sql`excluded.label_lon`,
        sortOrder: sql`excluded.sort_order`,
      },
    });
  console.log(`Seeded ${config.regions.length} regions`);

  // 3. Reference datasets published by the pipeline.
  const datasetFiles: { kind: string; file: string }[] = [
    { kind: "hex_map", file: "hex_map.json" },
    { kind: "travel_matrix", file: "travel_matrix.json" },
    { kind: "plan_geometries", file: "plan_geometries.json" },
    { kind: "optimized_routes", file: "optimized_routes.json" },
    { kind: "manual_routes", file: "manual_routes.json" },
    { kind: "fleet", file: "fleet.json" },
    { kind: "baseline_plan", file: "plan.json" },
  ];

  let datasetCount = 0;
  for (const dataset of datasetFiles) {
    const payload = readJson<unknown>(
      path.join(slug, dataset.file),
    );
    if (payload === null) continue;

    await db
      .insert(cityDatasets)
      .values({
        id: `${cityId}:${dataset.kind}`,
        cityId,
        kind: dataset.kind,
        version: 1,
        payload: payload as never,
      })
      .onConflictDoUpdate({
        target: cityDatasets.id,
        set: {
          payload: sql`excluded.payload`,
          version: sql`${cityDatasets.version} + 1`,
          updatedAt: sql`now()`,
        },
      });
    datasetCount += 1;
  }
  console.log(`Seeded ${datasetCount} datasets`);

  // 4. Master hotels.
  const sourceHotels = readJson<SourceHotel[]>(path.join(slug, "hotels.json"));
  const sourcePlan = readJson<SourcePlan>(path.join(slug, "plan.json"));

  if (sourceHotels) {
    const regionNameById = new Map(
      config.regions.map((region) => [
        region.region_index,
        region.short_name,
      ]),
    );

    const dayPlanByHotelId = new Map<string, NewHotelRow["dayPlan"]>();
    for (const route of sourcePlan?.routes ?? []) {
      for (const stop of route.stops) {
        dayPlanByHotelId.set(stop.hotel_id, dayPlanFromDays(stop.days));
      }
    }

    await db
      .insert(hotels)
      .values(
        sourceHotels.map((hotel) => ({
          cityId,
          id: hotel.id,
          name: hotel.name,
          address: null,
          latitude: hotel.lat,
          longitude: hotel.lon,
          regionName:
            regionNameById.get(hotel.region) ?? `Region ${hotel.region}`,
          stopMins: hotel.stop_mins,
          loadBags: hotel.load,
          alternateLoadBags: hotel.load,
          rooms: hotel.rooms ?? 0,
          dayPlan: dayPlanByHotelId.get(hotel.id) ?? "daily",
          isActive: true,
        })),
      )
      .onConflictDoUpdate({
        target: [hotels.cityId, hotels.id],
        set: {
          name: sql`excluded.name`,
          latitude: sql`excluded.latitude`,
          longitude: sql`excluded.longitude`,
          regionName: sql`excluded.region_name`,
          stopMins: sql`excluded.stop_mins`,
          loadBags: sql`excluded.load_bags`,
          alternateLoadBags: sql`excluded.alternate_load_bags`,
          rooms: sql`excluded.rooms`,
          dayPlan: sql`excluded.day_plan`,
          updatedAt: sql`now()`,
        },
      });
    console.log(`Seeded ${sourceHotels.length} hotels`);
  }

  // 5. Warehouses and laundries.
  const fleet = readJson<SourceFleet>(path.join(slug, "fleet.json"));
  const facilityRows = [
    ...(fleet?.depots ?? []).map((depot) => ({
      cityId,
      id: depot.id,
      name: depot.name,
      shortName: depot.short_name ?? depot.name.slice(0, 8),
      address: depot.address ?? null,
      latitude: depot.latitude,
      longitude: depot.longitude,
      isWarehouse: true,
      isLaundry: false,
      serviceMins: 180,
      isActive: true,
    })),
    ...(fleet?.laundries ?? []).map((laundry) => ({
      cityId,
      id: laundry.id,
      name: laundry.name,
      shortName: laundry.short_name ?? laundry.name.slice(0, 8),
      address: laundry.address ?? null,
      latitude: laundry.latitude,
      longitude: laundry.longitude,
      isWarehouse: false,
      isLaundry: true,
      serviceMins: laundry.service_mins ?? 180,
      isActive: true,
    })),
  ];

  if (facilityRows.length > 0) {
    await db
      .insert(facilities)
      .values(facilityRows)
      .onConflictDoUpdate({
        target: [facilities.cityId, facilities.id],
        set: {
          name: sql`excluded.name`,
          shortName: sql`excluded.short_name`,
          address: sql`excluded.address`,
          latitude: sql`excluded.latitude`,
          longitude: sql`excluded.longitude`,
          isWarehouse: sql`excluded.is_warehouse`,
          isLaundry: sql`excluded.is_laundry`,
          serviceMins: sql`excluded.service_mins`,
          updatedAt: sql`now()`,
        },
      });
    console.log(`Seeded ${facilityRows.length} facilities`);
  }

  // 6. Fleet vehicles.
  const fleetVehicles = fleet?.vehicles ?? [];
  if (fleetVehicles.length > 0) {
    const primaryDepotId = fleet?.depots?.[0]?.id ?? "depot-primary";
    const safetyBuffer = fleet?.safety_buffer_pct ?? 90;

    await db
      .insert(vehicles)
      .values(
        fleetVehicles.map((vehicle) => ({
          cityId,
          id: `vehicle-${vehicle.id}`,
          name: vehicle.label,
          realCapacity: vehicle.nominal_capacity,
          color: vehicle.color,
          regionId: vehicle.region_id,
          regionName: vehicle.region_name,
          sector: vehicle.sector,
          depotId: vehicle.depot_id ?? primaryDepotId,
          departureTime: vehicle.departure_time ?? "07:00",
          returnTime: vehicle.return_time ?? "17:00",
          isActive: true,
        })),
      )
      .onConflictDoUpdate({
        target: [vehicles.cityId, vehicles.id],
        set: {
          name: sql`excluded.name`,
          realCapacity: sql`excluded.real_capacity`,
          color: sql`excluded.color`,
          regionId: sql`excluded.region_id`,
          regionName: sql`excluded.region_name`,
          sector: sql`excluded.sector`,
          depotId: sql`excluded.depot_id`,
          departureTime: sql`excluded.departure_time`,
          returnTime: sql`excluded.return_time`,
          updatedAt: sql`now()`,
        },
      });
    console.log(`Seeded ${fleetVehicles.length} vehicles`);
  }

  // 7. Baseline plan.
  const baselinePlan = readJson<Plan>(path.join(slug, "plan.json"));
  if (baselinePlan) {
    await ensureDefaultPlan(cityId, baselinePlan);
    console.log(`Ensured baseline plan ${baselinePlan.plan_id}`);
  }

  clearCityDatasetCache();
  console.log(`\nCity "${cityId}" is ready.`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
