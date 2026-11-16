import { NextResponse } from "next/server";
import {
  createFacility,
  getFacilityAdminItems,
  FacilityInputError,
  parseFacilityInput,
} from "../../../../lib/facilities";
import { CityNotFoundError, requireCity } from "../../../../lib/cities";

export const dynamic = "force-dynamic";

type RouteContext = {
  params: Promise<{ city: string }>;
};

export async function GET(_request: Request, context: RouteContext) {
  try {
    const { city } = await context.params;
    await requireCity(city);
    const facilitiesList = await getFacilityAdminItems(city);
    return NextResponse.json({ facilities: facilitiesList });
  } catch (error) {
    if (error instanceof CityNotFoundError) {
      return NextResponse.json({ error: "City not found." }, { status: 404 });
    }
    console.error("Could not load facilities:", error);
    return NextResponse.json(
      { error: "Could not load facilities." },
      { status: 500 },
    );
  }
}

export async function POST(request: Request, context: RouteContext) {
  try {
    const { city } = await context.params;
    await requireCity(city);
    const body = (await request.json()) as unknown;
    const input = parseFacilityInput(body);
    const facility = await createFacility(city, input);
    return NextResponse.json({ facility }, { status: 201 });
  } catch (error) {
    if (error instanceof CityNotFoundError) {
      return NextResponse.json({ error: "City not found." }, { status: 404 });
    }
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
