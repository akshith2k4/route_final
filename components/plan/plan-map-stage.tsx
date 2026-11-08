"use client";

import type { RefObject } from "react";
import { PanelRight } from "lucide-react";
import PlanCanvasMap, {
  type PlanCanvasMapHandle,
} from "../plan-canvas-map";
import type { HexMap, RegionMeta } from "../../lib/coverage";
import type {
  Plan,
  PlanComputation,
  PlanLaundry,
  PlanRoute,
  PlanView,
} from "../../lib/plan";
import {
  depotLabel,
  laundryLabel,
  routeDepot,
} from "../../lib/plan";
import {
  mapOverlay,
  mapOverlayKicker,
  mapOverlayMeta,
  mapOverlayTitle,
  mapStage,
} from "../ui/plan-styles";
import { shortRouteName } from "./plan-types";

type PlanMapStageProps = {
  mapRef: RefObject<PlanCanvasMapHandle | null>;
  viewPlan: Plan;
  routes: PlanComputation["routes"];
  selectedRouteId: string | null;
  selectedStopId: string | null;
  geometries: Record<string, [number, number][]>;
  regions: RegionMeta[];
  hexMap: HexMap;
  inspectorOpen: boolean;
  view: PlanView;
  viewLabel: string;
  selectedRoute: PlanRoute | null;
  selectedComputed: {
    total_bags: number;
    total_rooms: number;
    total_dist_km: number;
  } | null;
  selectedLaundry: PlanLaundry | null;
  totalHotels: number;
  totalRooms: number;
  plan: Plan;
  onSelectRoute: (routeId: string) => void;
  onSelectStop: (routeId: string, stopId: string) => void;
  onToggleInspector: () => void;
};

export function PlanMapStage({
  mapRef,
  viewPlan,
  routes,
  selectedRouteId,
  selectedStopId,
  geometries,
  regions,
  hexMap,
  inspectorOpen,
  view,
  viewLabel,
  selectedRoute,
  selectedComputed,
  selectedLaundry,
  totalHotels,
  totalRooms,
  plan,
  onSelectRoute,
  onSelectStop,
  onToggleInspector,
}: PlanMapStageProps) {
  return (
    <section className={mapStage} aria-label="Plan map">
      <PlanCanvasMap
        ref={mapRef}
        plan={viewPlan}
        routes={routes}
        selectedRouteId={selectedRouteId}
        selectedStopId={selectedStopId}
        geometries={geometries}
        regions={regions}
        hexMap={hexMap}
        onSelectRoute={onSelectRoute}
        onSelectStop={onSelectStop}
      />

      {/* Floating Toolbar */}
      <div className="absolute top-4 right-4 z-[6] flex flex-col gap-px p-1 border border-line-strong rounded-xl bg-[#fbf8f1]/95 shadow-lg backdrop-blur-md max-[760px]:top-3 max-[760px]:right-3">
        <button
          type="button"
          className="grid w-8 h-8 place-items-center rounded-lg text-ink-soft bg-bone hover:bg-bone-deep transition-colors"
          onClick={onToggleInspector}
          aria-label="Toggle route details"
          aria-pressed={inspectorOpen}
          title="Route details"
        >
          <PanelRight size={15} />
        </button>
        <span className="h-px my-1 mx-1.5 bg-line" />
        <button
          type="button"
          className="grid w-8 h-8 place-items-center rounded-lg text-ink-soft bg-bone hover:bg-bone-deep transition-colors font-bold text-base"
          onClick={() => mapRef.current?.zoomIn()}
          aria-label="Zoom in"
        >
          +
        </button>
        <button
          type="button"
          className="grid w-8 h-8 place-items-center rounded-lg text-ink-soft bg-bone hover:bg-bone-deep transition-colors font-bold text-base"
          onClick={() => mapRef.current?.zoomOut()}
          aria-label="Zoom out"
        >
          −
        </button>
        <span className="h-px my-1 mx-1.5 bg-line" />
        <button
          type="button"
          className="h-8 px-2 rounded-lg text-ink-soft bg-bone hover:bg-bone-deep transition-colors text-[10px] font-semibold whitespace-nowrap"
          onClick={() => mapRef.current?.fitPlan()}
        >
          Fit plan
        </button>
      </div>

      {/* Map Overlay Badge */}
      <div className={mapOverlay}>
        <span className={mapOverlayKicker}>
          Plan canvas{view === "all" ? "" : ` · ${viewLabel}`}
        </span>
        <b className={mapOverlayTitle}>
          {selectedRoute ? shortRouteName(selectedRoute.name) : "All routes"}
        </b>
        <span className={mapOverlayMeta}>
          {selectedRoute
            ? `${selectedRoute.stops.length} stops · ${
                selectedComputed?.total_bags ?? 0
              } bags · ${selectedComputed?.total_rooms ?? 0} rooms · ${
                selectedComputed?.total_dist_km ?? 0
              } km · ${depotLabel(routeDepot(plan, selectedRoute))}${
                selectedLaundry ? ` · via ${laundryLabel(selectedLaundry)}` : ""
              }`
            : `${viewPlan.routes.length} routes · ${totalHotels} hotels · ${totalRooms} rooms`}
        </span>
      </div>
    </section>
  );
}

