"use client";

import { useState, useMemo } from "react";
import {
  ArrowUpToLine,
  ChevronDown,
  ChevronUp,
  Hotel as HotelIcon,
  Loader2,
  Plus,
  Route as RouteIcon,
  Save,
  Trash2,
  X,
} from "lucide-react";
import {
  type Hotel,
  type RegionMeta,
  type StudioDepot,
} from "../lib/coverage";
import { REGION_COLOR_PALETTE } from "../lib/city-presets";
import { clockToMinutes } from "../lib/clock";

type DraftRoute = {
  id: string;
  name: string;
  color: string;
  hotelIds: string[];
  /** The region this route belongs to. */
  regionIndex: number | null;
};

function routeFromRegion(region: RegionMeta): DraftRoute {
  return {
    id: `auto-${region.id}`,
    name: `Route ${region.code} · ${region.map_label}`,
    color: region.color,
    hotelIds: [],
    regionIndex: region.id,
  };
}

type ManualRouteBuilderProps = {
  cityId: string;
  cityName: string;
  hotels: Hotel[];
  regions: RegionMeta[];
  depots: StudioDepot[];
  /** Daily fleet shift from the city's onboarding settings ("HH:MM"). */
  shiftStart?: string;
  shiftEnd?: string;
};

/**
 * Empty-state route authoring for a city with no manual routes.
 * The manager groups hotels into routes; publishing writes a Plan as both the
 * baseline plan and the manual dispatch, which the Plan Canvas and the Manual
 * tab then read as their single source of truth.
 */
export default function ManualRouteBuilder({
  cityId,
  hotels,
  regions,
  depots,
  shiftStart = "07:00",
  shiftEnd = "17:00",
}: ManualRouteBuilderProps) {
  const [routes, setRoutes] = useState<DraftRoute[]>([]);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [regionFilter, setRegionFilter] = useState<number | "all">("all");

  const regionById = useMemo(() => new Map(regions.map((r) => [r.id, r])), [regions]);
  const hotelById = useMemo(() => new Map(hotels.map((h) => [h.id, h])), [hotels]);
  const assigned = useMemo(() => {
    const map = new Map<string, string>();
    routes.forEach((route) => route.hotelIds.forEach((id) => map.set(id, route.id)));
    return map;
  }, [routes]);

  const visibleHotels = useMemo(
    () => (regionFilter === "all" ? hotels : hotels.filter((h) => h.region === regionFilter)),
    [hotels, regionFilter],
  );

  function addRoute() {
    const usedRegions = new Set(
      routes.map((route) => route.regionIndex).filter((id): id is number => id !== null),
    );
    const region =
      regions.find((candidate) => !usedRegions.has(candidate.id)) ?? regions[0] ?? null;

    let route: DraftRoute;
    if (region) {
      route = routeFromRegion(region);
    } else {
      route = {
        id: "custom-route",
        name: `Route ${routes.length + 1}`,
        color: REGION_COLOR_PALETTE[routes.length % REGION_COLOR_PALETTE.length],
        hotelIds: [],
        regionIndex: null,
      };
    }
    if (routes.some((existing) => existing.id === route.id)) {
      route = { ...route, id: `custom-route-${Date.now()}` };
    }
    setRoutes((current) => [...current, route]);
    setExpanded(route.id);
  }

  function updateRoute(id: string, patch: Partial<DraftRoute>) {
    setRoutes((current) => current.map((r) => (r.id === id ? { ...r, ...patch } : r)));
  }

  function removeRoute(id: string) {
    setRoutes((current) => current.filter((r) => r.id !== id));
    if (expanded === id) setExpanded(null);
  }

  function toggleHotel(routeId: string, hotelId: string) {
    setRoutes((current) =>
      current.map((route) => {
        if (route.id !== routeId) {
          return { ...route, hotelIds: route.hotelIds.filter((id) => id !== hotelId) };
        }
        const has = route.hotelIds.includes(hotelId);
        return {
          ...route,
          hotelIds: has ? route.hotelIds.filter((id) => id !== hotelId) : [...route.hotelIds, hotelId],
        };
      }),
    );
  }

  /** Moves a stop one place earlier or later; the order is what gets published. */
  function moveHotel(routeId: string, hotelId: string, direction: -1 | 1) {
    setRoutes((current) =>
      current.map((route) => {
        if (route.id !== routeId) return route;
        const index = route.hotelIds.indexOf(hotelId);
        const target = index + direction;
        if (index < 0 || target < 0 || target >= route.hotelIds.length) return route;
        const hotelIds = [...route.hotelIds];
        const [moved] = hotelIds.splice(index, 1);
        hotelIds.splice(target, 0, moved);
        return { ...route, hotelIds };
      }),
    );
  }

  /** Promotes a hotel to stop 1 so the driver visits it before the rest. */
  function moveHotelToFirst(routeId: string, hotelId: string) {
    setRoutes((current) =>
      current.map((route) => {
        if (route.id !== routeId) return route;
        const index = route.hotelIds.indexOf(hotelId);
        if (index <= 0) return route;
        const hotelIds = [...route.hotelIds];
        const [moved] = hotelIds.splice(index, 1);
        hotelIds.unshift(moved);
        return { ...route, hotelIds };
      }),
    );
  }

  function autoAssign() {
    // One route per region, exactly as the regions are defined.
    const regionRoutes = regions.map((region) => routeFromRegion(region));
    if (regionRoutes.length === 0) {
      setMessage("Add at least one region before auto-assigning.");
      return;
    }

    let unassigned = 0;
    for (const hotel of hotels) {
      const target = regionRoutes.find((route) => route.regionIndex === hotel.region);
      if (target) {
        target.hotelIds.push(hotel.id);
      } else {
        unassigned += 1;
      }
    }

    const next = regionRoutes.filter((route) => route.hotelIds.length > 0);
    setRoutes(next);
    setExpanded(next[0]?.id ?? null);
    setMessage(
      unassigned > 0
        ? `Auto-assigned by region: ${next.length} route${next.length === 1 ? "" : "s"}. ${unassigned} hotel${unassigned === 1 ? "" : "s"} have no matching region. Set the visit order below.`
        : `Auto-assigned by region: ${next.length} route${next.length === 1 ? "" : "s"}. Use "First" or the arrows to set the visit order, then publish.`,
    );
  }

  async function publish() {
    if (routes.length === 0) {
      setMessage("Add at least one route before publishing.");
      return;
    }
    setSaving(true);
    setMessage(null);
    try {
      const primaryDepot = depots.find((d) => d.isPrimary) ?? depots[0];
      const shiftStartMin = clockToMinutes(shiftStart);
      const shiftEndMin = clockToMinutes(shiftEnd);
      const plan = {
        schema_version: 1,
        plan_id: "manual-current",
        name: "Manual Dispatch Plan",
        status: "draft",
        created_at: new Date().toISOString(),
        source: "manual-route-builder",
        depot: {
          id: primaryDepot?.id ?? "depot-primary",
          name: primaryDepot?.name ?? "Depot",
          lat: primaryDepot?.latitude ?? 0,
          lon: primaryDepot?.longitude ?? 0,
        },
        depots: depots.map((d) => ({
          id: d.id,
          name: d.name,
          lat: d.latitude,
          lon: d.longitude,
        })),
        laundries: [],
        vehicles_version: 2,
        days_version: 1,
        shift: { start_min: shiftStartMin, end_min: shiftEndMin },
        routes: routes.map((route) => ({
          route_id: route.id,
          route_key: route.id,
          name: route.name,
          color: route.color,
          nominal_cap: 40,
          max_load: 36,
          departure_min: shiftStartMin,
          depot_id: primaryDepot?.id,
          laundry_id: null,
          stops: route.hotelIds.flatMap((id) => {
            const hotel = hotelById.get(id);
            if (!hotel) return [];
            return [
              {
                hotel_id: hotel.id,
                name: hotel.name,
                lat: hotel.lat,
                lon: hotel.lon,
                region: hotel.region,
                service_mins: hotel.stop_mins,
                load_bags: hotel.load,
                rooms: 0,
                days: ["day1", "day2"],
              },
            ];
          }),
        })),
        unassigned_hotel_ids: [],
      };

      // Ensure the travel matrix exists so the publish endpoint can stamp
      // real arrival/departure times on every stop. If it is already complete
      // this returns immediately; if OSRM is down we still publish with
      // distance-based estimates.
      setMessage("Preparing travel times…");
      try {
        let matrixComplete = false;
        for (let pass = 0; pass < 20 && !matrixComplete; pass += 1) {
          const matrixResponse = await fetch(
            `/api/admin/cities/${cityId}/generate`,
            {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ step: "travel_matrix", budgetMs: 10_000 }),
            },
          );
          const matrixData = await matrixResponse.json();
          if (!matrixResponse.ok) {
            throw new Error(matrixData.error ?? "Could not prepare travel times.");
          }
          matrixComplete = matrixData.complete === true;
          if (!matrixComplete) {
            setMessage(
              `Preparing travel times… ${matrixData.filledPairs}/${matrixData.totalPairs} pairs`,
            );
          }
        }
      } catch {
        setMessage("Travel times unavailable — using distance estimates.");
      }

      const response = await fetch(`/api/admin/cities/${cityId}/publish`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ plan }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "Could not publish routes.");

      // Draw the routes from their real road geometry by default. The publish
      // endpoint writes the plan; these passes build the OSRM path for each
      // route. If OSRM is unavailable, the map falls back to straight lines.
      setMessage("Published. Drawing the road-accurate route lines…");
      let complete = false;
      for (let pass = 0; pass < 8 && !complete; pass += 1) {
        const geometryResponse = await fetch(
          `/api/admin/cities/${cityId}/generate`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ step: "geometries", budgetMs: 10_000 }),
          },
        );
        const geometryData = await geometryResponse.json();
        if (!geometryResponse.ok) {
          throw new Error(geometryData.error ?? "Could not generate route lines.");
        }
        complete = geometryData.complete === true;
        if (!complete) {
          setMessage(
            `Drawing route lines… ${geometryData.done}/${geometryData.total} routes`,
          );
        }
      }

      setMessage(
        complete
          ? "Published with road-accurate route lines. Reloading…"
          : "Published. Some lines may use the straight-line fallback until OSRM is available.",
      );
      // A clean reload is the reliable way to leave the builder with the
      // freshly published routes. The query makes the server render the
      // Manual workspace directly.
      window.location.replace(`/${cityId}?view=manual`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not publish routes.");
    } finally {
      setSaving(false);
    }
  }

  const assignedCount = assigned.size;

  return (
    <div className="flex h-full flex-col gap-3 overflow-y-auto bg-paper p-4">
      <div className="rounded-xl border border-line bg-bone/60 p-3">
        <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-muted">
          No manual routes yet — build your own
        </p>
        <p className="mt-1 text-[11.5px] leading-relaxed text-muted">
          Group the {hotels.length} hotels into routes. Every route leaves the
          warehouse at <b className="text-ink">{shiftStart}</b> and is planned to
          return by <b className="text-ink">{shiftEnd}</b>. Publish and the routes
          become the manual dispatch that the Plan Canvas opens with.
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={addRoute}
            className="flex items-center gap-1.5 rounded-lg bg-ink px-3 py-1.5 text-[11px] font-semibold text-cream transition-opacity hover:opacity-90"
          >
            <Plus size={13} /> Add route
          </button>
          <button
            type="button"
            onClick={autoAssign}
            className="flex items-center gap-1.5 rounded-lg border border-line-strong bg-paper px-3 py-1.5 text-[11px] font-semibold text-ink transition-colors hover:bg-bone"
          >
            <RouteIcon size={13} /> Auto-assign by region
          </button>
          <span className="self-center text-[10.5px] text-faint">
            {assignedCount}/{hotels.length} hotels assigned
          </span>
        </div>
      </div>

      <div className="flex items-center gap-2">
        <label className="text-[10px] font-bold uppercase tracking-[0.1em] text-muted">
          Hotel list
        </label>
        <select
          value={regionFilter}
          onChange={(e) => setRegionFilter(e.target.value === "all" ? "all" : Number(e.target.value))}
          className="rounded-lg border border-line-strong bg-paper px-2 py-1 text-[11px] font-semibold text-ink outline-none"
        >
          <option value="all">All regions</option>
          {regions.map((r) => (
            <option key={r.id} value={r.id}>
              {r.code} · {r.map_label}
            </option>
          ))}
        </select>
      </div>

      {/* Routes */}
      <div className="flex flex-col gap-2">
        {routes.map((route, index) => (
          <div key={route.id} className="rounded-xl border border-line bg-paper">
            <div className="flex items-center gap-2 px-3 py-2">
              <span className="h-3.5 w-3.5 shrink-0 rounded-full border border-black/10" style={{ background: route.color }} />
              <input
                value={route.name}
                onChange={(e) => updateRoute(route.id, { name: e.target.value })}
                className="min-w-0 flex-1 rounded-md border border-line bg-paper-strong px-2 py-1 text-[11.5px] font-semibold text-ink outline-none focus:border-[var(--focus)]"
                aria-label={`Route ${index + 1} name`}
              />
              <span className="font-mono text-[10px] text-faint">{route.hotelIds.length} stops</span>
              <button
                type="button"
                onClick={() => setExpanded(expanded === route.id ? null : route.id)}
                className="grid h-6 w-6 place-items-center rounded-md text-muted hover:bg-bone"
                aria-label="Toggle hotel list"
              >
                {expanded === route.id ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
              </button>
              <button
                type="button"
                onClick={() => removeRoute(route.id)}
                className="grid h-6 w-6 place-items-center rounded-md text-danger hover:bg-bone"
                aria-label="Delete route"
              >
                <Trash2 size={12} />
              </button>
            </div>
            {expanded === route.id && (
              <div className="border-t border-line px-2 py-2">
                <div className="flex items-center justify-between px-2 pb-1.5">
                  <span className="text-[9px] font-bold uppercase tracking-[0.12em] text-muted">
                    Stop order
                  </span>
                  <span className="text-[10px] text-faint">
                    Stop 1 is visited first
                  </span>
                </div>

                {route.hotelIds.length === 0 ? (
                  <p className="mb-2 rounded-md border border-dashed border-line-strong px-2 py-3 text-center text-[10.5px] text-muted">
                    Tick hotels below to add them to this route.
                  </p>
                ) : (
                  <ol className="mb-2 flex flex-col gap-1">
                    {route.hotelIds.map((hotelId, stopIndex) => {
                      const hotel = hotelById.get(hotelId);
                      if (!hotel) return null;
                      const isFirst = stopIndex === 0;
                      const isLast = stopIndex === route.hotelIds.length - 1;
                      return (
                        <li
                          key={hotelId}
                          className={`flex items-center gap-1.5 rounded-md border px-2 py-1 ${
                            isFirst
                              ? "border-green/35 bg-green-soft/40"
                              : "border-line bg-bone/40"
                          }`}
                        >
                          <span
                            className={`grid h-5 w-5 shrink-0 place-items-center rounded-full font-mono text-[9px] font-bold ${
                              isFirst ? "bg-green text-cream" : "bg-paper text-faint"
                            }`}
                          >
                            {stopIndex + 1}
                          </span>
                          <span className="min-w-0 flex-1 truncate text-[11px] font-medium text-ink">
                            {hotel.name}
                          </span>
                          {isFirst && (
                            <span className="rounded bg-green/15 px-1.5 py-0.5 text-[8.5px] font-bold uppercase tracking-[0.08em] text-green">
                              First
                            </span>
                          )}
                          <button
                            type="button"
                            onClick={() => moveHotelToFirst(route.id, hotelId)}
                            disabled={isFirst}
                            className="grid h-5 w-5 place-items-center rounded text-muted transition-colors hover:bg-paper hover:text-ink disabled:opacity-25"
                            title="Make this the first visit"
                            aria-label={`Visit ${hotel.name} first`}
                          >
                            <ArrowUpToLine size={11} />
                          </button>
                          <button
                            type="button"
                            onClick={() => moveHotel(route.id, hotelId, -1)}
                            disabled={isFirst}
                            className="grid h-5 w-5 place-items-center rounded text-muted transition-colors hover:bg-paper hover:text-ink disabled:opacity-25"
                            title="Move earlier"
                            aria-label={`Move ${hotel.name} earlier`}
                          >
                            <ChevronUp size={12} />
                          </button>
                          <button
                            type="button"
                            onClick={() => moveHotel(route.id, hotelId, 1)}
                            disabled={isLast}
                            className="grid h-5 w-5 place-items-center rounded text-muted transition-colors hover:bg-paper hover:text-ink disabled:opacity-25"
                            title="Move later"
                            aria-label={`Move ${hotel.name} later`}
                          >
                            <ChevronDown size={12} />
                          </button>
                          <button
                            type="button"
                            onClick={() => toggleHotel(route.id, hotelId)}
                            className="grid h-5 w-5 place-items-center rounded text-danger transition-colors hover:bg-paper"
                            title="Remove from route"
                            aria-label={`Remove ${hotel.name} from this route`}
                          >
                            <X size={11} />
                          </button>
                        </li>
                      );
                    })}
                  </ol>
                )}

                <p className="px-2 pb-1 text-[9px] font-bold uppercase tracking-[0.12em] text-muted">
                  Add hotels
                </p>
                <div className="max-h-44 overflow-y-auto">
                  {visibleHotels.map((hotel) => {
                    const owner = assigned.get(hotel.id);
                    const checked = owner === route.id;
                    return (
                      <label
                        key={hotel.id}
                        className={`flex cursor-pointer items-center gap-2 rounded-md px-2 py-1 text-[11px] ${
                          owner && owner !== route.id ? "opacity-40" : "hover:bg-bone"
                        }`}
                      >
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() => toggleHotel(route.id, hotel.id)}
                          className="accent-[var(--ink)]"
                        />
                        <HotelIcon size={11} className="shrink-0 text-faint" />
                        <span className="min-w-0 flex-1 truncate text-ink">{hotel.name}</span>
                        <span className="font-mono text-[9px] text-faint">
                          {regionById.get(hotel.region)?.map_label ?? `R${hotel.region}`}
                        </span>
                      </label>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        ))}
        {routes.length === 0 && (
          <p className="rounded-xl border border-dashed border-line-strong px-3 py-6 text-center text-[11.5px] text-muted">
            No routes yet. Click "Add route" or "Auto-assign by region" to start.
          </p>
        )}
      </div>

      <div className="mt-auto sticky bottom-0 border-t border-line bg-paper pt-3">
        <button
          type="button"
          onClick={publish}
          disabled={saving || routes.length === 0}
          className="flex w-full items-center justify-center gap-1.5 rounded-lg bg-ink py-2 text-[12px] font-semibold text-cream transition-opacity hover:opacity-90 disabled:opacity-40"
        >
          {saving ? <Loader2 size={13} className="animate-spin" /> : <Save size={13} />}
          {saving ? "Publishing & drawing…" : "Publish as manual dispatch"}
        </button>
      </div>
      {message && (
        <p className="rounded-lg border border-line bg-bone px-3 py-2 text-[11.5px] font-semibold text-ink">
          {message}
        </p>
      )}
    </div>
  );
}
