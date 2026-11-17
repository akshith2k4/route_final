import { NextResponse } from "next/server";
import { parsePlanDraft } from "../../../../../lib/plan";
import { getPlanById, updateStoredPlan } from "../../../../../lib/plan-store";
import { CityNotFoundError, requireCity } from "../../../../../lib/cities";

type RouteContext = {
  params: Promise<{ city: string; id: string }>;
};

export const dynamic = "force-dynamic";

export async function GET(_request: Request, context: RouteContext) {
  try {
    const { city, id } = await context.params;
    await requireCity(city);
    const plan = await getPlanById(city, id);

    if (!plan) {
      return NextResponse.json({ error: "Plan not found." }, { status: 404 });
    }

    return NextResponse.json(plan);
  } catch (error) {
    if (error instanceof CityNotFoundError) {
      return NextResponse.json({ error: "City not found." }, { status: 404 });
    }
    console.error("Could not load plan:", error);
    return NextResponse.json(
      { error: "Could not load this plan." },
      { status: 500 },
    );
  }
}

export async function PUT(request: Request, context: RouteContext) {
  try {
    const { city, id } = await context.params;
    await requireCity(city);
    const body = (await request.json()) as {
      plan?: unknown;
      version?: unknown;
    };

    if (!Number.isInteger(body.version) || (body.version as number) < 0) {
      return NextResponse.json(
        { error: "A valid plan version is required." },
        { status: 400 },
      );
    }

    const plan = parsePlanDraft(body.plan);
    const result = await updateStoredPlan(
      city,
      id,
      plan,
      body.version as number,
    );

    if ("conflict" in result) {
      return NextResponse.json(
        {
          error: "The plan changed in another session.",
          conflict: true,
          current: result.current,
        },
        { status: 409 },
      );
    }

    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof CityNotFoundError) {
      return NextResponse.json({ error: "City not found." }, { status: 404 });
    }
    console.error("Could not save plan:", error);
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Could not save this plan.",
      },
      { status: 400 },
    );
  }
}
