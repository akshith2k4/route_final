import { NextResponse } from "next/server";
import {
  AdminConflictError,
  deleteDraftCity,
  getCityWithRegions,
} from "../../../../../lib/admin-cities";

export const dynamic = "force-dynamic";

type RouteContext = {
  params: Promise<{ city: string }>;
};

export async function GET(_request: Request, context: RouteContext) {
  try {
    const { city } = await context.params;
    const result = await getCityWithRegions(city);
    if (!result) {
      return NextResponse.json({ error: "City not found." }, { status: 404 });
    }
    return NextResponse.json(result);
  } catch (error) {
    console.error("Could not load city:", error);
    return NextResponse.json(
      { error: "Could not load the city." },
      { status: 500 },
    );
  }
}

export async function DELETE(_request: Request, context: RouteContext) {
  try {
    const { city } = await context.params;
    const deleted = await deleteDraftCity(city);
    if (!deleted) {
      return NextResponse.json({ error: "City not found." }, { status: 404 });
    }
    return NextResponse.json({ deleted: true });
  } catch (error) {
    if (error instanceof AdminConflictError) {
      return NextResponse.json({ error: error.message }, { status: 409 });
    }
    console.error("Could not delete draft city:", error);
    return NextResponse.json(
      { error: "Could not delete the draft city." },
      { status: 500 },
    );
  }
}
