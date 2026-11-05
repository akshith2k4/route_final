export type DayPlanRoute = {
  route_id: string;
  route_name: string;
  color: string;
  daily_hotels: string[];
  "Day 1_Full": string[];
  "Day 2_Full": string[];
};

export type DayPlan = {
  routes: DayPlanRoute[];
};

export type DayKey = "day0" | "day1" | "day2";

export const DAY_HQ = {
  id: "depot-yeshwanthpur",
  name: "LinenGrass HQ",
  lat: 13.017275,
  lon: 77.546578,
} as const;

export type DayHotel = {
  key: string;
  name: string;
  routeId: string;
  routeName: string;
  color: string;
  daily: boolean;
  lat: number | null;
  lon: number | null;
  mappedName: string | null;
};

export type DayRouteView = {
  routeId: string;
  routeName: string;
  color: string;
  hotels: DayHotel[];
  dailyCount: number;
  alternativeCount: number;
};

export type DayData = {
  key: DayKey;
  label: string;
  caption: string;
  routes: DayRouteView[];
  total: number;
  unique: number;
  dailyTotal: number;
  alternativeTotal: number;
  missing: string[];
};

type HotelPoint = {
  id: string;
  name: string;
  lat: number;
  lon: number;
};

const HOTEL_ALIASES: Record<string, string> = {
  "HYATT WHITEFIELD MAHADEVPURA": "hyatt-centric-whitefield-bengaluru",
  "CASA PICOSSA E CITY": "casa-piccosa-e-city",
  "WANDR 100FT INDIRANAGAR": "wandr-indiranagar",
};

export function normalizeHotelName(value: string): string {
  return value.toUpperCase().replace(/[^A-Z0-9]+/g, " ").trim();
}

function namesForDay(route: DayPlanRoute, day: DayKey): string[] {
  if (day === "day0") return route.daily_hotels;
  if (day === "day1") return route["Day 1_Full"];
  return route["Day 2_Full"];
}

/**
 * Enriches the day plan with hotel coordinates. Names that are not in the
 * master hotel list are kept (so they still appear in the board) but marked
 * with null coordinates and listed as missing on the map.
 */
export function buildDayData(plan: DayPlan, hotels: HotelPoint[]): DayData[] {
  const byName = new Map(
    hotels.map((hotel) => [normalizeHotelName(hotel.name), hotel]),
  );
  const byId = new Map(hotels.map((hotel) => [hotel.id, hotel]));

  const resolve = (name: string): HotelPoint | null => {
    const normalized = normalizeHotelName(name);
    const direct = byName.get(normalized);
    if (direct) return direct;
    const aliasId = HOTEL_ALIASES[normalized];
    return aliasId ? (byId.get(aliasId) ?? null) : null;
  };

  const build = (
    key: DayKey,
    label: string,
    caption: string,
  ): DayData => {
    const routes = plan.routes.map<DayRouteView>((route) => {
      const dailyKeys = new Set(
        route.daily_hotels.map((name) => normalizeHotelName(name)),
      );
      const seen = new Set<string>();
      const routeHotels: DayHotel[] = [];

      for (const name of namesForDay(route, key)) {
        const normalized = normalizeHotelName(name);
        if (seen.has(normalized)) continue;
        seen.add(normalized);
        const point = resolve(name);
        routeHotels.push({
          key: point?.id ?? normalized,
          name,
          routeId: route.route_id,
          routeName: route.route_name,
          color: route.color,
          daily: key === "day0" ? true : dailyKeys.has(normalized),
          lat: point?.lat ?? null,
          lon: point?.lon ?? null,
          mappedName:
            point && normalizeHotelName(point.name) !== normalized
              ? point.name
              : null,
        });
      }

      const dailyCount = routeHotels.filter((hotel) => hotel.daily).length;
      return {
        routeId: route.route_id,
        routeName: route.route_name,
        color: route.color,
        hotels: routeHotels,
        dailyCount,
        alternativeCount: routeHotels.length - dailyCount,
      };
    });

    const allHotels = routes.flatMap((route) => route.hotels);
    const missing = [
      ...new Set(
        allHotels
          .filter((hotel) => hotel.lat === null || hotel.lon === null)
          .map((hotel) => hotel.name),
      ),
    ];

    return {
      key,
      label,
      caption,
      routes,
      total: allHotels.length,
      unique: new Set(allHotels.map((hotel) => hotel.key)).size,
      dailyTotal: allHotels.filter((hotel) => hotel.daily).length,
      alternativeTotal: allHotels.filter((hotel) => !hotel.daily).length,
      missing,
    };
  };

  return [
    build("day0", "Day 0", "Daily core"),
    build("day1", "Day 1", "Daily + Day 1"),
    build("day2", "Day 2", "Daily + Day 2"),
  ];
}
