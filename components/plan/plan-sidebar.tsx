"use client";

import Link from "next/link";
import type { DragEvent } from "react";
import {
  CalendarDays,
  GripVertical,
  Hotel,
  Plus,
  Route,
  Truck,
  Warehouse,
} from "lucide-react";
import type {
  Plan,
  PlanDay,
  PlanDepot,
  PlanIssue,
  PlanRoute,
  PlanStop,
  PlanView,
} from "../../lib/plan";
import {
  normalizeStopDays,
  overCapacityDays,
  projectRouteDayBags,
  resolveLaundry,
  resolveVehicle,
  routeDepot,
  routeDepotId,
} from "../../lib/plan";
import type { PlanSummary } from "../../lib/plan-store";
import {
  dayFilter,
  dayFilterButton,
  dayFilterButtonActive,
  eyebrow,
  eyebrowDot,
  legendLine,
  legendLineSolid,
  legendRegion,
  modeButton,
  modeButtonActive,
  modeSwitchSidebar,
  newRoute,
  newRouteGhost,
  sidebar,
  sidebarFoot,
  sidebarHead,
  sidebarHeadActions,
  sidebarHeadTools,
  sidebarHint,
  sidebarRoutes,
  sidebarRoutesWarehouse,
  sidebarTitle,
  switcher,
  switcherPicker,
  switcherSave,
  switcherSelect,
  warehouseHint,
} from "../ui/plan-styles";
import {
  DAY_VIEW_OPTIONS,
  ROUTE_WARNING_CODES,
  type DragState,
  type DropTarget,
  type PlanMode,
} from "./plan-types";
import { PlanRouteCard } from "./plan-route-card";
import { PlanWarehouseSection } from "./plan-warehouse-section";

type PlanSidebarProps = {
  plan: Plan;
  viewPlan: Plan;
  currentPlanId: string;
  planList: PlanSummary[];
  planSwitching: boolean;
  mode: PlanMode;
  view: PlanView;
  viewLabel: string;
  viewCounts: Record<PlanView, number>;
  totalHotelsCount: number;
  computedById: Map<
    string,
    {
      total_hotels: number;
      total_bags: number;
      total_rooms: number;
      stops: {
        stop_number: number;
        arrival_time: string;
        departure_time: string;
      }[];
      return_hq: string;
      return_min: number;
    }
  >;
  depots: PlanDepot[];
  selectedRouteId: string | null;
  selectedStopId: string | null;
  dragState: DragState | null;
  draggedStop: PlanStop | null;
  dropTarget: DropTarget | null;
  issuesByRoute: Map<string, PlanIssue[]>;
  updatingRoutes: Set<string>;
  onSwitchPlan: (planId: string) => void;
  onOpenSaveAs: () => void;
  onChangeMode: (mode: PlanMode) => void;
  onChangeView: (view: PlanView) => void;
  onOpenCreateRoute: () => void;
  onOpenNewHotel: () => void;
  onOpenVehicles: () => void;
  onOpenNewFacility: (role: "warehouse" | "laundry") => void;
  onSelectRoute: (routeId: string) => void;
  onSelectStop: (routeId: string, stopId: string) => void;
  onRouteDragOver: (event: DragEvent<HTMLElement>, route: PlanRoute) => void;
  onRouteDrop: (event: DragEvent<HTMLElement>, route: PlanRoute) => void;
  onStopDragOver: (
    event: DragEvent<HTMLElement>,
    route: PlanRoute,
    index: number,
  ) => void;
  onStopDrop: (
    event: DragEvent<HTMLElement>,
    route: PlanRoute,
    index: number,
  ) => void;
  onBeginDrag: (
    event: DragEvent<HTMLElement>,
    route: PlanRoute,
    stop: PlanStop,
  ) => void;
  onEndDrag: () => void;
  onSetStopDays: (hotelId: string, days: PlanDay[]) => void;
  onMoveWithinRoute: (
    routeId: string,
    fromIndex: number,
    delta: -1 | 1,
  ) => void;
  onOpenAddHotels: (routeId: string) => void;
  onOptimizeRoute: (routeId: string) => void;
  onDeleteRoute: (routeId: string) => void;
  onAssignDepot: (routeId: string, depotId: string) => void;
};

export function PlanSidebar({
  plan,
  viewPlan,
  currentPlanId,
  planList,
  planSwitching,
  mode,
  view,
  viewLabel,
  viewCounts,
  totalHotelsCount,
  computedById,
  depots,
  selectedRouteId,
  selectedStopId,
  dragState,
  draggedStop,
  dropTarget,
  issuesByRoute,
  updatingRoutes,
  onSwitchPlan,
  onOpenSaveAs,
  onChangeMode,
  onChangeView,
  onOpenCreateRoute,
  onOpenNewHotel,
  onOpenVehicles,
  onOpenNewFacility,
  onSelectRoute,
  onSelectStop,
  onRouteDragOver,
  onRouteDrop,
  onStopDragOver,
  onStopDrop,
  onBeginDrag,
  onEndDrag,
  onSetStopDays,
  onMoveWithinRoute,
  onOpenAddHotels,
  onOptimizeRoute,
  onDeleteRoute,
  onAssignDepot,
}: PlanSidebarProps) {
  const isAllView = view === "all";
  const isDayView = view === "day1" || view === "day2";
  const isDailyView = view === "daily";

  return (
    <aside className={sidebar} aria-label="Route board">
      {/* Plan Switcher */}
      <div className={switcher}>
        <label className={switcherPicker}>
          <span>Plan</span>
          <select
            className={switcherSelect}
            value={currentPlanId}
            onChange={(event) => void onSwitchPlan(event.target.value)}
            disabled={planSwitching}
            aria-label="Select plan"
          >
            {planList.map((entry) => (
              <option key={entry.id} value={entry.id}>
                {entry.name}
              </option>
            ))}
          </select>
        </label>
        <button
          type="button"
          className={switcherSave}
          onClick={onOpenSaveAs}
          title="Save this plan under a name"
        >
          <Plus size={11} />
          Save as
        </button>
      </div>

      {/* Sidebar Head */}
      <div className={sidebarHead}>
        <div>
          <span className={eyebrow}>
            <span className={eyebrowDot} />
            {mode === "plan"
              ? `${viewLabel} · ${viewPlan.routes.length} routes · ${totalHotelsCount} stops`
              : `${depots.length} warehouses · ${plan.routes.length} routes`}
          </span>
          <h2 className={sidebarTitle}>
            {mode === "plan" ? "Route board" : "Warehouse board"}
          </h2>
        </div>
        <div className={sidebarHeadTools}>
          {mode === "plan" ? (
            <>
              <div className={sidebarHeadActions}>
                <button
                  type="button"
                  className={newRoute}
                  onClick={onOpenCreateRoute}
                >
                  <Plus size={12} />
                  New route
                </button>
                <button
                  type="button"
                  className={newRouteGhost}
                  onClick={onOpenNewHotel}
                >
                  <Hotel size={12} />
                  New hotel
                </button>
              </div>
              <button
                type="button"
                className={newRouteGhost}
                onClick={onOpenVehicles}
              >
                <Truck size={12} />
                Vehicles
              </button>
              <span className={sidebarHint}>
                {isAllView ? (
                  <>
                    <GripVertical size={13} />
                    Drag to reorder
                  </>
                ) : (
                  <>
                    <CalendarDays size={13} />
                    Move hotels by day
                  </>
                )}
              </span>
            </>
          ) : (
            <span className={sidebarHint}>
              <Warehouse size={13} />
              Assign routes
            </span>
          )}

          {/* Mode switch (mobile / sidebar fallback) */}
          <div
            className={modeSwitchSidebar}
            role="group"
            aria-label="Editing mode"
          >
            <button
              type="button"
              className={mode === "plan" ? modeButtonActive : modeButton}
              onClick={() => onChangeMode("plan")}
              aria-pressed={mode === "plan"}
              title="Edit stops and routes"
            >
              <Route size={12} />
              Plan
            </button>
            <button
              type="button"
              className={mode === "warehouse" ? modeButtonActive : modeButton}
              onClick={() => onChangeMode("warehouse")}
              aria-pressed={mode === "warehouse"}
              title="Assign routes to warehouses"
            >
              <Warehouse size={12} />
              Warehouse
            </button>
          </div>
        </div>
      </div>

      {/* Day Filter Tabs */}
      {mode === "plan" && (
        <div
          className={dayFilter}
          role="group"
          aria-label="Hotel day view"
        >
          {DAY_VIEW_OPTIONS.map((option) => (
            <button
              key={option.key}
              type="button"
              className={
                view === option.key
                  ? dayFilterButtonActive
                  : dayFilterButton
              }
              aria-pressed={view === option.key}
              onClick={() => onChangeView(option.key)}
            >
              <span>{option.label}</span>
              <b>{viewCounts[option.key]}</b>
            </button>
          ))}
        </div>
      )}

      {/* Routes List */}
      {mode === "plan" ? (
        <div className={sidebarRoutes}>
          {viewPlan.routes.map((route) => {
            const computed = computedById.get(route.route_id);
            if (!computed) return null;
            const depot = routeDepot(plan, route);
            const laundry = resolveLaundry(plan, route);
            const assignedVehicle = resolveVehicle(plan, route);
            const isSelected = selectedRouteId === route.route_id;
            const isDropRoute = dropTarget?.routeId === route.route_id;
            const dropOverDays =
              isAllView &&
              dragState &&
              draggedStop &&
              dragState.sourceRouteId !== route.route_id &&
              assignedVehicle
                ? overCapacityDays(
                    route,
                    projectRouteDayBags(route, [draggedStop]),
                    normalizeStopDays(draggedStop),
                  )
                : [];
            const isDropBlocked = dropOverDays.length > 0;
            const routeIssues = issuesByRoute.get(route.route_id) ?? [];
            const cardWarnings = isDayView
              ? routeIssues.filter(
                  (issue) =>
                    ROUTE_WARNING_CODES.has(issue.code) &&
                    (assignedVehicle || !issue.code.startsWith("over_")),
                )
              : [];
            const isUpdating = updatingRoutes.has(route.route_id);
            const dropLineIndex =
              isDropRoute && dropTarget?.index !== null
                ? dropTarget?.index
                : null;

            return (
              <PlanRouteCard
                key={route.route_id}
                route={route}
                computed={computed}
                depot={depot}
                laundry={laundry}
                assignedVehicle={assignedVehicle}
                isPrimaryDepot={depot.id === plan.depot.id}
                isSelected={isSelected}
                isDropRoute={isDropRoute}
                isDropBlocked={isDropBlocked}
                isUpdating={isUpdating}
                isAllView={isAllView}
                isDayView={isDayView}
                isDailyView={isDailyView}
                view={view}
                shiftEndMin={plan.shift.end_min}
                cardWarnings={cardWarnings}
                selectedRouteId={selectedRouteId}
                selectedStopId={selectedStopId}
                dragState={dragState}
                dropLineIndex={dropLineIndex ?? null}
                onSelectRoute={onSelectRoute}
                onSelectStop={onSelectStop}
                onRouteDragOver={onRouteDragOver}
                onRouteDrop={onRouteDrop}
                onStopDragOver={onStopDragOver}
                onStopDrop={onStopDrop}
                onBeginDrag={onBeginDrag}
                onEndDrag={onEndDrag}
                onSetStopDays={onSetStopDays}
                onMoveWithinRoute={onMoveWithinRoute}
                onOpenAddHotels={onOpenAddHotels}
                onOptimizeRoute={onOptimizeRoute}
                onDeleteRoute={onDeleteRoute}
              />
            );
          })}
        </div>
      ) : (
        <div className={sidebarRoutesWarehouse}>
          <div className="flex items-center justify-between px-3.5 py-2.5 border-b border-line bg-paper-strong">
            <Link
              href="/facilities"
              className="text-xs font-medium text-ink-soft hover:text-ink underline"
            >
              Manage facilities
            </Link>
            <button
              type="button"
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-ink text-cream text-xs font-semibold hover:bg-[#273a2f]"
              onClick={() => onOpenNewFacility("warehouse")}
            >
              <Plus size={12} />
              Add warehouse
            </button>
          </div>
          {depots.map((depot) => {
            const assigned = plan.routes
              .map((route) => ({
                route,
                computed: computedById.get(route.route_id),
              }))
              .filter(({ route }) => routeDepotId(plan, route) === depot.id);
            const otherDepots = depots.filter(
              (candidate) => candidate.id !== depot.id,
            );

            return (
              <PlanWarehouseSection
                key={depot.id}
                depot={depot}
                isPrimary={depot.id === plan.depot.id}
                assigned={assigned}
                otherDepots={otherDepots}
                selectedRouteId={selectedRouteId}
                plan={plan}
                onSelectRoute={onSelectRoute}
                onAssignDepot={onAssignDepot}
              />
            );
          })}
          <p className={warehouseHint}>
            A route and all of its hotels move together. The vehicle starts at
            the assigned warehouse and returns there after any laundry stop.
          </p>
        </div>
      )}

      {/* Sidebar Footer */}
      <div className={sidebarFoot}>
        <span>
          <span className={legendLine} />
          Dashed = refreshing
        </span>
        <span>
          <span className={legendLineSolid} />
          Solid = OSRM path
        </span>
        <span>
          <span className={legendRegion} />
          H3 region boundary
        </span>
      </div>
    </aside>
  );
}

