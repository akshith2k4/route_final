import VehiclesDashboard from "../../components/vehicles-dashboard";
import regionMetadataJson from "../../data/region_metadata.json";
import type { RegionMeta } from "../../lib/coverage";
import { getVehicleAdminItems } from "../../lib/vehicles";
import { getWarehouseFacilities } from "../../lib/facilities";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Vehicle Dashboard · LinenGrass Fleet Atlas",
  description:
    "View, add, edit and remove vehicles in the LinenGrass fleet master.",
};

export default async function VehiclesPage() {
  const [vehicles, warehouses] = await Promise.all([
    getVehicleAdminItems(),
    getWarehouseFacilities(true),
  ]);
  const regions = Object.values(regionMetadataJson) as RegionMeta[];

  return (
    <VehiclesDashboard
      initialVehicles={vehicles}
      regions={regions.map((region) => ({
        id: region.id,
        name: region.name,
        short_name: region.short_name,
      }))}
      depots={warehouses.map((w) => ({
        id: w.id,
        name: w.name,
        isActive: w.isActive,
      }))}
    />
  );
}
