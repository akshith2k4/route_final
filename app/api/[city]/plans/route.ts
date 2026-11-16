import { NextResponse } from "next/server";
import { parsePlanDraft } from "../../../../lib/plan";
import { createPlan, listPlanSummaries } from "../../../../lib/plan-store";
import { CityNotFoundError, requireCity } from "../../../../lib/cities";

export const dynamic = "force-dynamic";

type RouteContext = {
  params: Promise<{ city: string }>;
};

export async function GET(_request: Request, context: RouteContext) {
  try {
    const { city } = await context.params;
    await requireCity(city);
    return NextResponse.json({ plans: await listPlanSummaries(city) });
  } catch (error) {
    if (error instanceof CityNotFoundError) {
      return NextResponse.json({ error: "City not found." }, { status: 404 });
    }
    console.error("Could not load plans:", error);
    return NextResponse.json(
      { error: "Could not load plans." },
      { status: 500 },
    );
  }
}

export async function POST(request: Request, context: RouteContext) {
  try {
    const { city } = await context.params;
    await requireCity(city);
    const body = (await request.json()) as {
      name?: unknown;
      plan?: unknown;
    };

    if (typeof body.name !== "string" || body.name.trim().length === 0) {
      return NextResponse.json(
        { error: "A plan name is required." },
        { status: 400 },
      );
    }

    const plan = parsePlanDraft(body.plan);
    return NextResponse.json(await createPlan(city, body.name, plan), {
      status: 201,
    });
  } catch (error) {
    if (error instanceof CityNotFoundError) {
      return NextResponse.json({ error: "City not found." }, { status: 404 });
    }
    console.error("Could not create plan:", error);
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Could not create this plan.",
      },
      { status: 400 },
    );
  }
}
