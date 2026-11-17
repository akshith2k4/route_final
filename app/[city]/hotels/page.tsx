import { notFound } from "next/navigation";
import type { Metadata } from "next";
import HotelsDashboard from "../../../components/hotels-dashboard";
import { getCity, getRegionMeta, listCities } from "../../../lib/cities";
import { getHotelAdminItems } from "../../../lib/hotels";

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
    title: `Hotel Dashboard · ${label} · LinenGrass Fleet Atlas`,
    description: `View, add, edit and remove hotels in the ${label} hotel master.`,
  };
}

export default async function HotelsPage({ params }: PageProps) {
  const { city: slug } = await params;
  const city = await getCity(slug);
  if (!city) notFound();

  const [regions, cities, hotels] = await Promise.all([
    getRegionMeta(city.id),
    listCities(),
    getHotelAdminItems(city.id),
  ]);

  return (
    <HotelsDashboard
      cityId={city.id}
      cityName={city.name}
      cities={cities}
      initialHotels={hotels}
      regionNames={regions.map((region) => region.short_name)}
    />
  );
}
