import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  doublePrecision,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import type { Plan } from "../lib/plan";
import type { CitySettings } from "../lib/city-types";

/**
 * City registry. Every operational record belongs to exactly one city, so a
 * deployment can serve Bengaluru, Delhi, or any other city from one app.
 */
export const cities = pgTable(
  "cities",
  {
    /** URL slug, for example "bengaluru". */
    id: text("id").primaryKey(),
    name: text("name").notNull(),
    /** Optional longer label used in page titles, for example "Bengaluru Urban". */
    displayName: text("display_name"),
    centerLat: doublePrecision("center_lat").notNull(),
    centerLon: doublePrecision("center_lon").notNull(),
    defaultZoom: integer("default_zoom").notNull().default(11),
    minZoom: integer("min_zoom").notNull().default(9),
    maxZoom: integer("max_zoom").notNull().default(17),
    timezone: text("timezone").notNull().default("Asia/Kolkata"),
    /** H3 resolution used for the coverage hex map of this city. */
    h3Resolution: integer("h3_resolution").notNull().default(7),
    /** Fallback average logistics speed in km/h when a leg is not in the matrix. */
    fallbackSpeedKmh: doublePrecision("fallback_speed_kmh").notNull().default(24),
    /** Straight-line to road-distance multiplier for estimated legs. */
    roadFactor: doublePrecision("road_factor").notNull().default(1.35),
    settings: jsonb("settings").$type<CitySettings>().notNull().default({}),
    isActive: boolean("is_active").notNull().default(true),
    sortOrder: integer("sort_order").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("cities_is_active_idx").on(table.isActive),
    index("cities_sort_order_idx").on(table.sortOrder),
    check("cities_latitude_check", sql`${table.centerLat} between -90 and 90`),
    check("cities_longitude_check", sql`${table.centerLon} between -180 and 180`),
  ],
);

/**
 * Operational regions inside a city. Region indices are unique per city so
 * the numeric `region` field on hotel records and hex maps stays meaningful.
 */
export const regions = pgTable(
  "regions",
  {
    cityId: text("city_id")
      .notNull()
      .references(() => cities.id, { onDelete: "cascade" }),
    /** Zero-based region index within the city. */
    regionIndex: integer("region_index").notNull(),
    code: text("code").notNull(),
    name: text("name").notNull(),
    shortName: text("short_name").notNull(),
    /** Short label drawn on the map. */
    mapLabel: text("map_label").notNull(),
    tier: text("tier"),
    routeStatus: text("route_status"),
    lotrRoute: text("lotr_route"),
    color: text("color").notNull().default("#3b82f6"),
    keyAreas: text("key_areas"),
    areasList: jsonb("areas_list").$type<string[]>().notNull().default([]),
    /** Visual centre of the region, used for nearest-region lookups. */
    centerLat: doublePrecision("center_lat").notNull(),
    centerLon: doublePrecision("center_lon").notNull(),
    /** Label anchor point, nudged apart so map labels never collide. */
    labelLat: doublePrecision("label_lat").notNull(),
    labelLon: doublePrecision("label_lon").notNull(),
    sortOrder: integer("sort_order").notNull().default(0),
    isActive: boolean("is_active").notNull().default(true),
  },
  (table) => [
    primaryKey({ columns: [table.cityId, table.regionIndex] }),
    uniqueIndex("regions_city_code_idx").on(table.cityId, table.code),
    index("regions_city_idx").on(table.cityId),
    check("regions_latitude_check", sql`${table.centerLat} between -90 and 90`),
    check(
      "regions_longitude_check",
      sql`${table.centerLon} between -180 and 180`,
    ),
  ],
);

/**
 * Read-only per-city reference data produced by the offline pipeline: hex
 * maps, travel matrices, route geometries, optimized dispatch routes and the
 * fleet definition.
 */
export const cityDatasets = pgTable(
  "city_datasets",
  {
    /** `${cityId}:${kind}`, for example "bengaluru:travel_matrix". */
    id: text("id").primaryKey(),
    cityId: text("city_id")
      .notNull()
      .references(() => cities.id, { onDelete: "cascade" }),
    kind: text("kind").notNull(),
    version: integer("version").notNull().default(1),
    payload: jsonb("payload").notNull(),
    generatedAt: timestamp("generated_at", { withTimezone: true }),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex("city_datasets_city_kind_idx").on(table.cityId, table.kind),
    index("city_datasets_city_idx").on(table.cityId),
  ],
);

/**
 * Master hotel list. Plan-specific data such as route assignment belongs in a
 * later plan table; day_plan is stored here while there is only one plan.
 */
export const hotels = pgTable(
  "hotels",
  {
    cityId: text("city_id")
      .notNull()
      .references(() => cities.id, { onDelete: "cascade" })
      .default("bengaluru"),
    id: text("id").notNull(),
    name: text("name").notNull(),
    address: text("address"),
    latitude: doublePrecision("latitude").notNull(),
    longitude: doublePrecision("longitude").notNull(),
    regionName: text("region_name").notNull(),
    stopMins: integer("stop_mins").notNull().default(15),
    /** Bags per service when the hotel runs every day. */
    loadBags: integer("load_bags").notNull().default(0),
    /** Bags per service when the hotel runs on Day 1 or Day 2 only. */
    alternateLoadBags: integer("alternate_load_bags").notNull().default(0),
    rooms: integer("rooms").notNull().default(0),
    dayPlan: text("day_plan").notNull().default("daily"),
    isActive: boolean("is_active").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    primaryKey({ columns: [table.cityId, table.id] }),
    index("hotels_city_region_idx").on(table.cityId, table.regionName),
    index("hotels_city_day_idx").on(table.cityId, table.dayPlan),
    index("hotels_name_idx").on(table.name),
    check(
      "hotels_day_plan_check",
      sql`${table.dayPlan} in ('daily', 'day1', 'day2')`,
    ),
    check(
      "hotels_latitude_check",
      sql`${table.latitude} between -90 and 90`,
    ),
    check(
      "hotels_longitude_check",
      sql`${table.longitude} between -180 and 180`,
    ),
    check("hotels_stop_mins_check", sql`${table.stopMins} >= 0`),
    check("hotels_load_bags_check", sql`${table.loadBags} >= 0`),
    check(
      "hotels_alternate_load_bags_check",
      sql`${table.alternateLoadBags} >= 0`,
    ),
    check("hotels_rooms_check", sql`${table.rooms} >= 0`),
  ],
);

export const vehicles = pgTable(
  "vehicles",
  {
    cityId: text("city_id")
      .notNull()
      .references(() => cities.id, { onDelete: "cascade" })
      .default("bengaluru"),
    id: text("id").notNull(),
    name: text("name").notNull(),
    realCapacity: integer("real_capacity").notNull().default(40),
    safeCapacity: integer("safe_capacity")
      .generatedAlwaysAs(sql`GREATEST(1, FLOOR(real_capacity * 0.9)::integer)`)
      .notNull(),
    color: text("color").notNull().default("#3b82f6"),
    regionId: integer("region_id"),
    regionName: text("region_name"),
    sector: text("sector"),
    depotId: text("depot_id").notNull().default("depot-yeshwanthpur"),
    departureTime: text("departure_time").notNull().default("07:00"),
    returnTime: text("return_time").notNull().default("17:00"),
    isActive: boolean("is_active").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    primaryKey({ columns: [table.cityId, table.id] }),
    index("vehicles_name_idx").on(table.name),
    index("vehicles_city_region_idx").on(table.cityId, table.regionName),
    index("vehicles_city_is_active_idx").on(table.cityId, table.isActive),
    check(
      "vehicles_real_capacity_check",
      sql`${table.realCapacity} > 0`,
    ),
    check(
      "vehicles_safe_capacity_check",
      sql`${table.safeCapacity} > 0`,
    ),
  ],
);

export const facilities = pgTable(
  "facilities",
  {
    cityId: text("city_id")
      .notNull()
      .references(() => cities.id, { onDelete: "cascade" })
      .default("bengaluru"),
    id: text("id").notNull(),
    name: text("name").notNull(),
    shortName: text("short_name").notNull(),
    address: text("address"),
    latitude: doublePrecision("latitude").notNull(),
    longitude: doublePrecision("longitude").notNull(),
    isWarehouse: boolean("is_warehouse").notNull().default(false),
    isLaundry: boolean("is_laundry").notNull().default(false),
    serviceMins: integer("service_mins").notNull().default(180),
    isActive: boolean("is_active").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    primaryKey({ columns: [table.cityId, table.id] }),
    index("facilities_name_idx").on(table.name),
    index("facilities_city_is_active_idx").on(table.cityId, table.isActive),
    check(
      "facilities_role_check",
      sql`${table.isWarehouse} = true or ${table.isLaundry} = true`,
    ),
    check(
      "facilities_latitude_check",
      sql`${table.latitude} between -90 and 90`,
    ),
    check(
      "facilities_longitude_check",
      sql`${table.longitude} between -180 and 180`,
    ),
    check("facilities_service_mins_check", sql`${table.serviceMins} >= 0`),
  ],
);

export const plans = pgTable("plans", {
  id: text("id").primaryKey(),
  cityId: text("city_id")
    .notNull()
    .references(() => cities.id, { onDelete: "cascade" })
    .default("bengaluru"),
  name: text("name").notNull(),
  status: text("status").notNull().default("draft"),
  data: jsonb("data").$type<Plan>().notNull(),
  version: integer("version").notNull().default(1),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
}, (table) => [
  index("plans_city_updated_idx").on(table.cityId, table.updatedAt),
]);

export type CityRow = typeof cities.$inferSelect;
export type NewCityRow = typeof cities.$inferInsert;
export type RegionRow = typeof regions.$inferSelect;
export type NewRegionRow = typeof regions.$inferInsert;
export type CityDatasetRow = typeof cityDatasets.$inferSelect;
export type NewCityDatasetRow = typeof cityDatasets.$inferInsert;
export type HotelRow = typeof hotels.$inferSelect;
export type NewHotelRow = typeof hotels.$inferInsert;
export type VehicleRow = typeof vehicles.$inferSelect;
export type NewVehicleRow = typeof vehicles.$inferInsert;
export type FacilityRow = typeof facilities.$inferSelect;
export type NewFacilityRow = typeof facilities.$inferInsert;
export type PlanRow = typeof plans.$inferSelect;
