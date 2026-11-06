import FacilitiesDashboard from "../../components/facilities-dashboard";
import { getFacilityAdminItems } from "../../lib/facilities";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Facility Dashboard · LinenGrass Fleet Atlas",
  description:
    "View, add, edit, and deactivate warehouses and laundries in the LinenGrass facility master.",
};

export default async function FacilitiesPage() {
  const facilities = await getFacilityAdminItems();

  return <FacilitiesDashboard initialFacilities={facilities} />;
}

