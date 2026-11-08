"use client";

import Link from "next/link";
import {
  AlertTriangle,
  ChevronDown,
  ChevronUp,
  MapPin,
  Plus,
  Trash2,
  Truck,
  Wand2,
  X,
} from "lucide-react";
import type {
  Plan,
  PlanDay,
  PlanDepot,
  PlanIssue,
  PlanLaundry,
  PlanRoute,
  PlanStop,
  PlanVehicle,
  PlanView,
} from "../../lib/plan";
import {
  depotLabel,
  formatDuration,
  normalizeStopDays,
  routeDepot,
  routeDepotId,
  routesUsingVehicle,
} from "../../lib/plan";
import { cn } from "../ui/cn";
import {
  capacity,
  capacityFill,
  capacityFillTone,
  capacityLabels,
  capacityTrack,
  dayCard,
  dayCardLabel,
  dayCardStats,
  dayCompare,
  drawerScrim,
  drawerScrimClosed,
  drawerScrimOpen,
  eyebrow,
  eyebrowDot,
  field,
  inlineDot,
  inspector,
  inspectorClosed,
  inspectorClose,
  inspectorCode,
  inspectorDangerButton,
  inspectorEmpty,
  inspectorHead,
  inspectorHealth,
  inspectorHealthHead,
  inspectorLede,
  inspectorNote,
  inspectorNoteWarning,
  inspectorOpenClass,
  inspectorRow,
  inspectorRowButton,
  inspectorSection,
  inspectorTitle,
  inspectorWideButton,
  issue as issueClass,
  issueError,
  issues,
  metric,
  metrics,
  mutedText,
} from "../ui/plan-styles";
import {
  capacityTone,
  formatBags,
  formatKm,
  shortRouteName,
  type PlanMode,
} from "./plan-types";

type PlanInspectorProps = {
  inspectorOpen: boolean;
  onCloseInspector: () => void;
  mode: PlanMode;
  view: PlanView;
  isAllView: boolean;
  isDayView: boolean;
  isDailyView: boolean;
  plan: Plan;
  depots: PlanDepot[];
  laundries: PlanLaundry[];
  vehicles: PlanVehicle[];
  selectedRoute: PlanRoute | null;
  selectedStop: PlanStop | null;
  selectedStopIndex: number;
  selectedComputed: {
    total_hotels: number;
    total_bags: number;
    total_rooms: number;
    total_dist_km: number;
    total_drive_mins: number;
    total_service_mins: number;
    laundry_service_mins: number;
    capacity_utilization_pct: number;
    departure_hq: string;
    return_hq: string;
    depot_name: string;
    laundry_arrival_time?: string | null;
    laundry_departure_time?: string | null;
  } | null;
  selectedComputedStop: {
    stop_number: number;
    arrival_time: string;
    departure_time: string;
    leg_distance_km: number;
    leg_drive_mins: number;
  } | null;
  selectedVehicle: PlanVehicle | null;
  selectedLaundry: PlanLaundry | null;
  selectedDay1: {
    total_hotels: number;
    total_bags: number;
    total_rooms: number;
    total_dist_km: number;
    return_hq: string;
  } | null;
  selectedDay2: {
    total_hotels: number;
    total_bags: number;
    total_rooms: number;
    total_dist_km: number;
    return_hq: string;
  } | null;
  otherRoutesOnVehicle: PlanRoute[];
  moveTargets: PlanRoute[];
  computedById: Map<string, { total_bags: number }>;
  issuesByRoute: Map<string, PlanIssue[]>;
  viewIssues: PlanIssue[];
  errors: PlanIssue[];
  warnings: PlanIssue[];
  onSelectStopDays: (hotelId: string, days: PlanDay[]) => void;
  onMoveWithinRoute: (
    routeId: string,
    fromIndex: number,
    delta: -1 | 1,
  ) => void;
  onMoveStopToRoute: (hotelId: string, targetRouteId: string) => void;
  onFocusStop: (lat: number, lon: number) => void;
  onFocusRoute: (routeId: string) => void;
  onFocusIssue: (issue: PlanIssue) => void;
  onAssignDepot: (routeId: string, depotId: string) => void;
  onAssignVehicle: (routeId: string, vehicleId: string) => void;
  onSetLaundry: (routeId: string, laundryId: string) => void;
  onOptimizeRoute: (routeId: string) => void;
  onDeleteRoute: (routeId: string) => void;
  onOpenAddHotels: () => void;
  onOpenVehicles: () => void;
  onOpenNewFacility: (role: "warehouse" | "laundry") => void;
};

export function PlanInspector({
  inspectorOpen,
  onCloseInspector,
  mode,
  view,
  isAllView,
  isDayView,
  isDailyView,
  plan,
  depots,
  laundries,
  vehicles,
  selectedRoute,
  selectedStop,
  selectedStopIndex,
  selectedComputed,
  selectedComputedStop,
  selectedVehicle,
  selectedLaundry,
  selectedDay1,
  selectedDay2,
  otherRoutesOnVehicle,
  moveTargets,
  computedById,
  issuesByRoute,
  viewIssues,
  errors,
  warnings,
  onSelectStopDays,
  onMoveWithinRoute,
  onMoveStopToRoute,
  onFocusStop,
  onFocusRoute,
  onFocusIssue,
  onAssignDepot,
  onAssignVehicle,
  onSetLaundry,
  onOptimizeRoute,
  onDeleteRoute,
  onOpenAddHotels,
  onOpenVehicles,
  onOpenNewFacility,
}: PlanInspectorProps) {
  return (
    <>
      <aside
        className={cn(
          inspector,
          inspectorOpen ? inspectorOpenClass : inspectorClosed,
        )}
        aria-label="Inspector"
      >
        <button
          type="button"
          className={inspectorClose}
          onClick={onCloseInspector}
          aria-label="Close details"
        >
          <X size={14} />
        </button>

        {mode === "plan" &&
        selectedStop &&
        selectedComputed &&
        selectedComputedStop ? (
          <>
            {/* Stop Detail View */}
            <div className={inspectorHead}>
              <span className={eyebrow}>
                <span
                  className={inlineDot}
                  style={{ background: selectedRoute?.color }}
                />
                Stop {selectedComputedStop.stop_number} ·{" "}
                {shortRouteName(selectedRoute?.name ?? "")}
              </span>
              <h2 className={inspectorTitle}>{selectedStop.name}</h2>
              <p className={inspectorLede}>
                Region {selectedStop.region} · hotel ID{" "}
                <code className={inspectorCode}>{selectedStop.hotel_id}</code>
              </p>
            </div>

            <div className={metrics}>
              <div className={metric}>
                <span>Arrive</span>
                <b>{selectedComputedStop.arrival_time}</b>
              </div>
              <div className={metric}>
                <span>Depart</span>
                <b>{selectedComputedStop.departure_time}</b>
              </div>
              <div className={metric}>
                <span>Load</span>
                <b>{formatBags(selectedStop.load_bags)}</b>
              </div>
              <div className={metric}>
                <span>Rooms</span>
                <b>{selectedStop.rooms ?? 0}</b>
              </div>
              <div className={metric}>
                <span>On site</span>
                <b>{selectedStop.service_mins} min</b>
              </div>
              <div className={metric}>
                <span>Leg</span>
                <b>{formatKm(selectedComputedStop.leg_distance_km)}</b>
              </div>
              <div className={metric}>
                <span>Drive</span>
                <b>{selectedComputedStop.leg_drive_mins} min</b>
              </div>
            </div>

            <div className={inspectorSection}>
              <h3>Day assignment</h3>
              <label className={field}>
                <span>Visits on</span>
                <select
                  value={(() => {
                    const days = normalizeStopDays(selectedStop);
                    return days.length === 2
                      ? "both"
                      : days.length === 0
                        ? "none"
                        : days[0];
                  })()}
                  onChange={(event) => {
                    const val = event.target.value;
                    const nextDays: PlanDay[] =
                      val === "both"
                        ? ["day1", "day2"]
                        : val === "day1"
                          ? ["day1"]
                          : val === "day2"
                            ? ["day2"]
                            : [];
                    onSelectStopDays(selectedStop.hotel_id, nextDays);
                  }}
                >
                  <option value="both">Both days (daily)</option>
                  <option value="day1">Day 1 only</option>
                  <option value="day2">Day 2 only</option>
                </select>
              </label>
              <p className={inspectorNote}>
                Daily hotels are part of both Day 1 and Day 2 trips.
              </p>
              <button
                type="button"
                className={inspectorWideButton}
                onClick={() =>
                  onFocusStop(selectedStop.lat, selectedStop.lon)
                }
              >
                <MapPin size={14} />
                Focus on map
              </button>
            </div>

            {isAllView && (
              <div className={inspectorSection}>
                <h3>Adjust this stop</h3>
                <div className={inspectorRow}>
                  <button
                    type="button"
                    className={inspectorRowButton}
                    onClick={() =>
                      onMoveWithinRoute(
                        selectedRoute?.route_id ?? "",
                        selectedStopIndex,
                        -1,
                      )
                    }
                    disabled={selectedStopIndex <= 0}
                  >
                    <ChevronUp size={14} />
                    Move up
                  </button>
                  <button
                    type="button"
                    className={inspectorRowButton}
                    onClick={() =>
                      onMoveWithinRoute(
                        selectedRoute?.route_id ?? "",
                        selectedStopIndex,
                        1,
                      )
                    }
                    disabled={
                      !selectedRoute ||
                      selectedStopIndex >= selectedRoute.stops.length - 1
                    }
                  >
                    <ChevronDown size={14} />
                    Move down
                  </button>
                </div>

                <label className={field}>
                  <span>Move to another route</span>
                  <select
                    value=""
                    onChange={(event) => {
                      if (!event.target.value) return;
                      onMoveStopToRoute(
                        selectedStop.hotel_id,
                        event.target.value,
                      );
                    }}
                  >
                    <option value="">Choose a route…</option>
                    {moveTargets.map((r) => {
                      const target = computedById.get(r.route_id);
                      const targetBags = target?.total_bags ?? 0;
                      const fits =
                        targetBags + selectedStop.load_bags <= r.nominal_cap;
                      return (
                        <option
                          key={r.route_id}
                          value={r.route_id}
                          disabled={!fits}
                        >
                          {shortRouteName(r.name)} · {targetBags}/{r.max_load}{" "}
                          bags{fits ? "" : " · over capacity"}
                        </option>
                      );
                    })}
                  </select>
                </label>
              </div>
            )}

            <div className={inspectorSection}>
              <h3>Route signals</h3>
              {(issuesByRoute.get(selectedRoute?.route_id ?? "") ?? []).length ===
              0 ? (
                <p className={mutedText}>
                  No capacity or shift issues on this route.
                </p>
              ) : (
                <div className={issues}>
                  {(
                    issuesByRoute.get(selectedRoute?.route_id ?? "") ?? []
                  ).map((issue) => (
                    <button
                      key={`${issue.day ?? "plan"}-${issue.code}-${
                        issue.stop_id ?? "route"
                      }`}
                      type="button"
                      className={
                        issue.severity === "error" ? issueError : issueClass
                      }
                      onClick={() => onFocusIssue(issue)}
                    >
                      <AlertTriangle size={12} />
                      <span>{issue.message}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </>
        ) : selectedRoute && selectedComputed ? (
          <>
            {/* Route Detail View */}
            <div className={inspectorHead}>
              <span className={eyebrow}>
                <span
                  className={inlineDot}
                  style={{ background: selectedRoute.color }}
                />
                Route summary
              </span>
              <h2 className={inspectorTitle}>
                {shortRouteName(selectedRoute.name)}
              </h2>
              <p className={inspectorLede}>
                {isAllView ? (
                  <>
                    {selectedComputed.total_hotels} stops ·{" "}
                    {selectedComputed.total_rooms} rooms · D1{" "}
                    {selectedDay1?.total_bags ?? 0} bags · D2{" "}
                    {selectedDay2?.total_bags ?? 0} bags
                  </>
                ) : isDailyView ? (
                  <>
                    {selectedComputed.total_hotels} daily hotels ·{" "}
                    {selectedComputed.total_bags} bags ·{" "}
                    {selectedComputed.total_rooms} rooms · shared by both days
                  </>
                ) : (
                  <>
                    {selectedComputed.total_hotels} stops ·{" "}
                    {selectedComputed.total_bags}
                    {selectedVehicle ? `/${selectedRoute.max_load}` : ""} bags ·{" "}
                    {selectedComputed.total_rooms} rooms
                    {selectedVehicle
                      ? ` · ${selectedComputed.capacity_utilization_pct}% of safe load`
                      : ""}
                  </>
                )}
              </p>
            </div>

            {/* Warehouse Section */}
            <div className={inspectorSection}>
              <div className="flex items-center justify-between mb-1.5">
                <h3 className="m-0">Warehouse</h3>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => onOpenNewFacility("warehouse")}
                    className="text-xs font-medium text-green hover:underline"
                  >
                    + Add warehouse
                  </button>
                  <Link
                    href="/facilities"
                    className="text-xs text-muted hover:text-ink underline"
                  >
                    Manage
                  </Link>
                </div>
              </div>
              <label className={field}>
                <span>Vehicle starts and ends at</span>
                <select
                  value={routeDepotId(plan, selectedRoute)}
                  onChange={(event) =>
                    onAssignDepot(selectedRoute.route_id, event.target.value)
                  }
                >
                  {depots.map((depot) => {
                    const isDual = laundries.some((l) => l.id === depot.id);
                    return (
                      <option key={depot.id} value={depot.id}>
                        {depot.name}
                        {isDual ? " · Warehouse + Laundry" : ""}
                        {depot.is_active === false ? " (inactive)" : ""}
                      </option>
                    );
                  })}
                </select>
              </label>
              <p className={inspectorNote}>
                {mode === "warehouse"
                  ? `All ${selectedComputed.total_hotels} hotels move with this route. Starts/ends at ${selectedComputed.depot_name}.`
                  : isAllView || isDailyView
                    ? `Starts and ends at ${selectedComputed.depot_name} on both Day 1 and Day 2.`
                    : selectedLaundry
                      ? `Follows ${selectedComputed.depot_name} → hotels → ${selectedLaundry.name} → ${selectedComputed.depot_name}.`
                      : `Calculated from ${selectedComputed.depot_name}.`}
              </p>
            </div>

            {/* Vehicle Section */}
            {mode === "plan" && (
              <div className={inspectorSection}>
                <h3>Vehicle</h3>
                <label className={field}>
                  <span>Assigned vehicle</span>
                  <select
                    value={selectedRoute.vehicle_id ?? ""}
                    onChange={(event) =>
                      onAssignVehicle(
                        selectedRoute.route_id,
                        event.target.value,
                      )
                    }
                  >
                    {!selectedVehicle && (
                      <option value="" disabled>
                        Select a vehicle
                      </option>
                    )}
                    {vehicles.map((v) => {
                      const usedElsewhere = routesUsingVehicle(
                        plan,
                        v.id,
                      ).filter((r) => r.route_id !== selectedRoute.route_id);
                      return (
                        <option
                          key={v.id}
                          value={v.id}
                          disabled={usedElsewhere.length > 0}
                        >
                          {v.name} · {v.nominal_cap} bags
                          {usedElsewhere.length > 0 ? " · in use" : ""}
                        </option>
                      );
                    })}
                  </select>
                </label>
                <p className={inspectorNote}>
                  {selectedVehicle
                    ? `${selectedVehicle.name} · safe load ${selectedVehicle.max_load} bags.`
                    : "No vehicle assigned. Choose one to set the route capacity."}
                </p>
                {otherRoutesOnVehicle.length > 0 && (
                  <p className={inspectorNoteWarning}>
                    Also allocated to{" "}
                    {otherRoutesOnVehicle
                      .map((r) => shortRouteName(r.name))
                      .join(", ")}
                    .
                  </p>
                )}
                {selectedComputed.total_bags > selectedRoute.nominal_cap && (
                  <p className={inspectorNoteWarning}>
                    Carries {selectedComputed.total_bags} bags, above the{" "}
                    {selectedRoute.nominal_cap}-bag vehicle capacity.
                  </p>
                )}
                <div className={inspectorRow}>
                  <button
                    type="button"
                    className={inspectorRowButton}
                    onClick={() => onAssignVehicle(selectedRoute.route_id, "")}
                    disabled={!selectedRoute.vehicle_id}
                  >
                    Release
                  </button>
                  <button
                    type="button"
                    className={inspectorRowButton}
                    onClick={onOpenVehicles}
                  >
                    <Truck size={14} />
                    Manage
                  </button>
                </div>
              </div>
            )}

            {/* Return / Laundry Section */}
            {mode === "plan" && (
              <div className={inspectorSection}>
                <div className="flex items-center justify-between mb-1.5">
                  <h3 className="m-0">Return</h3>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => onOpenNewFacility("laundry")}
                      className="text-xs font-medium text-green hover:underline"
                    >
                      + New laundry
                    </button>
                    <Link
                      href="/facilities"
                      className="text-xs text-muted hover:text-ink underline"
                    >
                      Manage
                    </Link>
                  </div>
                </div>
                <label className={field}>
                  <span>After the last hotel</span>
                  <select
                    value={selectedRoute.laundry_id ?? ""}
                    onChange={(event) =>
                      onSetLaundry(selectedRoute.route_id, event.target.value)
                    }
                  >
                    <option value="">
                      Direct to {depotLabel(routeDepot(plan, selectedRoute))}
                    </option>
                    {laundries.map((l) => {
                      const isDual = depots.some((d) => d.id === l.id);
                      return (
                        <option key={l.id} value={l.id}>
                          {l.name}
                          {isDual ? " · Warehouse + Laundry" : ""}
                          {l.is_active === false ? " (inactive)" : ""} ·{" "}
                          {formatDuration(l.service_mins)} on site
                        </option>
                      );
                    })}
                  </select>
                </label>
                <p className={inspectorNote}>
                  {isAllView || isDailyView
                    ? "Laundry applies to both day trips. Open Day 1 or Day 2 to see the timings."
                    : selectedLaundry && selectedComputed.laundry_arrival_time
                      ? `Arrive ${selectedComputed.laundry_arrival_time} · depart ${selectedComputed.laundry_departure_time} · return ${selectedComputed.return_hq}.`
                      : `Returns straight to ${selectedComputed.depot_name}.`}
                </p>
              </div>
            )}

            {/* Day Compare or Metrics Grid */}
            {isAllView ? (
              <div className={dayCompare}>
                {[
                  { label: "Day 1", data: selectedDay1 },
                  { label: "Day 2", data: selectedDay2 },
                ].map(({ label, data }) => (
                  <div className={dayCard} key={label}>
                    <span className={dayCardLabel}>{label}</span>
                    <div className={dayCardStats}>
                      <span>
                        <b>{data?.total_hotels ?? 0}</b> stops
                      </span>
                      <span>
                        <b>
                          {data?.total_bags ?? 0}
                          {selectedVehicle ? `/${selectedRoute.max_load}` : ""}
                        </b>{" "}
                        bags
                      </span>
                      <span>
                        <b>{data?.total_rooms ?? 0}</b> rooms
                      </span>
                      <span>
                        <b>{formatKm(data?.total_dist_km ?? 0)}</b>
                      </span>
                      <span>
                        <b>
                          {data && data.total_hotels > 0 ? data.return_hq : "—"}
                        </b>{" "}
                        return
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className={metrics}>
                <div className={metric}>
                  <span>Depart</span>
                  <b>{selectedComputed.departure_hq}</b>
                </div>
                <div className={metric}>
                  <span>Return</span>
                  <b>{selectedComputed.return_hq}</b>
                </div>
                <div className={metric}>
                  <span>Distance</span>
                  <b>{formatKm(selectedComputed.total_dist_km)}</b>
                </div>
                <div className={metric}>
                  <span>Drive</span>
                  <b>{formatDuration(selectedComputed.total_drive_mins)}</b>
                </div>
                <div className={metric}>
                  <span>Hotel service</span>
                  <b>{formatDuration(selectedComputed.total_service_mins)}</b>
                </div>
                <div className={metric}>
                  <span>Laundry</span>
                  <b>
                    {selectedLaundry
                      ? formatDuration(selectedComputed.laundry_service_mins)
                      : "Direct"}
                  </b>
                </div>
                <div className={metric}>
                  <span>Stops</span>
                  <b>{selectedComputed.total_hotels}</b>
                </div>
                <div className={metric}>
                  <span>Rooms</span>
                  <b>{selectedComputed.total_rooms}</b>
                </div>
              </div>
            )}

            {/* Capacity Meter */}
            <div className={inspectorSection}>
              <h3>Capacity</h3>
              {isDayView ? (
                selectedVehicle ? (
                  <div className={capacity}>
                    <div className={capacityLabels}>
                      <span>{selectedComputed.total_bags} bags</span>
                      <span>
                        safe {selectedRoute.max_load} · vehicle{" "}
                        {selectedRoute.nominal_cap}
                      </span>
                    </div>
                    <div className={capacityTrack}>
                      <span
                        className={cn(
                          capacityFill,
                          capacityFillTone[
                            capacityTone(
                              selectedComputed.total_bags,
                              selectedRoute,
                            )
                          ],
                        )}
                        style={{
                          width: `${Math.min(
                            100,
                            (selectedComputed.total_bags /
                              selectedRoute.max_load) *
                              100,
                          )}%`,
                        }}
                      />
                    </div>
                  </div>
                ) : (
                  <p className={mutedText}>
                    Assign a vehicle to see this route's capacity.
                  </p>
                )
              ) : (
                <p className={mutedText}>
                  {isDailyView
                    ? "Daily core is shared by both days; capacity is checked on Day 1 and Day 2."
                    : "Capacity is checked separately on Day 1 and Day 2."}
                </p>
              )}
            </div>

            {/* Tools (Add hotels, optimize, focus, delete) */}
            {mode === "plan" && isAllView && (
              <div className={inspectorSection}>
                <h3>Route tools</h3>
                <div className={inspectorRow}>
                  <button
                    type="button"
                    className={inspectorRowButton}
                    onClick={onOpenAddHotels}
                  >
                    <Plus size={14} />
                    Add hotels
                  </button>
                  <button
                    type="button"
                    className={inspectorRowButton}
                    onClick={() => onOptimizeRoute(selectedRoute.route_id)}
                    disabled={selectedRoute.stops.length < 3}
                  >
                    <Wand2 size={14} />
                    Optimize
                  </button>
                </div>
                <button
                  type="button"
                  className={inspectorWideButton}
                  onClick={() => onFocusRoute(selectedRoute.route_id)}
                >
                  <MapPin size={14} />
                  Focus on map
                </button>
                {selectedRoute.is_custom && (
                  <button
                    type="button"
                    className={inspectorDangerButton}
                    onClick={() => onDeleteRoute(selectedRoute.route_id)}
                  >
                    <Trash2 size={14} />
                    Delete route
                  </button>
                )}
              </div>
            )}

            {/* Route Signals */}
            <div className={inspectorSection}>
              <h3>Route signals</h3>
              {(issuesByRoute.get(selectedRoute.route_id) ?? []).length === 0 ? (
                <p className={mutedText}>
                  This route is within capacity and returns before shift end.
                </p>
              ) : (
                <div className={issues}>
                  {(issuesByRoute.get(selectedRoute.route_id) ?? []).map(
                    (issue) => (
                      <button
                        key={`${issue.day ?? "plan"}-${issue.code}-${
                          issue.stop_id ?? "route"
                        }`}
                        type="button"
                        className={
                        issue.severity === "error" ? issueError : issueClass
                      }
                        onClick={() => onFocusIssue(issue)}
                      >
                        <AlertTriangle size={12} />
                        <span>{issue.message}</span>
                      </button>
                    ),
                  )}
                </div>
              )}
            </div>
          </>
        ) : (
          /* Empty State */
          <div className={inspectorEmpty}>
            <span className={eyebrow}>
              <span className={eyebrowDot} />
              Plan canvas
            </span>
            <h2>Pick a route to begin</h2>
            <p>
              {mode === "warehouse"
                ? "Select a route in the warehouse board to see its metrics, or move it to another warehouse."
                : "Select a route on the left, then drag stops by the grip. Drop a stop on another route to move it."}
            </p>
          </div>
        )}

        {/* Global Plan Health Card */}
        <div className={inspectorHealth}>
          <div className={inspectorHealthHead}>
            <span>Plan health</span>
            <span>
              {errors.length} error{errors.length === 1 ? "" : "s"} ·{" "}
              {warnings.length} warning{warnings.length === 1 ? "" : "s"}
            </span>
          </div>
          <div className={issues}>
            {isDailyView && (
              <p className={mutedText}>
                Daily core is shared by both days. Capacity and shift checks run
                on Day 1 and Day 2.
              </p>
            )}
            {viewIssues.length === 0 ? (
              <p className={mutedText}>No issues found.</p>
            ) : (
              viewIssues.slice(0, 8).map((issue) => (
                <button
                  key={`${issue.day ?? "plan"}-${issue.code}-${
                    issue.route_id ?? "plan"
                  }-${issue.stop_id ?? ""}`}
                  type="button"
                  className={
                    issue.severity === "error" ? issueError : issueClass
                  }
                  onClick={() => onFocusIssue(issue)}
                >
                  <AlertTriangle size={12} />
                  <span>{issue.message}</span>
                </button>
              ))
            )}
          </div>
        </div>
      </aside>

      {/* Scrim backdrop for mobile drawer */}
      <div
        className={cn(
          drawerScrim,
          inspectorOpen ? drawerScrimOpen : drawerScrimClosed,
        )}
        onClick={onCloseInspector}
        aria-hidden="true"
      />
    </>
  );
}

