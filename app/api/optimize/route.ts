import { NextResponse } from "next/server";
import { callGoogleOptimizeTours } from "../../../lib/google-route-optimization";
import {
  type Hotel,
  type StudioHotelSetting,
  type StudioShiftSetting,
  type StudioVehicle,
} from "../../../lib/coverage";

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const {
      hotels,
      hotelSettings,
      vehicles,
      shiftSettings,
    }: {
      hotels: Hotel[];
      hotelSettings: Record<string, StudioHotelSetting>;
      vehicles: StudioVehicle[];
      shiftSettings: StudioShiftSetting;
    } = body;

    if (!hotels || !Array.isArray(hotels) || hotels.length === 0) {
      return NextResponse.json(
        { ok: false, error: "No hotels provided for optimization." },
        { status: 400 }
      );
    }

    if (!vehicles || !Array.isArray(vehicles) || vehicles.length === 0) {
      return NextResponse.json(
        { ok: false, error: "No vehicles provided for optimization." },
        { status: 400 }
      );
    }

    const result = await callGoogleOptimizeTours({
      hotels,
      hotelSettings,
      vehicles,
      shiftSettings,
    });

    return NextResponse.json({
      ok: true,
      ...result,
    });
  } catch (error: any) {
    console.error("Google Route Optimization API Error:", error);
    return NextResponse.json(
      {
        ok: false,
        error: error.message || "Failed to solve route optimization with Google Cloud.",
      },
      { status: 500 }
    );
  }
}
