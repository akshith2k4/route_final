import { NextResponse } from "next/server";
import {
  deleteVehicle,
  getVehicleById,
  parseVehicleInput,
  updateVehicle,
  VehicleInputError,
} from "../../../../../lib/vehicles";
import { CityNotFoundError, requireCity } from "../../../../../lib/cities";

type RouteContext = {
  params: Promise<{ city: string; id: string }>;
};

export const dynamic = "force-dynamic";

export async function PATCH(request: Request, context: RouteContext) {
  try {
    const { city, id } = await context.params;
    await requireCity(city);
    const current = await getVehicleById(city, id);

    if (!current) {
      return NextResponse.json({ error: "Vehicle not found." }, { status: 404 });
    }

    const body = (await request.json()) as Record<string, unknown>;
    const input = parseVehicleInput(
      { ...current, ...body },
      current.color,
    );
    const vehicle = await updateVehicle(city, id, input);

    if (!vehicle) {
      return NextResponse.json({ error: "Vehicle not found." }, { status: 404 });
    }

    return NextResponse.json({ vehicle });
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
    console.error("Could not update vehicle:", error);
    return NextResponse.json(
      { error: "Could not update this vehicle." },
      { status: 500 },
    );
  }
}

export async function DELETE(_request: Request, context: RouteContext) {
  try {
    const { city, id } = await context.params;
    await requireCity(city);
    const deleted = await deleteVehicle(city, id);

    if (!deleted) {
      return NextResponse.json({ error: "Vehicle not found." }, { status: 404 });
    }

    return NextResponse.json({ deleted: true });
  } catch (error) {
    if (error instanceof CityNotFoundError) {
      return NextResponse.json({ error: "City not found." }, { status: 404 });
    }
    console.error("Could not delete vehicle:", error);
    return NextResponse.json(
      { error: "Could not delete this vehicle." },
      { status: 500 },
    );
  }
}
