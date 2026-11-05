import CoverageApp from "../../components/coverage-app";
import hexMapJson from "../../data/hex_map.json";
import regionMetadataJson from "../../data/region_metadata.json";
import optimizedRoutesJson from "../../data/optimized_routes.json";
import fleetJson from "../../data/fleet.json";
import type { DispatchRoute, FleetDepot, RegionMeta } from "../../lib/coverage";
import { getCoverageHotels } from "../../lib/hotels";

export const metadata = {
  title: "Optimizer Studio · LinenGrass Fleet Atlas",
  description:
    "Interactive route optimizer studio to select customer hotels, lock vehicle capacity buffers, assign depots, configure driver shift and lunch windows, and simulate custom dispatch runs.",
};

export const dynamic = "force-dynamic";

export default async function StudioPage() {
  const regions = Object.values(regionMetadataJson) as RegionMeta[];
  const hotels = await getCoverageHotels(regions);

  return (
    <CoverageApp
      regions={regions}
      hotels={hotels}
      hexMap={hexMapJson as Record<string, number>}
      routes={optimizedRoutesJson as DispatchRoute[]}
      depot={fleetJson.depot as FleetDepot}
      initialWorkspace="studio"
    />
  );
}
