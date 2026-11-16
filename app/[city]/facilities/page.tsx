import { notFound } from "next/navigation";
import type { Metadata } from "next";
import FacilitiesDashboard from "../../../components/facilities-dashboard";
import { getCityContext } from "../../../lib/city-context";
import { getFacilityAdminItems } from "../../../lib/facilities";

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
    title: `Facility Dashboard · ${label} · LinenGrass Fleet Atlas`,
    description: `View, add, edit, and deactivate warehouses and laundries in the ${label} facility master.`,
  };
}

export default async function FacilitiesPage({ params }: PageProps) {
  const { city: slug } = await params;
  const context = await getCityContext(slug);
  if (!context) notFound();

  const { city } = context;
  const facilities = await getFacilityAdminItems(city.id);

  return (
    <FacilitiesDashboard
      cityId={city.id}
      cityName={city.name}
      cities={context.cities}
      initialFacilities={facilities}
    />
  );
}
