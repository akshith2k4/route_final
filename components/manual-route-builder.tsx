"use client";

import { useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import {
  Plus,
  Trash2,
  Save,
  ChevronDown,
  ChevronUp,
  Route as RouteIcon,
  Hotel as HotelIcon,
  Loader2,
} from "lucide-react";
import type { Hotel, RegionMeta, StudioDepot, StudioVehicle } from "../lib/coverage";
import { REGION_COLOR_PALETTE } from "../lib/city-presets";

type DraftRoute = {
  id: string;
  name: string;
  color: string;
  hotelIds: string[];
};

type ManualRouteBuilderProps = {
  cityId: string;
  cityName: string;
  hotels: Hotel[];
  regions: RegionMeta[];
  depots: StudioDepot[];
  vehicles: StudioVehicle[];
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
  vehicles,
}: ManualRouteBuilderProps) {
  const router = useRouter();
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
    const index = routes.length;
    const id = `custom-route-${Date.now()}`;
    setRoutes((current) => [
      ...current,
      {
        id,
        name: `Route ${index + 1}`,
        color: REGION_COLOR_PALETTE[index % REGION_COLOR_PALETTE.length],
        hotelIds: [],
      },
    ]);
    setExpanded(id);
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

  function autoAssign() {
    // One route per region, matching vehicles where possible.
    const regionRoutes = regions.map((region, index) => ({
      id: `auto-${region.id}`,
      name: vehicles[index]?.label ?? `Route ${region.code} · ${region.map_label}`,
      color: region.color,
      hotelIds: [] as string[],
    }));
    for (const hotel of hotels) {
      const route = regionRoutes.find((r) => r.id === `auto-${hotel.region}`) ?? regionRoutes[0];
      if (route) route.hotelIds.push(hotel.id);
    }
    setRoutes(regionRoutes.filter((r) => r.hotelIds.length > 0));
    setExpanded(regionRoutes[0]?.id ?? null);
    setMessage("Auto-assigned one route per region. Adjust as needed, then publish.");
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
        vehicles: vehicles.map((v) => ({
          id: `vehicle-${v.id}`,
          name: v.label,
          nominal_cap: v.nominal_capacity,
          max_load: v.max_load,
          color: v.color,
        })),
        vehicles_version: 2,
        days_version: 1,
        shift: { start_min: 7 * 60, end_min: 17 * 60 },
        routes: routes.map((route, index) => ({
          route_id: route.id,
          route_key: route.id,
          name: route.name,
          color: route.color,
          nominal_cap: 40,
          max_load: 36,
          departure_min: 7 * 60,
          depot_id: primaryDepot?.id,
          laundry_id: null,
          stops: route.hotelIds.map((id, i) => {
            const hotel = hotelById.get(id)!;
            return {
              hotel_id: hotel.id,
              name: hotel.name,
              lat: hotel.lat,
              lon: hotel.lon,
              region: hotel.region,
              service_mins: hotel.stop_mins,
              load_bags: hotel.load,
              rooms: 0,
              days: ["day1", "day2"],
            };
          }),
        })),
        unassigned_hotel_ids: [],
      };

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
      router.refresh();
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
          Group the {hotels.length} hotels into routes. Publish and they become the
          manual dispatch that the Plan Canvas opens with.
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
              <div className="max-h-48 overflow-y-auto border-t border-line px-2 py-2">
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
