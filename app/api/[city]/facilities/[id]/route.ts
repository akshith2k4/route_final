import { NextResponse } from "next/server";
import {
  deleteFacility,
  FacilityConflictError,
  FacilityInputError,
  parseFacilityInput,
  updateFacility,
} from "../../../../../lib/facilities";
import { CityNotFoundError, requireCity } from "../../../../../lib/cities";

type RouteContext = {
  params: Promise<{ city: string; id: string }>;
};

export const dynamic = "force-dynamic";

export async function PATCH(request: Request, context: RouteContext) {
  try {
    const { city, id } = await context.params;
    await requireCity(city);
    const body = (await request.json()) as unknown;
    const input = parseFacilityInput(body);
    const facility = await updateFacility(city, id, input);

    if (!facility) {
      return NextResponse.json(
        { error: "Facility not found." },
        { status: 404 },
      );
    }

    return NextResponse.json({ facility });
  } catch (error) {
    if (error instanceof CityNotFoundError) {
      return NextResponse.json({ error: "City not found." }, { status: 404 });
    }
    if (error instanceof FacilityConflictError) {
      return NextResponse.json(
        {
          error: error.message,
          plans: error.plans,
          vehicles: error.vehicles,
        },
        { status: 409 },
      );
    }
    if (error instanceof FacilityInputError) {
      return NextResponse.json(
        { error: error.message, field: error.field },
        { status: 400 },
      );
    }
    console.error("Could not update facility:", error);
    return NextResponse.json(
      { error: "Could not update this facility." },
      { status: 500 },
    );
  }
}

export async function DELETE(_request: Request, context: RouteContext) {
  try {
    const { city, id } = await context.params;
    await requireCity(city);
    const deleted = await deleteFacility(city, id);

    if (!deleted) {
      return NextResponse.json(
        { error: "Facility not found." },
        { status: 404 },
      );
    }

    return NextResponse.json({ deleted: true });
  } catch (error) {
    if (error instanceof CityNotFoundError) {
      return NextResponse.json({ error: "City not found." }, { status: 404 });
    }
    if (error instanceof FacilityConflictError) {
      return NextResponse.json(
        {
          error: error.message,
          plans: error.plans,
          vehicles: error.vehicles,
        },
        { status: 409 },
      );
    }
    console.error("Could not delete facility:", error);
    return NextResponse.json(
      { error: "Could not delete this facility." },
      { status: 500 },
    );
  }
}
