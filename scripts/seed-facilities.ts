import { sql } from "drizzle-orm";
import { db } from "../lib/db";
import { facilities, type NewFacilityRow } from "../db/schema";

export const SEED_FACILITIES: NewFacilityRow[] = [
  {
    id: "depot-yeshwanthpur",
    name: "LinenGrass HQ (Yeshwanthpur Central Laundry)",
    shortName: "HQ",
    address: "Yeshwanthpur, Bengaluru",
    latitude: 13.017275,
    longitude: 77.546578,
    isWarehouse: true,
    isLaundry: false,
    serviceMins: 180,
    isActive: true,
  },
  {
    id: "depot-second-warehouse",
    name: "Second Warehouse",
    shortName: "WH2",
    address: "Kengeri / Nice Road Junction, Bengaluru",
    latitude: 12.841935860793432,
    longitude: 77.51688698411317,
    isWarehouse: true,
    isLaundry: false,
    serviceMins: 180,
    isActive: true,
  },
  {
    id: "laundry-pioneer",
    name: "Pioneer",
    shortName: "Pioneer",
    address: "Hosur Road Industrial Area, Bengaluru",
    latitude: 12.727082620183035,
    longitude: 77.84031706188283,
    isWarehouse: false,
    isLaundry: true,
    serviceMins: 180,
    isActive: true,
  },
  {
    id: "laundry-solutions",
    name: "Laundry Solutions",
    shortName: "LS",
    address: "Bannerghatta Road, Bengaluru",
    latitude: 12.783260773940704,
    longitude: 77.52984326680344,
    isWarehouse: false,
    isLaundry: true,
    serviceMins: 180,
    isActive: true,
  },
];

async function main() {
  console.log("Seeding master facilities...");

  await db
    .insert(facilities)
    .values(SEED_FACILITIES)
    .onConflictDoUpdate({
      target: facilities.id,
      set: {
        name: sql`excluded.name`,
        shortName: sql`excluded.short_name`,
        address: sql`excluded.address`,
        latitude: sql`excluded.latitude`,
        longitude: sql`excluded.longitude`,
        isWarehouse: sql`excluded.is_warehouse`,
        isLaundry: sql`excluded.is_laundry`,
        serviceMins: sql`excluded.service_mins`,
        isActive: sql`excluded.is_active`,
        updatedAt: sql`now()`,
      },
    });

  const count = await db.select({ count: sql`count(*)` }).from(facilities);
  console.log(`Successfully seeded facilities. Total in DB: ${count[0]?.count}`);
}

main().catch((err) => {
  console.error("Failed to seed facilities:", err);
  process.exit(1);
});

