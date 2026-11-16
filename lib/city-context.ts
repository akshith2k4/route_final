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
import { getFacilityRows } from "./facilities";
import { getVehicleRows } from "./vehicles";
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

  // Prefer the published fleet dataset; fall back to the live DB masters so a
  // city onboarded entirely in-app (facilities + vehicles, no dataset) still
  // renders its depots and fleet.
  let fleet = (datasets.fleet as CityFleet | undefined) ?? null;
  const hasDatasetFleet =
    !!fleet &&
    ((fleet.depots?.length ?? 0) > 0 ||
      !!fleet.depot ||
      (fleet.vehicles?.length ?? 0) > 0);
  if (!hasDatasetFleet) {
    const [facilityRows, vehicleRows] = await Promise.all([
      getFacilityRows(city.id),
      getVehicleRows(city.id),
    ]);
    if (facilityRows.length > 0 || vehicleRows.length > 0) {
      fleet = {
        depots: facilityRows
          .filter((facility) => facility.isWarehouse && facility.isActive)
          .map((facility) => ({
            id: facility.id,
            name: facility.name,
            short_name: facility.shortName,
            latitude: facility.latitude,
            longitude: facility.longitude,
          })),
        laundries: facilityRows
          .filter((facility) => facility.isLaundry && facility.isActive)
          .map((facility) => ({
            id: facility.id,
            name: facility.name,
            short_name: facility.shortName,
            latitude: facility.latitude,
            longitude: facility.longitude,
            service_mins: facility.serviceMins,
          })),
        vehicles: vehicleRows
          .filter((vehicle) => vehicle.isActive)
          .map((vehicle, index) => ({
            // DB ids are strings; the studio fleet uses a numeric sequence.
            id: index + 1,
            label: vehicle.name,
            region_id: vehicle.regionId ?? 0,
            region_name: vehicle.regionName ?? "",
            sector: vehicle.sector ?? "",
            color: vehicle.color,
            nominal_capacity: vehicle.realCapacity,
            max_load_90pct: vehicle.safeCapacity,
            depot_id: vehicle.depotId,
            departure_time: vehicle.departureTime,
            return_time: vehicle.returnTime,
          })),
      };
    }
  }

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
