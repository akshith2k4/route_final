import { NextResponse } from "next/server";
import { parsePlanDraft } from "../../../../../../lib/plan";
import { publishPlanAsManual } from "../../../../../../lib/city-generation";
import { CityNotFoundError } from "../../../../../../lib/cities";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

type RouteContext = { params: Promise<{ city: string }> };

/**
 * Publishes an edited plan from the Plan Canvas as the city's manual dispatch.
 * Whatever the manager built becomes the Manual tab view and the baseline.
 */
export async function POST(request: Request, context: RouteContext) {
  try {
    const { city } = await context.params;
    const body = (await request.json()) as { plan?: unknown };
    const plan = parsePlanDraft(body.plan);
    await publishPlanAsManual(city, plan);
    return NextResponse.json({ ok: true });
  } catch (error) {
    if (error instanceof CityNotFoundError) {
      return NextResponse.json({ error: "City not found." }, { status: 404 });
    }
    console.error("Publish plan failed:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Could not publish plan." },
      { status: 400 },
    );
  }
}
