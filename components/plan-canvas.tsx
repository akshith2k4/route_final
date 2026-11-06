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
  RefreshCw,
  RotateCcw,
  Route,
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
import PlanVehiclesDialog from "./plan-vehicles-dialog";
import PlanCanvasMap, {
  type PlanCanvasMapHandle,
} from "./plan-canvas-map";
import type { HexMap, RegionMeta } from "../lib/coverage";
import type { PlanSummary } from "../lib/plan-store";
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
  filterPlanForView,
  findStop,
  formatClock,
  formatDuration,
  getPlanDepots,
  getPlanLaundries,
  getPlanVehicles,
  laundryLabel,
  moveStop,
  normalizeStopDays,
  optimizeRouteOrder,
  overCapacityDays,
  parseClock,
  projectRouteDayBags,
  reassignRouteDepot,
  reorderStops,
  resolveLaundry,
  resolveVehicle,
  routeDepot,
  routeDepotId,
  routeLaundryId,
  routesUsingVehicle,
  setRouteLaundry,
  setStopDays,
  sortVehicles,
  stopIsDaily,
  stopRunsOnDay,
  updateVehicle,
  type Plan,
  type PlanDay,
  type PlanIssue,
  type PlanRoute,
  type PlanStop,
  type PlanView,
  type NewHotelInput,
  type TravelMatrix,
} from "../lib/plan";

const OSRM_BASE_URL = "https://router.project-osrm.org";

type PlanCanvasProps = {
  initialPlan: Plan;
  initialPlanId: string;
  initialPlans: PlanSummary[];
  initialVersion: number;
  baselinePlan: Plan;
  matrix: TravelMatrix;
  regions: RegionMeta[];
  hexMap: HexMap;
  initialGeometries: Record<string, [number, number][]>;
};

type SaveState = "saved" | "saving" | "error";

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

const DAY_VIEW_OPTIONS: { key: PlanView; label: string }[] = [
  { key: "all", label: "All" },
  { key: "daily", label: "Daily" },
  { key: "day1", label: "Day 1" },
  { key: "day2", label: "Day 2" },
];

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
  initialPlanId,
  initialPlans,
  initialVersion,
  baselinePlan,
  matrix,
  regions,
  hexMap,
  initialGeometries,
}: PlanCanvasProps) {
  const [plan, setPlan] = useState<Plan>(initialPlan);
  const [currentPlanId, setCurrentPlanId] = useState(initialPlanId);
  const [planList, setPlanList] = useState<PlanSummary[]>(initialPlans);
  const [planSwitching, setPlanSwitching] = useState(false);
  const [saveAsOpen, setSaveAsOpen] = useState(false);
  const [saveAsName, setSaveAsName] = useState("");
  const [saveAsError, setSaveAsError] = useState<string | null>(null);
  const [saveAsBusy, setSaveAsBusy] = useState(false);
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
  const [saveState, setSaveState] = useState<SaveState>("saved");
  const [remoteUpdate, setRemoteUpdate] = useState(false);
  const [mode, setMode] = useState<PlanMode>("plan");
  const [view, setView] = useState<PlanView>("all");
  const [inspectorOpen, setInspectorOpen] = useState(false);
  const [createRouteOpen, setCreateRouteOpen] = useState(false);
  const [addHotelsOpen, setAddHotelsOpen] = useState(false);
  const [newHotelOpen, setNewHotelOpen] = useState(false);
  const [vehiclesOpen, setVehiclesOpen] = useState(false);

  const viewPlan = useMemo(
    () => filterPlanForView(plan, view),
    [plan, view],
  );
  const planRef = useRef(plan);
  const viewPlanRef = useRef(viewPlan);
  const mapRef = useRef<PlanCanvasMapHandle | null>(null);
  const toastTimerRef = useRef<number | null>(null);
  const previousViewPlanRef = useRef(viewPlan);
  const versionRef = useRef(initialVersion);
  const lastSavedPlanRef = useRef(initialPlan);
  const firstPlanEffectRef = useRef(true);

  useEffect(() => {
    planRef.current = plan;
  }, [plan]);

  useEffect(() => {
    viewPlanRef.current = viewPlan;
  }, [viewPlan]);

  const computation = useMemo(
    () => computePlan(viewPlan, matrix),
    [viewPlan, matrix],
  );
  const day1Plan = useMemo(
    () => filterPlanForView(plan, "day1"),
    [plan],
  );
  const day2Plan = useMemo(
    () => filterPlanForView(plan, "day2"),
    [plan],
  );
  const day1Computation = useMemo(
    () => computePlan(day1Plan, matrix),
    [day1Plan, matrix],
  );
  const day2Computation = useMemo(
    () => computePlan(day2Plan, matrix),
    [day2Plan, matrix],
  );
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
  const day1ById = useMemo(
    () =>
      new Map(
        day1Computation.routes.map((route) => [route.route_id, route]),
      ),
    [day1Computation.routes],
  );
  const day2ById = useMemo(
    () =>
      new Map(
        day2Computation.routes.map((route) => [route.route_id, route]),
      ),
    [day2Computation.routes],
  );
  const depotTotals = useMemo(
    () =>
      depots.map((depot) => {
        const routes = viewPlan.routes.filter(
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
    [computedById, depots, plan, viewPlan],
  );

  const selectedRoute =
    viewPlan.routes.find((route) => route.route_id === selectedRouteId) ??
    null;
  const selectedComputed = selectedRouteId
    ? computedById.get(selectedRouteId) ?? null
    : null;
  const selectedDay1 = selectedRouteId
    ? day1ById.get(selectedRouteId) ?? null
    : null;
  const selectedDay2 = selectedRouteId
    ? day2ById.get(selectedRouteId) ?? null
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

  const viewCounts = useMemo(() => {
    const stops = plan.routes.flatMap((route) => route.stops);
    return {
      all: stops.length,
      daily: stops.filter((stop) => stopIsDaily(stop)).length,
      day1: stops.filter((stop) => stopRunsOnDay(stop, "day1")).length,
      day2: stops.filter((stop) => stopRunsOnDay(stop, "day2")).length,
    };
  }, [plan]);

  const viewLabel =
    view === "all"
      ? "All hotels"
      : view === "daily"
        ? "Daily core"
        : view === "day1"
          ? "Day 1"
          : "Day 2";
  const isAllView = view === "all";
  const isDailyView = view === "daily";
  const isDayView = view === "day1" || view === "day2";

  const viewIssues = useMemo<PlanIssue[]>(() => {
    const planLevelCodes = new Set([
      "no_vehicle",
      "vehicle_double_booked",
      "unassigned_hotels",
    ]);
    const tagDay = (issues: PlanIssue[], day: PlanDay): PlanIssue[] =>
      issues
        .filter((issue) => !planLevelCodes.has(issue.code))
        .map((issue) => ({
          ...issue,
          day,
          message: `${day === "day1" ? "Day 1" : "Day 2"} · ${issue.message}`,
        }));
    const planLevel = day1Computation.issues.filter((issue) =>
      planLevelCodes.has(issue.code),
    );

    if (view === "daily") return planLevel;
    if (view === "day1" || view === "day2") return computation.issues;

    return [
      ...tagDay(day1Computation.issues, "day1"),
      ...tagDay(day2Computation.issues, "day2"),
      ...planLevel,
    ];
  }, [
    computation.issues,
    day1Computation.issues,
    day2Computation.issues,
    view,
  ]);

  const errors = viewIssues.filter(
    (issue) => issue.severity === "error",
  );
  const warnings = viewIssues.filter(
    (issue) => issue.severity === "warning",
  );
  const healthTone =
    errors.length > 0 ? "is-error" : warnings.length > 0 ? "is-warn" : "is-ok";

  const issuesByRoute = useMemo(() => {
    const map = new Map<string, PlanIssue[]>();
    for (const issue of viewIssues) {
      if (!issue.route_id) continue;
      const list = map.get(issue.route_id) ?? [];
      list.push(issue);
      map.set(issue.route_id, list);
    }
    return map;
  }, [viewIssues]);

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

  const refreshPlan = useCallback(
    async (silent = false) => {
      const dirty = planRef.current !== lastSavedPlanRef.current;
      if (silent && dirty) return;
      if (
        !silent &&
        dirty &&
        !window.confirm(
          "Discard your unsaved local changes and load the latest plan?",
        )
      ) {
        return;
      }

      try {
        const [response, listResponse] = await Promise.all([
          fetch(`/api/plans/${currentPlanId}`, { cache: "no-store" }),
          fetch("/api/plans", { cache: "no-store" }),
        ]);
        const data = (await response.json().catch(() => null)) as
          | {
              id?: string;
              name?: string;
              plan?: Plan;
              version?: number;
              updatedAt?: string;
              error?: string;
            }
          | null;
        const listData = (await listResponse.json().catch(() => null)) as
          | { plans?: PlanSummary[] }
          | null;

        if (listResponse.ok && listData?.plans) {
          setPlanList(listData.plans);
        }

        if (!response.ok || !data?.plan || typeof data.version !== "number") {
          throw new Error(data?.error ?? "Could not load the latest plan.");
        }

        if (!dirty && data.version === versionRef.current) {
          if (!silent) notify("Already up to date");
          return;
        }

        setPlan(data.plan);
        planRef.current = data.plan;
        versionRef.current = data.version;
        lastSavedPlanRef.current = data.plan;
        setSaveState("saved");
        setRemoteUpdate(false);
        setHistory([]);
        setFuture([]);
        setSelectedRouteId((current) =>
          current &&
          data.plan?.routes.some((route) => route.route_id === current)
            ? current
            : (data.plan?.routes[0]?.route_id ?? null),
        );
        setSelectedStopId(null);
        if (!silent) notify("Loaded the latest plan from the cloud");
      } catch (error) {
        if (!silent) {
          notify(
            error instanceof Error
              ? error.message
              : "Could not refresh the plan.",
            "error",
          );
        }
      }
    },
    [currentPlanId, notify],
  );

  useEffect(() => {
    if (firstPlanEffectRef.current) {
      firstPlanEffectRef.current = false;
      return;
    }
    if (plan === lastSavedPlanRef.current) return;

    setSaveState("saving");
    const timer = window.setTimeout(async () => {
      try {
        const response = await fetch(`/api/plans/${currentPlanId}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            plan,
            version: versionRef.current,
          }),
        });
        const data = (await response.json().catch(() => null)) as
          | {
              plan?: Plan;
              name?: string;
              version?: number;
              updatedAt?: string;
              error?: string;
              conflict?: boolean;
            }
          | null;

        if (!response.ok || typeof data?.version !== "number") {
          setSaveState("error");
          if (response.status === 409) {
            setRemoteUpdate(true);
            notify(
              "The plan changed in another session. Refresh to load the latest.",
              "error",
            );
          } else {
            notify(data?.error ?? "Could not save the plan.", "error");
          }
          return;
        }

        versionRef.current = data.version;
        lastSavedPlanRef.current = plan;
        setSaveState("saved");
        setRemoteUpdate(false);
        setPlanList((current) =>
          current
            .map((entry) =>
              entry.id === currentPlanId
                ? {
                    ...entry,
                    name: data.name ?? entry.name,
                    version: data.version as number,
                    updatedAt: data.updatedAt ?? entry.updatedAt,
                  }
                : entry,
            )
            .sort(
              (a, b) =>
                Date.parse(b.updatedAt) - Date.parse(a.updatedAt),
            ),
        );
      } catch {
        setSaveState("error");
        notify("Could not reach the server. Changes are not saved.", "error");
      }
    }, 500);

    return () => window.clearTimeout(timer);
  }, [currentPlanId, plan, notify]);

  const switchPlan = useCallback(
    async (nextPlanId: string) => {
      if (nextPlanId === currentPlanId || planSwitching) return;
      const dirty = planRef.current !== lastSavedPlanRef.current;
      if (
        dirty &&
        !window.confirm(
          "Discard your unsaved local changes and switch plans?",
        )
      ) {
        return;
      }

      setPlanSwitching(true);
      try {
        const [response, listResponse] = await Promise.all([
          fetch(`/api/plans/${nextPlanId}`, { cache: "no-store" }),
          fetch("/api/plans", { cache: "no-store" }),
        ]);
        const data = (await response.json().catch(() => null)) as
          | {
              id?: string;
              name?: string;
              plan?: Plan;
              version?: number;
              error?: string;
            }
          | null;
        const listData = (await listResponse.json().catch(() => null)) as
          | { plans?: PlanSummary[] }
          | null;

        if (!response.ok || !data?.plan || typeof data.version !== "number") {
          throw new Error(data?.error ?? "Could not load this plan.");
        }

        if (listResponse.ok && listData?.plans) {
          setPlanList(listData.plans);
        }

        setCurrentPlanId(data.id ?? nextPlanId);
        setPlan(data.plan);
        planRef.current = data.plan;
        versionRef.current = data.version;
        lastSavedPlanRef.current = data.plan;
        setSaveState("saved");
        setRemoteUpdate(false);
        setHistory([]);
        setFuture([]);
        setSelectedRouteId(data.plan.routes[0]?.route_id ?? null);
        setSelectedStopId(null);
        window.history.replaceState(
          null,
          "",
          `/plan?plan=${encodeURIComponent(data.id ?? nextPlanId)}`,
        );
        notify(`Loaded ${data.name ?? "plan"}`);
      } catch (error) {
        notify(
          error instanceof Error ? error.message : "Could not switch plans.",
          "error",
        );
      } finally {
        setPlanSwitching(false);
      }
    },
    [currentPlanId, notify, planSwitching],
  );

  const openSaveAs = useCallback(() => {
    setSaveAsName(`${planRef.current.name} copy`);
    setSaveAsError(null);
    setSaveAsOpen(true);
  }, []);

  const submitSaveAs = useCallback(
    async (event: React.FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      if (saveAsBusy) return;

      const name = saveAsName.trim();
      if (!name) {
        setSaveAsError("Give this plan a name.");
        return;
      }

      setSaveAsBusy(true);
      setSaveAsError(null);
      try {
        const response = await fetch("/api/plans", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name, plan: planRef.current }),
        });
        const data = (await response.json().catch(() => null)) as
          | {
              id?: string;
              name?: string;
              plan?: Plan;
              version?: number;
              plans?: PlanSummary[];
              error?: string;
            }
          | null;

        if (
          !response.ok ||
          !data?.id ||
          !data.plan ||
          typeof data.version !== "number"
        ) {
          throw new Error(data?.error ?? "Could not save this plan.");
        }

        setCurrentPlanId(data.id);
        setPlan(data.plan);
        planRef.current = data.plan;
        versionRef.current = data.version;
        lastSavedPlanRef.current = data.plan;
        if (data.plans) setPlanList(data.plans);
        setHistory([]);
        setFuture([]);
        setSaveState("saved");
        setRemoteUpdate(false);
        setSaveAsOpen(false);
        window.history.replaceState(
          null,
          "",
          `/plan?plan=${encodeURIComponent(data.id)}`,
        );
        notify(`Saved as ${data.name ?? name}`);
      } catch (error) {
        setSaveAsError(
          error instanceof Error ? error.message : "Could not save this plan.",
        );
      } finally {
        setSaveAsBusy(false);
      }
    },
    [notify, saveAsBusy, saveAsName],
  );

  useEffect(() => {
    const handleFocus = () => {
      void refreshPlan(true);
    };
    const timer = window.setInterval(() => {
      if (document.visibilityState === "visible") {
        void refreshPlan(true);
      }
    }, 20000);

    window.addEventListener("focus", handleFocus);
    return () => {
      window.removeEventListener("focus", handleFocus);
      window.clearInterval(timer);
    };
  }, [refreshPlan]);

  const fetchRouteGeometry = useCallback(async (route: PlanRoute) => {
    if (route.stops.length === 0) return;

    const signature = routeSignature(route);
    setUpdatingRoutes((current) => {
      const next = new Set(current);
      next.add(route.route_id);
      return next;
    });

    try {
      const depot = routeDepot(viewPlanRef.current, route);
      const laundry = resolveLaundry(viewPlanRef.current, route);
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

      const currentRoute = viewPlanRef.current.routes.find(
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
    const previous = previousViewPlanRef.current;
    if (previous === viewPlan) return;
    previousViewPlanRef.current = viewPlan;

    const changed = changedRouteIds(previous, viewPlan);
    if (changed.length === 0) return;

    setGeometries((current) => {
      const next = { ...current };
      for (const routeId of changed) delete next[routeId];
      return next;
    });

    for (const routeId of changed) {
      const route = viewPlan.routes.find(
        (candidate) => candidate.route_id === routeId,
      );
      if (route) void fetchRouteGeometry(route);
    }
  }, [viewPlan, fetchRouteGeometry]);

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
          vehiclesOpen
        ) {
          setCreateRouteOpen(false);
          setAddHotelsOpen(false);
          setNewHotelOpen(false);
          setVehiclesOpen(false);
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
      if (nextMode === "warehouse") setView("all");
      setCreateRouteOpen(false);
      setAddHotelsOpen(false);
      setNewHotelOpen(false);
      setVehiclesOpen(false);
      setDragState(null);
      setDropTarget(null);
      setSelectedStopId(null);
    },
    [mode],
  );

  const changeView = useCallback(
    (nextView: PlanView) => {
      if (nextView === view) return;
      setView(nextView);
      setSelectedStopId(null);
      setDragState(null);
      setDropTarget(null);
    },
    [view],
  );

  const handleSetStopDays = useCallback(
    (hotelId: string, days: PlanDay[]) => {
      const current = planRef.current;
      const found = findStop(current, hotelId);
      if (!found) return;
      let next: Plan;
      try {
        next = setStopDays(current, hotelId, days);
      } catch (error) {
        notify(
          error instanceof Error
            ? error.message
            : "Could not change this hotel's day.",
          "error",
        );
        return;
      }
      if (next === current) return;
      const normalized = normalizeStopDays({ ...found.stop, days });
      const label =
        normalized.length === 2
          ? "Daily (both days)"
          : normalized[0] === "day1"
            ? "Day 1"
            : "Day 2";
      commit(next, `${found.stop.name} → ${label}`);
      const stillVisible = filterPlanForView(next, view).routes.some((route) =>
        route.stops.some((stop) => stop.hotel_id === hotelId),
      );
      if (!stillVisible) setSelectedStopId(null);
    },
    [commit, notify, view],
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
    async (values: NewHotelInput, routeId: string): Promise<boolean> => {
      const current = planRef.current;
      const route = current.routes.find(
        (candidate) => candidate.route_id === routeId,
      );
      const regionName =
        regions.find((region) => region.id === values.region)?.short_name ??
        `Region ${values.region}`;
      const days = values.days ?? ["day1", "day2"];
      const dayPlan =
        days.length === 2
          ? "daily"
          : days[0] === "day1"
            ? "day1"
            : "day2";

      let createdId: string | null = null;
      try {
        const response = await fetch("/api/hotels", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: values.name,
            address: values.address ?? null,
            latitude: values.lat,
            longitude: values.lon,
            regionName,
            stopMins: values.service_mins,
            loadBags: values.daily_load_bags ?? values.load_bags,
            alternateLoadBags:
              values.alternate_load_bags ?? values.load_bags,
            rooms: values.rooms ?? 0,
            dayPlan,
          }),
        });
        const data = (await response.json().catch(() => null)) as
          | { hotel?: { id: string }; error?: string }
          | null;

        if (!response.ok || !data?.hotel) {
          notify(data?.error ?? "Could not add this hotel to the master.", "error");
          return false;
        }

        createdId = data.hotel.id;
        let result: ReturnType<typeof addNewHotelToRoute>;
        try {
          result = addNewHotelToRoute(
            current,
            routeId,
            { ...values, id: createdId },
            matrix,
          );
        } catch (error) {
          await fetch(`/api/hotels/${createdId}`, { method: "DELETE" }).catch(
            () => undefined,
          );
          throw error;
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
      } catch (error) {
        notify(
          error instanceof Error ? error.message : "Could not add the hotel.",
          "error",
        );
        return false;
      }
    },
    [commit, matrix, notify, regions, revealInspector],
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
        next = deleteRoute(current, routeId, { restoreFrom: baselinePlan });
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
    [baselinePlan, commit, notify, selectedRouteId],
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
    async (name: string, capacity: number): Promise<void> => {
      const current = planRef.current;
      const palette = [
        "#1d4ed8",
        "#0f766e",
        "#b45309",
        "#7c3aed",
        "#be185d",
        "#0369a1",
        "#4d7c0f",
        "#c2410c",
      ];

      let createdId: string | null = null;
      try {
        const response = await fetch("/api/vehicles", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name,
            realCapacity: capacity,
            color:
              palette[getPlanVehicles(current).length % palette.length],
            depotId: "depot-yeshwanthpur",
            departureTime: "07:00",
            returnTime: "17:00",
          }),
        });
        const data = (await response.json().catch(() => null)) as
          | {
              vehicle?: {
                id: string;
                name: string;
                realCapacity: number;
                color: string;
              };
              error?: string;
            }
          | null;

        if (!response.ok || !data?.vehicle) {
          notify(
            data?.error ?? "Could not add this vehicle to the master.",
            "error",
          );
          return;
        }

        createdId = data.vehicle.id;
        let next: Plan;
        try {
          next = addVehicle(current, {
            id: data.vehicle.id,
            name: data.vehicle.name,
            capacity: data.vehicle.realCapacity,
            color: data.vehicle.color,
          });
        } catch (error) {
          await fetch(`/api/vehicles/${createdId}`, { method: "DELETE" }).catch(
            () => undefined,
          );
          throw error;
        }

        const added = next.vehicles?.[next.vehicles.length - 1];
        commit(next, `Added ${added?.name ?? name} · ${capacity} bags`);
      } catch (error) {
        notify(
          error instanceof Error ? error.message : "Could not add the vehicle.",
          "error",
        );
      }
    },
    [commit, notify],
  );

  const handleUpdateVehicle = useCallback(
    async (vehicleId: string, name: string, capacity: number) => {
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

      const response = await fetch(`/api/vehicles/${vehicleId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, realCapacity: capacity }),
      });
      if (!response.ok) {
        const data = (await response.json().catch(() => null)) as
          | { error?: string }
          | null;
        notify(data?.error ?? "Could not update the vehicle master.", "error");
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
    [commit, notify],
  );

  const handleDeleteVehicle = useCallback(
    async (vehicleId: string): Promise<void> => {
      const current = planRef.current;
      const vehicle = getPlanVehicles(current).find(
        (candidate) => candidate.id === vehicleId,
      );
      if (!vehicle) return;

      const next = deleteVehicle(current, vehicleId);
      const response = await fetch(`/api/vehicles/${vehicleId}`, {
        method: "DELETE",
      });
      if (!response.ok) {
        const data = (await response.json().catch(() => null)) as
          | { error?: string }
          | null;
        throw new Error(data?.error ?? "Could not delete the vehicle master.");
      }

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

  const canResetPlan = currentPlanId === baselinePlan.plan_id;

  const resetPlan = useCallback(() => {
    if (!canResetPlan) {
      notify(
        "Reset is only available for the Manual Dispatch Plan.",
        "error",
      );
      return;
    }
    if (planRef.current === baselinePlan) return;
    commit(baselinePlan, "Reset to the published manual plan");
    setSelectedRouteId(baselinePlan.routes[0]?.route_id ?? null);
    setSelectedStopId(null);
  }, [baselinePlan, canResetPlan, commit, notify]);

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
      const projected = projectRouteDayBags(route, [dragged.stop]);
      return (
        overCapacityDays(
          route,
          projected,
          normalizeStopDays(dragged.stop),
        ).length === 0
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
          <span
            className={`plan-save-state ${
              saveState === "error" ? "is-error" : ""
            }`}
          >
            {saveState === "saving" ? (
              <RefreshCw size={12} className="plan-save-spinner" />
            ) : saveState === "error" ? (
              <AlertTriangle size={12} />
            ) : (
              <Check size={12} />
            )}
            {saveState === "saving"
              ? "Saving to cloud…"
              : saveState === "error"
                ? "Save failed"
                : remoteUpdate
                  ? "New changes available"
                  : "Saved to cloud"}
          </span>
          <button
            type="button"
            className="plan-icon-btn"
            onClick={() => void refreshPlan()}
            title="Refresh from cloud"
            aria-label="Refresh from cloud"
          >
            <RefreshCw size={15} />
          </button>
          <Link href="/hotels" className="btn btn--ghost">
            <Hotel size={14} />
            Hotels
          </Link>
          <button
            type="button"
            className="btn btn--ghost"
            onClick={resetPlan}
            disabled={!canResetPlan}
            title={
              canResetPlan
                ? "Reset to the published Manual Dispatch Plan"
                : "Reset is only available for the Manual Dispatch Plan"
            }
          >
            <RotateCcw size={14} />
            Reset
          </button>
        </div>
      </header>

      <main className="plan-workspace">
        <aside className="plan-sidebar" aria-label="Route board">
          <div className="plan-switcher">
            <label className="plan-switcher__picker">
              <span>Plan</span>
              <select
                value={currentPlanId}
                onChange={(event) => void switchPlan(event.target.value)}
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
              className="plan-switcher__save"
              onClick={openSaveAs}
              title="Save this plan under a name"
            >
              <Plus size={11} />
              Save as
            </button>
          </div>

          <div className="plan-sidebar__head">
            <div>
              <span className="eyebrow">
                <span className="eyebrow__dot" />
                {mode === "plan"
                  ? `${viewLabel} · ${viewPlan.routes.length} routes · ${computation.totals.hotels} stops`
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
                <span className="plan-sidebar__hint">
                  <Warehouse size={13} />
                  Assign routes
                </span>
              )}
              {renderModeSwitch("plan-mode-switch--sidebar")}
            </div>
          </div>

          {mode === "plan" && (
            <div
              className="plan-day-filter"
              role="group"
              aria-label="Hotel day view"
            >
              {DAY_VIEW_OPTIONS.map((option) => (
                <button
                  key={option.key}
                  type="button"
                  className={view === option.key ? "is-active" : ""}
                  aria-pressed={view === option.key}
                  onClick={() => changeView(option.key)}
                >
                  <span>{option.label}</span>
                  <b>{viewCounts[option.key]}</b>
                </button>
              ))}
            </div>
          )}

          {mode === "plan" ? (
            <div className="plan-sidebar__routes">
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
              const tone =
                isDayView && assignedVehicle
                  ? capacityTone(computed.total_bags, route)
                  : "ok";
              const routeIssues = issuesByRoute.get(route.route_id) ?? [];
              const cardWarnings = isDayView
                ? routeIssues.filter(
                    (issue) =>
                      ROUTE_WARNING_CODES.has(issue.code) &&
                      (assignedVehicle ||
                        !issue.code.startsWith("over_")),
                  )
                : [];
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
                        {formatRooms(computed.total_rooms)}
                        {isUpdating ? " · updating path…" : ""}
                        {isDropBlocked ? " · not enough capacity" : ""}
                      </span>
                    </span>
                  </button>

                  {isDayView && assignedVehicle && (
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
                      key={`${issue.day ?? "day"}-${issue.code}-${
                        issue.stop_id ?? "route"
                      }`}
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

                  {isAllView && route.is_custom && (
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
                          : isDailyView
                            ? "No daily hotels on this route."
                            : isDayView
                              ? `No hotels on ${
                                  view === "day1" ? "Day 1" : "Day 2"
                                }.`
                              : "Drop a stop here"}
                      </div>
                    )}
                    {route.stops.map((stop, index) => {
                      const computedStop = computed.stops[index];
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
                            {isAllView && (
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
                            )}
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
                            </span>
                            <select
                              className="plan-stop__day"
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
                                handleSetStopDays(stop.hotel_id, nextDays);
                              }}
                              title="Change this hotel's day"
                              aria-label={`Day assignment for ${stop.name}`}
                            >
                              <option value="both">Both</option>
                              <option value="day1">Day 1</option>
                              <option value="day2">Day 2</option>
                            </select>
                            {isAllView && (
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
                            )}
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
            plan={viewPlan}
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
            <span className="plan-map-overlay__kicker">
              Plan canvas{view === "all" ? "" : ` · ${viewLabel}`}
            </span>
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
                : `${viewPlan.routes.length} routes · ${computation.totals.hotels} hotels · ${computation.totals.rooms} rooms`}
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
                <h3>Day assignment</h3>
                <label className="plan-field">
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
                      const value = event.target.value;
                      const nextDays: PlanDay[] =
                        value === "both"
                          ? ["day1", "day2"]
                          : value === "day1"
                            ? ["day1"]
                            : value === "day2"
                              ? ["day2"]
                              : [];
                      handleSetStopDays(selectedStop.hotel_id, nextDays);
                    }}
                  >
                    <option value="both">Both days (daily)</option>
                    <option value="day1">Day 1 only</option>
                    <option value="day2">Day 2 only</option>
                  </select>
                </label>
                <p className="plan-inspector__note">
                  Daily hotels are part of both Day 1 and Day 2 trips.
                </p>
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

              {isAllView && (
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
                </div>
              )}

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
                        key={`${issue.day ?? "plan"}-${issue.code}-${
                          issue.stop_id ?? "route"
                        }`}
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
                    : isAllView || isDailyView
                      ? `The vehicle starts and ends at ${selectedComputed.depot_name} on both Day 1 and Day 2.`
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
                    {isAllView || isDailyView
                      ? "Laundry applies to both day trips. Open Day 1 or Day 2 to see the timings."
                      : selectedLaundry && selectedComputed.laundry_arrival_time
                        ? `Arrive ${selectedComputed.laundry_arrival_time} · depart ${selectedComputed.laundry_departure_time} · ${selectedComputed.depot_name} return ${selectedComputed.return_hq}.`
                        : `No laundry stop. The vehicle returns straight to ${selectedComputed.depot_name}.`}
                  </p>
                </div>
              )}

              {isDailyView && (
                <p className="plan-inspector__note">
                  Daily core subset — these hotels are part of both Day 1 and
                  Day 2 trips, not a standalone trip.
                </p>
              )}

              {isAllView ? (
                <div className="plan-day-compare">
                  {[
                    { label: "Day 1", data: selectedDay1 },
                    { label: "Day 2", data: selectedDay2 },
                  ].map(({ label, data }) => (
                    <div className="plan-day-card" key={label}>
                      <span className="plan-day-card__label">{label}</span>
                      <div className="plan-day-card__stats">
                        <span>
                          <b>{data?.total_hotels ?? 0}</b> stops
                        </span>
                        <span>
                          <b>
                            {data?.total_bags ?? 0}
                            {selectedVehicle
                              ? `/${selectedRoute.max_load}`
                              : ""}
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
                            {data && data.total_hotels > 0
                              ? data.return_hq
                              : "—"}
                          </b>{" "}
                          return
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
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
              )}

              <div className="plan-inspector__section">
                <h3>Capacity</h3>
                {isDayView ? (
                  selectedVehicle ? (
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
                  )
                ) : (
                  <p className="plan-muted">
                    {isDailyView
                      ? "Daily core is shared by both days; capacity is checked on Day 1 and Day 2."
                      : "Capacity is checked separately on the Day 1 and Day 2 views."}
                  </p>
                )}
              </div>

              {mode === "plan" && isAllView && (
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
                          key={`${issue.day ?? "plan"}-${issue.code}-${
                            issue.stop_id ?? "route"
                          }`}
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
                    : isAllView
                      ? "Change a hotel's day with the selector on its row. Drag by the grip to reorder stops or move them between routes."
                      : "Use the day selector on each hotel row to move it to Both, Day 1 or Day 2. Switch to All to reorder stops or add hotels."}
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
              {isDailyView && (
                <p className="plan-muted">
                  Daily core is shared by both days. Capacity and shift checks
                  run on Day 1 and Day 2.
                </p>
              )}
              {viewIssues.length === 0 ? (
                <p className="plan-muted">No issues found.</p>
              ) : (
                viewIssues.slice(0, 8).map((issue) => (
                  <button
                    key={`${issue.day ?? "plan"}-${issue.code}-${
                      issue.route_id ?? "plan"
                    }-${issue.stop_id ?? ""}`}
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
                : isDailyView
                  ? "Daily core view"
                  : isAllView
                    ? "All day trips within capacity"
                    : "All routes within capacity"}
          </span>
        </div>
      </footer>

      {saveAsOpen && (
        <div
          className="modal-backdrop"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget && !saveAsBusy) {
              setSaveAsOpen(false);
            }
          }}
        >
          <form
            className="plan-dialog plan-save-as-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="plan-save-as-title"
            onSubmit={submitSaveAs}
          >
            <button
              type="button"
              className="dialog-close"
              onClick={() => setSaveAsOpen(false)}
              disabled={saveAsBusy}
              aria-label="Close save as dialog"
            >
              <X size={16} />
            </button>

            <span className="dialog-eyebrow">
              <Plus size={12} />
              Named plan
            </span>
            <h2 id="plan-save-as-title">Save this plan as</h2>
            <p className="dialog-lede">
              This creates a new plan in the database under this name. Other
              users can load it from the plan dropdown.
            </p>

            <label className="plan-dialog__field">
              <span>Plan name</span>
              <input
                type="text"
                value={saveAsName}
                maxLength={120}
                placeholder="e.g. Monday morning plan"
                onChange={(event) => setSaveAsName(event.target.value)}
                autoFocus
              />
            </label>

            {saveAsError && (
              <div className="hotels-form-error">
                <X size={13} />
                {saveAsError}
              </div>
            )}

            <div className="plan-dialog__actions">
              <button
                type="button"
                className="btn btn--ghost"
                onClick={() => setSaveAsOpen(false)}
                disabled={saveAsBusy}
              >
                Cancel
              </button>
              <button
                type="submit"
                className="btn btn--primary"
                disabled={saveAsBusy || saveAsName.trim().length === 0}
              >
                {saveAsBusy ? "Saving…" : "Save named plan"}
              </button>
            </div>
          </form>
        </div>
      )}

      <PlanNewHotelDialog
        open={newHotelOpen}
        plan={plan}
        regions={regions}
        defaultRouteId={selectedRouteId}
        defaultDay={
          view === "day1" ? "day1" : view === "day2" ? "day2" : "both"
        }
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
