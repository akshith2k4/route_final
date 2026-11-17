import { NextResponse } from "next/server";
import { callGoogleOptimizeTours } from "../../../../lib/google-route-optimization";
import {
  type Hotel,
  type StudioHotelSetting,
  type StudioShiftSetting,
  type StudioVehicle,
} from "../../../../lib/coverage";
import { CityNotFoundError, requireCity } from "../../../../lib/cities";
import { getWarehouseFacilities } from "../../../../lib/facilities";

export const dynamic = "force-dynamic";

type RouteContext = {
  params: Promise<{ city: string }>;
};

export async function POST(request: Request, context: RouteContext) {
  try {
    const { city } = await context.params;
    const cityRecord = await requireCity(city);

    const body = await request.json();
    const {
      hotels,
      hotelSettings,
      vehicles,
      shiftSettings,
      objective,
    }: {
      hotels: Hotel[];
      hotelSettings: Record<string, StudioHotelSetting>;
      vehicles: StudioVehicle[];
      shiftSettings: StudioShiftSetting;
      objective?:
        | "fastest_turnaround"
        | "shortest_distance"
        | "balanced"
        | "minimize_fleet";
    } = body;

    if (!hotels || !Array.isArray(hotels) || hotels.length === 0) {
      return NextResponse.json(
        { ok: false, error: "No hotels provided for optimization." },
        { status: 400 },
      );
    }

    if (!vehicles || !Array.isArray(vehicles) || vehicles.length === 0) {
      return NextResponse.json(
        { ok: false, error: "No vehicles provided for optimization." },
        { status: 400 },
      );
    }

    // The run starts and ends at the city's primary warehouse.
    const warehouses = await getWarehouseFacilities(city);
    const primary =
      warehouses[0] ??
      (cityRecord.centerLat !== undefined
        ? {
            id: "depot-primary",
            name: `${cityRecord.name} Depot`,
            latitude: cityRecord.centerLat,
            longitude: cityRecord.centerLon,
            isWarehouse: true,
            isLaundry: false,
            serviceMins: 180,
            isActive: true,
          }
        : null);

    if (!primary) {
      return NextResponse.json(
        {
          ok: false,
          error: "No warehouse configured for this city yet.",
        },
        { status: 400 },
      );
    }

    const result = await callGoogleOptimizeTours({
      hotels,
      hotelSettings,
      vehicles,
      shiftSettings,
      depot: {
        latitude: primary.latitude,
        longitude: primary.longitude,
        name: primary.name,
        timezone: cityRecord.timezone,
      },
      objective,
    });

    return NextResponse.json({
      ok: true,
      ...result,
    });
  } catch (error: unknown) {
    if (error instanceof CityNotFoundError) {
      return NextResponse.json({ error: "City not found." }, { status: 404 });
    }
    console.error("Google Route Optimization API Error:", error);
    return NextResponse.json(
      {
        ok: false,
        error:
          error instanceof Error
            ? error.message
            : "Failed to solve route optimization with Google Cloud.",
      },
      { status: 500 },
    );
  }
}
