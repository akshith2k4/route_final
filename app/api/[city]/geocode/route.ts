import { NextResponse } from "next/server";
import { geocodeAddress } from "../../../../lib/geocoding";
import { CityNotFoundError, requireCity } from "../../../../lib/cities";

export const dynamic = "force-dynamic";

type RouteContext = {
  params: Promise<{ city: string }>;
};

export async function POST(request: Request, context: RouteContext) {
  try {
    const { city } = await context.params;
    const cityRecord = await requireCity(city);
    const body = (await request.json()) as { address?: unknown };
    const address =
      typeof body.address === "string" ? body.address.trim() : "";

    if (address.length < 3) {
      return NextResponse.json(
        { error: "Enter a more complete address." },
        { status: 400 },
      );
    }
    if (address.length > 300) {
      return NextResponse.json(
        { error: "Address must be 300 characters or less." },
        { status: 400 },
      );
    }

    const result = await geocodeAddress(
      address,
      cityRecord.displayName ?? cityRecord.name,
    );
    return NextResponse.json({ result });
  } catch (error) {
    if (error instanceof CityNotFoundError) {
      return NextResponse.json({ error: "City not found." }, { status: 404 });
    }
    console.error("Could not geocode address:", error);
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Could not find coordinates for that address.",
      },
      { status: 400 },
    );
  }
}
