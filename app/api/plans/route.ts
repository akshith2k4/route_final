import { NextResponse } from "next/server";
import { parsePlanDraft } from "../../../lib/plan";
import {
  createPlan,
  listPlanSummaries,
} from "../../../lib/plan-store";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    return NextResponse.json({ plans: await listPlanSummaries() });
  } catch (error) {
    console.error("Could not load plans:", error);
    return NextResponse.json(
      { error: "Could not load plans." },
      { status: 500 },
    );
  }
}

export async function POST(request: Request) {
  try {
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
    return NextResponse.json(await createPlan(body.name, plan), {
      status: 201,
    });
  } catch (error) {
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
