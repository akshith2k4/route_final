import { NextResponse } from "next/server";
import {
  AdminConflictError,
  AdminInputError,
  createDraftCity,
  listAllCitiesWithCounts,
  parseDraftCityInput,
} from "../../../../lib/admin-cities";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    return NextResponse.json({ cities: await listAllCitiesWithCounts() });
  } catch (error) {
    console.error("Could not list cities:", error);
    return NextResponse.json(
      { error: "Could not load cities." },
      { status: 500 },
    );
  }
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as unknown;
    const input = parseDraftCityInput(body);
    const result = await createDraftCity(input);
    return NextResponse.json(result, { status: 201 });
  } catch (error) {
    if (error instanceof AdminInputError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    if (error instanceof AdminConflictError) {
      return NextResponse.json({ error: error.message }, { status: 409 });
    }
    console.error("Could not create draft city:", error);
    return NextResponse.json(
      { error: "Could not save the draft city." },
      { status: 500 },
    );
  }
}
