import { notFound } from "next/navigation";
import type { Metadata } from "next";
import VehiclesDashboard from "../../../components/vehicles-dashboard";
import { getCity, getRegionMeta, listCities } from "../../../lib/cities";
import { getVehicleAdminItems } from "../../../lib/vehicles";
import { getWarehouseFacilities } from "../../../lib/facilities";

export const dynamic = "force-dynamic";

type PageProps = {
  params: Promise<{ city: string }>;
};

export async function generateMetadata({
  params,
}: PageProps): Promise<Metadata> {
  const { city: slug } = await params;
  const city = await getCity(slug);
  if (!city) return { title: "City not found" };

  const label = city.displayName ?? city.name;
  return {
    title: `Vehicle Dashboard · ${label} · LinenGrass Fleet Atlas`,
    description: `View, add, edit and remove vehicles in the ${label} fleet master.`,
  };
}

export default async function VehiclesPage({ params }: PageProps) {
  const { city: slug } = await params;
  const city = await getCity(slug);
  if (!city) notFound();

  const [regions, cities, vehicles, warehouses] = await Promise.all([
    getRegionMeta(city.id),
    listCities(),
    getVehicleAdminItems(city.id),
    getWarehouseFacilities(city.id, true),
  ]);

  return (
    <VehiclesDashboard
      cityId={city.id}
      cityName={city.name}
      cities={cities}
      initialVehicles={vehicles}
      regions={regions.map((region) => ({
        id: region.id,
        name: region.name,
        short_name: region.short_name,
      }))}
      depots={warehouses.map((warehouse) => ({
        id: warehouse.id,
        name: warehouse.name,
        isActive: warehouse.isActive,
      }))}
    />
  );
}
