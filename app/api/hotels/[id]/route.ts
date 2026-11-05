import { NextResponse } from "next/server";
import {
  deleteHotel,
  HotelInputError,
  parseHotelInput,
  updateHotel,
} from "../../../../lib/hotels";

type RouteContext = {
  params: Promise<{ id: string }>;
};

export async function PATCH(request: Request, context: RouteContext) {
  try {
    const { id } = await context.params;
    const body = (await request.json()) as unknown;
    const input = parseHotelInput(body);
    const hotel = await updateHotel(id, input);

    if (!hotel) {
      return NextResponse.json({ error: "Hotel not found." }, { status: 404 });
    }

    return NextResponse.json({ hotel });
  } catch (error) {
    if (error instanceof HotelInputError) {
      return NextResponse.json(
        { error: error.message, field: error.field },
        { status: 400 },
      );
    }
    console.error("Could not update hotel:", error);
    return NextResponse.json(
      { error: "Could not update this hotel." },
      { status: 500 },
    );
  }
}

export async function DELETE(_request: Request, context: RouteContext) {
  try {
    const { id } = await context.params;
    const deleted = await deleteHotel(id);

    if (!deleted) {
      return NextResponse.json({ error: "Hotel not found." }, { status: 404 });
    }

    return NextResponse.json({ deleted: true });
  } catch (error) {
    console.error("Could not delete hotel:", error);
    return NextResponse.json(
      { error: "Could not delete this hotel." },
      { status: 500 },
    );
  }
}
