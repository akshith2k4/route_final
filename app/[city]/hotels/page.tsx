import { notFound } from "next/navigation";
import type { Metadata } from "next";
import HotelsDashboard from "../../../components/hotels-dashboard";
import { getCityContext } from "../../../lib/city-context";
import { getHotelAdminItems } from "../../../lib/hotels";

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
    title: `Hotel Dashboard · ${label} · LinenGrass Fleet Atlas`,
    description: `View, add, edit and remove hotels in the ${label} hotel master.`,
  };
}

export default async function HotelsPage({ params }: PageProps) {
  const { city: slug } = await params;
  const context = await getCityContext(slug);
  if (!context) notFound();

  const { city, regions } = context;
  const hotels = await getHotelAdminItems(city.id);

  return (
    <HotelsDashboard
      cityId={city.id}
      cityName={city.name}
      cities={context.cities}
      initialHotels={hotels}
      regionNames={regions.map((region) => region.short_name)}
    />
  );
}
