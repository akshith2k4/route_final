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
  ArrowRightLeft,
  CalendarDays,
  Check,
  ChevronDown,
  ChevronUp,
  Clock,
  GripVertical,
  Hotel,
  MapPin,
  MoveRight,
  PanelRight,
  Plus,
  Redo2,
  RotateCcw,
  Route,
  Share2,
  Trash2,
  Truck,
  Undo2,
  Wand2,
  Warehouse,
  WashingMachine,
  X,
} from "lucide-react";
import PlanAddHotelsDialog from "./plan-add-hotels-dialog";
import PlanCreateRouteDialog from "./plan-create-route-dialog";
import PlanNewHotelDialog from "./plan-new-hotel-dialog";
import PlanShareDialog from "./plan-share-dialog";
import PlanVehiclesDialog from "./plan-vehicles-dialog";
import PlanCanvasMap, {
  type PlanCanvasMapHandle,
} from "./plan-canvas-map";
import type { HexMap, RegionMeta } from "../lib/coverage";
import {
  addNewHotelToRoute,
  addStopsToRoute,
  addVehicle,
  assignVehicleToRoute,
  computePlan,
  createRoute,
  deleteRoute,
  deleteVehicle,
  depotLabel,
  findStop,
  formatClock,
  formatDuration,
  getPlanDepots,
  getPlanLaundries,
  getPlanVehicles,
  laundryLabel,
  migratePlanDepots,
  moveStop,
  optimizeRouteOrder,
  parseClock,
  parsePlanDraft,
  PLAN_DRAFT_STORAGE_KEY,
  PLAN_IMPORT_BACKUP_KEY,
  reassignRouteDepot,
  reorderStops,
  resolveLaundry,
  resolveVehicle,
  routeDepot,
  routeDepotId,
  routeLaundryId,
  routesUsingVehicle,
  setRouteLaundry,
  sortVehicles,
  summarizePlan,
  updateVehicle,
  type Plan,
  type PlanIssue,
  type PlanRoute,
  type PlanStop,
  type NewHotelInput,
  type TravelMatrix,
} from "../lib/plan";

const STORAGE_KEY = PLAN_DRAFT_STORAGE_KEY;
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

type PlanMode = "plan" | "warehouse";

function shortRouteName(name: string): string {
  return name.replace(/\s*\(ID:[^)]*\)\s*$/, "").trim();
}

function routeSignature(route: PlanRoute): string {
  return [
    route.depot_id ?? "",
    route.laundry_id ?? "",
    ...route.stops.map((stop) => stop.hotel_id),
  ].join("|");
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

function formatRooms(value: number): string {
  return `${value} room${value === 1 ? "" : "s"}`;
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
  const [mode, setMode] = useState<PlanMode>("plan");
  const [inspectorOpen, setInspectorOpen] = useState(false);
  const [createRouteOpen, setCreateRouteOpen] = useState(false);
  const [addHotelsOpen, setAddHotelsOpen] = useState(false);
  const [newHotelOpen, setNewHotelOpen] = useState(false);
  const [vehiclesOpen, setVehiclesOpen] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);
  const [hasImportBackup, setHasImportBackup] = useState(false);

  const planRef = useRef(plan);
  const mapRef = useRef<PlanCanvasMapHandle | null>(null);
  const toastTimerRef = useRef<number | null>(null);
  const previousPlanRef = useRef(plan);

  useEffect(() => {
    planRef.current = plan;
  }, [plan]);

  const computation = useMemo(() => computePlan(plan, matrix), [plan, matrix]);
  const depots = useMemo(() => getPlanDepots(plan), [plan]);
  const laundries = useMemo(() => getPlanLaundries(plan), [plan]);
  const vehicles = useMemo(
    () => sortVehicles(getPlanVehicles(plan)),
    [plan],
  );
  const usedVehicleIds = useMemo(
    () =>
      vehicles
        .filter((vehicle) => routesUsingVehicle(plan, vehicle.id).length > 0)
        .map((vehicle) => vehicle.id),
    [plan, vehicles],
  );
  const computedById = useMemo(
    () =>
      new Map(
        computation.routes.map((route) => [route.route_id, route]),
      ),
    [computation.routes],
  );
  const depotTotals = useMemo(
    () =>
      depots.map((depot) => {
        const routes = plan.routes.filter(
          (route) => routeDepotId(plan, route) === depot.id,
        );
        return {
          depot,
          routeCount: routes.length,
          bags: routes.reduce(
            (sum, route) =>
              sum + (computedById.get(route.route_id)?.total_bags ?? 0),
            0,
          ),
          rooms: routes.reduce(
            (sum, route) =>
              sum + (computedById.get(route.route_id)?.total_rooms ?? 0),
            0,
          ),
        };
      }),
    [computedById, depots, plan],
  );

  const selectedRoute =
    plan.routes.find((route) => route.route_id === selectedRouteId) ?? null;
  const selectedComputed = selectedRouteId
    ? computedById.get(selectedRouteId) ?? null
    : null;
  const selectedLaundry =
    selectedRoute === null ? null : resolveLaundry(plan, selectedRoute);
  const selectedVehicle =
    selectedRoute === null ? null : resolveVehicle(plan, selectedRoute);
  const otherRoutesOnVehicle =
    selectedVehicle === null
      ? []
      : routesUsingVehicle(plan, selectedVehicle.id).filter(
          (route) => route.route_id !== selectedRoute?.route_id,
        );
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
          const restored: Plan = migratePlanDepots(
            { ...parsed, shift: initialPlan.shift },
            initialPlan,
          );
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
      const depot = routeDepot(planRef.current, route);
      const laundry = resolveLaundry(planRef.current, route);
      const points = [
        [depot.lat, depot.lon],
        ...route.stops.map((stop) => [stop.lat, stop.lon]),
        ...(laundry ? [[laundry.lat, laundry.lon]] : []),
        [depot.lat, depot.lon],
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
    notify("Undid the last change");
  }, [history, future, notify]);

  const redo = useCallback(() => {
    if (future.length === 0) return;
    const next = future[0];
    setFuture(future.slice(1));
    setHistory([...history.slice(-49), planRef.current]);
    setPlan(next);
    planRef.current = next;
    notify("Redid the last change");
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
        if (
          createRouteOpen ||
          addHotelsOpen ||
          newHotelOpen ||
          vehiclesOpen ||
          shareOpen
        ) {
          setCreateRouteOpen(false);
          setAddHotelsOpen(false);
          setNewHotelOpen(false);
          setVehiclesOpen(false);
          setShareOpen(false);
          return;
        }
        setSelectedStopId(null);
        setDropTarget(null);
        setDragState(null);
        setInspectorOpen(false);
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [
    addHotelsOpen,
    createRouteOpen,
    newHotelOpen,
    shareOpen,
    vehiclesOpen,
    undo,
    redo,
  ]);

  const revealInspector = useCallback(() => {
    if (window.matchMedia("(max-width: 980px)").matches) {
      setInspectorOpen(true);
    }
  }, []);

  const changeMode = useCallback(
    (nextMode: PlanMode) => {
      if (nextMode === mode) return;
      setMode(nextMode);
      setCreateRouteOpen(false);
      setAddHotelsOpen(false);
      setNewHotelOpen(false);
      setVehiclesOpen(false);
      setShareOpen(false);
      setDragState(null);
      setDropTarget(null);
      setSelectedStopId(null);
    },
    [mode],
  );

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
      if (mode === "warehouse") {
        selectRoute(routeId);
        return;
      }
      setSelectedRouteId(routeId);
      setSelectedStopId(hotelId);
      const stop = planRef.current.routes
        .find((route) => route.route_id === routeId)
        ?.stops.find((candidate) => candidate.hotel_id === hotelId);
      if (stop) mapRef.current?.focusStop(stop.lat, stop.lon);
      revealInspector();
    },
    [mode, revealInspector, selectRoute],
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

  const handleCreateRoute = useCallback(
    (
      name: string,
      capacity: number,
      depotId: string,
      vehicleId: string | null,
    ) => {
      let next: Plan;
      try {
        next = createRoute(planRef.current, {
          name,
          capacity,
          depot_id: depotId,
          vehicle_id: vehicleId,
        });
      } catch (error) {
        notify(
          error instanceof Error ? error.message : "Could not create the route.",
          "error",
        );
        return;
      }

      const created = next.routes[next.routes.length - 1];
      const vehicle = created.vehicle_id
        ? getPlanVehicles(next).find(
            (candidate) => candidate.id === created.vehicle_id,
          )
        : null;
      commit(
        next,
        `Created ${shortRouteName(created.name)} at ${
          depots.find((depot) => depot.id === depotId)?.name ?? "the warehouse"
        } · ${
          vehicle
            ? `${vehicle.name} · ${vehicle.nominal_cap} bags`
            : `manual capacity · safe load ${formatBags(created.max_load)}`
        }`,
      );
      setSelectedRouteId(created.route_id);
      setSelectedStopId(null);
      setCreateRouteOpen(false);
    },
    [commit, depots, notify],
  );

  const handleAddNewHotel = useCallback(
    (values: NewHotelInput, routeId: string): boolean => {
      const current = planRef.current;
      const route = current.routes.find(
        (candidate) => candidate.route_id === routeId,
      );
      let result: ReturnType<typeof addNewHotelToRoute>;
      try {
        result = addNewHotelToRoute(current, routeId, values, matrix);
      } catch (error) {
        notify(
          error instanceof Error ? error.message : "Could not add the hotel.",
          "error",
        );
        return false;
      }

      commit(
        result.plan,
        `Added ${result.stop.name} to ${
          route ? shortRouteName(route.name) : "the route"
        } · ${formatBags(result.stop.load_bags)} · ${formatRooms(
          result.stop.rooms ?? 0,
        )}`,
      );
      setSelectedRouteId(routeId);
      setSelectedStopId(result.stop.hotel_id);
      setNewHotelOpen(false);
      mapRef.current?.focusStop(result.stop.lat, result.stop.lon);
      revealInspector();
      return true;
    },
    [commit, matrix, notify, revealInspector],
  );

  const handleAddStops = useCallback(
    (hotelIds: string[]) => {
      const current = planRef.current;
      const target = current.routes.find(
        (route) => route.route_id === selectedRouteId,
      );
      if (!target) return;

      let next: Plan;
      try {
        next = addStopsToRoute(current, target.route_id, hotelIds, matrix);
      } catch (error) {
        notify(
          error instanceof Error
            ? error.message
            : "Those hotels could not be added.",
          "error",
        );
        return;
      }

      const addedBags = hotelIds.reduce(
        (sum, hotelId) => sum + (findStop(current, hotelId)?.stop.load_bags ?? 0),
        0,
      );
      commit(
        next,
        `Added ${hotelIds.length} hotel${
          hotelIds.length === 1 ? "" : "s"
        } (${formatBags(addedBags)}) to ${shortRouteName(target.name)}`,
      );
      setAddHotelsOpen(false);
      revealInspector();
    },
    [commit, matrix, notify, revealInspector, selectedRouteId],
  );

  const handleDeleteRoute = useCallback(
    (routeId: string) => {
      const current = planRef.current;
      const index = current.routes.findIndex(
        (route) => route.route_id === routeId,
      );
      const target = current.routes[index];
      if (!target) return;

      let next: Plan;
      try {
        next = deleteRoute(current, routeId, { restoreFrom: initialPlan });
      } catch (error) {
        notify(
          error instanceof Error ? error.message : "Could not delete the route.",
          "error",
        );
        return;
      }

      const returned = target.stops.length;
      commit(
        next,
        returned > 0
          ? `Deleted ${shortRouteName(target.name)} · returned ${returned} hotel${
              returned === 1 ? "" : "s"
            } to the original plan`
          : `Deleted ${shortRouteName(target.name)}`,
      );
      setAddHotelsOpen(false);
      if (selectedRouteId === routeId) {
        const fallback =
          next.routes[Math.min(index, next.routes.length - 1)] ?? null;
        setSelectedRouteId(fallback?.route_id ?? null);
        setSelectedStopId(null);
      }
    },
    [commit, initialPlan, notify, selectedRouteId],
  );

  const handleAssignDepot = useCallback(
    (routeId: string, depotId: string) => {
      const current = planRef.current;
      const route = current.routes.find(
        (candidate) => candidate.route_id === routeId,
      );
      const depot = depots.find((candidate) => candidate.id === depotId);
      if (!route || !depot) return;

      if (routeDepotId(current, route) === depotId) {
        setSelectedRouteId(routeId);
        setSelectedStopId(null);
        return;
      }

      const before = computedById.get(routeId);
      let next: Plan;
      try {
        next = reassignRouteDepot(current, routeId, depotId, matrix);
      } catch (error) {
        notify(
          error instanceof Error
            ? error.message
            : "Could not move this route to that warehouse.",
          "error",
        );
        return;
      }

      const after = computePlan(next, matrix).routes.find(
        (candidate) => candidate.route_id === routeId,
      );
      commit(
        next,
        `Moved ${shortRouteName(route.name)} to ${depot.name} · ${
          before ? formatKm(before.total_dist_km) : "—"
        } → ${after ? formatKm(after.total_dist_km) : "—"}`,
      );
      setSelectedRouteId(routeId);
      setSelectedStopId(null);
      revealInspector();
    },
    [commit, computedById, depots, matrix, notify, revealInspector],
  );

  const handleSetLaundry = useCallback(
    (routeId: string, laundryId: string) => {
      const current = planRef.current;
      const route = current.routes.find(
        (candidate) => candidate.route_id === routeId,
      );
      const laundry = laundryId
        ? laundries.find((candidate) => candidate.id === laundryId)
        : null;
      if (!route) return;
      if (laundryId && !laundry) return;

      if ((route.laundry_id ?? null) === (laundryId || null)) {
        setSelectedRouteId(routeId);
        setSelectedStopId(null);
        return;
      }

      const before = computedById.get(routeId);
      let next: Plan;
      try {
        next = setRouteLaundry(current, routeId, laundryId || null, matrix);
      } catch (error) {
        notify(
          error instanceof Error
            ? error.message
            : "Could not update this route's laundry.",
          "error",
        );
        return;
      }

      const after = computePlan(next, matrix).routes.find(
        (candidate) => candidate.route_id === routeId,
      );
      commit(
        next,
        laundry
          ? `${shortRouteName(route.name)} returns via ${laundry.name} · ${
              before ? before.return_hq : "—"
            } → ${after ? after.return_hq : "—"}`
          : `${shortRouteName(route.name)} returns directly to ${
              depotLabel(routeDepot(current, route))
            } · ${before ? before.return_hq : "—"} → ${
              after ? after.return_hq : "—"
            }`,
      );
      setSelectedRouteId(routeId);
      setSelectedStopId(null);
      revealInspector();
    },
    [commit, computedById, laundries, matrix, notify, revealInspector],
  );

  const handleAssignVehicle = useCallback(
    (routeId: string, vehicleId: string) => {
      const current = planRef.current;
      const route = current.routes.find(
        (candidate) => candidate.route_id === routeId,
      );
      const vehicle = vehicleId
        ? getPlanVehicles(current).find(
            (candidate) => candidate.id === vehicleId,
          )
        : null;
      if (!route) return;
      if (vehicleId && !vehicle) return;
      if ((route.vehicle_id ?? null) === (vehicleId || null)) return;

      let next: Plan;
      try {
        next = assignVehicleToRoute(current, routeId, vehicleId || null);
      } catch (error) {
        notify(
          error instanceof Error
            ? error.message
            : "Could not assign this vehicle.",
          "error",
        );
        return;
      }
      commit(
        next,
        vehicle
          ? `${shortRouteName(route.name)} uses ${vehicle.name}`
          : `${shortRouteName(route.name)} released ${
              getPlanVehicles(current).find(
                (candidate) => candidate.id === route.vehicle_id,
              )?.name ?? "its vehicle"
            } — pick another vehicle`,
      );
    },
    [commit, notify],
  );

  const handleAddVehicle = useCallback(
    (name: string, capacity: number) => {
      const current = planRef.current;
      const next = addVehicle(current, { name, capacity });
      const added = next.vehicles?.[next.vehicles.length - 1];
      commit(
        next,
        `Added ${added?.name ?? name} · ${capacity} bags`,
      );
    },
    [commit],
  );

  const handleUpdateVehicle = useCallback(
    (vehicleId: string, name: string, capacity: number) => {
      const current = planRef.current;
      const vehicle = getPlanVehicles(current).find(
        (candidate) => candidate.id === vehicleId,
      );
      if (!vehicle) return;
      if (
        vehicle.name === name.trim() &&
        vehicle.nominal_cap === capacity
      ) {
        return;
      }

      const affected = routesUsingVehicle(current, vehicleId);
      const next = updateVehicle(current, vehicleId, { name, capacity });
      const updated = getPlanVehicles(next).find(
        (candidate) => candidate.id === vehicleId,
      );
      const overloaded = affected.filter(
        (route) =>
          route.stops.reduce((sum, stop) => sum + stop.load_bags, 0) >
          (updated?.nominal_cap ?? capacity),
      );
      commit(
        next,
        `Updated ${updated?.name ?? name} · ${capacity} bags${
          affected.length > 0
            ? ` · ${affected.length} route${
                affected.length === 1 ? "" : "s"
              } updated`
            : ""
        }${
          overloaded.length > 0
            ? ` · ${overloaded
                .map((route) => shortRouteName(route.name))
                .join(", ")} now over capacity`
            : ""
        }`,
      );
    },
    [commit],
  );

  const handleDeleteVehicle = useCallback(
    (vehicleId: string) => {
      const current = planRef.current;
      const vehicle = getPlanVehicles(current).find(
        (candidate) => candidate.id === vehicleId,
      );
      if (!vehicle) return;
      const next = deleteVehicle(current, vehicleId);
      commit(next, `Deleted ${vehicle.name}`);
    },
    [commit],
  );

  const handleOptimizeRoute = useCallback(
    (routeId: string) => {
      const current = planRef.current;
      const target = current.routes.find((route) => route.route_id === routeId);
      if (!target) return;

      let next: Plan;
      try {
        next = optimizeRouteOrder(current, routeId, matrix);
      } catch (error) {
        notify(
          error instanceof Error
            ? error.message
            : "Could not optimize this route.",
          "error",
        );
        return;
      }

      if (next === current) {
        notify("This route is already in its best stop order.");
        return;
      }

      const before = computedById.get(routeId);
      const after = computePlan(next, matrix).routes.find(
        (route) => route.route_id === routeId,
      );
      commit(
        next,
        `Optimized ${shortRouteName(target.name)} · ${
          before ? formatKm(before.total_dist_km) : "—"
        } → ${after ? formatKm(after.total_dist_km) : "—"}`,
      );
    },
    [commit, computedById, matrix, notify],
  );

  const resetPlan = useCallback(() => {
    if (planRef.current === initialPlan) return;
    commit(initialPlan, "Reset to the published manual plan");
    setSelectedRouteId(initialPlan.routes[0]?.route_id ?? null);
    setSelectedStopId(null);
  }, [commit, initialPlan]);

  const exportPlan = useCallback(() => {
    const exportedAt = new Date().toISOString();
    const payload = { ...planRef.current, exported_at: exportedAt };
    const blob = new Blob([`${JSON.stringify(payload, null, 2)}\n`], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `linengrass-plan-${exportedAt.slice(0, 10)}.json`;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(url);
    notify("Plan file downloaded");
  }, [notify]);

  const openShare = useCallback(() => {
    try {
      setHasImportBackup(
        Boolean(window.localStorage.getItem(PLAN_IMPORT_BACKUP_KEY)),
      );
    } catch {
      setHasImportBackup(false);
    }
    setShareOpen(true);
  }, []);

  const handleImportPlan = useCallback(
    (imported: Plan, fileName: string): boolean => {
      const current = planRef.current;
      try {
        const next = migratePlanDepots(
          {
            ...imported,
            plan_id: initialPlan.plan_id,
            shift: initialPlan.shift,
          },
          initialPlan,
        );
        try {
          window.localStorage.setItem(
            PLAN_IMPORT_BACKUP_KEY,
            JSON.stringify(current),
          );
        } catch {
          // The in-memory Undo history still protects this import.
        }
        setHasImportBackup(true);
        const summary = summarizePlan(next);
        commit(
          next,
          `Imported ${fileName} · ${summary.routes} routes · ${summary.stops} stops · ${summary.bags} bags`,
        );
        setSelectedRouteId(next.routes[0]?.route_id ?? null);
        setSelectedStopId(null);
        setInspectorOpen(false);
        setShareOpen(false);
        return true;
      } catch (error) {
        notify(
          error instanceof Error
            ? error.message
            : "Could not import this plan.",
          "error",
        );
        return false;
      }
    },
    [commit, initialPlan, notify],
  );

  const handleRestoreBackup = useCallback((): boolean => {
    let raw: string | null = null;
    try {
      raw = window.localStorage.getItem(PLAN_IMPORT_BACKUP_KEY);
    } catch {
      raw = null;
    }
    if (!raw) {
      notify("No import backup found.", "error");
      return false;
    }
    try {
      const parsed = parsePlanDraft(JSON.parse(raw));
      const restored = migratePlanDepots(
        {
          ...parsed,
          plan_id: initialPlan.plan_id,
          shift: initialPlan.shift,
        },
        initialPlan,
      );
      commit(restored, "Restored the draft from before the last import");
      setSelectedRouteId(restored.routes[0]?.route_id ?? null);
      setSelectedStopId(null);
      setInspectorOpen(false);
      setShareOpen(false);
      return true;
    } catch (error) {
      notify(
        error instanceof Error
          ? error.message
          : "Could not restore the previous draft.",
        "error",
      );
      return false;
    }
  }, [commit, initialPlan, notify]);

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

  const renderModeSwitch = (extraClass = "") => (
    <div
      className={`plan-mode-switch ${extraClass}`}
      role="group"
      aria-label="Editing mode"
    >
      <button
        type="button"
        className={mode === "plan" ? "is-active" : ""}
        onClick={() => changeMode("plan")}
        aria-pressed={mode === "plan"}
        title="Edit stops and routes"
      >
        <Route size={12} />
        Plan
      </button>
      <button
        type="button"
        className={mode === "warehouse" ? "is-active" : ""}
        onClick={() => changeMode("warehouse")}
        aria-pressed={mode === "warehouse"}
        title="Assign routes to warehouses"
      >
        <Warehouse size={12} />
        Warehouse
      </button>
    </div>
  );

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
          <div className="plan-heading__row">
            <h1>{mode === "plan" ? "Edit the day" : "Assign warehouses"}</h1>
            {renderModeSwitch()}
          </div>
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
          <Link href="/days" className="btn btn--ghost">
            <CalendarDays size={14} />
            Days
          </Link>
          <button type="button" className="btn btn--ghost" onClick={resetPlan}>
            <RotateCcw size={14} />
            Reset
          </button>
          <button
            type="button"
            className="btn btn--primary"
            onClick={openShare}
            title="Share or upload a plan file"
          >
            <Share2 size={14} />
            Share
          </button>
        </div>
      </header>

      <main className="plan-workspace">
        <aside className="plan-sidebar" aria-label="Route board">
          <div className="plan-sidebar__head">
            <div>
              <span className="eyebrow">
                <span className="eyebrow__dot" />
                {mode === "plan"
                  ? `${plan.routes.length} routes · ${computation.totals.hotels} stops`
                  : `${depots.length} warehouses · ${plan.routes.length} routes`}
              </span>
              <h2>{mode === "plan" ? "Route board" : "Warehouse board"}</h2>
            </div>
            <div className="plan-sidebar__head-tools">
              {mode === "plan" ? (
                <>
                  <div className="plan-sidebar__head-actions">
                    <button
                      type="button"
                      className="plan-new-route"
                      onClick={() => setCreateRouteOpen(true)}
                    >
                      <Plus size={12} />
                      New route
                    </button>
                    <button
                      type="button"
                      className="plan-new-route plan-new-route--ghost"
                      onClick={() => setNewHotelOpen(true)}
                    >
                      <Hotel size={12} />
                      New hotel
                    </button>
                  </div>
                  <button
                    type="button"
                    className="plan-new-route plan-new-route--ghost"
                    onClick={() => setVehiclesOpen(true)}
                  >
                    <Truck size={12} />
                    Vehicles
                  </button>
                  <span className="plan-sidebar__hint">
                    <GripVertical size={13} />
                    Drag to reorder
                  </span>
                </>
              ) : (
                <span className="plan-sidebar__hint">
                  <Warehouse size={13} />
                  Assign routes
                </span>
              )}
              {renderModeSwitch("plan-mode-switch--sidebar")}
            </div>
          </div>

          {mode === "plan" ? (
            <div className="plan-sidebar__routes">
              {plan.routes.map((route) => {
              const computed = computedById.get(route.route_id);
              if (!computed) return null;
              const depot = routeDepot(plan, route);
              const laundry = resolveLaundry(plan, route);
              const assignedVehicle = resolveVehicle(plan, route);
              const isSelected = selectedRouteId === route.route_id;
              const isDropRoute = dropTarget?.routeId === route.route_id;
              const isDropBlocked = Boolean(
                dragState &&
                  draggedStop &&
                  dragState.sourceRouteId !== route.route_id &&
                  assignedVehicle &&
                  computed.total_bags + draggedStop.load_bags >
                    route.nominal_cap,
              );
              const tone = assignedVehicle
                ? capacityTone(computed.total_bags, route)
                : "ok";
              const returnTone =
                assignedVehicle && computed.total_bags > route.nominal_cap
                  ? "over"
                  : computed.return_min > plan.shift.end_min ||
                      (assignedVehicle &&
                        computed.total_bags > route.max_load)
                    ? "warn"
                    : "ok";
              const routeIssues = issuesByRoute.get(route.route_id) ?? [];
              const cardWarnings = routeIssues.filter(
                (issue) =>
                  ROUTE_WARNING_CODES.has(issue.code) &&
                  (assignedVehicle || !issue.code.startsWith("over_")),
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
                      <b>
                        <span className="plan-route__name">
                          {shortRouteName(route.name)}
                        </span>
                        <span
                          className={`plan-route__depot ${
                            depot.id === plan.depot.id ? "" : "is-secondary"
                          }`}
                        >
                          {depotLabel(depot)}
                        </span>
                        {laundry && (
                          <span className="plan-route__laundry">
                            <WashingMachine size={9} />
                            {laundryLabel(laundry)}
                          </span>
                        )}
                        {!assignedVehicle && (
                          <span className="plan-route__vehicle-missing">
                            No vehicle
                          </span>
                        )}
                        {route.is_custom && (
                          <span className="plan-route__tag">Custom</span>
                        )}
                      </b>
                      <span className="plan-route__meta">
                        {computed.total_hotels} stops ·{" "}
                        {computed.total_bags}
                        {assignedVehicle ? `/${route.max_load}` : ""} bags ·{" "}
                        {formatRooms(computed.total_rooms)}
                        {isUpdating ? " · updating path…" : ""}
                        {isDropBlocked ? " · not enough capacity" : ""}
                      </span>
                    </span>
                    <span className={`plan-route__return plan-route__return--${returnTone}`}>
                      {computed.return_hq}
                    </span>
                  </button>

                  {assignedVehicle && (
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
                  )}

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

                  {route.is_custom && (
                    <div className="plan-route__tools">
                      <button
                        type="button"
                        className="plan-route__tool"
                        onClick={() => {
                          setSelectedRouteId(route.route_id);
                          setSelectedStopId(null);
                          setAddHotelsOpen(true);
                        }}
                      >
                        <Plus size={11} />
                        Add hotels
                      </button>
                      <button
                        type="button"
                        className="plan-route__tool"
                        onClick={() => handleOptimizeRoute(route.route_id)}
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
                        className="plan-route__tool plan-route__tool--danger"
                        onClick={() => handleDeleteRoute(route.route_id)}
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

                  <div className="plan-route__stops">
                    {route.stops.length === 0 && (
                      <div className="plan-route__empty">
                        <MapPin size={13} />
                        {route.is_custom
                          ? "New route · add hotels to start"
                          : "Drop a stop here"}
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
                                {formatRooms(stop.rooms ?? 0)} ·{" "}
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
          ) : (
            <div className="plan-sidebar__routes plan-sidebar__routes--warehouse">
              {depots.map((depot) => {
                const assigned = plan.routes
                  .map((route) => ({
                    route,
                    computed: computedById.get(route.route_id),
                  }))
                  .filter(
                    ({ route }) => routeDepotId(plan, route) === depot.id,
                  );
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
                const otherDepots = depots.filter(
                  (candidate) => candidate.id !== depot.id,
                );

                return (
                  <section className="plan-warehouse" key={depot.id}>
                    <header className="plan-warehouse__head">
                      <span
                        className={`plan-warehouse__pin ${
                          depot.id === plan.depot.id ? "is-primary" : ""
                        }`}
                      >
                        <Warehouse size={14} />
                      </span>
                      <span className="plan-warehouse__title">
                        <b>{depot.name}</b>
                        <span>
                          {assigned.length} route
                          {assigned.length === 1 ? "" : "s"} · {stopCount} stops ·{" "}
                          {bags} bags · {rooms} rooms
                        </span>
                      </span>
                      <span className="plan-warehouse__tag">
                        {depotLabel(depot)}
                      </span>
                    </header>

                    <div className="plan-warehouse__routes">
                      {assigned.length === 0 ? (
                        <div className="plan-warehouse__empty">
                          No routes assigned yet.
                        </div>
                      ) : (
                        assigned.map(({ route, computed }) => {
                          const laundry = resolveLaundry(plan, route);
                          const vehicle = resolveVehicle(plan, route);
                          return (
                          <div
                            key={route.route_id}
                            className={`plan-warehouse-route ${
                              selectedRouteId === route.route_id
                                ? "is-selected"
                                : ""
                            }`}
                          >
                            <button
                              type="button"
                              className="plan-warehouse-route__main"
                              onClick={() => selectRoute(route.route_id)}
                            >
                              <span
                                className="plan-warehouse-route__dot"
                                style={{ background: route.color }}
                              />
                              <span className="plan-warehouse-route__body">
                                <b>{shortRouteName(route.name)}</b>
                                <span>
                                  {computed?.total_hotels ?? 0} stops ·{" "}
                                  {computed?.total_bags ?? 0}
                                  {vehicle ? `/${route.max_load}` : ""} bags ·{" "}
                                  {computed?.total_rooms ?? 0} rooms ·{" "}
                                  {laundry
                                    ? `via ${laundryLabel(laundry)}`
                                    : "direct"}{" "}
                                  · {computed?.return_hq ?? "—"} return
                                </span>
                              </span>
                            </button>
                            {otherDepots.map((other) => (
                              <button
                                key={other.id}
                                type="button"
                                className="plan-warehouse-route__move"
                                onClick={() =>
                                  handleAssignDepot(route.route_id, other.id)
                                }
                                title={`Move ${shortRouteName(
                                  route.name,
                                )} to ${other.name}`}
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
              })}
              <p className="plan-warehouse__hint">
                A route and all of its hotels move together. The vehicle starts
                at the assigned warehouse and returns there after any laundry
                stop.
              </p>
            </div>
          )}

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
                  } bags · ${selectedComputed?.total_rooms ?? 0} rooms · ${selectedComputed?.total_dist_km ?? 0} km · ${
                    depotLabel(routeDepot(plan, selectedRoute))
                  }${selectedLaundry ? ` · via ${laundryLabel(selectedLaundry)}` : ""}`
                : `${plan.routes.length} routes · ${computation.totals.hotels} hotels · ${computation.totals.rooms} rooms`}
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
          {mode === "plan" && selectedStop && selectedComputed && selectedComputedStop ? (
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
                  <span>Rooms</span>
                  <b>{selectedStop.rooms ?? 0}</b>
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
                  {selectedComputed.total_bags}
                  {selectedVehicle ? `/${selectedRoute.max_load}` : ""} bags ·{" "}
                  {selectedComputed.total_rooms} rooms
                  {selectedVehicle
                    ? ` · ${selectedComputed.capacity_utilization_pct}% of safe load`
                    : ""}
                </p>
              </div>

              <div className="plan-inspector__section">
                <h3>Warehouse</h3>
                <label className="plan-field">
                  <span>Vehicle starts and ends at</span>
                  <select
                    value={routeDepotId(plan, selectedRoute)}
                    onChange={(event) =>
                      handleAssignDepot(
                        selectedRoute.route_id,
                        event.target.value,
                      )
                    }
                  >
                    {depots.map((depot) => (
                      <option key={depot.id} value={depot.id}>
                        {depot.name}
                      </option>
                    ))}
                  </select>
                </label>
                <p className="plan-inspector__note">
                  {mode === "warehouse"
                    ? `All ${selectedComputed.total_hotels} hotels move with this route. The vehicle starts and ends at ${selectedComputed.depot_name}.`
                    : selectedLaundry
                      ? `Distance and return time follow ${selectedComputed.depot_name} → hotels → ${selectedLaundry.name} → ${selectedComputed.depot_name}.`
                      : `Distance and return time are calculated from ${selectedComputed.depot_name}.`}
                </p>
              </div>

              {mode === "plan" && (
                <div className="plan-inspector__section">
                  <h3>Vehicle</h3>
                  <label className="plan-field">
                    <span>Assigned vehicle</span>
                    <select
                      value={selectedRoute.vehicle_id ?? ""}
                      onChange={(event) =>
                        handleAssignVehicle(
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
                      {vehicles.map((vehicle) => {
                        const usedElsewhere = routesUsingVehicle(
                          plan,
                          vehicle.id,
                        ).filter(
                          (route) =>
                            route.route_id !== selectedRoute.route_id,
                        );
                        return (
                          <option
                            key={vehicle.id}
                            value={vehicle.id}
                            disabled={usedElsewhere.length > 0}
                            title={
                              usedElsewhere.length > 0
                                ? `Allocated to ${usedElsewhere
                                    .map((route) => shortRouteName(route.name))
                                    .join(", ")} — release it there first`
                                : undefined
                            }
                          >
                            {vehicle.name} · {vehicle.nominal_cap} bags
                            {usedElsewhere.length > 0 ? " · in use" : ""}
                          </option>
                        );
                      })}
                    </select>
                  </label>
                  <p className="plan-inspector__note">
                    {selectedVehicle
                      ? `${selectedVehicle.name} · safe load ${selectedVehicle.max_load} bags.`
                      : "No vehicle assigned. Choose one to set the route capacity."}
                  </p>
                  {otherRoutesOnVehicle.length > 0 && (
                    <p className="plan-inspector__note plan-inspector__note--warning">
                      Also allocated to{" "}
                      {otherRoutesOnVehicle
                        .map((route) => shortRouteName(route.name))
                        .join(", ")}
                      . Reassign one of these routes.
                    </p>
                  )}
                  {selectedComputed.total_bags > selectedRoute.nominal_cap && (
                    <p className="plan-inspector__note plan-inspector__note--warning">
                      This route carries {selectedComputed.total_bags} bags,
                      above the {selectedRoute.nominal_cap}-bag vehicle capacity.
                    </p>
                  )}
                  <div className="plan-inspector__row">
                    <button
                      type="button"
                      className="btn btn--ghost"
                      onClick={() =>
                        handleAssignVehicle(selectedRoute.route_id, "")
                      }
                      disabled={!selectedRoute.vehicle_id}
                      title={
                        selectedRoute.vehicle_id
                          ? "Free this vehicle so another route can use it"
                          : "No vehicle assigned"
                      }
                    >
                      Release
                    </button>
                    <button
                      type="button"
                      className="btn btn--ghost"
                      onClick={() => setVehiclesOpen(true)}
                    >
                      <Truck size={14} />
                      Manage
                    </button>
                  </div>
                  <p className="plan-inspector__note">
                    A vehicle on another route is locked. Release it there
                    first, then assign it here.
                  </p>
                </div>
              )}

              {mode === "plan" && (
                <div className="plan-inspector__section">
                  <h3>Return</h3>
                  <label className="plan-field">
                    <span>After the last hotel</span>
                    <select
                      value={selectedRoute.laundry_id ?? ""}
                      onChange={(event) =>
                        handleSetLaundry(
                          selectedRoute.route_id,
                          event.target.value,
                        )
                      }
                    >
                      <option value="">
                        Direct to {depotLabel(routeDepot(plan, selectedRoute))}
                      </option>
                      {laundries.map((laundry) => (
                        <option key={laundry.id} value={laundry.id}>
                          {laundry.name} ·{" "}
                          {formatDuration(laundry.service_mins)} on site
                        </option>
                      ))}
                    </select>
                  </label>
                  <p className="plan-inspector__note">
                    {selectedLaundry && selectedComputed.laundry_arrival_time
                      ? `Arrive ${selectedComputed.laundry_arrival_time} · depart ${selectedComputed.laundry_departure_time} · ${selectedComputed.depot_name} return ${selectedComputed.return_hq}.`
                      : `No laundry stop. The vehicle returns straight to ${selectedComputed.depot_name}.`}
                  </p>
                </div>
              )}

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
                  <span>Hotel service</span>
                  <b>{formatDuration(selectedComputed.total_service_mins)}</b>
                </div>
                <div className="plan-metric">
                  <span>Laundry</span>
                  <b>
                    {selectedLaundry
                      ? formatDuration(selectedComputed.laundry_service_mins)
                      : "Direct"}
                  </b>
                </div>
                <div className="plan-metric">
                  <span>Stops</span>
                  <b>{selectedComputed.total_hotels}</b>
                </div>
                <div className="plan-metric">
                  <span>Rooms</span>
                  <b>{selectedComputed.total_rooms}</b>
                </div>
              </div>

              <div className="plan-inspector__section">
                <h3>Capacity</h3>
                {selectedVehicle ? (
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
                ) : (
                  <p className="plan-muted">
                    Assign a vehicle to see this route's capacity.
                  </p>
                )}
              </div>

              {mode === "plan" && (
                <div className="plan-inspector__section">
                  <h3>Route tools</h3>
                  <div className="plan-inspector__row">
                    <button
                      type="button"
                      className="btn btn--ghost"
                      onClick={() => setAddHotelsOpen(true)}
                    >
                      <Plus size={14} />
                      Add hotels
                    </button>
                    <button
                      type="button"
                      className="btn btn--ghost"
                      onClick={() => handleOptimizeRoute(selectedRoute.route_id)}
                      disabled={selectedRoute.stops.length < 3}
                      title={
                        selectedRoute.stops.length < 3
                          ? "Add at least three stops to optimize"
                          : "Polish this route's stop order"
                      }
                    >
                      <Wand2 size={14} />
                      Optimize
                    </button>
                  </div>
                  <button
                    type="button"
                    className="btn btn--ghost plan-inspector__wide"
                    onClick={() =>
                      mapRef.current?.focusRoute(selectedRoute.route_id)
                    }
                  >
                    <MapPin size={14} />
                    Focus on map
                  </button>
                  {selectedRoute.is_custom && (
                    <>
                      <button
                        type="button"
                        className="btn btn--ghost plan-inspector__wide plan-danger-btn"
                        onClick={() => handleDeleteRoute(selectedRoute.route_id)}
                        title={
                          selectedRoute.stops.length > 0
                            ? "Delete this route and return its hotels to the original plan"
                            : "Delete this custom route"
                        }
                      >
                        <Trash2 size={14} />
                        Delete route
                      </button>
                      {selectedRoute.stops.length > 0 && (
                        <p className="plan-inspector__note">
                          {selectedRoute.stops.length} hotel
                          {selectedRoute.stops.length === 1 ? "" : "s"} will
                          return to the original plan.
                        </p>
                      )}
                    </>
                  )}
                </div>
              )}

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
                  {mode === "warehouse"
                    ? "Choose a warehouse above or use the move button on a route in the warehouse board. A route and all of its hotels move together, then the stop order is re-optimized from the new start."
                    : "Drag a stop by its grip to reorder it in this route. Drag it onto another route card to reassign it. Drop on a card header to use the cheapest insertion point."}
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
                {mode === "warehouse"
                  ? "Select a route in the warehouse board to see its metrics, or move it to the other warehouse."
                  : "Select a route on the left, then drag stops by the grip. Drop a stop on another route to move it."}
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
            <b>{computation.totals.rooms}</b> rooms
          </span>
          <span>
            <b>{computation.totals.distance_km.toFixed(0)}</b> km
          </span>
          <span className="plan-statusbar__shift">
            <Clock size={11} />
            Shift {formatClock(plan.shift.start_min)}–
            {formatClock(plan.shift.end_min)}
          </span>
          <span className="plan-statusbar__depots">
            {depotTotals.map(({ depot, routeCount, bags, rooms }) => (
              <span key={depot.id}>
                <Warehouse size={10} />
                <b>{depotLabel(depot)}</b>
                {routeCount} route{routeCount === 1 ? "" : "s"} · {bags} bags ·{" "}
                {rooms} rooms
              </span>
            ))}
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

      <PlanShareDialog
        open={shareOpen}
        plan={plan}
        hasBackup={hasImportBackup}
        onClose={() => setShareOpen(false)}
        onExport={exportPlan}
        onImport={handleImportPlan}
        onRestoreBackup={handleRestoreBackup}
      />

      <PlanNewHotelDialog
        open={newHotelOpen}
        plan={plan}
        regions={regions}
        defaultRouteId={selectedRouteId}
        onClose={() => setNewHotelOpen(false)}
        onAdd={handleAddNewHotel}
      />

      <PlanCreateRouteDialog
        open={createRouteOpen}
        defaultName={`Route ${plan.routes.length + 1}`}
        depots={depots}
        defaultDepotId={plan.depot.id}
        vehicles={vehicles}
        usedVehicleIds={usedVehicleIds}
        onClose={() => setCreateRouteOpen(false)}
        onCreate={handleCreateRoute}
      />

      <PlanVehiclesDialog
        open={vehiclesOpen}
        plan={plan}
        onClose={() => setVehiclesOpen(false)}
        onAdd={handleAddVehicle}
        onUpdate={handleUpdateVehicle}
        onDelete={handleDeleteVehicle}
      />

      <PlanAddHotelsDialog
        open={addHotelsOpen}
        route={selectedRoute}
        currentBags={selectedComputed?.total_bags ?? 0}
        plan={plan}
        regions={regions}
        onClose={() => setAddHotelsOpen(false)}
        onAdd={handleAddStops}
      />

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
