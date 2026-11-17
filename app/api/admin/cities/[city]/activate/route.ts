import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "../../../../../../lib/db";
import { cities, cityDatasets, hotels, vehicles, facilities, regions } from "../../../../../../db/schema";
import { CityNotFoundError, getCity } from "../../../../../../lib/cities";

export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ city: string }> };

/** Activates a city once it has regions, hotels, a warehouse and a plan. */
export async function POST(_request: Request, context: RouteContext) {
  try {
    const { city } = await context.params;
    const record = await getCity(city);
    if (!record) throw new CityNotFoundError(city);

    const [regionRows, hotelRows, facilityRows, vehicleRows, datasetRows] = await Promise.all([
      db.select({ id: regions.regionIndex }).from(regions).where(eq(regions.cityId, city)).limit(1),
      db.select({ id: hotels.id }).from(hotels).where(eq(hotels.cityId, city)).limit(1),
      db.select({ id: facilities.id, isWarehouse: facilities.isWarehouse }).from(facilities).where(eq(facilities.cityId, city)),
      db.select({ id: vehicles.id }).from(vehicles).where(eq(vehicles.cityId, city)).limit(1),
      db.select({ kind: cityDatasets.kind }).from(cityDatasets).where(eq(cityDatasets.cityId, city)),
    ]);

    const missing: string[] = [];
    if (!regionRows.length) missing.push("regions");
    if (!hotelRows.length) missing.push("hotels");
    if (!facilityRows.some((f) => f.isWarehouse)) missing.push("a warehouse");
    if (!vehicleRows.length) missing.push("vehicles");
    const kinds = new Set(datasetRows.map((d) => d.kind));
    if (!kinds.has("hex_map")) missing.push("hex map");
    if (!kinds.has("baseline_plan")) missing.push("baseline plan");
    if (missing.length > 0) {
      return NextResponse.json(
        { error: `Before going live add: ${missing.join(", ")}.` },
        { status: 400 },
      );
    }

    await db.update(cities).set({ isActive: true, updatedAt: new Date() }).where(eq(cities.id, city));
    return NextResponse.json({ ok: true, active: true });
  } catch (error) {
    if (error instanceof CityNotFoundError) {
      return NextResponse.json({ error: "City not found." }, { status: 404 });
    }
    console.error("Activation failed:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Could not activate city." },
      { status: 400 },
    );
  }
}
