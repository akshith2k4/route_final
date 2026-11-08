"use client";

import { ArrowRightLeft, Warehouse } from "lucide-react";
import type { Plan, PlanDepot, PlanRoute } from "../../lib/plan";
import {
  depotLabel,
  laundryLabel,
  resolveLaundry,
  resolveVehicle,
} from "../../lib/plan";
import {
  warehouse,
  warehouseEmpty,
  warehouseHead,
  warehousePin,
  warehousePinPrimary,
  warehouseRoute,
  warehouseRouteBody,
  warehouseRouteDot,
  warehouseRouteMain,
  warehouseRouteMeta,
  warehouseRouteMove,
  warehouseRouteName,
  warehouseRouteSelected,
  warehouseRoutes,
  warehouseTag,
  warehouseTitle,
  warehouseTitleMeta,
  warehouseTitleText,
} from "../ui/plan-styles";
import { shortRouteName } from "./plan-types";

type AssignedRouteItem = {
  route: PlanRoute;
  computed?: {
    total_hotels: number;
    total_bags: number;
    total_rooms: number;
    return_hq: string;
  };
};

type PlanWarehouseSectionProps = {
  depot: PlanDepot;
  isPrimary: boolean;
  assigned: AssignedRouteItem[];
  otherDepots: PlanDepot[];
  selectedRouteId: string | null;
  plan: Plan;
  onSelectRoute: (routeId: string) => void;
  onAssignDepot: (routeId: string, depotId: string) => void;
};

export function PlanWarehouseSection({
  depot,
  isPrimary,
  assigned,
  otherDepots,
  selectedRouteId,
  plan,
  onSelectRoute,
  onAssignDepot,
}: PlanWarehouseSectionProps) {
  const stopCount = assigned.reduce(
    (sum, { computed }) => sum + (computed?.total_hotels ?? 0),
    0,
  );
  const bags = assigned.reduce(
    (sum, { computed }) => sum + (computed?.total_bags ?? 0),
    0,
  );
  const rooms = assigned.reduce(
    (sum, { computed }) => sum + (computed?.total_rooms ?? 0),
    0,
  );

  return (
    <section className={warehouse} key={depot.id}>
      <header className={warehouseHead}>
        <span className={isPrimary ? warehousePinPrimary : warehousePin}>
          <Warehouse size={14} />
        </span>
        <span className={warehouseTitle}>
          <b className={warehouseTitleText}>{depot.name}</b>
          <span className={warehouseTitleMeta}>
            {assigned.length} route{assigned.length === 1 ? "" : "s"} ·{" "}
            {stopCount} stops · {bags} bags · {rooms} rooms
          </span>
        </span>
        <span className={warehouseTag}>{depotLabel(depot)}</span>
      </header>

      <div className={warehouseRoutes}>
        {assigned.length === 0 ? (
          <div className={warehouseEmpty}>No routes assigned yet.</div>
        ) : (
          assigned.map(({ route, computed }) => {
            const laundry = resolveLaundry(plan, route);
            const vehicle = resolveVehicle(plan, route);
            return (
              <div
                key={route.route_id}
                className={
                  selectedRouteId === route.route_id
                    ? warehouseRouteSelected
                    : warehouseRoute
                }
              >
                <button
                  type="button"
                  className={warehouseRouteMain}
                  onClick={() => onSelectRoute(route.route_id)}
                >
                  <span
                    className={warehouseRouteDot}
                    style={{ background: route.color }}
                  />
                  <span className={warehouseRouteBody}>
                    <b className={warehouseRouteName}>
                      {shortRouteName(route.name)}
                    </b>
                    <span className={warehouseRouteMeta}>
                      {computed?.total_hotels ?? 0} stops ·{" "}
                      {computed?.total_bags ?? 0}
                      {vehicle ? `/${route.max_load}` : ""} bags ·{" "}
                      {computed?.total_rooms ?? 0} rooms ·{" "}
                      {laundry ? `via ${laundryLabel(laundry)}` : "direct"} ·{" "}
                      {computed?.return_hq ?? "—"} return
                    </span>
                  </span>
                </button>
                {otherDepots.map((other) => (
                  <button
                    key={other.id}
                    type="button"
                    className={warehouseRouteMove}
                    onClick={() => onAssignDepot(route.route_id, other.id)}
                    title={`Move ${shortRouteName(route.name)} to ${other.name}`}
                  >
                    <ArrowRightLeft size={11} />
                    {depotLabel(other)}
                  </button>
                ))}
              </div>
            );
          })
        )}
      </div>
    </section>
  );
}

