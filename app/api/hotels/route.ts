import { NextResponse } from "next/server";
import {
  createHotel,
  getHotelAdminItems,
  HotelInputError,
  parseHotelInput,
} from "../../../lib/hotels";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    return NextResponse.json({ hotels: await getHotelAdminItems() });
  } catch (error) {
    console.error("Could not load hotels:", error);
    return NextResponse.json(
      { error: "Could not load hotels." },
      { status: 500 },
    );
  }
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as unknown;
    const input = parseHotelInput(body);
    const hotel = await createHotel(input);
    return NextResponse.json({ hotel }, { status: 201 });
  } catch (error) {
    if (error instanceof HotelInputError) {
      return NextResponse.json(
        { error: error.message, field: error.field },
        { status: 400 },
      );
    }
    console.error("Could not create hotel:", error);
    return NextResponse.json(
      { error: "Could not create this hotel." },
      { status: 500 },
    );
  }
}
