import { NextResponse } from "next/server";
import {
  generateBaselinePlan,
  generateGeometries,
  generateHexMap,
  generateTravelMatrix,
} from "../../../../../../lib/city-generation";
import { CityNotFoundError } from "../../../../../../lib/cities";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

type RouteContext = { params: Promise<{ city: string }> };

const STEPS = ["hex_map", "baseline_plan", "travel_matrix", "geometries"] as const;
type Step = (typeof STEPS)[number];

export async function POST(request: Request, context: RouteContext) {
  try {
    const { city } = await context.params;
    const body = (await request.json()) as { step?: string; budgetMs?: number };
    const step = body.step as Step;
    if (!STEPS.includes(step)) {
      return NextResponse.json({ error: `Unknown step. Use one of: ${STEPS.join(", ")}` }, { status: 400 });
    }
    const budgetMs = typeof body.budgetMs === "number" ? body.budgetMs : undefined;

    switch (step) {
      case "hex_map":
        return NextResponse.json({ step, complete: true, ...(await generateHexMap(city)) });
      case "baseline_plan":
        return NextResponse.json({ step, complete: true, ...(await generateBaselinePlan(city)) });
      case "travel_matrix":
        return NextResponse.json({ step, ...(await generateTravelMatrix(city, budgetMs)) });
      case "geometries":
        return NextResponse.json({ step, ...(await generateGeometries(city, budgetMs)) });
    }
  } catch (error) {
    if (error instanceof CityNotFoundError) {
      return NextResponse.json({ error: "City not found." }, { status: 404 });
    }
    console.error("Generation step failed:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Generation failed." },
      { status: 400 },
    );
  }
}
