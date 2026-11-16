import {
  getCity,
  getCityDataset,
  getCityDatasets,
  getRegionMeta,
  listCities,
} from "./cities";
import type { City } from "./city-types";
import {
  fleetDepots,
  fleetVehicles,
  type CityFleet,
  type DispatchRoute,
  type HexMap,
  type Hotel,
  type RegionMeta,
  type StudioDepot,
  type StudioVehicle,
} from "./coverage";
import { getCoverageHotels } from "./hotels";
import type { Plan, TravelMatrix } from "./plan";

export type CityContext = {
  city: City;
  /** Every active city, for the city switcher. */
  cities: City[];
  regions: RegionMeta[];
  /** Active hotels of the city, mapped onto region indices. */
  hotels: Hotel[];
  fleet: CityFleet;
  depots: StudioDepot[];
  vehicles: StudioVehicle[];
  hexMap: HexMap;
  travelMatrix: TravelMatrix | null;
  planGeometries: Record<string, [number, number][]>;
  optimizedRoutes: DispatchRoute[];
  manualRoutes: DispatchRoute[];
  baselinePlan: Plan | null;
};

/**
 * Loads everything a city page needs in one place: the registry entry, its
 * regions, its master hotels and the reference datasets published by the
 * offline pipeline.
 */
export async function getCityContext(
  slug: string,
): Promise<CityContext | null> {
  const city = await getCity(slug);
  if (!city) return null;

  const [regions, datasets, cities] = await Promise.all([
    getRegionMeta(city.id),
    getCityDatasets(city.id),
    listCities(),
  ]);

  const hotels = await getCoverageHotels(city.id, regions);

  const fleet = (datasets.fleet as CityFleet | undefined) ?? null;
  const geometries = datasets.plan_geometries as
    | { routes?: Record<string, [number, number][]> }
    | undefined;

  return {
    city,
    cities,
    regions,
    hotels,
    fleet: fleet ?? {},
    depots: fleetDepots(fleet),
    vehicles: fleetVehicles(fleet),
    hexMap: (datasets.hex_map as HexMap | undefined) ?? {},
    travelMatrix: (datasets.travel_matrix as TravelMatrix | undefined) ?? null,
    planGeometries: geometries?.routes ?? {},
    optimizedRoutes: (datasets.optimized_routes as DispatchRoute[]) ?? [],
    manualRoutes: (datasets.manual_routes as DispatchRoute[]) ?? [],
    baselinePlan: (datasets.baseline_plan as Plan | undefined) ?? null,
  };
}

/** The travel matrix of a city, or null when the city has not published one. */
export async function getCityTravelMatrix(
  cityId: string,
): Promise<TravelMatrix | null> {
  return (
    (await getCityDataset<TravelMatrix>(cityId, "travel_matrix")) ?? null
  );
}
