import { NextResponse } from "next/server";
import {
  createFacility,
  getFacilityAdminItems,
  FacilityInputError,
  parseFacilityInput,
} from "../../../lib/facilities";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const facilitiesList = await getFacilityAdminItems();
    return NextResponse.json({ facilities: facilitiesList });
  } catch (error) {
    console.error("Could not load facilities:", error);
    return NextResponse.json(
      { error: "Could not load facilities." },
      { status: 500 },
    );
  }
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as unknown;
    const input = parseFacilityInput(body);
    const facility = await createFacility(input);
    return NextResponse.json({ facility }, { status: 201 });
  } catch (error) {
    if (error instanceof FacilityInputError) {
      return NextResponse.json(
        { error: error.message, field: error.field },
        { status: 400 },
      );
    }
    console.error("Could not create facility:", error);
    return NextResponse.json(
      { error: "Could not create this facility." },
      { status: 500 },
    );
  }
}

