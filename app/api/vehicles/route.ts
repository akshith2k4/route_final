import { NextResponse } from "next/server";
import {
  createVehicle,
  getVehicleAdminItems,
  parseVehicleInput,
  VehicleInputError,
} from "../../../lib/vehicles";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    return NextResponse.json({ vehicles: await getVehicleAdminItems() });
  } catch (error) {
    console.error("Could not load vehicles:", error);
    return NextResponse.json(
      { error: "Could not load vehicles." },
      { status: 500 },
    );
  }
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as unknown;
    const input = parseVehicleInput(body);
    const vehicle = await createVehicle(input);
    return NextResponse.json({ vehicle }, { status: 201 });
  } catch (error) {
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
