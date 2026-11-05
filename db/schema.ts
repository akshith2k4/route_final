import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  doublePrecision,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
} from "drizzle-orm/pg-core";
import type { Plan } from "../lib/plan";

/**
 * Master hotel list. Plan-specific data such as route assignment belongs in a
 * later plan table; day_plan is stored here while there is only one plan.
 */
export const hotels = pgTable(
  "hotels",
  {
    id: text("id").primaryKey(),
    name: text("name").notNull(),
    address: text("address"),
    latitude: doublePrecision("latitude").notNull(),
    longitude: doublePrecision("longitude").notNull(),
    regionName: text("region_name").notNull(),
    stopMins: integer("stop_mins").notNull().default(15),
    loadBags: integer("load_bags").notNull().default(0),
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
    index("hotels_region_idx").on(table.regionName),
    index("hotels_day_idx").on(table.dayPlan),
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
    check("hotels_rooms_check", sql`${table.rooms} >= 0`),
  ],
);

export const vehicles = pgTable(
  "vehicles",
  {
    id: text("id").primaryKey(),
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
    index("vehicles_name_idx").on(table.name),
    index("vehicles_region_idx").on(table.regionName),
    index("vehicles_is_active_idx").on(table.isActive),
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

export const plans = pgTable("plans", {
  id: text("id").primaryKey(),
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
});

export type HotelRow = typeof hotels.$inferSelect;
export type NewHotelRow = typeof hotels.$inferInsert;
export type VehicleRow = typeof vehicles.$inferSelect;
export type NewVehicleRow = typeof vehicles.$inferInsert;
export type PlanRow = typeof plans.$inferSelect;
