import {
  type DispatchRoute,
  type DispatchStop,
  type Hotel,
  type HotelPriority,
  type StudioHotelSetting,
  type StudioShiftSetting,
  type StudioVehicle,
} from "./coverage";
import { getGoogleAccessToken } from "./google-auth";

const DEPOT = { latitude: 13.017275, longitude: 77.546578 };
const DEPOT_NAME = "LinenGrass HQ (Yeshwanthpur Central Laundry)";

// Decodes a Google Encoded Polyline into LatLng array
export function decodePolyline(encoded: string): [number, number][] {
  if (!encoded) return [];
  const points: [number, number][] = [];
  let index = 0;
  const len = encoded.length;
  let lat = 0;
  let lng = 0;

  while (index < len) {
    let b: number;
    let shift = 0;
    let result = 0;
    do {
      b = encoded.charCodeAt(index++) - 63;
      result |= (b & 0x1f) << shift;
      shift += 5;
    } while (b >= 0x20);
    const dlat = (result & 1) !== 0 ? ~(result >> 1) : result >> 1;
    lat += dlat;

    shift = 0;
    result = 0;
    do {
      b = encoded.charCodeAt(index++) - 63;
      result |= (b & 0x1f) << shift;
      shift += 5;
    } while (b >= 0x20);
    const dlng = (result & 1) !== 0 ? ~(result >> 1) : result >> 1;
    lng += dlng;

    points.push([lat / 1e5, lng / 1e5]);
  }

  return points;
}

// Converts a timestamp to IST string "08:30 AM"
function formatIst(isoString?: string): string {
  if (!isoString) return "08:00 AM";
  const date = new Date(isoString);
  return date.toLocaleTimeString("en-IN", {
    timeZone: "Asia/Kolkata",
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
  });
}

function parseSeconds(durationStr?: string): number {
  if (!durationStr) return 0;
  return Number.parseInt(durationStr.replace("s", ""), 10) || 0;
}

export type GoogleOptimizationResult = {
  provider: "google";
  routes: DispatchRoute[];
  unassignedHotels: { hotel: Hotel; reason: string }[];
  totalHotelsSelected: number;
  totalHotelsAssigned: number;
  totalBagsDemanded: number;
  totalFleetCapacity: number;
  fleetUtilizationPct: number;
  isFeasible: boolean;
  warnings: string[];
};

export type OptimizationObjective =
  | "fastest_turnaround"
  | "shortest_distance"
  | "balanced"
  | "minimize_fleet";

export async function callGoogleOptimizeTours({
  hotels,
  hotelSettings,
  vehicles,
  shiftSettings,
  objective = "balanced",
}: {
  hotels: Hotel[];
  hotelSettings: Record<string, StudioHotelSetting>;
  vehicles: StudioVehicle[];
  shiftSettings: StudioShiftSetting;
  objective?: OptimizationObjective;
}): Promise<GoogleOptimizationResult> {
  const { token, projectId } = await getGoogleAccessToken();

  // 1. Filter selected hotels & enabled vehicles
  const selectedHotels = hotels.filter((h) => {
    const s = hotelSettings[h.name];
    return s ? s.selected : true;
  });

  const activeVehicles = vehicles.filter((v) => v.enabled);

  if (activeVehicles.length === 0) {
    throw new Error("No vehicles enabled in fleet. Please enable at least one vehicle.");
  }
  if (selectedHotels.length === 0) {
    throw new Error("No hotels selected for dispatch.");
  }

  // 2. Set shift date window (Tomorrow morning IST)
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  const dateStr = tomorrow.toISOString().slice(0, 10);

  const departureTime = shiftSettings.earliestDeparture || "07:00";
  const returnTime = shiftSettings.latestReturn || "17:00";
  const globalStartIso = `${dateStr}T${departureTime}:00+05:30`;
  const globalEndIso = `${dateStr}T${returnTime}:00+05:30`;

  // 3. Build Google Shipments
  const hotelDemands = new Map<string, number>();
  let totalBagsDemanded = 0;

  const penaltyCostMap: Record<HotelPriority, number> = {
    VIP: 500000.0,
    High: 200000.0,
    Normal: 80000.0,
    Flexible: 30000.0,
  };

  const shipments = selectedHotels.map((h) => {
    const s = hotelSettings[h.name];
    const bags = s?.customBags !== undefined ? s.customBags : (h.load ?? 3);
    const stopMins = s?.customStopMins ?? (h.stop_mins ?? 21);
    hotelDemands.set(h.name, bags);
    totalBagsDemanded += bags;

    const delivery: any = {
      arrivalLocation: { latitude: h.lat, longitude: h.lon },
      duration: `${stopMins * 60}s`,
    };

    if (s?.timeWindowEnabled && s.earliestArrival && s.latestArrival) {
      delivery.timeWindows = [
        {
          startTime: `${dateStr}T${s.earliestArrival}:00+05:30`,
          endTime: `${dateStr}T${s.latestArrival}:00+05:30`,
        },
      ];
    }

    const priority = s?.priority ?? "Normal";

    return {
      label: h.name,
      deliveries: [delivery],
      loadDemands: {
        space: { amount: String(bags) },
      },
      penaltyCost: penaltyCostMap[priority],
    };
  });

  // 4. Build Google Vehicles with Objective Cost Weights
  let costPerHour = 100.0;
  let costPerKilometer = 10.0;
  let costPerTraveledHour = 0.0;
  let fixedCost = 0.0;

  if (objective === "fastest_turnaround") {
    // Prioritize fastest return to Yeshwanthpur HQ and avoiding traffic congestion
    costPerHour = 1000.0;
    costPerTraveledHour = 500.0;
    costPerKilometer = 1.0;
  } else if (objective === "shortest_distance") {
    // Prioritize minimal road kilometers and fuel savings
    costPerHour = 10.0;
    costPerTraveledHour = 0.0;
    costPerKilometer = 100.0;
  } else if (objective === "minimize_fleet") {
    // Prioritize consolidating loads to keep spare vans at HQ
    costPerHour = 100.0;
    costPerKilometer = 10.0;
    fixedCost = 3000.0;
  } else {
    // Balanced hybrid default
    costPerHour = 100.0;
    costPerKilometer = 10.0;
  }

  const googleVehicles = activeVehicles.map((v) => {
    const vehicleObj: any = {
      label: `${v.label} (R${v.region_id} - ${v.sector})`,
      startLocation: DEPOT,
      endLocation: DEPOT,
      startTimeWindows: [{ startTime: globalStartIso, endTime: globalEndIso }],
      loadLimits: {
        space: { maxLoad: String(v.max_load) },
      },
      costPerHour,
      costPerKilometer,
    };

    if (costPerTraveledHour > 0) {
      vehicleObj.costPerTraveledHour = costPerTraveledHour;
    }
    if (fixedCost > 0) {
      vehicleObj.fixedCost = fixedCost;
    }

    if (shiftSettings.lunchBreakEnabled) {
      const lunchStart = shiftSettings.lunchWindowStart || "12:30";
      const lunchEnd = shiftSettings.lunchWindowEnd || "14:00";
      const lunchDuration = (shiftSettings.lunchDurationMins || 45) * 60;

      vehicleObj.breakRule = {
        breakRequests: [
          {
            earliestStartTime: `${dateStr}T${lunchStart}:00+05:30`,
            latestStartTime: `${dateStr}T${lunchEnd}:00+05:30`,
            minDuration: `${lunchDuration}s`,
          },
        ],
      };
    }

    return vehicleObj;
  });

  // 5. Build optimizeTours Request Payload
  const reqBody = {
    model: {
      shipments,
      vehicles: googleVehicles,
      globalStartTime: globalStartIso,
      globalEndTime: globalEndIso,
    },
    populatePolylines: true,
    populateTransitionPolylines: true,
    considerRoadTraffic: true,
  };

  const apiUrl = `https://routeoptimization.googleapis.com/v1/projects/${projectId}:optimizeTours`;
  const res = await fetch(apiUrl, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(reqBody),
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Google Route Optimization API failed (${res.status}): ${errText}`);
  }

  const data = await res.json();
  const routesData: any[] = data.routes || [];
  const skippedShipments: any[] = data.skippedShipments || [];

  const hotelMap = new Map(hotels.map((h) => [h.name, h]));
  const vehicleMap = new Map(activeVehicles.map((v) => [v.label, v]));

  // 6. Parse Google Routes
  const parsedRoutes: DispatchRoute[] = [];

  for (let rIdx = 0; rIdx < routesData.length; rIdx++) {
    const gRoute = routesData[rIdx];
    const rawLabel = gRoute.vehicleLabel || "";
    const matchedVan =
      activeVehicles.find((v) => rawLabel.startsWith(v.label)) ??
      activeVehicles[rIdx] ??
      activeVehicles[0];

    const visits: any[] = gRoute.visits || [];
    const transitions: any[] = gRoute.transitions || [];
    const breaks: any[] = gRoute.breaks || [];

    const stops: DispatchStop[] = [];
    let stopCounter = 1;
    let cumulativeBags = 0;

    // Decode polyline
    let pathCoords: [number, number][] = [];
    if (gRoute.routePolyline?.points) {
      pathCoords = decodePolyline(gRoute.routePolyline.points);
    } else {
      // Fallback path connecting visits
      pathCoords = [[DEPOT.latitude, DEPOT.longitude]];
      for (const v of visits) {
        const hName = v.shipmentLabel;
        const hObj = hotelMap.get(hName);
        if (hObj) pathCoords.push([hObj.lat, hObj.lon]);
      }
      pathCoords.push([DEPOT.latitude, DEPOT.longitude]);
    }

    // Extract stops and lunch breaks chronologically
    for (const visit of visits) {
      const hotelName = visit.shipmentLabel;
      const hotelObj = hotelMap.get(hotelName);
      const bags = hotelDemands.get(hotelName) ?? 3;
      cumulativeBags += bags;

      const arrivalTime = formatIst(visit.startTime);
      const departureTime = formatIst(visit.detour || visit.startTime);
      const serviceM = Math.round(parseSeconds(visit.duration) / 60) || 20;

      stops.push({
        stop_number: stopCounter++,
        name: hotelName,
        arrival_time: arrivalTime,
        departure_time: departureTime,
        stop_mins: serviceM,
        load_bags: bags,
        lat: hotelObj?.lat ?? DEPOT.latitude,
        lon: hotelObj?.lon ?? DEPOT.longitude,
        address_locality: hotelObj?.locality ?? `Region ${hotelObj?.region ?? matchedVan.region_id}`,
      });
    }

    // Insert scheduled lunch breaks if returned by Google
    for (const b of breaks) {
      const lunchArrival = formatIst(b.startTime);
      const lunchDurationM = Math.round(parseSeconds(b.duration) / 60) || 45;
      stops.splice(Math.max(1, Math.floor(stops.length / 2)), 0, {
        stop_number: stopCounter++,
        name: "🍱 Driver Lunch Break (Google Scheduled)",
        arrival_time: lunchArrival,
        departure_time: lunchArrival,
        stop_mins: lunchDurationM,
        load_bags: 0,
        lat: stops[0]?.lat ?? DEPOT.latitude,
        lon: stops[0]?.lon ?? DEPOT.longitude,
        address_locality: "Mandatory Route Rest Stop",
      });
    }

    const distMeters = gRoute.metrics?.travelDistanceMeters || 0;
    const driveSecs = parseSeconds(gRoute.metrics?.travelDuration);
    const totalDistKm = Math.round((distMeters / 1000) * 10) / 10;
    const totalDriveMins = Math.round(driveSecs / 60);
    const totalServiceMins = stops.reduce((sum, s) => sum + s.stop_mins, 0);
    const shiftDurationMins = totalDriveMins + totalServiceMins;

    const utilizationPct = Math.min(
      100,
      Math.round((cumulativeBags / matchedVan.max_load) * 100)
    );

    parsedRoutes.push({
      route_id: `google-v${matchedVan.id}`,
      vehicle_id: matchedVan.id,
      vehicle_label: `${matchedVan.label} (${matchedVan.sector})`,
      region_id: matchedVan.region_id,
      region_name: matchedVan.region_name,
      color: matchedVan.color,
      nominal_cap: matchedVan.nominal_capacity,
      nominal_capacity: matchedVan.nominal_capacity,
      max_load: matchedVan.max_load,
      max_load_90pct: matchedVan.max_load,
      departure_hq: DEPOT_NAME,
      return_hq: DEPOT_NAME,
      total_hotels: stops.filter((s) => !s.name.includes("Lunch")).length,
      total_bags: cumulativeBags,
      total_dist_km: totalDistKm,
      total_drive_mins: totalDriveMins,
      total_service_mins: totalServiceMins,
      shift_duration_mins: shiftDurationMins,
      capacity_utilization_pct: utilizationPct,
      stops,
      path_coordinates: pathCoords,
    });
  }

  const unassignedHotels: { hotel: Hotel; reason: string }[] = [];
  for (const skipped of skippedShipments) {
    const hObj = hotelMap.get(skipped.label);
    if (hObj) {
      unassignedHotels.push({
        hotel: hObj,
        reason: skipped.reasons?.[0]?.description || "Exceeded fleet shift or capacity constraints",
      });
    }
  }

  const totalFleetCapacity = activeVehicles.reduce((sum, v) => sum + v.max_load, 0);
  const fleetUtilizationPct =
    totalFleetCapacity > 0
      ? Math.round((totalBagsDemanded / totalFleetCapacity) * 100)
      : 0;

  const warnings: string[] = [];
  if (unassignedHotels.length > 0) {
    warnings.push(
      `${unassignedHotels.length} hotels were skipped by Google solver due to capacity/shift bounds.`
    );
  }

  return {
    provider: "google",
    routes: parsedRoutes,
    unassignedHotels,
    totalHotelsSelected: selectedHotels.length,
    totalHotelsAssigned: selectedHotels.length - unassignedHotels.length,
    totalBagsDemanded,
    totalFleetCapacity,
    fleetUtilizationPct,
    isFeasible: unassignedHotels.length === 0,
    warnings,
  };
}
