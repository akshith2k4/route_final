import { cache } from "react";
import {
  getCity,
  getCityDataset,
  getCityDatasets,
  getRegionMeta,
  listCities,
  registerCacheInvalidator,
} from "./cities";
import type { City } from "./city-types";
import {
  fleetDepots,
  fleetVehicles,
  haversineKm,
  type CityFleet,
  type DispatchRoute,
  type HexMap,
  type Hotel,
  type RegionMeta,
  type StudioDepot,
  type StudioVehicle,
} from "./coverage";
import { getCoverageHotels } from "./hotels";
import { scheduleDispatchRoutes } from "./schedule";
import { clockToMinutes, formatClock, minutesToClock } from "./clock";
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

const CONTEXT_CACHE_TTL_MS = 60_000;
const cityContextCache = new Map<
  string,
  { expiresAt: number; value: CityContext }
>();

export function clearCityContextCache(cityId?: string): void {
  if (cityId) {
    cityContextCache.delete(cityId);
  } else {
    cityContextCache.clear();
  }
}

registerCacheInvalidator(clearCityContextCache);

/**
 * Loads everything a city page needs in one place: the registry entry, its
 * regions, its master hotels and the reference datasets published for it.
 */
async function loadCityContext(
  slug: string,
): Promise<CityContext | null> {
  const cached = cityContextCache.get(slug);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.value;
  }

  const city = await getCity(slug);
  if (!city) return null;

  const [regions, datasets, cities] = await Promise.all([
    getRegionMeta(city.id),
    getCityDatasets(city.id),
    listCities(),
  ]);

  const hotels = await getCoverageHotels(city.id, regions);

  // The live DB masters are the source of truth for facilities and vehicles:
  // the wizard writes there, and a stale `fleet` dataset must never hide a
  // vehicle the manager just added. The dataset is only a fallback for cities
  // that have no DB masters at all.
  const [facilityRows, vehicleRows] = await Promise.all([
    getFacilityRows(city.id),
    getVehicleRows(city.id),
  ]);

  let fleet = (datasets.fleet as CityFleet | undefined) ?? null;
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

  const geometries = datasets.plan_geometries as
    | { routes?: Record<string, [number, number][]> }
    | undefined;

  const depots = fleetDepots(fleet);
  const vehicles = fleetVehicles(fleet);
  const geoRoutes = geometries?.routes ?? {};
  const matrix = (datasets.travel_matrix as TravelMatrix | undefined) ?? null;
  const primaryDepot = depots[0]
    ? {
        id: depots[0].id,
        name: depots[0].name,
        lat: depots[0].latitude,
        lon: depots[0].longitude,
      }
    : undefined;

  // Manual routes carry their own stops. Attach the road geometry by route id
  // when it exists; otherwise draw a depot → stops → depot line so the map
  // always shows the route, even before OSRM geometries are generated.
  const manualRoutes = ((datasets.manual_routes as DispatchRoute[] | undefined) ?? []).map(
    (route) => {
      const geometry = route.route_id ? geoRoutes[route.route_id] : undefined;
      const path: [number, number][] =
        route.path_coordinates?.length > 0
          ? route.path_coordinates
          : geometry && geometry.length > 1
            ? geometry
            : straightLinePath(route, depots[0]);

      const distanceKm =
        route.total_dist_km > 0
          ? route.total_dist_km
          : pathDistanceKm(path) * (geometry ? 1 : city.roadFactor);
      const driveMins =
        route.total_drive_mins > 0
          ? route.total_drive_mins
          : Math.round((distanceKm / Math.max(1, city.fallbackSpeedKmh)) * 60);

      // Every route shows a full shift window. When the source data has no
      // return time, estimate it from departure + drive + stop service.
      const departureHq = formatClock(route.departure_hq || "07:00");
      const returnHq = route.return_hq
        ? formatClock(route.return_hq)
        : formatClock(
            minutesToClock(
              clockToMinutes(departureHq) + driveMins + route.total_service_mins,
            ),
          );

      const enriched: DispatchRoute = {
        ...route,
        departure_hq: departureHq,
        return_hq: returnHq,
        path_coordinates: path,
        total_dist_km: Number(distanceKm.toFixed(1)),
        total_drive_mins: driveMins,
      };

      // Cities onboarded in-app arrive without stop times. Fill each stop's
      // arrival/departure from the travel matrix, so every route has real
      // times like the hand-authored Bengaluru data.
      if (enriched.stops.every((stop) => !stop.arrival_time)) {
        return scheduleDispatchRoutes([enriched], primaryDepot, matrix, {
          fallbackSpeedKmh: city.fallbackSpeedKmh,
          roadFactor: city.roadFactor,
        })[0];
      }
      return enriched;
    },
  );

  const context: CityContext = {
    city,
    cities,
    regions,
    hotels,
    fleet: fleet ?? {},
    depots,
    vehicles,
    hexMap: (datasets.hex_map as HexMap | undefined) ?? {},
    travelMatrix: matrix,
    planGeometries: geoRoutes,
    optimizedRoutes: (datasets.optimized_routes as DispatchRoute[]) ?? [],
    manualRoutes,
    baselinePlan: (datasets.baseline_plan as Plan | undefined) ?? null,
  };

  cityContextCache.set(slug, {
    expiresAt: Date.now() + CONTEXT_CACHE_TTL_MS,
    value: context,
  });

  return context;
}

export const getCityContext = cache(loadCityContext);

function pathDistanceKm(path: [number, number][]): number {
  let total = 0;
  for (let index = 1; index < path.length; index += 1) {
    total += haversineKm(
      path[index - 1][0],
      path[index - 1][1],
      path[index][0],
      path[index][1],
    );
  }
  return total;
}

/** Straight depot → stops → depot path used before road geometries exist. */
function straightLinePath(
  route: DispatchRoute,
  depot: StudioDepot | undefined,
): [number, number][] {
  if (!depot || route.stops.length === 0) return [];
  const start: [number, number] = [depot.latitude, depot.longitude];
  return [
    start,
    ...route.stops.map((stop) => [stop.lat, stop.lon] as [number, number]),
    start,
  ];
}

/** The travel matrix of a city, or null when the city has not published one. */
export async function getCityTravelMatrix(
  cityId: string,
): Promise<TravelMatrix | null> {
  return (
    (await getCityDataset<TravelMatrix>(cityId, "travel_matrix")) ?? null
  );
}
