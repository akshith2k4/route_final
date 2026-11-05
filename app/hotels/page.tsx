import HotelsDashboard from "../../components/hotels-dashboard";
import regionMetadataJson from "../../data/region_metadata.json";
import type { RegionMeta } from "../../lib/coverage";
import { getHotelAdminItems } from "../../lib/hotels";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Hotel Dashboard · LinenGrass Fleet Atlas",
  description:
    "View, add, edit and remove hotels in the LinenGrass hotel master.",
};

export default async function HotelsPage() {
  const hotels = await getHotelAdminItems();
  const regions = Object.values(regionMetadataJson) as RegionMeta[];

  return (
    <HotelsDashboard
      initialHotels={hotels}
      regionNames={regions.map((region) => region.short_name)}
    />
  );
}
