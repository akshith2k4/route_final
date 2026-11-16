import { notFound } from "next/navigation";
import type { Metadata } from "next";
import CoverageApp from "../../components/coverage-app";
import { getCityContext } from "../../lib/city-context";

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

  const { city, hotels, regions } = context;
  const label = city.displayName ?? city.name;
  return {
    title: `LinenGrass — ${label} Coverage Atlas`,
    description: `Interactive coverage map of ${hotels.length} hotels across ${regions.length} LinenGrass operational regions in ${label}.`,
  };
}

export default async function CityHome({ params }: PageProps) {
  const { city: slug } = await params;
  const context = await getCityContext(slug);
  if (!context) notFound();

  const { city, regions, hotels, hexMap, optimizedRoutes, manualRoutes, depots } = context;

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
    />
  );
}
