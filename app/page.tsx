import CoverageApp from "../components/coverage-app";
import hexMapJson from "../data/hex_map.json";
import regionMetadataJson from "../data/region_metadata.json";
import optimizedRoutesJson from "../data/optimized_routes.json";
import fleetJson from "../data/fleet.json";
import type { DispatchRoute, FleetDepot, RegionMeta } from "../lib/coverage";
import { getCoverageHotels } from "../lib/hotels";

export const dynamic = "force-dynamic";

export default async function Home() {
  const regions = Object.values(regionMetadataJson) as RegionMeta[];
  const hotels = await getCoverageHotels(regions);

  return (
    <CoverageApp
      regions={regions}
      hotels={hotels}
      hexMap={hexMapJson as Record<string, number>}
      routes={optimizedRoutesJson as DispatchRoute[]}
      depot={fleetJson.depot as FleetDepot}
    />
  );
}

