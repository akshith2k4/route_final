import {
  latLngToCell,
  cellToBoundary,
  gridDisk,
  gridPathCells,
  cellsToMultiPolygon,
  type CoordPair,
} from "h3-js";

export const ONBOARDING_H3_RESOLUTION = 7;

export type CityPreset = {
  id: string;
  name: string;
  state: string;
  centerLat: number;
  centerLon: number;
  depotName: string;
  description: string;
};

export const CITY_PRESETS: CityPreset[] = [
  {
    id: "bengaluru",
    name: "Bengaluru",
    state: "Karnataka",
    centerLat: 12.9716,
    centerLon: 77.5946,
    depotName: "LinenGrass HQ (Yeshwanthpur)",
    description: "Primary operational hub across 5 urban sectors and outer ribbons",
  },
  {
    id: "mumbai",
    name: "Mumbai & MMR",
    state: "Maharashtra",
    centerLat: 19.0760,
    centerLon: 72.8777,
    depotName: "BKC / Kurla Central Depot",
    description: "Linear peninsula geography with Western & Eastern express corridors",
  },
  {
    id: "pune",
    name: "Pune",
    state: "Maharashtra",
    centerLat: 18.5204,
    centerLon: 73.8567,
    depotName: "Shivajinagar / Hadapsar Hub",
    description: "Radial IT corridors across Hinjawadi, Kharadi, and Viman Nagar",
  },
  {
    id: "hyderabad",
    name: "Hyderabad",
    state: "Telangana",
    centerLat: 17.3850,
    centerLon: 78.4867,
    depotName: "Gachibowli / Madhapur Hub",
    description: "Cyberabad, Banjara Hills, Secunderabad, and ORR highway hotels",
  },
  {
    id: "chennai",
    name: "Chennai",
    state: "Tamil Nadu",
    centerLat: 13.0827,
    centerLon: 80.2707,
    depotName: "Guindy Industrial Logistics Hub",
    description: "OMR IT expressway, Mount Road, and Airport arterial",
  },
  {
    id: "delhi-ncr",
    name: "Delhi NCR",
    state: "Delhi NCR",
    centerLat: 28.6139,
    centerLon: 77.2090,
    depotName: "Okhla / Aerocity Distribution Depot",
    description: "Tri-state metro spanning Delhi Central, Gurugram, and Noida",
  },
  {
    id: "ahmedabad",
    name: "Ahmedabad",
    state: "Gujarat",
    centerLat: 23.0225,
    centerLon: 72.5714,
    depotName: "SG Highway Central Hub",
    description: "Sabarmati corridor, SG Road, and Sanand industrial belt",
  },
  {
    id: "kolkata",
    name: "Kolkata",
    state: "West Bengal",
    centerLat: 22.5726,
    centerLon: 88.3639,
    depotName: "Salt Lake Sector V Hub",
    description: "Park Street, Salt Lake, New Town, and Rajarhat hotels",
  },
  {
    id: "kochi",
    name: "Kochi",
    state: "Kerala",
    centerLat: 9.9312,
    centerLon: 76.2673,
    depotName: "Kalamassery / Edappally Hub",
    description: "Kakkanad Infopark, Marine Drive, MG Road, and Willingdon Island",
  },
  {
    id: "goa",
    name: "Goa (North & South)",
    state: "Goa",
    centerLat: 15.3993,
    centerLon: 73.8783,
    depotName: "Panaji / Verna Central Facility",
    description: "Coastal resort clusters from Calangute/Candolim to Candolim/Cavelossim",
  },
];

export type OnboardingHotel = {
  id: string;
  name: string;
  lat: number;
  lon: number;
  load: number;
  stop_mins: number;
  regionId?: number;
  regionName?: string;
  distToCenterKm?: number;
  distToCentroidKm?: number;
  h3Index?: string;
};

export type RegionMetaDefinition = {
  id: number;
  code: string;
  name: string;
  color: string;
  centroid: { lat: number; lon: number };
  hotelCount: number;
  totalBags: number;
  avgRadiusKm: number;
  maxRadiusKm: number;
  distFromDepotKm: number;
  estimatedVans: number;
  dominantCorridor: string;
};

export type ClusterEvaluation = {
  k: number;
  score: number; // 0 - 100 composite
  verdict: "optimal" | "viable" | "imbalanced" | "fragmented" | "sprawling";
  verdictLabel: string;
  silhouette: number; // -1 to +1 (higher is better)
  daviesBouldin: number; // lower is better
  calinskiHarabasz: number; // higher is better
  inertia: number;
  workloadBalance: number; // min/max count ratio (0 - 1)
  bagBalance: number; // min/max bag ratio (0 - 1)
  minHotels: number;
  maxHotels: number;
  avgHotels: number;
  avgRadiusKm: number;
  maxRadiusKm: number;
  totalVans: number;
  whyBetter: string[];
  drawbacks: string[];
  comparisonNote: string;
  regions: RegionMetaDefinition[];
  assignments: number[]; // index matches hotels array
};

export const REGION_COLORS = [
  "#2d5b42", // Forest Green
  "#1e3a8a", // Navy Blue
  "#b45309", // Amber Ochre
  "#7c3aed", // Rich Violet
  "#b91c1c", // Crimson
  "#0d9488", // Teal
  "#c2410c", // Burnt Orange
  "#4338ca", // Indigo
  "#0369a1", // Ocean Sky
  "#a21caf", // Magenta
  "#4d7c0f", // Olive Green
  "#be123c", // Ruby Rose
];

export function haversineKm(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

export function bearingDegrees(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number {
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const y = Math.sin(dLon) * Math.cos((lat2 * Math.PI) / 180);
  const x =
    Math.cos((lat1 * Math.PI) / 180) * Math.sin((lat2 * Math.PI) / 180) -
    Math.sin((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.cos(dLon);
  return ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360;
}

export function getCorridorName(
  centerLat: number,
  centerLon: number,
  destLat: number,
  destLon: number,
  distKm: number
): string {
  if (distKm < 3.2) return "Central Core / Downtown";
  const b = bearingDegrees(centerLat, centerLon, destLat, destLon);
  if (b >= 337.5 || b < 22.5) return "North Arterial";
  if (b >= 22.5 && b < 67.5) return "North-East Sector";
  if (b >= 67.5 && b < 112.5) return "East Corridor";
  if (b >= 112.5 && b < 157.5) return "South-East Sector";
  if (b >= 157.5 && b < 202.5) return "South Arterial";
  if (b >= 202.5 && b < 247.5) return "South-West Sector";
  if (b >= 247.5 && b < 292.5) return "West Corridor";
  return "North-West Sector";
}

// ==========================================
// CSV PARSER
// ==========================================

export type ParseCsvResult = {
  success: boolean;
  hotels: OnboardingHotel[];
  errors: string[];
  warnings: string[];
  summary: {
    totalRows: number;
    validHotels: number;
    totalBags: number;
    minLat: number;
    maxLat: number;
    minLon: number;
    maxLon: number;
    centerDistanceAvg: number;
  };
};

export function parseHotelsCsv(
  csvText: string,
  centerLat: number,
  centerLon: number
): ParseCsvResult {
  const lines = csvText
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);

  const errors: string[] = [];
  const warnings: string[] = [];

  if (lines.length < 2) {
    return {
      success: false,
      hotels: [],
      errors: ["CSV must contain at least a header row and one hotel row."],
      warnings,
      summary: {
        totalRows: 0,
        validHotels: 0,
        totalBags: 0,
        minLat: 0,
        maxLat: 0,
        minLon: 0,
        maxLon: 0,
        centerDistanceAvg: 0,
      },
    };
  }

  // Parse header
  const rawHeaders = splitCsvLine(lines[0]).map((h) =>
    h.toLowerCase().replace(/["\s_]+/g, "")
  );

  const nameIdx = rawHeaders.findIndex((h) =>
    ["name", "hotelname", "hotel", "property", "title"].includes(h)
  );
  const latIdx = rawHeaders.findIndex((h) =>
    ["lat", "latitude", "y", "latitud"].includes(h)
  );
  const lonIdx = rawHeaders.findIndex((h) =>
    ["lon", "lng", "longitude", "x", "longitud"].includes(h)
  );
  const loadIdx = rawHeaders.findIndex((h) =>
    ["load", "bags", "demand", "bagsdemand", "bag", "capacity"].includes(h)
  );
  const stopMinsIdx = rawHeaders.findIndex((h) =>
    ["stopmins", "servicemins", "duration", "mins", "stoptime"].includes(h)
  );

  if (latIdx === -1 || lonIdx === -1) {
    errors.push(
      "Could not detect Latitude and Longitude columns. Expected headers like 'lat', 'latitude', 'lon', 'longitude'."
    );
    return {
      success: false,
      hotels: [],
      errors,
      warnings,
      summary: {
        totalRows: lines.length - 1,
        validHotels: 0,
        totalBags: 0,
        minLat: 0,
        maxLat: 0,
        minLon: 0,
        maxLon: 0,
        centerDistanceAvg: 0,
      },
    };
  }

  const hotels: OnboardingHotel[] = [];
  let totalBags = 0;
  let minLat = Infinity;
  let maxLat = -Infinity;
  let minLon = Infinity;
  let maxLon = -Infinity;
  let distSum = 0;

  for (let i = 1; i < lines.length; i++) {
    const row = splitCsvLine(lines[i]);
    if (row.length <= Math.max(latIdx, lonIdx)) continue;

    const latVal = parseFloat(row[latIdx]);
    const lonVal = parseFloat(row[lonIdx]);

    if (isNaN(latVal) || isNaN(lonVal)) {
      warnings.push(`Row ${i + 1}: Skipped row due to invalid coordinates.`);
      continue;
    }

    if (latVal < -90 || latVal > 90 || lonVal < -180 || lonVal > 180) {
      warnings.push(`Row ${i + 1}: Coordinates out of geographical range.`);
      continue;
    }

    const nameVal =
      nameIdx !== -1 && row[nameIdx]?.trim()
        ? row[nameIdx].trim().replace(/^"|"$/g, "")
        : `Hotel #${i}`;

    const loadVal =
      loadIdx !== -1 && !isNaN(parseInt(row[loadIdx]))
        ? Math.max(1, parseInt(row[loadIdx]))
        : 3;

    const stopMinsVal =
      stopMinsIdx !== -1 && !isNaN(parseInt(row[stopMinsIdx]))
        ? Math.max(5, parseInt(row[stopMinsIdx]))
        : 15;

    const distToCenter = haversineKm(centerLat, centerLon, latVal, lonVal);

    if (distToCenter > 150) {
      warnings.push(
        `Row ${i + 1} (${nameVal}) is ${Math.round(distToCenter)} km from city center. Check if coordinates belong to another city.`
      );
    }

    let h3Idx = "";
    try {
      h3Idx = latLngToCell(latVal, lonVal, ONBOARDING_H3_RESOLUTION);
    } catch {
      // ignore
    }

    hotels.push({
      id: `hotel-${hotels.length + 1}`,
      name: nameVal,
      lat: latVal,
      lon: lonVal,
      load: loadVal,
      stop_mins: stopMinsVal,
      distToCenterKm: Math.round(distToCenter * 10) / 10,
      h3Index: h3Idx,
    });

    totalBags += loadVal;
    distSum += distToCenter;
    if (latVal < minLat) minLat = latVal;
    if (latVal > maxLat) maxLat = latVal;
    if (lonVal < minLon) minLon = lonVal;
    if (lonVal > maxLon) maxLon = lonVal;
  }

  if (hotels.length === 0) {
    errors.push("No valid hotel rows could be parsed from the CSV.");
    return {
      success: false,
      hotels: [],
      errors,
      warnings,
      summary: {
        totalRows: lines.length - 1,
        validHotels: 0,
        totalBags: 0,
        minLat: 0,
        maxLat: 0,
        minLon: 0,
        maxLon: 0,
        centerDistanceAvg: 0,
      },
    };
  }

  return {
    success: true,
    hotels,
    errors,
    warnings,
    summary: {
      totalRows: lines.length - 1,
      validHotels: hotels.length,
      totalBags,
      minLat,
      maxLat,
      minLon,
      maxLon,
      centerDistanceAvg: Math.round((distSum / hotels.length) * 10) / 10,
    },
  };
}

function splitCsvLine(text: string): string[] {
  const result: string[] = [];
  let cur = "";
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    if (char === '"') {
      inQuotes = !inQuotes;
    } else if (char === "," && !inQuotes) {
      result.push(cur.trim());
      cur = "";
    } else {
      cur += char;
    }
  }
  result.push(cur.trim());
  return result;
}

// ==========================================
// K-MEANS & MULTI-K EVALUATION ENGINE
// ==========================================

type ProjectedPoint = {
  x: number; // meters from city center
  y: number; // meters from city center
  lat: number;
  lon: number;
  origIndex: number;
  load: number;
};

export function projectPoints(
  hotels: OnboardingHotel[],
  centerLat: number,
  centerLon: number
): ProjectedPoint[] {
  const latRad = (centerLat * Math.PI) / 180;
  const mPerDegLat = 111132.92 - 559.82 * Math.cos(2 * latRad);
  const mPerDegLon = 111412.84 * Math.cos(latRad);

  return hotels.map((h, idx) => ({
    x: (h.lon - centerLon) * mPerDegLon,
    y: (h.lat - centerLat) * mPerDegLat,
    lat: h.lat,
    lon: h.lon,
    origIndex: idx,
    load: h.load,
  }));
}

function euclideanDist(
  p1: { x: number; y: number },
  p2: { x: number; y: number }
): number {
  const dx = p1.x - p2.x;
  const dy = p1.y - p2.y;
  return Math.sqrt(dx * dx + dy * dy);
}

// Seedable pseudo-random for deterministic K-Means runs
function makeRng(seed: number) {
  let s = seed;
  return function () {
    s = (s * 9301 + 49297) % 233280;
    return s / 233280;
  };
}

export function runKMeans(
  points: ProjectedPoint[],
  k: number,
  seed = 42,
  maxIterations = 60
): {
  centroids: { x: number; y: number }[];
  assignments: number[];
  inertia: number;
} {
  const rng = makeRng(seed);
  const n = points.length;

  if (k >= n) {
    return {
      centroids: points.map((p) => ({ x: p.x, y: p.y })),
      assignments: points.map((_, i) => i),
      inertia: 0,
    };
  }

  // 1. K-Means++ initialization
  const centroids: { x: number; y: number }[] = [];
  const firstIdx = Math.floor(rng() * n);
  centroids.push({ x: points[firstIdx].x, y: points[firstIdx].y });

  while (centroids.length < k) {
    const distSq: number[] = new Array(n);
    let sumDistSq = 0;
    for (let i = 0; i < n; i++) {
      let minDist = Infinity;
      for (const c of centroids) {
        const d = euclideanDist(points[i], c);
        if (d < minDist) minDist = d;
      }
      distSq[i] = minDist * minDist;
      sumDistSq += distSq[i];
    }

    let r = rng() * sumDistSq;
    let chosenIdx = 0;
    for (let i = 0; i < n; i++) {
      r -= distSq[i];
      if (r <= 0) {
        chosenIdx = i;
        break;
      }
    }
    centroids.push({ x: points[chosenIdx].x, y: points[chosenIdx].y });
  }

  // 2. Lloyd's algorithm iterations
  const assignments = new Array(n).fill(0);

  for (let iter = 0; iter < maxIterations; iter++) {
    let changed = false;

    for (let i = 0; i < n; i++) {
      let minDist = Infinity;
      let bestCluster = 0;
      for (let c = 0; c < k; c++) {
        const d = euclideanDist(points[i], centroids[c]);
        if (d < minDist) {
          minDist = d;
          bestCluster = c;
        }
      }
      if (assignments[i] !== bestCluster) {
        assignments[i] = bestCluster;
        changed = true;
      }
    }

    if (!changed && iter > 0) break;

    // Recalculate centroids
    const sums = Array.from({ length: k }, () => ({ x: 0, y: 0, count: 0 }));
    for (let i = 0; i < n; i++) {
      const a = assignments[i];
      sums[a].x += points[i].x;
      sums[a].y += points[i].y;
      sums[a].count++;
    }

    for (let c = 0; c < k; c++) {
      if (sums[c].count > 0) {
        centroids[c] = {
          x: sums[c].x / sums[c].count,
          y: sums[c].y / sums[c].count,
        };
      }
    }
  }

  // Compute inertia
  let inertia = 0;
  for (let i = 0; i < n; i++) {
    inertia += euclideanDist(points[i], centroids[assignments[i]]) ** 2;
  }

  return { centroids, assignments, inertia };
}

// Compute Silhouette Score
export function computeSilhouetteScore(
  points: ProjectedPoint[],
  assignments: number[],
  k: number
): number {
  const n = points.length;
  if (k <= 1 || k >= n) return 0;

  const clusterPoints = Array.from({ length: k }, () => [] as ProjectedPoint[]);
  for (let i = 0; i < n; i++) {
    clusterPoints[assignments[i]].push(points[i]);
  }

  let totalSilhouette = 0;

  for (let i = 0; i < n; i++) {
    const myClusterIdx = assignments[i];
    const myCluster = clusterPoints[myClusterIdx];

    if (myCluster.length <= 1) {
      continue;
    }

    // Mean intra-cluster distance a(i)
    let aSum = 0;
    for (const other of myCluster) {
      aSum += euclideanDist(points[i], other);
    }
    const a = aSum / (myCluster.length - 1);

    // Mean nearest-cluster distance b(i)
    let bMin = Infinity;
    for (let c = 0; c < k; c++) {
      if (c === myClusterIdx || clusterPoints[c].length === 0) continue;
      let bSum = 0;
      for (const other of clusterPoints[c]) {
        bSum += euclideanDist(points[i], other);
      }
      const bAvg = bSum / clusterPoints[c].length;
      if (bAvg < bMin) bMin = bAvg;
    }

    const maxAB = Math.max(a, bMin);
    const s = maxAB === 0 ? 0 : (bMin - a) / maxAB;
    totalSilhouette += s;
  }

  return Math.round((totalSilhouette / n) * 1000) / 1000;
}

// Compute Davies-Bouldin Index (lower is better)
export function computeDaviesBouldinIndex(
  points: ProjectedPoint[],
  centroids: { x: number; y: number }[],
  assignments: number[],
  k: number
): number {
  if (k <= 1) return 0;

  const clusterScatters = new Array(k).fill(0);
  const clusterCounts = new Array(k).fill(0);

  for (let i = 0; i < points.length; i++) {
    const a = assignments[i];
    clusterScatters[a] += euclideanDist(points[i], centroids[a]);
    clusterCounts[a]++;
  }

  const s = clusterScatters.map((sum, i) =>
    clusterCounts[i] > 0 ? sum / clusterCounts[i] : 0
  );

  let dbSum = 0;
  for (let i = 0; i < k; i++) {
    let maxR = -Infinity;
    for (let j = 0; j < k; j++) {
      if (i === j) continue;
      const m = euclideanDist(centroids[i], centroids[j]);
      if (m === 0) continue;
      const r = (s[i] + s[j]) / m;
      if (r > maxR) maxR = r;
    }
    if (maxR > -Infinity) dbSum += maxR;
  }

  return Math.round((dbSum / k) * 1000) / 1000;
}

// Compute Calinski-Harabasz Index (higher is better)
export function computeCalinskiHarabaszIndex(
  points: ProjectedPoint[],
  centroids: { x: number; y: number }[],
  assignments: number[],
  k: number
): number {
  const n = points.length;
  if (k <= 1 || k >= n) return 0;

  // Overall center
  let overallX = 0;
  let overallY = 0;
  for (const p of points) {
    overallX += p.x;
    overallY += p.y;
  }
  overallX /= n;
  overallY /= n;

  let ssb = 0; // Between-cluster scatter
  let ssw = 0; // Within-cluster scatter

  const clusterCounts = new Array(k).fill(0);
  for (let i = 0; i < n; i++) {
    clusterCounts[assignments[i]]++;
    ssw += euclideanDist(points[i], centroids[assignments[i]]) ** 2;
  }

  for (let c = 0; c < k; c++) {
    const d = euclideanDist(centroids[c], { x: overallX, y: overallY });
    ssb += clusterCounts[c] * d * d;
  }

  if (ssw === 0) return 0;
  const ch = (ssb / (k - 1)) / (ssw / (n - k));
  return Math.round(ch * 10) / 10;
}

// Run comprehensive evaluation across candidate K values
export function evaluateMultiK(
  hotels: OnboardingHotel[],
  centerLat: number,
  centerLon: number,
  minK = 3,
  maxK = 10
): ClusterEvaluation[] {
  const points = projectPoints(hotels, centerLat, centerLon);
  const n = points.length;
  const safeMaxK = Math.min(maxK, Math.max(minK, Math.floor(n / 2)));
  const results: ClusterEvaluation[] = [];

  const latRad = (centerLat * Math.PI) / 180;
  const mPerDegLat = 111132.92 - 559.82 * Math.cos(2 * latRad);
  const mPerDegLon = 111412.84 * Math.cos(latRad);

  for (let k = minK; k <= safeMaxK; k++) {
    // Multi-restart for stability
    let bestRun = runKMeans(points, k, 42);
    for (let restart = 1; restart < 10; restart++) {
      const candidate = runKMeans(points, k, 42 + restart * 17);
      if (candidate.inertia < bestRun.inertia) {
        bestRun = candidate;
      }
    }

    const { centroids, assignments, inertia } = bestRun;
    const silhouette = computeSilhouetteScore(points, assignments, k);
    const daviesBouldin = computeDaviesBouldinIndex(
      points,
      centroids,
      assignments,
      k
    );
    const calinskiHarabasz = computeCalinskiHarabaszIndex(
      points,
      centroids,
      assignments,
      k
    );

    // Compute regional metrics
    const clusterHotels = Array.from({ length: k }, () => [] as ProjectedPoint[]);
    for (let i = 0; i < n; i++) {
      clusterHotels[assignments[i]].push(points[i]);
    }

    const counts = clusterHotels.map((cl) => cl.length);
    const bagsList = clusterHotels.map((cl) =>
      cl.reduce((acc, p) => acc + p.load, 0)
    );

    const minHotels = Math.min(...counts);
    const maxHotels = Math.max(...counts);
    const avgHotels = Math.round((n / k) * 10) / 10;
    const workloadBalance =
      maxHotels > 0 ? Math.round((minHotels / maxHotels) * 100) / 100 : 0;
    const minBags = Math.min(...bagsList);
    const maxBags = Math.max(...bagsList);
    const bagBalance =
      maxBags > 0 ? Math.round((minBags / maxBags) * 100) / 100 : 0;

    let totalRadiusSum = 0;
    let globalMaxRadius = 0;

    const regions: RegionMetaDefinition[] = [];

    for (let c = 0; c < k; c++) {
      const centroidLat = centerLat + centroids[c].y / mPerDegLat;
      const centroidLon = centerLon + centroids[c].x / mPerDegLon;
      const distFromDepotKm =
        Math.round(haversineKm(centerLat, centerLon, centroidLat, centroidLon) * 10) /
        10;

      const pts = clusterHotels[c];
      let maxR = 0;
      let rSum = 0;
      for (const p of pts) {
        const d = euclideanDist(p, centroids[c]) / 1000;
        rSum += d;
        if (d > maxR) maxR = d;
      }
      const avgR = pts.length > 0 ? rSum / pts.length : 0;
      totalRadiusSum += avgR;
      if (maxR > globalMaxRadius) globalMaxRadius = maxR;

      const totalClusterBags = bagsList[c];
      // Logistics estimation: 36 bags safe limit per van
      const estimatedVans = Math.max(1, Math.ceil(totalClusterBags / 36));

      const dominantCorridor = getCorridorName(
        centerLat,
        centerLon,
        centroidLat,
        centroidLon,
        distFromDepotKm
      );

      regions.push({
        id: c,
        code: `R${c}`,
        name: `R${c} · ${dominantCorridor}`,
        color: REGION_COLORS[c % REGION_COLORS.length],
        centroid: {
          lat: Math.round(centroidLat * 100000) / 100000,
          lon: Math.round(centroidLon * 100000) / 100000,
        },
        hotelCount: pts.length,
        totalBags: totalClusterBags,
        avgRadiusKm: Math.round(avgR * 10) / 10,
        maxRadiusKm: Math.round(maxR * 10) / 10,
        distFromDepotKm,
        estimatedVans,
        dominantCorridor,
      });
    }

    const avgRadiusKm = Math.round((totalRadiusSum / k) * 10) / 10;
    const maxRadiusKm = Math.round(globalMaxRadius * 10) / 10;
    const totalVans = regions.reduce((acc, r) => acc + r.estimatedVans, 0);

    // Composite scoring logic:
    // Balanced penalty: Silhouette, Workload Balance, Compactness, Low micro-clusters
    let score = 50;

    // Silhouette factor (0 to +0.6 -> adds up to 30)
    score += Math.max(-20, Math.min(30, silhouette * 60));

    // Workload Balance factor (0 to 1 -> adds up to 25)
    score += workloadBalance * 25;

    // Micro-cluster penalty: if minHotels < 4 when n >= 25, penalize heavily
    if (minHotels < 4 && n >= 25) {
      score -= (4 - minHotels) * 10;
    }

    // Huge cluster penalty: if maxHotels > 28, penalize
    if (maxHotels > 28) {
      score -= Math.min(20, (maxHotels - 28) * 1.5);
    }

    // Spatial radius penalty: if maxRadiusKm > 14km, penalize
    if (maxRadiusKm > 14) {
      score -= Math.min(15, (maxRadiusKm - 14) * 2);
    }

    score = Math.round(Math.max(10, Math.min(99, score)));

    // Verdict determination
    let verdict: ClusterEvaluation["verdict"] = "viable";
    let verdictLabel = "Viable Alternative";

    if (score >= 82) {
      verdict = "optimal";
      verdictLabel = "Optimal / Top Recommendation";
    } else if (workloadBalance < 0.22 || (minHotels <= 3 && n >= 30)) {
      verdict = "imbalanced";
      verdictLabel = "Severe Workload Imbalance";
    } else if (k >= 8 && minHotels < 6) {
      verdict = "fragmented";
      verdictLabel = "Over-Partitioned / High Van Overhead";
    } else if (k <= 4 && maxRadiusKm > 15) {
      verdict = "sprawling";
      verdictLabel = "Under-Partitioned / High Route Sprawl";
    } else if (score >= 68) {
      verdict = "viable";
      verdictLabel = "Viable Operational Choice";
    } else {
      verdict = "imbalanced";
      verdictLabel = "Sub-Optimal Dispatch Distribution";
    }

    // Generate explainable bullets
    const whyBetter: string[] = [];
    const drawbacks: string[] = [];

    if (silhouette > 0.42) {
      whyBetter.push(
        `High cluster cohesion (Silhouette ${silhouette}): Hotels group tightly along natural express corridors.`
      );
    }
    if (workloadBalance >= 0.35) {
      whyBetter.push(
        `Even driver workload (Balance ${Math.round(workloadBalance * 100)}%): Stops range between ${minHotels} and ${maxHotels} hotels per vehicle territory.`
      );
    }
    if (maxRadiusKm <= 12) {
      whyBetter.push(
        `Compact operating footprint: Max cluster radius is ${maxRadiusKm} km, allowing drivers to finish 8-hour shift windows without traffic burnout.`
      );
    }
    if (regions.every((r) => r.estimatedVans <= 2)) {
      whyBetter.push(
        `Streamlined fleet allocation: Requires exactly ${totalVans} dedicated vans across the city.`
      );
    }

    if (minHotels <= 3 && n >= 25) {
      drawbacks.push(
        `Micro-cluster warning: The smallest region contains only ${minHotels} hotels, which will result in idle van capacity or excessive deadhead miles.`
      );
    }
    if (maxHotels >= 28) {
      drawbacks.push(
        `Overburdened cluster: Region with ${maxHotels} hotels (${maxBags} bags) will require multiple split dispatch runs.`
      );
    }
    if (maxRadiusKm > 14) {
      drawbacks.push(
        `Geographic sprawl: Cluster radius reaches ${maxRadiusKm} km from its centroid, creating cross-arterial bottlenecks.`
      );
    }

    const comparisonNote = generateComparisonNote(k, minHotels, maxHotels, totalVans);

    results.push({
      k,
      score,
      verdict,
      verdictLabel,
      silhouette,
      daviesBouldin,
      calinskiHarabasz,
      inertia: Math.round(inertia / 1000000),
      workloadBalance,
      bagBalance,
      minHotels,
      maxHotels,
      avgHotels,
      avgRadiusKm,
      maxRadiusKm,
      totalVans,
      whyBetter,
      drawbacks,
      comparisonNote,
      regions,
      assignments,
    });
  }

  // Sort descending by score
  results.sort((a, b) => b.score - a.score);

  // Guarantee that the highest score gets marked optimal if not already
  if (results.length > 0 && results[0].score >= 70) {
    results[0].verdict = "optimal";
    results[0].verdictLabel = "Optimal / Top Recommendation";
  }

  return results;
}

function generateComparisonNote(
  k: number,
  minH: number,
  maxH: number,
  vans: number
): string {
  if (k === 5) {
    return "Balanced sweet-spot: Minimizes deadhead kilometers while keeping vehicle routes comfortably inside standard 7-8h operational shifts.";
  }
  if (k < 5) {
    return `Broad territorial zones (${maxH} max stops): Requires multi-driver shifts or larger vehicle buffers to prevent daily delivery delays.`;
  }
  if (k === 8) {
    return `Historical 8-cluster partition: Good geographical granularity, but risks producing micro-sectors with low van utilization unless merged.`;
  }
  return `Granular ${k}-region partition (${vans} total vans): High spatial precision, but demands stricter depot loading schedules.`;
}

// ==========================================
// H3 HEXAGON FOOTPRINT GENERATOR
// ==========================================

export type HexMapResult = {
  hexMap: Record<string, number>; // hexId -> regionId
  cellsByRegion: Record<number, string[]>;
  allCellsCount: number;
};

export function generateH3HexMap(
  hotels: OnboardingHotel[],
  assignments: number[],
  centerLat: number,
  centerLon: number,
  density: "corridor" | "standard" | "dense" = "standard"
): HexMapResult {
  const hexMap: Record<string, number> = {};
  const cellsByRegion: Record<number, string[]> = {};

  let centerHex = "";
  try {
    centerHex = latLngToCell(centerLat, centerLon, ONBOARDING_H3_RESOLUTION);
  } catch {
    // ignore
  }

  // 1. Map each hotel's primary H3 cell
  hotels.forEach((hotel, idx) => {
    const regionId = assignments[idx] ?? 0;
    let hHex = "";
    try {
      hHex = latLngToCell(hotel.lat, hotel.lon, ONBOARDING_H3_RESOLUTION);
    } catch {
      return;
    }

    hexMap[hHex] = regionId;

    // 2. Expand neighbor disk based on density
    const ringRadius = density === "dense" ? 2 : density === "standard" ? 1 : 0;
    if (ringRadius > 0) {
      try {
        const disk = gridDisk(hHex, ringRadius);
        disk.forEach((c) => {
          if (hexMap[c] === undefined) {
            hexMap[c] = regionId;
          }
        });
      } catch {
        // ignore
      }
    }

    // 3. Connect corridor highway ribbon to city center / depot
    if (centerHex) {
      try {
        const path = gridPathCells(centerHex, hHex);
        path.forEach((c) => {
          if (hexMap[c] === undefined) {
            hexMap[c] = regionId;
          }
        });
      } catch {
        // Linear interpolation fallback if gridPathCells fails
        const steps = 8;
        for (let s = 1; s < steps; s++) {
          const t = s / steps;
          const lat = centerLat + (hotel.lat - centerLat) * t;
          const lon = centerLon + (hotel.lon - centerLon) * t;
          try {
            const stepHex = latLngToCell(lat, lon, ONBOARDING_H3_RESOLUTION);
            if (hexMap[stepHex] === undefined) {
              hexMap[stepHex] = regionId;
            }
          } catch {
            // ignore
          }
        }
      }
    }
  });

  // Center hex assignment
  if (centerHex && hexMap[centerHex] === undefined) {
    hexMap[centerHex] = 0;
  }

  // Group by region
  for (const [hexId, regionId] of Object.entries(hexMap)) {
    if (!cellsByRegion[regionId]) {
      cellsByRegion[regionId] = [];
    }
    cellsByRegion[regionId].push(hexId);
  }

  return {
    hexMap,
    cellsByRegion,
    allCellsCount: Object.keys(hexMap).length,
  };
}

export { cellsToMultiPolygon, cellToBoundary };
