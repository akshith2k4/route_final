import CoverageApp from "../components/coverage-app";
import hotelsJson from "../data/hotels.json";
import hexMapJson from "../data/hex_map.json";
import regionMetadataJson from "../data/region_metadata.json";
import type { Hotel, RegionMeta } from "../lib/coverage";

export default function Home() {
  return (
    <CoverageApp
      regions={Object.values(regionMetadataJson) as RegionMeta[]}
      hotels={hotelsJson as Hotel[]}
      hexMap={hexMapJson as Record<string, number>}
    />
  );
}
