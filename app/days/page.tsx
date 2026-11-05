import DaysDashboard from "../../components/days-dashboard";
import dayPlanJson from "../../data/day_plan.json";
import hexMapJson from "../../data/hex_map.json";
import hotelsJson from "../../data/hotels.json";
import regionMetadataJson from "../../data/region_metadata.json";
import type { HexMap, RegionMeta } from "../../lib/coverage";
import { buildDayData, type DayPlan } from "../../lib/day-plan";

export const metadata = {
  title: "Day Board · LinenGrass Fleet Atlas",
  description:
    "Daily core hotels plus Day 1 and Day 2 coverage, mapped across all routes.",
};

export default function DaysPage() {
  const days = buildDayData(dayPlanJson as DayPlan, hotelsJson);
  return (
    <DaysDashboard
      days={days}
      hexMap={hexMapJson as HexMap}
      regions={Object.values(regionMetadataJson) as RegionMeta[]}
    />
  );
}
