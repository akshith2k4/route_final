import fs from "node:fs";
import { sql } from "drizzle-orm";
import { db } from "../lib/db";
import { hotels, type NewHotelRow } from "../db/schema";

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

type SourceRegion = {
  id: number;
  short_name?: string;
  name: string;
};

type SourcePlanStop = {
  hotel_id: string;
  days?: string[];
};

type SourcePlan = {
  routes: { stops: SourcePlanStop[] }[];
};

function dayPlanFromDays(days: string[] | undefined): NewHotelRow["dayPlan"] {
  const requested = new Set(days ?? ["day1", "day2"]);
  const day1 = requested.has("day1");
  const day2 = requested.has("day2");

  if (day1 && day2) return "daily";
  if (day1) return "day1";
  if (day2) return "day2";
  return "daily";
}

const sourceHotels = JSON.parse(
  fs.readFileSync("data/hotels.json", "utf8"),
) as SourceHotel[];
const sourcePlan = JSON.parse(
  fs.readFileSync("data/plan.json", "utf8"),
) as SourcePlan;
const sourceRegions = JSON.parse(
  fs.readFileSync("data/region_metadata.json", "utf8"),
) as Record<string, SourceRegion>;

const regionNameById = new Map(
  Object.values(sourceRegions).map((region) => [
    region.id,
    region.short_name ?? region.name,
  ]),
);

const dayPlanByHotelId = new Map<string, NewHotelRow["dayPlan"]>();
for (const route of sourcePlan.routes) {
  for (const stop of route.stops) {
    dayPlanByHotelId.set(stop.hotel_id, dayPlanFromDays(stop.days));
  }
}

const rows: NewHotelRow[] = sourceHotels.map((hotel) => ({
  id: hotel.id,
  name: hotel.name,
  address: null,
  latitude: hotel.lat,
  longitude: hotel.lon,
  regionName: regionNameById.get(hotel.region) ?? `Region ${hotel.region}`,
  stopMins: hotel.stop_mins,
  loadBags: hotel.load,
  alternateLoadBags: hotel.load,
  rooms: hotel.rooms ?? 0,
  dayPlan: dayPlanByHotelId.get(hotel.id) ?? "daily",
}));

async function main() {
  await db
    .insert(hotels)
    .values(rows)
    .onConflictDoUpdate({
      target: hotels.id,
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

  const counts = await db
    .select({
      dayPlan: hotels.dayPlan,
      count: sql<number>`count(*)::int`,
    })
    .from(hotels)
    .groupBy(hotels.dayPlan)
    .orderBy(hotels.dayPlan);

  console.log(`Seeded ${rows.length} hotels.`);
  for (const row of counts) {
    console.log(`  ${row.dayPlan.padEnd(11)} ${row.count}`);
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
