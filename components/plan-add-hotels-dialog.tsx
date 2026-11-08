"use client";

import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, Check, Plus, Search, X } from "lucide-react";
import type { RegionMeta } from "../lib/coverage";
import {
  dayLabel,
  normalizeStopDays,
  overCapacityDays,
  projectRouteDayBags,
  resolveLaundry,
  resolveVehicle,
  routeDayBags,
  routeDepot,
  type Plan,
  type PlanDay,
  type PlanRoute,
  type PlanStop,
} from "../lib/plan";
import { cn } from "./ui/cn";
import {
  btnGhost,
  btnPrimary,
  capacity,
  capacityFill,
  capacityFillTone,
  capacityLabels,
  capacityNote,
  capacityNoteTone,
  capacityTrack,
  dialog,
  dialogActions,
  dialogBackdrop,
  dialogCapacity,
  dialogClose,
  dialogDayLoads,
  dialogEyebrow,
  dialogLede,
  dialogSelection,
  dialogWide,
  hotelBulk,
  hotelFilterSelect,
  hotelFilters,
  hotelList,
  hotelListEmpty,
  hotelOption,
  hotelOptionBags,
  hotelOptionCheck,
  hotelOptionCheckSelected,
  hotelOptionDot,
  hotelOptionInput,
  hotelOptionMain,
  hotelOptionSelected,
  hotelSearch,
} from "./ui/plan-styles";

type HotelCandidate = {
  stop: PlanStop;
  routeId: string;
  routeName: string;
  routeColor: string;
};

type PlanAddHotelsDialogProps = {
  open: boolean;
  route: PlanRoute | null;
  plan: Plan;
  regions: RegionMeta[];
  onClose: () => void;
  onAdd: (hotelIds: string[]) => void;
};

function shortRouteName(name: string): string {
  return name.replace(/\s*\(ID:[^)]*\)\s*$/, "").trim();
}

function bagLabel(value: number): string {
  return `${value} bag${value === 1 ? "" : "s"}`;
}

function roomLabel(value: number): string {
  return `${value} room${value === 1 ? "" : "s"}`;
}

export default function PlanAddHotelsDialog({
  open,
  route,
  plan,
  regions,
  onClose,
  onAdd,
}: PlanAddHotelsDialogProps) {
  const [selected, setSelected] = useState<Set<string>>(() => new Set());
  const [query, setQuery] = useState("");
  const [regionFilter, setRegionFilter] = useState("all");

  useEffect(() => {
    if (!open) return;
    setSelected(new Set());
    setQuery("");
    setRegionFilter("all");
  }, [open, route?.route_id]);

  useEffect(() => {
    if (!open) return;
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [open, onClose]);

  const regionById = useMemo(
    () => new Map(regions.map((region) => [region.id, region])),
    [regions],
  );

  const candidates = useMemo<HotelCandidate[]>(() => {
    if (!route) return [];
    return plan.routes
      .filter((candidate) => candidate.route_id !== route.route_id)
      .flatMap((candidate) =>
        candidate.stops.map((stop) => ({
          stop,
          routeId: candidate.route_id,
          routeName: shortRouteName(candidate.name),
          routeColor: candidate.color,
        })),
      )
      .sort((a, b) => a.stop.name.localeCompare(b.stop.name));
  }, [plan, route]);

  const regionOptions = useMemo(() => {
    const ids = new Set(candidates.map((candidate) => candidate.stop.region));
    return [...ids]
      .sort((a, b) => a - b)
      .map((id) => ({
        id,
        label: regionById.get(id)?.short_name ?? `Region ${id}`,
      }));
  }, [candidates, regionById]);

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return candidates.filter((candidate) => {
      if (
        regionFilter !== "all" &&
        String(candidate.stop.region) !== regionFilter
      ) {
        return false;
      }
      if (!needle) return true;
      return (
        candidate.stop.name.toLowerCase().includes(needle) ||
        candidate.routeName.toLowerCase().includes(needle)
      );
    });
  }, [candidates, query, regionFilter]);

  if (!open || !route) return null;

  const depot = routeDepot(plan, route);
  const laundry = resolveLaundry(plan, route);
  const vehicle = resolveVehicle(plan, route);
  const hasVehicle = vehicle !== null;
  const selectedCandidates = candidates.filter((candidate) =>
    selected.has(candidate.stop.hotel_id),
  );
  const selectedBags = selectedCandidates.reduce(
    (sum, candidate) => sum + candidate.stop.load_bags,
    0,
  );
  const selectedRooms = selectedCandidates.reduce(
    (sum, candidate) => sum + (candidate.stop.rooms ?? 0),
    0,
  );
  const currentDayBags = routeDayBags(route);
  const selectedDays: PlanDay[] = [
    ...new Set(
      selectedCandidates.flatMap((candidate) =>
        normalizeStopDays(candidate.stop),
      ),
    ),
  ];
  const projectedDayBags = projectRouteDayBags(
    route,
    selectedCandidates.map((candidate) => candidate.stop),
  );
  const overDays = hasVehicle
    ? overCapacityDays(route, projectedDayBags, selectedDays)
    : [];
  const overCapacity = overDays.length > 0;
  const overSafeDays = hasVehicle
    ? selectedDays.filter((day) => projectedDayBags[day] > route.max_load)
    : [];
  const overSafeLoad = overSafeDays.length > 0;
  const capacityTone = overCapacity
    ? "over"
    : overSafeLoad
      ? "warn"
      : "ok";
  const allVisibleSelected =
    filtered.length > 0 &&
    filtered.every((candidate) => selected.has(candidate.stop.hotel_id));

  function toggleHotel(hotelId: string) {
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(hotelId)) next.delete(hotelId);
      else next.add(hotelId);
      return next;
    });
  }

  function toggleVisible() {
    const visibleIds = filtered.map((candidate) => candidate.stop.hotel_id);
    setSelected((current) => {
      const next = new Set(current);
      if (allVisibleSelected) {
        for (const id of visibleIds) next.delete(id);
      } else {
        for (const id of visibleIds) next.add(id);
      }
      return next;
    });
  }

  return (
    <div
      className={dialogBackdrop}
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        className={cn(dialog, dialogWide)}
        role="dialog"
        aria-modal="true"
        aria-labelledby="plan-add-hotels-title"
      >
        <button
          type="button"
          className={dialogClose}
          onClick={onClose}
          aria-label="Close add hotels dialog"
        >
          <X size={16} />
        </button>

        <span className={dialogEyebrow}>
          <Plus size={12} />
          Add existing hotels
        </span>
        <h2 id="plan-add-hotels-title">
          Add hotels to {shortRouteName(route.name)}
        </h2>
        <p className={dialogLede}>
          Selected hotels leave their current routes and join this route with
          cheapest insertion, then a 2-opt polish. Starts at {depot.name};
          returns{" "}
          {laundry
            ? `via ${laundry.name} (${laundry.service_mins} min on site) to ${depot.name}`
            : `directly to ${depot.name}`}
          .{" "}
          {hasVehicle
            ? `${route.nominal_cap} bag vehicle · safe load ${route.max_load} · currently Day 1 ${bagLabel(currentDayBags.day1)}, Day 2 ${bagLabel(currentDayBags.day2)}.`
            : `No vehicle assigned · currently Day 1 ${bagLabel(currentDayBags.day1)}, Day 2 ${bagLabel(currentDayBags.day2)}.`}
        </p>

        <div className={hotelFilters}>
          <label className={hotelSearch}>
            <Search size={14} />
            <input
              type="search"
              value={query}
              placeholder="Search hotels or routes…"
              onChange={(event) => setQuery(event.target.value)}
              aria-label="Search hotels"
              autoFocus
            />
          </label>
          <select
            className={hotelFilterSelect}
            value={regionFilter}
            onChange={(event) => setRegionFilter(event.target.value)}
            aria-label="Filter hotels by region"
          >
            <option value="all">All regions</option>
            {regionOptions.map((region) => (
              <option key={region.id} value={String(region.id)}>
                {region.label}
              </option>
            ))}
          </select>
        </div>

        <div className={hotelBulk}>
          <span>
            {filtered.length} hotel{filtered.length === 1 ? "" : "s"} ·{" "}
            {selected.size} selected
          </span>
          <button
            type="button"
            onClick={toggleVisible}
            disabled={filtered.length === 0}
          >
            {allVisibleSelected ? "Clear visible" : "Select all visible"}
          </button>
        </div>

        <div className={hotelList}>
          {filtered.length === 0 ? (
            <p className={hotelListEmpty}>
              {candidates.length === 0
                ? "Every existing hotel is already on this route."
                : "No hotels match this search or region filter."}
            </p>
          ) : (
            filtered.map((candidate) => {
              const isSelected = selected.has(candidate.stop.hotel_id);
              const regionLabel =
                regionById.get(candidate.stop.region)?.short_name ??
                `Region ${candidate.stop.region}`;
              return (
                <label
                  key={candidate.stop.hotel_id}
                  className={
                    isSelected ? hotelOptionSelected : hotelOption
                  }
                >
                  <input
                    className={hotelOptionInput}
                    type="checkbox"
                    checked={isSelected}
                    onChange={() => toggleHotel(candidate.stop.hotel_id)}
                  />
                  <span
                    className={
                      isSelected
                        ? hotelOptionCheckSelected
                        : hotelOptionCheck
                    }
                    aria-hidden="true"
                  >
                    {isSelected && <Check size={11} />}
                  </span>
                  <span className={hotelOptionMain}>
                    <b>{candidate.stop.name}</b>
                    <span>
                      <span
                        className={hotelOptionDot}
                        style={{ background: candidate.routeColor }}
                      />
                      {candidate.routeName} · {regionLabel}
                    </span>
                  </span>
                  <span className={hotelOptionBags}>
                    {bagLabel(candidate.stop.load_bags)} ·{" "}
                    {roomLabel(candidate.stop.rooms ?? 0)}
                  </span>
                </label>
              );
            })
          )}
        </div>

        <div className={dialogCapacity}>
          <div className={dialogDayLoads}>
            {(["day1", "day2"] as const).map((day) => {
              const isAffected = selectedDays.includes(day);
              const dayTone = overDays.includes(day)
                ? "over"
                : hasVehicle && projectedDayBags[day] > route.max_load
                  ? "warn"
                  : "ok";
              return (
                <div className={capacity} key={day}>
                  <div className={capacityLabels}>
                    <span>
                      {dayLabel(day)} {projectedDayBags[day]}
                      {hasVehicle ? ` / ${route.nominal_cap}` : ""} bags
                    </span>
                    <span>
                      {hasVehicle
                        ? `${isAffected ? "affected" : "unchanged"} · safe ${route.max_load}`
                        : "no vehicle"}
                    </span>
                  </div>
                  {hasVehicle && (
                    <div className={capacityTrack}>
                      <span
                        className={cn(
                          capacityFill,
                          capacityFillTone[dayTone],
                        )}
                        style={{
                          width: `${Math.min(
                            100,
                            (projectedDayBags[day] /
                              Math.max(1, route.max_load)) *
                              100,
                          )}%`,
                        }}
                      />
                    </div>
                  )}
                </div>
              );
            })}
          </div>
          <p
            className={cn(
              capacityNote,
              capacityNoteTone[hasVehicle ? capacityTone : "ok"],
            )}
          >
            {!hasVehicle ? (
              <>No vehicle assigned — capacity will apply after you assign one.</>
            ) : overCapacity ? (
              <>
                <AlertTriangle size={12} />
                {overDays
                  .map(
                    (day) =>
                      `${dayLabel(day)} would carry ${projectedDayBags[day]} of ${route.nominal_cap} bags`,
                  )
                  .join(" and ")}{" "}
                — remove hotels before adding.
              </>
            ) : overSafeLoad ? (
              <>
                <AlertTriangle size={12} />
                {overSafeDays
                  .map(
                    (day) =>
                      `${dayLabel(day)} would carry ${projectedDayBags[day]} bags, above the safe load of ${route.max_load}`,
                  )
                  .join(" and ")}
                . This is a warning; the add is still allowed.
              </>
            ) : (
              <>Within the safe load for every affected day.</>
            )}
          </p>
        </div>

        <div className={dialogActions}>
          <span className={dialogSelection}>
            {selected.size} hotel{selected.size === 1 ? "" : "s"} ·{" "}
            {bagLabel(selectedBags)} · {roomLabel(selectedRooms)}
          </span>
          <button type="button" className={btnGhost} onClick={onClose}>
            Cancel
          </button>
          <button
            type="button"
            className={btnPrimary}
            disabled={selected.size === 0 || overCapacity}
            onClick={() =>
              onAdd(selectedCandidates.map((candidate) => candidate.stop.hotel_id))
            }
          >
            <Plus size={14} />
            {selected.size === 0
              ? "Add hotels"
              : `Add ${selected.size} hotel${selected.size === 1 ? "" : "s"}`}
          </button>
        </div>
      </div>
    </div>
  );
}
