import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  doublePrecision,
  index,
  integer,
  pgTable,
  text,
  timestamp,
} from "drizzle-orm/pg-core";

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

export type HotelRow = typeof hotels.$inferSelect;
export type NewHotelRow = typeof hotels.$inferInsert;
