import { NextResponse } from "next/server";
import {
  createHotel,
  getHotelAdminItems,
  HotelInputError,
  parseHotelInput,
} from "../../../../lib/hotels";
import { CityNotFoundError, requireCity } from "../../../../lib/cities";

export const dynamic = "force-dynamic";

type RouteContext = {
  params: Promise<{ city: string }>;
};

export async function GET(_request: Request, context: RouteContext) {
  try {
    const { city } = await context.params;
    await requireCity(city);
    return NextResponse.json({ hotels: await getHotelAdminItems(city) });
  } catch (error) {
    if (error instanceof CityNotFoundError) {
      return NextResponse.json({ error: "City not found." }, { status: 404 });
    }
    console.error("Could not load hotels:", error);
    return NextResponse.json(
      { error: "Could not load hotels." },
      { status: 500 },
    );
  }
}

export async function POST(request: Request, context: RouteContext) {
  try {
    const { city } = await context.params;
    await requireCity(city);
    const body = (await request.json()) as unknown;
    const input = parseHotelInput(body);
    const hotel = await createHotel(city, input);
    return NextResponse.json({ hotel }, { status: 201 });
  } catch (error) {
    if (error instanceof CityNotFoundError) {
      return NextResponse.json({ error: "City not found." }, { status: 404 });
    }
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
