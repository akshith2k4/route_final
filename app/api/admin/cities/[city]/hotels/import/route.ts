import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "../../../../../../../lib/db";
import { hotels } from "../../../../../../../db/schema";
import {
  CityNotFoundError,
  clearCityDatasetCache,
  getRegionMeta,
  requireCity,
} from "../../../../../../../lib/cities";
import { parseHotelCsv, toHotelInputs } from "../../../../../../../lib/hotel-csv";

export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ city: string }> };

export async function POST(request: Request, context: RouteContext) {
  try {
    const { city } = await context.params;
    await requireCity(city);

    const body = (await request.json()) as { csv?: string; commit?: boolean };
    if (typeof body.csv !== "string") {
      return NextResponse.json({ error: "Send the CSV text." }, { status: 400 });
    }

    const regions = await getRegionMeta(city);
    const parsed = parseHotelCsv(body.csv, regions);
    if (parsed.error) {
      return NextResponse.json({ error: parsed.error }, { status: 400 });
    }

    const preview = {
      total: parsed.rows.length,
      valid: parsed.rows.filter((row) => row.errors.length === 0).length,
      invalid: parsed.rows.filter((row) => row.errors.length > 0).length,
      rows: parsed.rows.map((row) => ({
        line: row.line,
        name: row.name,
        region: row.regionCode,
        latitude: row.latitude,
        longitude: row.longitude,
        bags: row.bags,
        serviceMins: row.serviceMins,
        errors: row.errors,
      })),
    };

    if (!body.commit) {
      return NextResponse.json({ dryRun: true, ...preview });
    }

    const hotelsToImport = toHotelInputs(parsed.rows, regions);
    if (hotelsToImport.length === 0) {
      return NextResponse.json({ error: "No valid hotels to import." }, { status: 400 });
    }

    const existing = await db
      .select({ id: hotels.id })
      .from(hotels)
      .where(eq(hotels.cityId, city));
    const existingIds = new Set(existing.map((row) => row.id));

    let inserted = 0;
    let updated = 0;
    for (const hotel of hotelsToImport) {
      const exists = existingIds.has(hotel.id);
      await db
        .insert(hotels)
        .values({ cityId: city, id: hotel.id, ...hotel.input })
        .onConflictDoUpdate({
          target: [hotels.cityId, hotels.id],
          set: {
            name: hotel.input.name,
            latitude: hotel.input.latitude,
            longitude: hotel.input.longitude,
            regionName: hotel.input.regionName,
            stopMins: hotel.input.stopMins,
            loadBags: hotel.input.loadBags,
            alternateLoadBags: hotel.input.alternateLoadBags,
            rooms: hotel.input.rooms,
            dayPlan: hotel.input.dayPlan,
            updatedAt: new Date(),
          },
        });
      if (exists) updated += 1;
      else inserted += 1;
    }

    clearCityDatasetCache();
    return NextResponse.json({ dryRun: false, inserted, updated, total: hotelsToImport.length });
  } catch (error) {
    if (error instanceof CityNotFoundError) {
      return NextResponse.json({ error: "City not found." }, { status: 404 });
    }
    console.error("Hotel CSV import failed:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Import failed." },
      { status: 400 },
    );
  }
}
