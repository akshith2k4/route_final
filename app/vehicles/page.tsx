import VehiclesDashboard from "../../components/vehicles-dashboard";
import regionMetadataJson from "../../data/region_metadata.json";
import type { RegionMeta } from "../../lib/coverage";
import { getVehicleAdminItems } from "../../lib/vehicles";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Vehicle Dashboard · LinenGrass Fleet Atlas",
  description:
    "View, add, edit and remove vehicles in the LinenGrass fleet master.",
};

export default async function VehiclesPage() {
  const vehicles = await getVehicleAdminItems();
  const regions = Object.values(regionMetadataJson) as RegionMeta[];

  return (
    <VehiclesDashboard
      initialVehicles={vehicles}
      regions={regions.map((region) => ({
        id: region.id,
        name: region.name,
        short_name: region.short_name,
      }))}
    />
  );
}
