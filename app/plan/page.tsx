import PlanCanvas from "../../components/plan-canvas";
import planJson from "../../data/plan.json";
import geometriesJson from "../../data/plan_geometries.json";
import hexMapJson from "../../data/hex_map.json";
import regionMetadataJson from "../../data/region_metadata.json";
import matrixJson from "../../data/travel_matrix.json";
import type { HexMap, RegionMeta } from "../../lib/coverage";
import type { Plan, TravelMatrix } from "../../lib/plan";
import { getInitialPlan } from "../../lib/plan-store";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Plan Canvas · LinenGrass Fleet Atlas",
  description:
    "Drag stops between routes and reorder the day's sequence with live distance, ETA, load and shift validation.",
};

type PlanPageProps = {
  searchParams: Promise<{ plan?: string | string[] }>;
};

export default async function PlanPage({ searchParams }: PlanPageProps) {
  const { plan: requestedPlan } = await searchParams;
  const initial = await getInitialPlan(
    typeof requestedPlan === "string" ? requestedPlan : undefined,
  );

  return (
    <PlanCanvas
      initialPlan={initial.plan}
      initialPlanId={initial.id}
      initialPlans={initial.plans}
      initialVersion={initial.version}
      baselinePlan={planJson as Plan}
      matrix={matrixJson as TravelMatrix}
      regions={Object.values(regionMetadataJson) as RegionMeta[]}
      hexMap={hexMapJson as HexMap}
      initialGeometries={
        geometriesJson.routes as unknown as Record<
          string,
          [number, number][]
        >
      }
    />
  );
}
