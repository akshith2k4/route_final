import { NextResponse } from "next/server";
import { CityNotFoundError, requireCity } from "../../../../../../lib/cities";
import { createFacility, getFacilityRows } from "../../../../../../lib/facilities";

export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ city: string }> };

type FleetSetup = {
  warehouse?: {
    name: string;
    shortName?: string;
    address?: string | null;
    latitude: number;
    longitude: number;
  };
};

/**
 * Creates the city's primary warehouse from the details the manager enters.
 * Vehicles are intentionally NOT created here — the manager adds them in the
 * city's Vehicles dashboard, so the fleet is always their own decision.
 */
export async function POST(request: Request, context: RouteContext) {
  try {
    const { city } = await context.params;
    await requireCity(city);
    const body = (await request.json()) as FleetSetup;

    const existing = await getFacilityRows(city);
    if (existing.length > 0) {
      return NextResponse.json(
        { error: "A facility already exists for this city. Edit it in the Facilities dashboard." },
        { status: 409 },
      );
    }

    const warehouse = body.warehouse;
    if (!warehouse || typeof warehouse.name !== "string" || warehouse.name.trim().length < 2) {
      return NextResponse.json({ error: "Enter the warehouse name." }, { status: 400 });
    }
    if (
      !Number.isFinite(warehouse.latitude) ||
      !Number.isFinite(warehouse.longitude) ||
      warehouse.latitude < -90 ||
      warehouse.latitude > 90 ||
      warehouse.longitude < -180 ||
      warehouse.longitude > 180
    ) {
      return NextResponse.json(
        { error: "Pick the warehouse location on the map." },
        { status: 400 },
      );
    }

    const created = await createFacility(city, {
      name: warehouse.name.trim(),
      shortName: warehouse.shortName?.trim() || warehouse.name.trim().slice(0, 8),
      address: warehouse.address?.trim() || null,
      latitude: warehouse.latitude,
      longitude: warehouse.longitude,
      isWarehouse: true,
      isLaundry: false,
      serviceMins: 0,
      isActive: true,
    });

    return NextResponse.json({ warehouse: created.id }, { status: 201 });
  } catch (error) {
    if (error instanceof CityNotFoundError) {
      return NextResponse.json({ error: "City not found." }, { status: 404 });
    }
    console.error("Warehouse setup failed:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Could not create the warehouse." },
      { status: 400 },
    );
  }
}
