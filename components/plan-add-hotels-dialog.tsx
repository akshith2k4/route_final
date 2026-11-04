"use client";

import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, Check, Plus, Search, X } from "lucide-react";
import type { RegionMeta } from "../lib/coverage";
import { routeDepot, type Plan, type PlanRoute, type PlanStop } from "../lib/plan";

type HotelCandidate = {
  stop: PlanStop;
  routeId: string;
  routeName: string;
  routeColor: string;
};

type PlanAddHotelsDialogProps = {
  open: boolean;
  route: PlanRoute | null;
  currentBags: number;
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

export default function PlanAddHotelsDialog({
  open,
  route,
  currentBags,
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
  const selectedCandidates = candidates.filter((candidate) =>
    selected.has(candidate.stop.hotel_id),
  );
  const selectedBags = selectedCandidates.reduce(
    (sum, candidate) => sum + candidate.stop.load_bags,
    0,
  );
  const projectedBags = currentBags + selectedBags;
  const overCapacity = projectedBags > route.nominal_cap;
  const overSafeLoad = projectedBags > route.max_load;
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
      className="modal-backdrop"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        className="plan-dialog plan-dialog--wide"
        role="dialog"
        aria-modal="true"
        aria-labelledby="plan-add-hotels-title"
      >
        <button
          type="button"
          className="dialog-close"
          onClick={onClose}
          aria-label="Close add hotels dialog"
        >
          <X size={16} />
        </button>

        <span className="dialog-eyebrow">
          <Plus size={12} />
          Add existing hotels
        </span>
        <h2 id="plan-add-hotels-title">
          Add hotels to {shortRouteName(route.name)}
        </h2>
        <p className="dialog-lede">
          Selected hotels leave their current routes and join this route with
          cheapest insertion, then a 2-opt polish. Starts and ends at{" "}
          {depot.name}. {route.nominal_cap} bag vehicle · safe load{" "}
          {route.max_load} · currently {bagLabel(currentBags)}.
        </p>

        <div className="plan-hotel-filters">
          <label className="plan-hotel-search">
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

        <div className="plan-hotel-bulk">
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

        <div className="plan-hotel-list">
          {filtered.length === 0 ? (
            <p className="plan-hotel-list__empty">
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
                  className={`plan-hotel-option ${
                    isSelected ? "is-selected" : ""
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={isSelected}
                    onChange={() => toggleHotel(candidate.stop.hotel_id)}
                  />
                  <span className="plan-hotel-option__check" aria-hidden="true">
                    {isSelected && <Check size={11} />}
                  </span>
                  <span className="plan-hotel-option__main">
                    <b>{candidate.stop.name}</b>
                    <span>
                      <span
                        className="plan-hotel-option__dot"
                        style={{ background: candidate.routeColor }}
                      />
                      {candidate.routeName} · {regionLabel}
                    </span>
                  </span>
                  <span className="plan-hotel-option__bags">
                    {bagLabel(candidate.stop.load_bags)}
                  </span>
                </label>
              );
            })
          )}
        </div>

        <div className="plan-dialog__capacity">
          <div className="plan-capacity">
            <div className="plan-capacity__labels">
              <span>
                {projectedBags} / {route.nominal_cap} bags
              </span>
              <span>
                safe {route.max_load} · {selectedBags} selected
              </span>
            </div>
            <div className="plan-capacity__track">
              <span
                className={`plan-capacity__fill plan-capacity__fill--${capacityTone}`}
                style={{
                  width: `${Math.min(
                    100,
                    (projectedBags / Math.max(1, route.max_load)) * 100,
                  )}%`,
                }}
              />
            </div>
          </div>
          <p
            className={`plan-dialog__capacity-note plan-dialog__capacity-note--${capacityTone}`}
          >
            {overCapacity ? (
              <>
                <AlertTriangle size={12} />
                {projectedBags - route.nominal_cap} bags over the vehicle limit —
                remove hotels before adding.
              </>
            ) : overSafeLoad ? (
              <>
                <AlertTriangle size={12} />
                {projectedBags - route.max_load} bags over the safe load. This is
                a warning; the add is still allowed.
              </>
            ) : (
              <>Within the safe load for this vehicle.</>
            )}
          </p>
        </div>

        <div className="plan-dialog__actions">
          <span className="plan-dialog__selection">
            {selected.size} hotel{selected.size === 1 ? "" : "s"} ·{" "}
            {bagLabel(selectedBags)}
          </span>
          <button type="button" className="btn btn--ghost" onClick={onClose}>
            Cancel
          </button>
          <button
            type="button"
            className="btn btn--primary"
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
