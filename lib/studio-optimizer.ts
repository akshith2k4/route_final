import {
  haversineKm,
  type DispatchRoute,
  type DispatchStop,
  type FleetDepot,
  type Hotel,
  type HotelPriority,
  type StudioDepot,
  type StudioHotelSetting,
  type StudioShiftSetting,
  type StudioVehicle,
} from "./coverage";

export type OptimizationResult = {
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

// Helper: parse time "HH:MM" to minutes from midnight
function timeToMins(timeStr: string): number {
  if (!timeStr) return 8 * 60; // 08:00 default
  const parts = timeStr.split(":");
  const h = Number(parts[0]) || 0;
  const m = Number(parts[1]) || 0;
  return h * 60 + m;
}

// Helper: format minutes from midnight to "HH:MM AM/PM"
function minsToTimeStr(totalMins: number): string {
  const normalized = Math.max(0, Math.floor(totalMins)) % (24 * 60);
  const h24 = Math.floor(normalized / 60);
  const m = normalized % 60;
  const period = h24 >= 12 ? "PM" : "AM";
  const h12 = h24 % 12 === 0 ? 12 : h24 % 12;
  const mStr = m < 10 ? `0${m}` : `${m}`;
  return `${h12}:${mStr} ${period}`;
}

// Estimate road distance with Bengaluru curvature factor
function roadDistKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  return haversineKm(lat1, lon1, lat2, lon2) * 1.34;
}

// Estimate drive minutes at Bengaluru average logistics speed (~19 km/h)
function driveTimeMins(distKm: number): number {
  const avgSpeedKmh = 19;
  return Math.max(3, Math.round((distKm / avgSpeedKmh) * 60));
}

export function runStudioOptimization({
  hotels,
  hotelSettings,
  vehicles,
  depots,
  shiftSettings,
}: {
  hotels: Hotel[];
  hotelSettings: Record<string, StudioHotelSetting>;
  vehicles: StudioVehicle[];
  depots: StudioDepot[];
  shiftSettings: StudioShiftSetting;
}): OptimizationResult {
  const depotMap = new Map(depots.map((d) => [d.id, d]));
  const primaryDepot = depots.find((d) => d.isPrimary) ?? depots[0];

  // 1. Identify selected hotels
  const selectedHotels = hotels.filter((hotel) => {
    const setting = hotelSettings[hotel.name];
    return setting ? setting.selected : true;
  });

  const activeVehicles = vehicles.filter((v) => v.enabled);

  // Bag demands
  const hotelDemands = new Map<string, number>();
  let totalBagsDemanded = 0;
  for (const h of selectedHotels) {
    const setting = hotelSettings[h.name];
    const bags = setting?.customBags !== undefined ? setting.customBags : (h.load ?? 3);
    hotelDemands.set(h.name, bags);
    totalBagsDemanded += bags;
  }

  const totalFleetCapacity = activeVehicles.reduce((sum, v) => sum + v.max_load, 0);
  const warnings: string[] = [];

  if (activeVehicles.length === 0) {
    return {
      routes: [],
      unassignedHotels: selectedHotels.map((h) => ({
        hotel: h,
        reason: "No vehicles enabled in fleet configuration.",
      })),
      totalHotelsSelected: selectedHotels.length,
      totalHotelsAssigned: 0,
      totalBagsDemanded,
      totalFleetCapacity: 0,
      fleetUtilizationPct: 0,
      isFeasible: false,
      warnings: ["No active vehicles available. Please enable at least one vehicle."],
    };
  }

  if (selectedHotels.length === 0) {
    return {
      routes: [],
      unassignedHotels: [],
      totalHotelsSelected: 0,
      totalHotelsAssigned: 0,
      totalBagsDemanded: 0,
      totalFleetCapacity,
      fleetUtilizationPct: 0,
      isFeasible: true,
      warnings: ["No hotels selected for dispatch."],
    };
  }

  if (totalBagsDemanded > totalFleetCapacity) {
    const overflow = totalBagsDemanded - totalFleetCapacity;
    warnings.push(
      `Fleet capacity exceeded by ${overflow} bags (${totalBagsDemanded} bags demanded vs ${totalFleetCapacity} max load buffer). Some stops will require secondary wave or vehicle capacity override.`
    );
  }

  // 2. Sort hotels by priority so VIP and High priority stops get cluster priority
  const priorityWeight: Record<HotelPriority, number> = {
    VIP: 4,
    High: 3,
    Normal: 2,
    Flexible: 1,
  };

  const prioritizedHotels = [...selectedHotels].sort((a, b) => {
    const pA = priorityWeight[hotelSettings[a.name]?.priority ?? "Normal"];
    const pB = priorityWeight[hotelSettings[b.name]?.priority ?? "Normal"];
    if (pB !== pA) return pB - pA;
    // Tie breaker: bag demand descending
    return (hotelDemands.get(b.name) ?? 0) - (hotelDemands.get(a.name) ?? 0);
  });

  // 3. Capacitated clustering: Assign each hotel to best active vehicle
  type VehicleBucket = {
    vehicle: StudioVehicle;
    depot: StudioDepot;
    hotels: Hotel[];
    currentLoad: number;
  };

  const buckets: VehicleBucket[] = activeVehicles.map((v) => {
    const depot = depotMap.get(v.depot_id) ?? primaryDepot;
    return {
      vehicle: v,
      depot,
      hotels: [],
      currentLoad: 0,
    };
  });

  const unassignedHotels: { hotel: Hotel; reason: string }[] = [];

  for (const hotel of prioritizedHotels) {
    const demand = hotelDemands.get(hotel.name) ?? 3;

    // Rank candidate vehicles
    let bestBucket: VehicleBucket | null = null;
    let bestScore = Number.NEGATIVE_INFINITY;

    for (const bucket of buckets) {
      const remainingCap = bucket.vehicle.max_load - bucket.currentLoad;
      if (remainingCap < demand) {
        // Vehicle full for 90% buffer
        continue;
      }

      // Territory scoring
      let score = 0;

      // Region alignment
      if (bucket.vehicle.region_id === hotel.region) {
        score += 80;
      } else if (
        // Secondary adjacent region matches
        (bucket.vehicle.region_id === 1 && (hotel.region === 0 || hotel.region === 2 || hotel.region === 4)) ||
        (bucket.vehicle.region_id === 0 && hotel.region === 4) ||
        (bucket.vehicle.region_id === 3 && (hotel.region === 0 || hotel.region === 1))
      ) {
        score += 25;
      }

      // Distance to vehicle depot
      const distToDepot = roadDistKm(
        hotel.lat,
        hotel.lon,
        bucket.depot.latitude,
        bucket.depot.longitude
      );
      score -= distToDepot * 2.2;

      // Distance to existing stops in this bucket
      if (bucket.hotels.length > 0) {
        let minDistToStops = Number.POSITIVE_INFINITY;
        for (const existing of bucket.hotels) {
          const d = roadDistKm(hotel.lat, hotel.lon, existing.lat, existing.lon);
          if (d < minDistToStops) minDistToStops = d;
        }
        score -= minDistToStops * 3.5;
      }

      // Capacity buffer penalty if nearing limit
      const loadRatio = (bucket.currentLoad + demand) / bucket.vehicle.max_load;
      score -= loadRatio * 15;

      if (score > bestScore) {
        bestScore = score;
        bestBucket = bucket;
      }
    }

    if (bestBucket) {
      bestBucket.hotels.push(hotel);
      bestBucket.currentLoad += demand;
    } else {
      unassignedHotels.push({
        hotel,
        reason: `Exceeds max safe load across all ${activeVehicles.length} active vehicles.`,
      });
    }
  }

  // 4. Sequence each vehicle route with nearest-neighbor, priority & lunch window insertion
  const shiftStartMins = timeToMins(shiftSettings.earliestDeparture || "07:00");
  const shiftLatestReturnMins = timeToMins(shiftSettings.latestReturn || "17:00");
  const lunchDuration = shiftSettings.lunchDurationMins || 45;
  const lunchWindowStartMins = timeToMins(shiftSettings.lunchWindowStart || "12:30");
  const lunchWindowEndMins = timeToMins(shiftSettings.lunchWindowEnd || "14:00");

  const generatedRoutes: DispatchRoute[] = [];

  for (let bIdx = 0; bIdx < buckets.length; bIdx++) {
    const bucket = buckets[bIdx];
    if (bucket.hotels.length === 0) continue;

    const depot = bucket.depot;
    const vehicle = bucket.vehicle;

    let currentLat = depot.latitude;
    let currentLon = depot.longitude;
    let currentMins = shiftStartMins;
    let lunchTaken = !shiftSettings.lunchBreakEnabled;

    const remainingToVisit = [...bucket.hotels];
    const orderedStops: DispatchStop[] = [];
    const pathCoords: [number, number][] = [[depot.latitude, depot.longitude]];

    let stopCounter = 1;
    let totalDriveMins = 0;
    let totalServiceMins = 0;
    let totalDistKm = 0;
    let cumulativeBags = 0;

    while (remainingToVisit.length > 0) {
      // Check if lunch break should be inserted now
      if (
        !lunchTaken &&
        shiftSettings.lunchBreakEnabled &&
        currentMins >= lunchWindowStartMins
      ) {
        // Insert lunch stop right here
        const lunchArrival = minsToTimeStr(currentMins);
        currentMins += lunchDuration;
        const lunchDeparture = minsToTimeStr(currentMins);
        lunchTaken = true;

        orderedStops.push({
          stop_number: stopCounter++,
          name: "🍱 Driver Lunch Break (Mandatory Rest)",
          arrival_time: lunchArrival,
          departure_time: lunchDeparture,
          stop_mins: lunchDuration,
          load_bags: 0,
          lat: currentLat,
          lon: currentLon,
          address_locality: "Designated Route Rest Area",
        });
      }

      // Find the next best stop from current position
      let bestStopIdx = 0;
      let bestCandidateScore = Number.NEGATIVE_INFINITY;

      for (let i = 0; i < remainingToVisit.length; i++) {
        const candidate = remainingToVisit[i];
        const dist = roadDistKm(currentLat, currentLon, candidate.lat, candidate.lon);
        const driveM = driveTimeMins(dist);
        const arrivalEstimate = currentMins + driveM;

        const setting = hotelSettings[candidate.name];
        const priority = setting?.priority ?? "Normal";
        let cScore = -dist * 2.5;

        // Priority weighting
        if (priority === "VIP") cScore += 70;
        else if (priority === "High") cScore += 35;
        else if (priority === "Flexible") cScore -= 10;

        // Time window enforcement
        if (setting?.timeWindowEnabled) {
          const earliestM = timeToMins(setting.earliestArrival);
          const latestM = timeToMins(setting.latestArrival);
          if (arrivalEstimate < earliestM) {
            // Waiting time penalty
            cScore -= (earliestM - arrivalEstimate) * 0.5;
          } else if (arrivalEstimate > latestM) {
            // Late penalty
            cScore -= (arrivalEstimate - latestM) * 3;
          } else {
            // Perfect window bonus
            cScore += 40;
          }
        }

        if (cScore > bestCandidateScore) {
          bestCandidateScore = cScore;
          bestStopIdx = i;
        }
      }

      const nextHotel = remainingToVisit.splice(bestStopIdx, 1)[0];
      const dist = roadDistKm(currentLat, currentLon, nextHotel.lat, nextHotel.lon);
      const driveM = driveTimeMins(dist);

      totalDistKm += dist;
      totalDriveMins += driveM;
      currentMins += driveM;

      const arrivalTime = minsToTimeStr(currentMins);

      // Service time: 12 mins base + 2.5 mins per bag
      const setting = hotelSettings[nextHotel.name];
      const bags = hotelDemands.get(nextHotel.name) ?? (nextHotel.load ?? 3);
      const serviceM = setting?.customStopMins ?? Math.round(12 + bags * 2.2);

      totalServiceMins += serviceM;
      currentMins += serviceM;
      const departureTime = minsToTimeStr(currentMins);
      cumulativeBags += bags;

      orderedStops.push({
        stop_number: stopCounter++,
        name: nextHotel.name,
        arrival_time: arrivalTime,
        departure_time: departureTime,
        stop_mins: serviceM,
        load_bags: bags,
        lat: nextHotel.lat,
        lon: nextHotel.lon,
        address_locality: nextHotel.locality ?? `Region ${nextHotel.region}`,
      });

      // Add polyline step (with subtle midpoint to simulate road routing)
      const midLat = (currentLat + nextHotel.lat) / 2 + (Math.random() - 0.5) * 0.003;
      const midLon = (currentLon + nextHotel.lon) / 2 + (Math.random() - 0.5) * 0.003;
      pathCoords.push([midLat, midLon]);
      pathCoords.push([nextHotel.lat, nextHotel.lon]);

      currentLat = nextHotel.lat;
      currentLon = nextHotel.lon;
    }

    // Return to assigned depot
    const returnDist = roadDistKm(currentLat, currentLon, depot.latitude, depot.longitude);
    const returnDriveM = driveTimeMins(returnDist);
    totalDistKm += returnDist;
    totalDriveMins += returnDriveM;
    currentMins += returnDriveM;

    // Add return path
    pathCoords.push([depot.latitude, depot.longitude]);

    const totalShiftMins = currentMins - shiftStartMins;
    const utilizationPct = Math.min(
      100,
      Math.round((cumulativeBags / vehicle.max_load) * 100)
    );

    if (currentMins > shiftLatestReturnMins) {
      const overtime = currentMins - shiftLatestReturnMins;
      warnings.push(
        `${vehicle.label} shift runs ${overtime}m past latest return cutoff (${minsToTimeStr(currentMins)} vs ${minsToTimeStr(shiftLatestReturnMins)}).`
      );
    }

    generatedRoutes.push({
      route_id: `studio-v${vehicle.id}`,
      vehicle_id: vehicle.id,
      vehicle_label: `${vehicle.label} (${vehicle.sector})`,
      region_id: vehicle.region_id,
      region_name: vehicle.region_name,
      color: vehicle.color,
      nominal_cap: vehicle.nominal_capacity,
      nominal_capacity: vehicle.nominal_capacity,
      max_load: vehicle.max_load,
      max_load_90pct: vehicle.max_load,
      departure_hq: depot.name,
      return_hq: depot.name,
      total_hotels: orderedStops.filter((s) => !s.name.includes("Lunch")).length,
      total_bags: cumulativeBags,
      total_dist_km: Math.round(totalDistKm * 10) / 10,
      total_drive_mins: totalDriveMins,
      total_service_mins: totalServiceMins,
      shift_duration_mins: totalShiftMins,
      capacity_utilization_pct: utilizationPct,
      stops: orderedStops,
      path_coordinates: pathCoords,
    });
  }

  const assignedHotelsCount = selectedHotels.length - unassignedHotels.length;
  const fleetUtilizationPct =
    totalFleetCapacity > 0
      ? Math.round((totalBagsDemanded / totalFleetCapacity) * 100)
      : 0;

  return {
    routes: generatedRoutes,
    unassignedHotels,
    totalHotelsSelected: selectedHotels.length,
    totalHotelsAssigned: assignedHotelsCount,
    totalBagsDemanded,
    totalFleetCapacity,
    fleetUtilizationPct,
    isFeasible: unassignedHotels.length === 0,
    warnings,
  };
}
