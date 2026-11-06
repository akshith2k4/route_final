import { NextResponse } from "next/server";
import { geocodeAddress } from "../../../lib/geocoding";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
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

    return NextResponse.json({ result: await geocodeAddress(address) });
  } catch (error) {
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
