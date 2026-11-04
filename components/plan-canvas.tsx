"use client";

import Link from "next/link";
import {
  Fragment,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  AlertTriangle,
  Check,
  ChevronDown,
  Clock,
  ChevronUp,
  Download,
  GripVertical,
  MapPin,
  MoveRight,
  PanelRight,
  Redo2,
  RotateCcw,
  Undo2,
  X,
} from "lucide-react";
import PlanCanvasMap, {
  type PlanCanvasMapHandle,
} from "./plan-canvas-map";
import type { HexMap, RegionMeta } from "../lib/coverage";
import {
  computePlan,
  findStop,
  formatClock,
  formatDuration,
  moveStop,
  reorderStops,
  type ComputedRoute,
  type Plan,
  type PlanIssue,
  type PlanRoute,
  type PlanStop,
  type TravelMatrix,
} from "../lib/plan";

const STORAGE_KEY = "linengrass.plan-canvas.v1";
const OSRM_BASE_URL = "https://router.project-osrm.org";

type PlanCanvasProps = {
  initialPlan: Plan;
  matrix: TravelMatrix;
  regions: RegionMeta[];
  hexMap: HexMap;
  initialGeometries: Record<string, [number, number][]>;
};

type DropTarget = {
  routeId: string;
  index: number | null;
};

type DragState = {
  hotelId: string;
  sourceRouteId: string;
};

type Toast = {
  message: string;
  tone: "info" | "error";
};

function shortRouteName(name: string): string {
  return name.replace(/\s*\(ID:[^)]*\)\s*$/, "").trim();
}

function routeSignature(route: PlanRoute): string {
  return route.stops.map((stop) => stop.hotel_id).join("|");
}

function changedRouteIds(previous: Plan, next: Plan): string[] {
  const ids = new Set([
    ...previous.routes.map((route) => route.route_id),
    ...next.routes.map((route) => route.route_id),
  ]);

  return [...ids].filter((id) => {
    const before = previous.routes.find((route) => route.route_id === id);
    const after = next.routes.find((route) => route.route_id === id);
    if (!before || !after) return true;
    return routeSignature(before) !== routeSignature(after);
  });
}

function capacityTone(bags: number, route: PlanRoute): "ok" | "warn" | "over" {
  if (bags > route.nominal_cap) return "over";
  if (bags > route.max_load) return "warn";
  return "ok";
}

const ROUTE_WARNING_CODES = new Set([
  "over_nominal_capacity",
  "over_safe_capacity",
  "shift_overrun",
]);

function formatKm(value: number): string {
  return `${value.toFixed(1)} km`;
}

function formatBags(value: number): string {
  return `${value} bag${value === 1 ? "" : "s"}`;
}

export default function PlanCanvas({
  initialPlan,
  matrix,
  regions,
  hexMap,
  initialGeometries,
}: PlanCanvasProps) {
  const [plan, setPlan] = useState<Plan>(initialPlan);
  const [history, setHistory] = useState<Plan[]>([]);
  const [future, setFuture] = useState<Plan[]>([]);
  const [selectedRouteId, setSelectedRouteId] = useState<string | null>(
    initialPlan.routes[0]?.route_id ?? null,
  );
  const [selectedStopId, setSelectedStopId] = useState<string | null>(null);
  const [dragState, setDragState] = useState<DragState | null>(null);
  const [dropTarget, setDropTarget] = useState<DropTarget | null>(null);
  const [geometries, setGeometries] =
    useState<Record<string, [number, number][]>>(initialGeometries);
  const [updatingRoutes, setUpdatingRoutes] = useState<Set<string>>(
    () => new Set(),
  );
  const [toast, setToast] = useState<Toast | null>(null);
  const [hydrated, setHydrated] = useState(false);
  const [inspectorOpen, setInspectorOpen] = useState(false);

  const planRef = useRef(plan);
  const mapRef = useRef<PlanCanvasMapHandle | null>(null);
  const toastTimerRef = useRef<number | null>(null);
  const previousPlanRef = useRef(plan);

  useEffect(() => {
    planRef.current = plan;
  }, [plan]);

  const computation = useMemo(() => computePlan(plan, matrix), [plan, matrix]);
  const computedById = useMemo(
    () =>
      new Map(
        computation.routes.map((route) => [route.route_id, route]),
      ),
    [computation.routes],
  );

  const selectedRoute =
    plan.routes.find((route) => route.route_id === selectedRouteId) ?? null;
  const selectedComputed = selectedRouteId
    ? computedById.get(selectedRouteId) ?? null
    : null;
  const selectedStop =
    selectedRoute?.stops.find((stop) => stop.hotel_id === selectedStopId) ??
    null;
  const selectedComputedStop =
    selectedComputed?.stops.find(
      (stop) => stop.hotel_id === selectedStopId,
    ) ?? null;
  const selectedStopIndex =
    selectedRoute && selectedStopId
      ? selectedRoute.stops.findIndex(
          (stop) => stop.hotel_id === selectedStopId,
        )
      : -1;

  const errors = computation.issues.filter(
    (issue) => issue.severity === "error",
  );
  const warnings = computation.issues.filter(
    (issue) => issue.severity === "warning",
  );
  const healthTone =
    errors.length > 0 ? "is-error" : warnings.length > 0 ? "is-warn" : "is-ok";

  const issuesByRoute = useMemo(() => {
    const map = new Map<string, PlanIssue[]>();
    for (const issue of computation.issues) {
      if (!issue.route_id) continue;
      const list = map.get(issue.route_id) ?? [];
      list.push(issue);
      map.set(issue.route_id, list);
    }
    return map;
  }, [computation.issues]);

  const notify = useCallback(
    (message: string, tone: Toast["tone"] = "info") => {
      setToast({ message, tone });
      if (toastTimerRef.current) window.clearTimeout(toastTimerRef.current);
      toastTimerRef.current = window.setTimeout(
        () => setToast(null),
        tone === "error" ? 5600 : 3800,
      );
    },
    [],
  );

  useEffect(() => {
    return () => {
      if (toastTimerRef.current) window.clearTimeout(toastTimerRef.current);
    };
  }, []);

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as Plan;
        if (
          parsed?.schema_version === 1 &&
          parsed.plan_id === initialPlan.plan_id &&
          Array.isArray(parsed.routes)
        ) {
          const restored: Plan = { ...parsed, shift: initialPlan.shift };
          setPlan(restored);
          planRef.current = restored;
          setSelectedRouteId((current) =>
            current && restored.routes.some((route) => route.route_id === current)
              ? current
              : (restored.routes[0]?.route_id ?? null),
          );
          notify("Restored your local draft");
        }
      }
    } catch {
      // Ignore malformed local drafts.
    } finally {
      setHydrated(true);
    }
  }, [
    initialPlan.plan_id,
    initialPlan.shift.start_min,
    initialPlan.shift.end_min,
    notify,
  ]);

  useEffect(() => {
    if (!hydrated) return;
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(plan));
    } catch {
      // Storage can be unavailable in private mode; the canvas still works.
    }
  }, [plan, hydrated]);

  const fetchRouteGeometry = useCallback(async (route: PlanRoute) => {
    if (route.stops.length === 0) return;

    const signature = routeSignature(route);
    setUpdatingRoutes((current) => {
      const next = new Set(current);
      next.add(route.route_id);
      return next;
    });

    try {
      const points = [
        [planRef.current.depot.lat, planRef.current.depot.lon],
        ...route.stops.map((stop) => [stop.lat, stop.lon]),
        [planRef.current.depot.lat, planRef.current.depot.lon],
      ];
      const coords = points
        .map(([lat, lon]) => `${lon.toFixed(6)},${lat.toFixed(6)}`)
        .join(";");
      const response = await fetch(
        `${OSRM_BASE_URL}/route/v1/driving/${coords}?overview=full&geometries=geojson&steps=false`,
      );
      if (!response.ok) throw new Error(`OSRM ${response.status}`);
      const payload = (await response.json()) as {
        code?: string;
        routes?: { geometry?: { coordinates?: [number, number][] } }[];
      };
      const coordinates = payload.routes?.[0]?.geometry?.coordinates;
      if (payload.code !== "Ok" || !coordinates?.length) {
        throw new Error("OSRM returned no geometry");
      }

      const currentRoute = planRef.current.routes.find(
        (candidate) => candidate.route_id === route.route_id,
      );
      if (!currentRoute || routeSignature(currentRoute) !== signature) {
        return;
      }

      setGeometries((current) => ({
        ...current,
        [route.route_id]: coordinates.map(
          ([lon, lat]) => [lat, lon] as [number, number],
        ),
      }));
    } catch {
      // The map falls back to a dashed schematic line.
    } finally {
      setUpdatingRoutes((current) => {
        const next = new Set(current);
        next.delete(route.route_id);
        return next;
      });
    }
  }, []);

  useEffect(() => {
    const previous = previousPlanRef.current;
    if (previous === plan) return;
    previousPlanRef.current = plan;

    const changed = changedRouteIds(previous, plan);
    if (changed.length === 0) return;

    setGeometries((current) => {
      const next = { ...current };
      for (const routeId of changed) delete next[routeId];
      return next;
    });

    for (const routeId of changed) {
      const route = plan.routes.find(
        (candidate) => candidate.route_id === routeId,
      );
      if (route) void fetchRouteGeometry(route);
    }
  }, [plan, fetchRouteGeometry]);

  const commit = useCallback(
    (next: Plan, message: string) => {
      const current = planRef.current;
      if (next === current) return;
      setHistory((items) => [...items.slice(-49), current]);
      setFuture([]);
      setPlan(next);
      planRef.current = next;
      notify(message);
    },
    [notify],
  );

  const undo = useCallback(() => {
    if (history.length === 0) return;
    const previous = history[history.length - 1];
    setHistory(history.slice(0, -1));
    setFuture([planRef.current, ...future].slice(0, 50));
    setPlan(previous);
    planRef.current = previous;
    notify("Undid the last move");
  }, [history, future, notify]);

  const redo = useCallback(() => {
    if (future.length === 0) return;
    const next = future[0];
    setFuture(future.slice(1));
    setHistory([...history.slice(-49), planRef.current]);
    setPlan(next);
    planRef.current = next;
    notify("Redid the last move");
  }, [history, future, notify]);

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      const target = event.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === "INPUT" ||
          target.tagName === "SELECT" ||
          target.tagName === "TEXTAREA" ||
          target.isContentEditable)
      ) {
        return;
      }

      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "z") {
        event.preventDefault();
        if (event.shiftKey) redo();
        else undo();
      } else if (event.key === "Escape") {
        setSelectedStopId(null);
        setDropTarget(null);
        setDragState(null);
        setInspectorOpen(false);
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [undo, redo]);

  const revealInspector = useCallback(() => {
    if (window.matchMedia("(max-width: 980px)").matches) {
      setInspectorOpen(true);
    }
  }, []);

  const selectRoute = useCallback(
    (routeId: string) => {
      setSelectedRouteId(routeId);
      setSelectedStopId(null);
      revealInspector();
    },
    [revealInspector],
  );

  const selectStop = useCallback(
    (routeId: string, hotelId: string) => {
      setSelectedRouteId(routeId);
      setSelectedStopId(hotelId);
      const stop = planRef.current.routes
        .find((route) => route.route_id === routeId)
        ?.stops.find((candidate) => candidate.hotel_id === hotelId);
      if (stop) mapRef.current?.focusStop(stop.lat, stop.lon);
      revealInspector();
    },
    [revealInspector],
  );

  const handleReorder = useCallback(
    (routeId: string, fromIndex: number, toIndex: number) => {
      const next = reorderStops(planRef.current, routeId, fromIndex, toIndex);
      if (next === planRef.current) return;
      const stop = planRef.current.routes
        .find((route) => route.route_id === routeId)
        ?.stops[fromIndex];
      commit(next, stop ? `Moved ${stop.name} in the sequence` : "Reordered stops");
    },
    [commit],
  );

  const handleMove = useCallback(
    (hotelId: string, targetRouteId: string, targetIndex?: number) => {
      const current = planRef.current;
      const source = findStop(current, hotelId);
      const target = current.routes.find(
        (route) => route.route_id === targetRouteId,
      );
      if (!source || !target) return;

      let next: Plan;
      try {
        next = moveStop(current, hotelId, targetRouteId, targetIndex, matrix);
      } catch (error) {
        notify(
          error instanceof Error
            ? error.message
            : "That stop cannot be moved to this route.",
          "error",
        );
        return;
      }
      const stop = source.stop;
      const targetName = shortRouteName(target.name);
      commit(next, `Moved ${stop.name} to ${targetName}`);
      setSelectedRouteId(targetRouteId);
      setSelectedStopId(hotelId);
      mapRef.current?.focusStop(stop.lat, stop.lon);
      revealInspector();
    },
    [commit, matrix, notify, revealInspector],
  );

  const moveWithinRoute = useCallback(
    (routeId: string, index: number, direction: -1 | 1) => {
      handleReorder(routeId, index, index + direction);
    },
    [handleReorder],
  );

  const resetPlan = useCallback(() => {
    if (planRef.current === initialPlan) return;
    commit(initialPlan, "Reset to the published manual plan");
    setSelectedRouteId(initialPlan.routes[0]?.route_id ?? null);
    setSelectedStopId(null);
  }, [commit, initialPlan]);

  const exportPlan = useCallback(() => {
    const blob = new Blob([`${JSON.stringify(planRef.current, null, 2)}\n`], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = "linengrass-plan-draft.json";
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(url);
    notify("Plan exported as JSON");
  }, [notify]);

  const beginDrag = useCallback(
    (
      event: React.DragEvent<HTMLElement>,
      route: PlanRoute,
      stop: PlanStop,
    ) => {
      event.dataTransfer.effectAllowed = "move";
      event.dataTransfer.setData("text/plain", stop.hotel_id);
      const row = event.currentTarget.closest(".plan-stop");
      if (row) {
        event.dataTransfer.setDragImage(row as HTMLElement, 22, 18);
      }
      setDragState({ hotelId: stop.hotel_id, sourceRouteId: route.route_id });
      setSelectedRouteId(route.route_id);
      setSelectedStopId(stop.hotel_id);
    },
    [],
  );

  const endDrag = useCallback(() => {
    setDragState(null);
    setDropTarget(null);
  }, []);

  const canDropOnRoute = useCallback(
    (route: PlanRoute): boolean => {
      if (!dragState) return true;
      if (dragState.sourceRouteId === route.route_id) return true;
      const dragged = findStop(planRef.current, dragState.hotelId);
      const target = computedById.get(route.route_id);
      if (!dragged || !target) return true;
      return (
        target.total_bags + dragged.stop.load_bags <= route.nominal_cap
      );
    },
    [computedById, dragState],
  );

  const handleStopDragOver = useCallback(
    (
      event: React.DragEvent<HTMLElement>,
      route: PlanRoute,
      index: number,
    ) => {
      if (!dragState) return;
      if (!canDropOnRoute(route)) {
        event.dataTransfer.dropEffect = "none";
        if (dropTarget?.routeId === route.route_id) setDropTarget(null);
        return;
      }
      event.preventDefault();
      event.stopPropagation();
      event.dataTransfer.dropEffect = "move";
      const rect = event.currentTarget.getBoundingClientRect();
      const gap =
        event.clientY > rect.top + rect.height / 2 ? index + 1 : index;
      if (
        dropTarget?.routeId !== route.route_id ||
        dropTarget.index !== gap
      ) {
        setDropTarget({ routeId: route.route_id, index: gap });
      }
    },
    [canDropOnRoute, dragState, dropTarget],
  );

  const handleStopDrop = useCallback(
    (event: React.DragEvent<HTMLElement>, route: PlanRoute, index: number) => {
      event.preventDefault();
      event.stopPropagation();
      const drag = dragState;
      const target = dropTarget;
      endDrag();
      if (!drag) return;

      const gap =
        target?.routeId === route.route_id && target.index !== null
          ? target.index
          : index;

      if (drag.sourceRouteId === route.route_id) {
        const sourceRoute = planRef.current.routes.find(
          (candidate) => candidate.route_id === route.route_id,
        );
        const sourceIndex = sourceRoute?.stops.findIndex(
          (stop) => stop.hotel_id === drag.hotelId,
        );
        if (sourceIndex === undefined || sourceIndex < 0) return;
        const finalIndex = gap > sourceIndex ? gap - 1 : gap;
        if (finalIndex !== sourceIndex) {
          handleReorder(route.route_id, sourceIndex, finalIndex);
        }
      } else {
        handleMove(drag.hotelId, route.route_id, gap);
      }
    },
    [dragState, dropTarget, endDrag, handleMove, handleReorder],
  );

  const handleRouteDragOver = useCallback(
    (event: React.DragEvent<HTMLElement>, route: PlanRoute) => {
      if (!dragState) return;
      if (!canDropOnRoute(route)) {
        event.dataTransfer.dropEffect = "none";
        if (dropTarget) setDropTarget(null);
        return;
      }
      event.preventDefault();
      event.dataTransfer.dropEffect = "move";
      if (dropTarget?.routeId !== route.route_id || dropTarget.index !== null) {
        setDropTarget({ routeId: route.route_id, index: null });
      }
    },
    [canDropOnRoute, dragState, dropTarget],
  );

  const handleRouteDrop = useCallback(
    (event: React.DragEvent<HTMLElement>, route: PlanRoute) => {
      event.preventDefault();
      const drag = dragState;
      endDrag();
      if (!drag) return;

      if (drag.sourceRouteId === route.route_id) {
        const sourceRoute = planRef.current.routes.find(
          (candidate) => candidate.route_id === route.route_id,
        );
        const sourceIndex = sourceRoute?.stops.findIndex(
          (stop) => stop.hotel_id === drag.hotelId,
        );
        if (
          sourceIndex !== undefined &&
          sourceIndex >= 0 &&
          sourceRoute &&
          sourceIndex !== sourceRoute.stops.length - 1
        ) {
          handleReorder(
            route.route_id,
            sourceIndex,
            sourceRoute.stops.length - 1,
          );
        }
      } else {
        handleMove(drag.hotelId, route.route_id);
      }
    },
    [dragState, endDrag, handleMove, handleReorder],
  );

  const focusIssue = useCallback((issue: PlanIssue) => {
    if (!issue.route_id) return;
    setSelectedRouteId(issue.route_id);
    if (issue.stop_id) {
      setSelectedStopId(issue.stop_id);
      const stop = planRef.current.routes
        .find((route) => route.route_id === issue.route_id)
        ?.stops.find((candidate) => candidate.hotel_id === issue.stop_id);
      if (stop) mapRef.current?.focusStop(stop.lat, stop.lon);
    } else {
      setSelectedStopId(null);
    }
  }, []);

  const moveTargets = selectedRoute
    ? plan.routes.filter((route) => route.route_id !== selectedRoute.route_id)
    : [];
  const draggedStop = dragState
    ? findStop(plan, dragState.hotelId)?.stop ?? null
    : null;

  return (
    <div className="plan-app">
      <header className="topbar plan-topbar">
        <Link className="brand" href="/" aria-label="Back to the coverage atlas">
          <span className="brand-mark" aria-hidden="true">
            <svg viewBox="0 0 24 24" fill="none">
              <path
                d="M4.5 7.5c2.4-2 4.8-2 7.2 0s4.8 2 7.2 0"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
              />
              <path
                d="M4.5 12c2.4-2 4.8-2 7.2 0s4.8 2 7.2 0"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
              />
              <path
                d="M4.5 16.5c2.4-2 4.8-2 7.2 0s4.8 2 7.2 0"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
              />
            </svg>
          </span>
          <span className="brand-copy">
            <span className="brand-name">LinenGrass</span>
            <span className="brand-sub">Plan canvas</span>
          </span>
        </Link>

        <div className="plan-heading">
          <span className="eyebrow">
            <span className="eyebrow__dot" />
            Draft plan · {plan.name}
          </span>
          <h1>Edit the day</h1>
        </div>

        <div className="plan-actions">
          <div className="plan-actions__history">
            <button
              type="button"
              className="plan-icon-btn"
              onClick={undo}
              disabled={history.length === 0}
              title="Undo (⌘Z)"
              aria-label="Undo"
            >
              <Undo2 size={15} />
            </button>
            <button
              type="button"
              className="plan-icon-btn"
              onClick={redo}
              disabled={future.length === 0}
              title="Redo (⇧⌘Z)"
              aria-label="Redo"
            >
              <Redo2 size={15} />
            </button>
          </div>
          <span className="plan-save-state">
            <Check size={12} />
            {hydrated ? "Autosaved locally" : "Loading draft"}
          </span>
          <button type="button" className="btn btn--ghost" onClick={resetPlan}>
            <RotateCcw size={14} />
            Reset
          </button>
          <button type="button" className="btn btn--primary" onClick={exportPlan}>
            <Download size={14} />
            Export
          </button>
        </div>
      </header>

      <main className="plan-workspace">
        <aside className="plan-sidebar" aria-label="Route board">
          <div className="plan-sidebar__head">
            <div>
              <span className="eyebrow">
                <span className="eyebrow__dot" />
                {plan.routes.length} routes · {computation.totals.hotels} stops
              </span>
              <h2>Route board</h2>
            </div>
            <span className="plan-sidebar__hint">
              <GripVertical size={13} />
              Drag to reorder
            </span>
          </div>

          <div className="plan-sidebar__routes">
            {plan.routes.map((route) => {
              const computed = computedById.get(route.route_id);
              if (!computed) return null;
              const isSelected = selectedRouteId === route.route_id;
              const isDropRoute = dropTarget?.routeId === route.route_id;
              const isDropBlocked = Boolean(
                dragState &&
                  draggedStop &&
                  dragState.sourceRouteId !== route.route_id &&
                  computed.total_bags + draggedStop.load_bags >
                    route.nominal_cap,
              );
              const tone = capacityTone(computed.total_bags, route);
              const returnTone =
                computed.total_bags > route.nominal_cap
                  ? "over"
                  : computed.total_bags > route.max_load ||
                      computed.return_min > plan.shift.end_min
                    ? "warn"
                    : "ok";
              const routeIssues = issuesByRoute.get(route.route_id) ?? [];
              const cardWarnings = routeIssues.filter((issue) =>
                ROUTE_WARNING_CODES.has(issue.code),
              );
              const isUpdating = updatingRoutes.has(route.route_id);
              const dropLineIndex =
                isDropRoute && dropTarget?.index !== null
                  ? dropTarget?.index
                  : null;

              return (
                <section
                  key={route.route_id}
                  className={`plan-route ${
                    isSelected ? "is-selected" : ""
                  } ${isDropRoute ? "is-drop-target" : ""} ${
                    isDropBlocked ? "is-drop-blocked" : ""
                  }`}
                  onDragOver={(event) => handleRouteDragOver(event, route)}
                  onDrop={(event) => handleRouteDrop(event, route)}
                >
                  <button
                    type="button"
                    className="plan-route__head"
                    onClick={() => selectRoute(route.route_id)}
                    aria-pressed={isSelected}
                  >
                    <span
                      className="plan-route__dot"
                      style={{ background: route.color }}
                    />
                    <span className="plan-route__title">
                      <b>{shortRouteName(route.name)}</b>
                      <span>
                        {computed.total_hotels} stops ·{" "}
                        {computed.total_bags}/{route.max_load} bags
                        {isUpdating ? " · updating path…" : ""}
                        {isDropBlocked ? " · not enough capacity" : ""}
                      </span>
                    </span>
                    <span className={`plan-route__return plan-route__return--${returnTone}`}>
                      {computed.return_hq}
                    </span>
                  </button>

                  <div className="plan-route__capacity" aria-hidden="true">
                    <span
                      className={`plan-route__capacity-fill plan-route__capacity-fill--${tone}`}
                      style={{
                        width: `${Math.min(
                          100,
                          (computed.total_bags / route.max_load) * 100,
                        )}%`,
                      }}
                    />
                  </div>

                  {cardWarnings.slice(0, 2).map((issue) => (
                    <div
                      key={issue.code}
                      className={`plan-route__warning plan-route__warning--${issue.severity}`}
                    >
                      <AlertTriangle size={12} />
                      <span>
                        {issue.code === "over_nominal_capacity"
                          ? `${computed.total_bags - route.nominal_cap} bags over the vehicle limit`
                          : issue.code === "over_safe_capacity"
                            ? `${computed.total_bags - route.max_load} bags over the safe load`
                            : `Returns ${computed.return_hq} · ${
                                computed.return_min - plan.shift.end_min
                              } min past shift`}
                      </span>
                    </div>
                  ))}

                  <div className="plan-route__stops">
                    {route.stops.length === 0 && (
                      <div className="plan-route__empty">
                        <MapPin size={13} />
                        Drop a stop here
                      </div>
                    )}
                    {route.stops.map((stop, index) => {
                      const computedStop = computed.stops[index];
                      const isStopSelected =
                        selectedRouteId === route.route_id &&
                        selectedStopId === stop.hotel_id;
                      return (
                        <Fragment key={stop.hotel_id}>
                          {dropLineIndex === index && (
                            <div className="plan-drop-line" />
                          )}
                          <div
                            className={`plan-stop ${
                              isStopSelected ? "is-selected" : ""
                            } ${
                              dragState?.hotelId === stop.hotel_id
                                ? "is-dragging"
                                : ""
                            }`}
                            onClick={() =>
                              selectStop(route.route_id, stop.hotel_id)
                            }
                            onDragOver={(event) =>
                              handleStopDragOver(event, route, index)
                            }
                            onDrop={(event) =>
                              handleStopDrop(event, route, index)
                            }
                          >
                            <span
                              className="plan-stop__handle"
                              draggable
                              onDragStart={(event) =>
                                beginDrag(event, route, stop)
                              }
                              onDragEnd={endDrag}
                              title="Drag to reorder or move to another route"
                              aria-label={`Drag ${stop.name}`}
                            >
                              <GripVertical size={14} />
                            </span>
                            <span
                              className="plan-stop__number"
                              style={{ background: route.color }}
                            >
                              {computedStop?.stop_number ?? index + 1}
                            </span>
                            <span className="plan-stop__main">
                              <span className="plan-stop__name">
                                {stop.name}
                              </span>
                              <span className="plan-stop__meta">
                                {computedStop?.arrival_time ?? "—"} ·{" "}
                                {formatBags(stop.load_bags)} ·{" "}
                                {computedStop
                                  ? formatKm(computedStop.leg_distance_km)
                                  : "—"}
                              </span>
                            </span>
                            <span className="plan-stop__actions">
                              <button
                                type="button"
                                className="plan-stop__action"
                                onClick={(event) => {
                                  event.stopPropagation();
                                  moveWithinRoute(
                                    route.route_id,
                                    index,
                                    -1,
                                  );
                                }}
                                disabled={index === 0}
                                title="Move up"
                                aria-label={`Move ${stop.name} up`}
                              >
                                <ChevronUp size={13} />
                              </button>
                              <button
                                type="button"
                                className="plan-stop__action"
                                onClick={(event) => {
                                  event.stopPropagation();
                                  moveWithinRoute(
                                    route.route_id,
                                    index,
                                    1,
                                  );
                                }}
                                disabled={index === route.stops.length - 1}
                                title="Move down"
                                aria-label={`Move ${stop.name} down`}
                              >
                                <ChevronDown size={13} />
                              </button>
                            </span>
                          </div>
                        </Fragment>
                      );
                    })}
                    {dropLineIndex === route.stops.length && (
                      <div className="plan-drop-line" />
                    )}
                  </div>
                </section>
              );
            })}
          </div>

          <div className="plan-sidebar__foot">
            <span>
              <span className="plan-legend-line" />
              Dashed line = road path refreshing
            </span>
            <span>
              <span className="plan-legend-line plan-legend-line--solid" />
              Solid line = OSRM road path
            </span>
            <span>
              <span className="plan-legend-region" />
              H3 region fill &amp; boundary
            </span>
          </div>
        </aside>

        <section className="plan-map-stage" aria-label="Plan map">
          <PlanCanvasMap
            ref={mapRef}
            plan={plan}
            routes={computation.routes}
            selectedRouteId={selectedRouteId}
            selectedStopId={selectedStopId}
            geometries={geometries}
            regions={regions}
            hexMap={hexMap}
            onSelectRoute={selectRoute}
            onSelectStop={selectStop}
          />

          <div className="map-toolbar plan-map-toolbar">
            <button
              type="button"
              className="map-tool plan-details-toggle"
              onClick={() => setInspectorOpen((current) => !current)}
              aria-label="Toggle route details"
              aria-pressed={inspectorOpen}
              title="Route details"
            >
              <PanelRight size={15} />
            </button>
            <span className="map-toolbar__sep plan-details-sep" />
            <button
              type="button"
              className="map-tool"
              onClick={() => mapRef.current?.zoomIn()}
              aria-label="Zoom in"
            >
              +
            </button>
            <button
              type="button"
              className="map-tool"
              onClick={() => mapRef.current?.zoomOut()}
              aria-label="Zoom out"
            >
              −
            </button>
            <span className="map-toolbar__sep" />
            <button
              type="button"
              className="map-tool plan-map-toolbar__fit"
              onClick={() => mapRef.current?.fitPlan()}
            >
              Fit plan
            </button>
          </div>

          <div className="plan-map-overlay">
            <span className="plan-map-overlay__kicker">Plan canvas</span>
            <b>
              {selectedRoute
                ? shortRouteName(selectedRoute.name)
                : "All routes"}
            </b>
            <span>
              {selectedRoute
                ? `${selectedRoute.stops.length} stops · ${
                    selectedComputed?.total_bags ?? 0
                  } bags · ${selectedComputed?.total_dist_km ?? 0} km`
                : `${plan.routes.length} routes · ${computation.totals.hotels} hotels`}
            </span>
          </div>
        </section>

        <aside
          className={`plan-inspector ${inspectorOpen ? "is-open" : ""}`}
          aria-label="Inspector"
        >
          <button
            type="button"
            className="plan-inspector__close"
            onClick={() => setInspectorOpen(false)}
            aria-label="Close details"
          >
            <X size={14} />
          </button>
          {selectedStop && selectedComputed && selectedComputedStop ? (
            <>
              <div className="plan-inspector__head">
                <span className="eyebrow">
                  <span
                    className="plan-inline-dot"
                    style={{ background: selectedRoute?.color }}
                  />
                  Stop {selectedComputedStop.stop_number} ·{" "}
                  {shortRouteName(selectedRoute?.name ?? "")}
                </span>
                <h2>{selectedStop.name}</h2>
                <p>
                  Region {selectedStop.region} · hotel ID{" "}
                  <code>{selectedStop.hotel_id}</code>
                </p>
              </div>

              <div className="plan-metrics">
                <div className="plan-metric">
                  <span>Arrive</span>
                  <b>{selectedComputedStop.arrival_time}</b>
                </div>
                <div className="plan-metric">
                  <span>Depart</span>
                  <b>{selectedComputedStop.departure_time}</b>
                </div>
                <div className="plan-metric">
                  <span>Load</span>
                  <b>{formatBags(selectedStop.load_bags)}</b>
                </div>
                <div className="plan-metric">
                  <span>On site</span>
                  <b>{selectedStop.service_mins} min</b>
                </div>
                <div className="plan-metric">
                  <span>Leg</span>
                  <b>{formatKm(selectedComputedStop.leg_distance_km)}</b>
                </div>
                <div className="plan-metric">
                  <span>Drive</span>
                  <b>{selectedComputedStop.leg_drive_mins} min</b>
                </div>
              </div>

              <div className="plan-inspector__section">
                <h3>Adjust this stop</h3>
                <div className="plan-inspector__row">
                  <button
                    type="button"
                    className="btn btn--ghost"
                    onClick={() =>
                      moveWithinRoute(
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
                    className="btn btn--ghost"
                    onClick={() =>
                      moveWithinRoute(
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

                <label className="plan-field">
                  <span>Move to another route</span>
                  <select
                    value=""
                    onChange={(event) => {
                      if (!event.target.value) return;
                      handleMove(selectedStop.hotel_id, event.target.value);
                    }}
                  >
                    <option value="">Choose a route…</option>
                    {moveTargets.map((route) => {
                      const target = computedById.get(route.route_id);
                      const targetBags = target?.total_bags ?? 0;
                      const fits =
                        targetBags + selectedStop.load_bags <=
                        route.nominal_cap;
                      return (
                        <option
                          key={route.route_id}
                          value={route.route_id}
                          disabled={!fits}
                        >
                          {shortRouteName(route.name)} · {targetBags}/
                          {route.max_load} bags
                          {fits ? "" : " · over capacity"}
                        </option>
                      );
                    })}
                  </select>
                </label>

                <button
                  type="button"
                  className="btn btn--ghost plan-inspector__wide"
                  onClick={() =>
                    mapRef.current?.focusStop(
                      selectedStop.lat,
                      selectedStop.lon,
                    )
                  }
                >
                  <MapPin size={14} />
                  Focus on map
                </button>
              </div>

              <div className="plan-inspector__section">
                <h3>Route signals</h3>
                {(
                  issuesByRoute.get(selectedRoute?.route_id ?? "") ?? []
                ).length === 0 ? (
                  <p className="plan-muted">
                    No capacity or shift issues on this route.
                  </p>
                ) : (
                  <div className="plan-issues">
                    {(
                      issuesByRoute.get(selectedRoute?.route_id ?? "") ?? []
                    ).map((issue) => (
                      <button
                        key={`${issue.code}-${issue.stop_id ?? "route"}`}
                        type="button"
                        className={`plan-issue plan-issue--${issue.severity}`}
                        onClick={() => focusIssue(issue)}
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
              <div className="plan-inspector__head">
                <span className="eyebrow">
                  <span
                    className="plan-inline-dot"
                    style={{ background: selectedRoute.color }}
                  />
                  Route summary
                </span>
                <h2>{shortRouteName(selectedRoute.name)}</h2>
                <p>
                  {selectedComputed.total_hotels} stops ·{" "}
                  {selectedComputed.total_bags}/{selectedRoute.max_load} bags ·{" "}
                  {selectedComputed.capacity_utilization_pct}% of safe load
                </p>
              </div>

              <div className="plan-metrics">
                <div className="plan-metric">
                  <span>Depart</span>
                  <b>{selectedComputed.departure_hq}</b>
                </div>
                <div className="plan-metric">
                  <span>Return</span>
                  <b>{selectedComputed.return_hq}</b>
                </div>
                <div className="plan-metric">
                  <span>Distance</span>
                  <b>{formatKm(selectedComputed.total_dist_km)}</b>
                </div>
                <div className="plan-metric">
                  <span>Drive</span>
                  <b>{formatDuration(selectedComputed.total_drive_mins)}</b>
                </div>
                <div className="plan-metric">
                  <span>Service</span>
                  <b>{formatDuration(selectedComputed.total_service_mins)}</b>
                </div>
                <div className="plan-metric">
                  <span>Stops</span>
                  <b>{selectedComputed.total_hotels}</b>
                </div>
              </div>

              <div className="plan-inspector__section">
                <h3>Capacity</h3>
                <div className="plan-capacity">
                  <div className="plan-capacity__labels">
                    <span>{selectedComputed.total_bags} bags</span>
                    <span>
                      safe {selectedRoute.max_load} · vehicle{" "}
                      {selectedRoute.nominal_cap}
                    </span>
                  </div>
                  <div className="plan-capacity__track">
                    <span
                      className={`plan-capacity__fill plan-capacity__fill--${capacityTone(
                        selectedComputed.total_bags,
                        selectedRoute,
                      )}`}
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
              </div>

              <div className="plan-inspector__section">
                <h3>Route signals</h3>
                {(issuesByRoute.get(selectedRoute.route_id) ?? []).length ===
                0 ? (
                  <p className="plan-muted">
                    This route is within capacity and returns before shift end.
                  </p>
                ) : (
                  <div className="plan-issues">
                    {(issuesByRoute.get(selectedRoute.route_id) ?? []).map(
                      (issue) => (
                        <button
                          key={`${issue.code}-${issue.stop_id ?? "route"}`}
                          type="button"
                          className={`plan-issue plan-issue--${issue.severity}`}
                          onClick={() => focusIssue(issue)}
                        >
                          <AlertTriangle size={12} />
                          <span>{issue.message}</span>
                        </button>
                      ),
                    )}
                  </div>
                )}
              </div>

              <div className="plan-inspector__section">
                <h3>How to edit</h3>
                <p className="plan-muted">
                  Drag a stop by its grip to reorder it in this route. Drag it
                  onto another route card to reassign it. Drop on a card header
                  to use the cheapest insertion point.
                </p>
              </div>
            </>
          ) : (
            <div className="plan-inspector__empty">
              <span className="eyebrow">
                <span className="eyebrow__dot" />
                Plan canvas
              </span>
              <h2>Pick a route to begin</h2>
              <p>
                Select a route on the left, then drag stops by the grip. Drop a
                stop on another route to move it.
              </p>
            </div>
          )}

          <div className="plan-inspector__health">
            <div className="plan-inspector__health-head">
              <span>Plan health</span>
              <span>
                {errors.length} error{errors.length === 1 ? "" : "s"} ·{" "}
                {warnings.length} warning{warnings.length === 1 ? "" : "s"}
              </span>
            </div>
            <div className="plan-issues">
              {computation.issues.length === 0 ? (
                <p className="plan-muted">No issues found.</p>
              ) : (
                computation.issues.slice(0, 8).map((issue) => (
                  <button
                    key={`${issue.code}-${issue.route_id ?? "plan"}-${
                      issue.stop_id ?? ""
                    }`}
                    type="button"
                    className={`plan-issue plan-issue--${issue.severity}`}
                    onClick={() => focusIssue(issue)}
                  >
                    <AlertTriangle size={12} />
                    <span>{issue.message}</span>
                  </button>
                ))
              )}
            </div>
          </div>
        </aside>

        <div
          className={`plan-drawer-scrim ${inspectorOpen ? "is-open" : ""}`}
          onClick={() => setInspectorOpen(false)}
          aria-hidden="true"
        />
      </main>

      <footer className="plan-statusbar">
        <div className="plan-statusbar__totals">
          <span>
            <b>{plan.routes.length}</b> routes
          </span>
          <span>
            <b>{computation.totals.hotels}</b> stops
          </span>
          <span>
            <b>{computation.totals.bags}</b> bags
          </span>
          <span>
            <b>{computation.totals.distance_km.toFixed(0)}</b> km
          </span>
          <span className="plan-statusbar__shift">
            <Clock size={11} />
            Shift {formatClock(plan.shift.start_min)}–
            {formatClock(plan.shift.end_min)}
          </span>
        </div>
        <div className="plan-statusbar__right">
          {updatingRoutes.size > 0 && (
            <span className="plan-statusbar__sync">
              <span className="plan-sync-dot" />
              Refreshing road paths
            </span>
          )}
          <span className="plan-statusbar__note">
            OSRM · calibrated to the Google-traffic baseline
          </span>
          <span
            className={`plan-statusbar__health ${healthTone}`}
          >
            {errors.length > 0 || warnings.length > 0 ? (
              <AlertTriangle size={13} />
            ) : (
              <Check size={13} />
            )}
            {errors.length > 0
              ? `${errors.length} error${errors.length === 1 ? "" : "s"} · ${warnings.length} warning${warnings.length === 1 ? "" : "s"}`
              : warnings.length > 0
                ? `${warnings.length} warning${warnings.length === 1 ? "" : "s"} to review`
                : "All routes within capacity"}
          </span>
        </div>
      </footer>

      {toast && (
        <div
          className={`plan-toast ${
            toast.tone === "error" ? "plan-toast--error" : ""
          }`}
          role={toast.tone === "error" ? "alert" : "status"}
        >
          {toast.tone === "error" ? (
            <AlertTriangle size={14} />
          ) : (
            <MoveRight size={14} />
          )}
          <span>{toast.message}</span>
          {toast.tone === "info" && history.length > 0 && (
            <button type="button" onClick={undo}>
              <Undo2 size={12} />
              Undo
            </button>
          )}
          <button
            type="button"
            className="plan-toast__close"
            onClick={() => setToast(null)}
            aria-label="Dismiss"
          >
            <X size={13} />
          </button>
        </div>
      )}
    </div>
  );
}
