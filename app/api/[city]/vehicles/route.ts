import { NextResponse } from "next/server";
import {
  createVehicle,
  getVehicleAdminItems,
  parseVehicleInput,
  VehicleInputError,
} from "../../../../lib/vehicles";
import { CityNotFoundError, requireCity } from "../../../../lib/cities";

export const dynamic = "force-dynamic";

type RouteContext = {
  params: Promise<{ city: string }>;
};

export async function GET(_request: Request, context: RouteContext) {
  try {
    const { city } = await context.params;
    await requireCity(city);
    return NextResponse.json({ vehicles: await getVehicleAdminItems(city) });
  } catch (error) {
    if (error instanceof CityNotFoundError) {
      return NextResponse.json({ error: "City not found." }, { status: 404 });
    }
    console.error("Could not load vehicles:", error);
    return NextResponse.json(
      { error: "Could not load vehicles." },
      { status: 500 },
    );
  }
}

export async function POST(request: Request, context: RouteContext) {
  try {
    const { city } = await context.params;
    await requireCity(city);
    const body = (await request.json()) as unknown;
    const input = parseVehicleInput(body);
    const vehicle = await createVehicle(city, input);
    return NextResponse.json({ vehicle }, { status: 201 });
  } catch (error) {
    if (error instanceof CityNotFoundError) {
      return NextResponse.json({ error: "City not found." }, { status: 404 });
    }
    if (error instanceof VehicleInputError) {
      return NextResponse.json(
        { error: error.message, field: error.field },
        { status: 400 },
      );
    }
    console.error("Could not create vehicle:", error);
    return NextResponse.json(
      { error: "Could not create this vehicle." },
      { status: 500 },
    );
  }
}
