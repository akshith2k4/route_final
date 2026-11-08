"use client";

import { Fragment, type DragEvent } from "react";
import {
  AlertTriangle,
  ChevronDown,
  ChevronUp,
  GripVertical,
  MapPin,
  Plus,
  Trash2,
  Wand2,
  WashingMachine,
} from "lucide-react";
import type {
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
  laundryLabel,
  normalizeStopDays,
} from "../../lib/plan";
import { cn } from "../ui/cn";
import {
  capacityFill,
  capacityFillTone,
  dropLine,
  routeCapacityTrack,
  routeCard,
  routeCardDropBlocked,
  routeCardDropTarget,
  routeCardSelected,
  routeDepotTag,
  routeDepotTagSecondary,
  routeDot,
  routeEmpty,
  routeHead,
  routeLaundryTag,
  routeMeta,
  routeName,
  routeStops,
  routeTag,
  routeTitle,
  routeTitleName,
  routeTool,
  routeToolDanger,
  routeTools,
  routeVehicleMissing,
  routeWarningTone,
  stopAction,
  stopActions,
  stopActionsVisible,
  stopDay,
  stopHandle,
  stopMain,
  stopName,
  stopNumber,
  stopRow,
  stopRowDragging,
  stopRowSelected,
} from "../ui/plan-styles";
import {
  capacityTone,
  formatRooms,
  shortRouteName,
  type DragState,
} from "./plan-types";

type PlanRouteCardProps = {
  route: PlanRoute;
  computed?: {
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
  };
  depot: PlanDepot;
  laundry: PlanLaundry | null;
  assignedVehicle: PlanVehicle | null;
  isPrimaryDepot: boolean;
  isSelected: boolean;
  isDropRoute: boolean;
  isDropBlocked: boolean;
  isUpdating: boolean;
  isAllView: boolean;
  isDayView: boolean;
  isDailyView: boolean;
  view: PlanView;
  shiftEndMin: number;
  cardWarnings: PlanIssue[];
  selectedRouteId: string | null;
  selectedStopId: string | null;
  dragState: DragState | null;
  dropLineIndex: number | null;
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
};

export function PlanRouteCard({
  route,
  computed,
  depot,
  laundry,
  assignedVehicle,
  isPrimaryDepot,
  isSelected,
  isDropRoute,
  isDropBlocked,
  isUpdating,
  isAllView,
  isDayView,
  isDailyView,
  view,
  shiftEndMin,
  cardWarnings,
  selectedRouteId,
  selectedStopId,
  dragState,
  dropLineIndex,
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
}: PlanRouteCardProps) {
  const tone = capacityTone(computed?.total_bags ?? 0, route);

  return (
    <section
      className={cn(
        isDropBlocked
          ? routeCardDropBlocked
          : isDropRoute
            ? routeCardDropTarget
            : isSelected
              ? routeCardSelected
              : routeCard,
      )}
      onDragOver={(event) => onRouteDragOver(event, route)}
      onDrop={(event) => onRouteDrop(event, route)}
    >
      {/* Route Card Header */}
      <button
        type="button"
        className={routeHead}
        onClick={() => onSelectRoute(route.route_id)}
        aria-pressed={isSelected}
      >
        <span className={routeDot} style={{ background: route.color }} />
        <span className={routeTitle}>
          <b className={routeTitleName}>
            <span className={routeName}>{shortRouteName(route.name)}</span>
            <span
              className={
                isPrimaryDepot ? routeDepotTag : routeDepotTagSecondary
              }
            >
              {depotLabel(depot)}
            </span>
            {laundry && (
              <span className={routeLaundryTag}>
                <WashingMachine size={9} />
                {laundryLabel(laundry)}
              </span>
            )}
            {!assignedVehicle && (
              <span className={routeVehicleMissing}>No vehicle</span>
            )}
            {route.is_custom && <span className={routeTag}>Custom</span>}
          </b>
          <span className={routeMeta}>
            {computed?.total_hotels ?? 0} stops ·{" "}
            {formatRooms(computed?.total_rooms ?? 0)}
            {isUpdating ? " · updating path…" : ""}
            {isDropBlocked ? " · not enough capacity" : ""}
          </span>
        </span>
      </button>

      {/* Capacity meter */}
      {isDayView && assignedVehicle && (
        <div className={routeCapacityTrack} aria-hidden="true">
          <span
            className={cn(capacityFill, capacityFillTone[tone])}
            style={{
              width: `${Math.min(
                100,
                ((computed?.total_bags ?? 0) / route.max_load) * 100,
              )}%`,
            }}
          />
        </div>
      )}

      {/* Warnings */}
      {cardWarnings.slice(0, 2).map((issue) => (
        <div
          key={`${issue.day ?? "day"}-${issue.code}-${issue.stop_id ?? "route"}`}
          className={routeWarningTone[issue.severity]}
        >
          <AlertTriangle size={12} />
          <span>
            {issue.code === "over_nominal_capacity"
              ? `${(computed?.total_bags ?? 0) - route.nominal_cap} bags over the vehicle limit`
              : issue.code === "over_safe_capacity"
                ? `${(computed?.total_bags ?? 0) - route.max_load} bags over the safe load`
                : `Returns ${computed?.return_hq} · ${
                    (computed?.return_min ?? 0) - shiftEndMin
                  } min past shift`}
          </span>
        </div>
      ))}

      {/* Custom Route Tools */}
      {isAllView && route.is_custom && (
        <div className={routeTools}>
          <button
            type="button"
            className={routeTool}
            onClick={() => onOpenAddHotels(route.route_id)}
          >
            <Plus size={11} />
            Add hotels
          </button>
          <button
            type="button"
            className={routeTool}
            onClick={() => onOptimizeRoute(route.route_id)}
            disabled={route.stops.length < 3}
            title={
              route.stops.length < 3
                ? "Add at least three stops to optimize"
                : "Polish this route's stop order"
            }
          >
            <Wand2 size={11} />
            Optimize
          </button>
          <button
            type="button"
            className={routeToolDanger}
            onClick={() => onDeleteRoute(route.route_id)}
            title={
              route.stops.length > 0
                ? "Delete this route and return its hotels to the original plan"
                : "Delete this custom route"
            }
          >
            <Trash2 size={11} />
            Delete
          </button>
        </div>
      )}

      {/* Stop Items */}
      <div className={routeStops}>
        {route.stops.length === 0 && (
          <div className={routeEmpty}>
            <MapPin size={13} />
            {route.is_custom
              ? "New route · add hotels to start"
              : isDailyView
                ? "No daily hotels on this route."
                : isDayView
                  ? `No hotels on ${view === "day1" ? "Day 1" : "Day 2"}.`
                  : "Drop a stop here"}
          </div>
        )}
        {route.stops.map((stop, index) => {
          const computedStop = computed?.stops[index];
          const isStopSelected =
            selectedRouteId === route.route_id &&
            selectedStopId === stop.hotel_id;
          const stopDays = normalizeStopDays(stop);
          const dayValue =
            stopDays.length === 2
              ? "both"
              : stopDays.length === 0
                ? "none"
                : stopDays[0];

          return (
            <Fragment key={stop.hotel_id}>
              {dropLineIndex === index && <div className={dropLine} />}
              <div
                className={cn(
                  "plan-stop",
                  isStopSelected ? stopRowSelected : stopRow,
                  dragState?.hotelId === stop.hotel_id && stopRowDragging,
                )}
                onClick={() => onSelectStop(route.route_id, stop.hotel_id)}
                onDragOver={(event) => onStopDragOver(event, route, index)}
                onDrop={(event) => onStopDrop(event, route, index)}
              >
                {isAllView && (
                  <span
                    className={stopHandle}
                    draggable
                    onDragStart={(event) => onBeginDrag(event, route, stop)}
                    onDragEnd={onEndDrag}
                    title="Drag to reorder or move to another route"
                    aria-label={`Drag ${stop.name}`}
                  >
                    <GripVertical size={14} />
                  </span>
                )}
                <span
                  className={stopNumber}
                  style={{ background: route.color }}
                >
                  {computedStop?.stop_number ?? index + 1}
                </span>
                <span className={stopMain}>
                  <span className={stopName}>{stop.name}</span>
                </span>
                <select
                  className={stopDay}
                  value={dayValue}
                  onClick={(event) => event.stopPropagation()}
                  onChange={(event) => {
                    const value = event.target.value;
                    const nextDays: PlanDay[] =
                      value === "both"
                        ? ["day1", "day2"]
                        : value === "day1"
                          ? ["day1"]
                          : value === "day2"
                            ? ["day2"]
                            : [];
                    onSetStopDays(stop.hotel_id, nextDays);
                  }}
                  title="Change this hotel's day"
                  aria-label={`Day assignment for ${stop.name}`}
                >
                  <option value="both">Both</option>
                  <option value="day1">Day 1</option>
                  <option value="day2">Day 2</option>
                </select>
                {isAllView && (
                  <span
                    className={
                      isStopSelected ? stopActionsVisible : stopActions
                    }
                  >
                    <button
                      type="button"
                      className={stopAction}
                      onClick={(event) => {
                        event.stopPropagation();
                        onMoveWithinRoute(route.route_id, index, -1);
                      }}
                      disabled={index === 0}
                      title="Move up"
                      aria-label={`Move ${stop.name} up`}
                    >
                      <ChevronUp size={13} />
                    </button>
                    <button
                      type="button"
                      className={stopAction}
                      onClick={(event) => {
                        event.stopPropagation();
                        onMoveWithinRoute(route.route_id, index, 1);
                      }}
                      disabled={index === route.stops.length - 1}
                      title="Move down"
                      aria-label={`Move ${stop.name} down`}
                    >
                      <ChevronDown size={13} />
                    </button>
                  </span>
                )}
              </div>
            </Fragment>
          );
        })}
        {dropLineIndex === route.stops.length && (
          <div className={dropLine} />
        )}
      </div>
    </section>
  );
}

