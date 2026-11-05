import { NextResponse } from "next/server";
import {
  deleteVehicle,
  getVehicleById,
  parseVehicleInput,
  updateVehicle,
  VehicleInputError,
} from "../../../../lib/vehicles";

type RouteContext = {
  params: Promise<{ id: string }>;
};

export async function PATCH(request: Request, context: RouteContext) {
  try {
    const { id } = await context.params;
    const current = await getVehicleById(id);

    if (!current) {
      return NextResponse.json({ error: "Vehicle not found." }, { status: 404 });
    }

    const body = (await request.json()) as Record<string, unknown>;
    const input = parseVehicleInput(
      { ...current, ...body },
      current.color,
    );
    const vehicle = await updateVehicle(id, input);

    if (!vehicle) {
      return NextResponse.json({ error: "Vehicle not found." }, { status: 404 });
    }

    return NextResponse.json({ vehicle });
  } catch (error) {
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
    const { id } = await context.params;
    const deleted = await deleteVehicle(id);

    if (!deleted) {
      return NextResponse.json({ error: "Vehicle not found." }, { status: 404 });
    }

    return NextResponse.json({ deleted: true });
  } catch (error) {
    console.error("Could not delete vehicle:", error);
    return NextResponse.json(
      { error: "Could not delete this vehicle." },
      { status: 500 },
    );
  }
}
