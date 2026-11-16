import { notFound } from "next/navigation";
import type { Metadata } from "next";
import PlanCanvas from "../../../components/plan-canvas";
import { getCityContext } from "../../../lib/city-context";
import { getInitialPlan } from "../../../lib/plan-store";

export const dynamic = "force-dynamic";

type PlanPageProps = {
  params: Promise<{ city: string }>;
  searchParams: Promise<{ plan?: string | string[] }>;
};

export async function generateMetadata({
  params,
}: PlanPageProps): Promise<Metadata> {
  const { city: slug } = await params;
  const context = await getCityContext(slug);
  if (!context) return { title: "City not found" };

  const { city } = context;
  const label = city.displayName ?? city.name;
  return {
    title: `Plan Canvas · ${label} · LinenGrass Fleet Atlas`,
    description:
      "Drag stops between routes and reorder the day's sequence with live distance, ETA, load and shift validation.",
  };
}

export default async function PlanPage({
  params,
  searchParams,
}: PlanPageProps) {
  const { city: slug } = await params;
  const { plan: requestedPlan } = await searchParams;

  const context = await getCityContext(slug);
  if (!context) notFound();

  const { city, regions, hexMap, travelMatrix, planGeometries, baselinePlan } =
    context;

  const initial = await getInitialPlan(
    city.id,
    baselinePlan,
    typeof requestedPlan === "string" ? requestedPlan : undefined,
  );

  return (
    <PlanCanvas
      cityId={city.id}
      cityName={city.name}
      cities={context.cities}
      cityCenter={{ lat: city.centerLat, lon: city.centerLon }}
      defaultZoom={city.defaultZoom}
      minZoom={city.minZoom}
      maxZoom={city.maxZoom}
      initialPlan={initial.plan}
      initialPlanId={initial.id}
      initialPlans={initial.plans}
      initialVersion={initial.version}
      baselinePlan={baselinePlan ?? initial.plan}
      matrix={
        travelMatrix ?? {
          schema_version: 1,
          provider: "none",
          traffic_aware: false,
          generated_at: new Date().toISOString(),
          points: [],
          durations_s: [],
          distances_m: [],
        }
      }
      regions={regions}
      hexMap={hexMap}
      initialGeometries={planGeometries}
    />
  );
}
