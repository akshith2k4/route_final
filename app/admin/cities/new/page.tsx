import type { Metadata } from "next";
import CityWizard from "../../../../components/admin/city-wizard";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "New city · LinenGrass Admin",
  description: "Onboard a new LinenGrass operating city with the guided wizard.",
};

export default function NewCityPage() {
  return <CityWizard />;
}
