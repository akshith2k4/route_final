import { notFound } from "next/navigation";
import type { Metadata } from "next";
import CoverageApp from "../../../components/coverage-app";
import { getCityContext } from "../../../lib/city-context";

export const dynamic = "force-dynamic";

type PageProps = {
  params: Promise<{ city: string }>;
};

export async function generateMetadata({
  params,
}: PageProps): Promise<Metadata> {
  const { city: slug } = await params;
  const context = await getCityContext(slug);
  if (!context) return { title: "City not found" };

  const { city } = context;
  const label = city.displayName ?? city.name;
  return {
    title: `Optimizer Studio · ${label} · LinenGrass Fleet Atlas`,
    description:
      "Interactive route optimizer studio to select customer hotels, lock vehicle capacity buffers, assign depots, configure driver shift and lunch windows, and simulate custom dispatch runs.",
  };
}

export default async function StudioPage({ params }: PageProps) {
  const { city: slug } = await params;
  const context = await getCityContext(slug);
  if (!context) notFound();

  const {
    city,
    regions,
    hotels,
    hexMap,
    optimizedRoutes, manualRoutes,
    depots,
    vehicles,
  } = context;

  return (
    <CoverageApp
      cityId={city.id}
      cityName={city.name}
      cities={context.cities}
      cityCenter={{ lat: city.centerLat, lon: city.centerLon }}
      defaultZoom={city.defaultZoom}
      minZoom={city.minZoom}
      maxZoom={city.maxZoom}
      h3Resolution={city.h3Resolution}
      roadFactor={city.roadFactor}
      avgSpeedKmh={city.fallbackSpeedKmh}
      regionAdjacency={city.settings.regionAdjacency ?? {}}
      regions={regions}
      hotels={hotels}
      hexMap={hexMap}
      routes={optimizedRoutes}
      manualRoutes={manualRoutes}
      depots={depots}
      vehicles={vehicles}
      initialWorkspace="studio"
    />
  );
}
