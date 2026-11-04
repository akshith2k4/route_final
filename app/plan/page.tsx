import PlanCanvas from "../../components/plan-canvas";
import planJson from "../../data/plan.json";
import geometriesJson from "../../data/plan_geometries.json";
import matrixJson from "../../data/travel_matrix.json";
import type { Plan, TravelMatrix } from "../../lib/plan";

export const metadata = {
  title: "Plan Canvas · LinenGrass Fleet Atlas",
  description:
    "Drag stops between routes and reorder the day's sequence with live distance, ETA, load and shift validation.",
};

export default function PlanPage() {
  return (
    <PlanCanvas
      initialPlan={planJson as Plan}
      matrix={matrixJson as TravelMatrix}
      initialGeometries={
        geometriesJson.routes as unknown as Record<
          string,
          [number, number][]
        >
      }
    />
  );
}
