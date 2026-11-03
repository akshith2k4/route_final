import CoverageApp from "../../components/coverage-app";
import hotelsJson from "../../data/hotels.json";
import hexMapJson from "../../data/hex_map.json";
import regionMetadataJson from "../../data/region_metadata.json";
import optimizedRoutesJson from "../../data/optimized_routes.json";
import fleetJson from "../../data/fleet.json";
import type { DispatchRoute, FleetDepot, Hotel, RegionMeta } from "../../lib/coverage";

export const metadata = {
  title: "Optimizer Studio · LinenGrass Fleet Atlas",
  description:
    "Interactive route optimizer studio to select customer hotels, lock vehicle capacity buffers, assign depots, configure driver shift and lunch windows, and simulate custom dispatch runs.",
};

export default function StudioPage() {
  return (
    <CoverageApp
      regions={Object.values(regionMetadataJson) as RegionMeta[]}
      hotels={hotelsJson as Hotel[]}
      hexMap={hexMapJson as Record<string, number>}
      routes={optimizedRoutesJson as DispatchRoute[]}
      depot={fleetJson.depot as FleetDepot}
      initialWorkspace="studio"
    />
  );
}
