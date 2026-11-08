"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import PlanAddHotelsDialog from "./plan-add-hotels-dialog";
import PlanCreateRouteDialog from "./plan-create-route-dialog";
import PlanNewFacilityDialog from "./plan-new-facility-dialog";
import PlanNewHotelDialog from "./plan-new-hotel-dialog";
import PlanVehiclesDialog from "./plan-vehicles-dialog";
import { type PlanCanvasMapHandle } from "./plan-canvas-map";
import { PlanHeader } from "./plan/plan-header";
import { PlanSidebar } from "./plan/plan-sidebar";
import { PlanMapStage } from "./plan/plan-map-stage";
import { PlanInspector } from "./plan/plan-inspector";
import { PlanStatusBar } from "./plan/plan-statusbar";
import { PlanSaveAsDialog } from "./plan/plan-save-as-dialog";
import { PlanToast } from "./plan/plan-toast";
import { workspace } from "./ui/plan-styles";
import {
  changedRouteIds,
  formatBags,
  formatKm,
  formatRooms,
  routeSignature,
  shortRouteName,
  type DragState,
  type DropTarget,
  type PlanMode,
  type SaveState,
  type Toast,
} from "./plan/plan-types";
import type { HexMap, RegionMeta } from "../lib/coverage";
import type { FacilityAdminItem, FacilityInput } from "../lib/facilities";
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
  getPlanDepots,
  getPlanLaundries,
  getPlanVehicles,
  moveStop,
  normalizeStopDays,
  optimizeRouteOrder,
  overCapacityDays,
  projectRouteDayBags,
  reassignRouteDepot,
  reorderStops,
  resolveLaundry,
  resolveVehicle,
  routeDepot,
  routeDepotId,
  routesUsingVehicle,
  setRouteLaundry,
  setStopDays,
  sortVehicles,
  stopIsDaily,
  stopRunsOnDay,
  updateVehicle,
  type Plan,
  type PlanDay,
  type PlanDepot,
  type PlanIssue,
  type PlanLaundry,
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
  const [newFacilityOpen, setNewFacilityOpen] = useState(false);
  const [facilityRole, setFacilityRole] = useState<"warehouse" | "laundry">("warehouse");
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
    errors.length > 0 ? "error" : warnings.length > 0 ? "warn" : "ok";

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
    setSaveAsOpen(true);
  }, []);

  const handleSaveAsSubmit = useCallback(
    async (name: string) => {
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
    },
    [notify],
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

  const handleAddNewFacility = useCallback(
    async (values: FacilityInput): Promise<boolean> => {
      const current = planRef.current;
      let createdFacility: FacilityAdminItem | null = null;

      try {
        const response = await fetch("/api/facilities", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(values),
        });

        const data = (await response.json().catch(() => null)) as
          | { facility?: FacilityAdminItem; error?: string }
          | null;

        if (!response.ok || !data?.facility) {
          notify(
            data?.error ?? "Could not add this facility to the master.",
            "error",
          );
          return false;
        }

        createdFacility = data.facility;

        let nextPlan: Plan = { ...current, routes: current.routes };

        if (values.isWarehouse) {
          const newDepot: PlanDepot = {
            id: createdFacility.id,
            name: createdFacility.name,
            lat: createdFacility.latitude,
            lon: createdFacility.longitude,
            short_name: createdFacility.shortName,
            is_active: createdFacility.isActive,
          };
          const currentDepots = getPlanDepots(current);
          nextPlan = {
            ...nextPlan,
            depot: current.depot ?? newDepot,
            depots: currentDepots.some((depot) => depot.id === newDepot.id)
              ? currentDepots
              : [...currentDepots, newDepot],
          };

          if (selectedRouteId) {
            nextPlan = reassignRouteDepot(
              nextPlan,
              selectedRouteId,
              newDepot.id,
              matrix,
            );
          }
        }

        if (values.isLaundry) {
          const newLaundry: PlanLaundry = {
            id: createdFacility.id,
            name: createdFacility.name,
            lat: createdFacility.latitude,
            lon: createdFacility.longitude,
            short_name: createdFacility.shortName,
            service_mins: createdFacility.serviceMins,
            is_active: createdFacility.isActive,
          };
          const currentLaundries = getPlanLaundries(current);
          nextPlan = {
            ...nextPlan,
            laundries: currentLaundries.some(
              (laundry) => laundry.id === newLaundry.id,
            )
              ? currentLaundries
              : [...currentLaundries, newLaundry],
          };

          if (selectedRouteId) {
            nextPlan = setRouteLaundry(
              nextPlan,
              selectedRouteId,
              newLaundry.id,
              matrix,
            );
          }
        }

        const addedLabel = values.isWarehouse
          ? `warehouse ${createdFacility.name}`
          : `laundry ${createdFacility.name}`;
        commit(
          nextPlan,
          `Added ${addedLabel}${selectedRoute ? ` and assigned to ${shortRouteName(selectedRoute.name)}` : ""}`,
        );

        setNewFacilityOpen(false);
        revealInspector();
        return true;
      } catch (error) {
        if (createdFacility) {
          await fetch(`/api/facilities/${createdFacility.id}`, {
            method: "DELETE",
          }).catch(() => undefined);
        }
        notify(
          error instanceof Error ? error.message : "Could not add the facility.",
          "error",
        );
        return false;
      }
    },
    [commit, notify, revealInspector, selectedRoute, selectedRouteId],
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
            depotId:
              selectedRoute?.depot_id ??
              current.depot?.id ??
              "depot-yeshwanthpur",
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

  return (
    <div className="flex flex-col w-full h-[100svh] min-h-0 overflow-hidden bg-bone">
      <PlanHeader
        planName={plan.name}
        mode={mode}
        onChangeMode={changeMode}
        onUndo={undo}
        canUndo={history.length > 0}
        onRedo={redo}
        canRedo={future.length > 0}
        saveState={saveState}
        remoteUpdate={remoteUpdate}
        onRefresh={() => void refreshPlan()}
        canResetPlan={canResetPlan}
        onResetPlan={resetPlan}
      />

      <main className={workspace}>
        <PlanSidebar
          plan={plan}
          viewPlan={viewPlan}
          currentPlanId={currentPlanId}
          planList={planList}
          planSwitching={planSwitching}
          mode={mode}
          view={view}
          viewLabel={viewLabel}
          viewCounts={viewCounts}
          totalHotelsCount={computation.totals.hotels}
          computedById={computedById}
          depots={depots}
          selectedRouteId={selectedRouteId}
          selectedStopId={selectedStopId}
          dragState={dragState}
          draggedStop={draggedStop}
          dropTarget={dropTarget}
          issuesByRoute={issuesByRoute}
          updatingRoutes={updatingRoutes}
          onSwitchPlan={(id) => void switchPlan(id)}
          onOpenSaveAs={openSaveAs}
          onChangeMode={changeMode}
          onChangeView={changeView}
          onOpenCreateRoute={() => setCreateRouteOpen(true)}
          onOpenNewHotel={() => setNewHotelOpen(true)}
          onOpenVehicles={() => setVehiclesOpen(true)}
          onOpenNewFacility={(role) => {
            setFacilityRole(role);
            setNewFacilityOpen(true);
          }}
          onSelectRoute={selectRoute}
          onSelectStop={selectStop}
          onRouteDragOver={handleRouteDragOver}
          onRouteDrop={handleRouteDrop}
          onStopDragOver={handleStopDragOver}
          onStopDrop={handleStopDrop}
          onBeginDrag={beginDrag}
          onEndDrag={endDrag}
          onSetStopDays={handleSetStopDays}
          onMoveWithinRoute={moveWithinRoute}
          onOpenAddHotels={(routeId) => {
            setSelectedRouteId(routeId);
            setSelectedStopId(null);
            setAddHotelsOpen(true);
          }}
          onOptimizeRoute={handleOptimizeRoute}
          onDeleteRoute={handleDeleteRoute}
          onAssignDepot={handleAssignDepot}
        />

        <PlanMapStage
          mapRef={mapRef}
          viewPlan={viewPlan}
          routes={computation.routes}
          selectedRouteId={selectedRouteId}
          selectedStopId={selectedStopId}
          geometries={geometries}
          regions={regions}
          hexMap={hexMap}
          inspectorOpen={inspectorOpen}
          view={view}
          viewLabel={viewLabel}
          selectedRoute={selectedRoute ?? null}
          selectedComputed={selectedComputed}
          selectedLaundry={selectedLaundry ?? null}
          totalHotels={computation.totals.hotels}
          totalRooms={computation.totals.rooms}
          plan={plan}
          onSelectRoute={selectRoute}
          onSelectStop={selectStop}
          onToggleInspector={() => setInspectorOpen((curr) => !curr)}
        />

        <PlanInspector
          inspectorOpen={inspectorOpen}
          onCloseInspector={() => setInspectorOpen(false)}
          mode={mode}
          view={view}
          isAllView={isAllView}
          isDayView={isDayView}
          isDailyView={isDailyView}
          plan={plan}
          depots={depots}
          laundries={laundries}
          vehicles={vehicles}
          selectedRoute={selectedRoute ?? null}
          selectedStop={selectedStop ?? null}
          selectedStopIndex={selectedStopIndex}
          selectedComputed={selectedComputed}
          selectedComputedStop={selectedComputedStop}
          selectedVehicle={selectedVehicle}
          selectedLaundry={selectedLaundry ?? null}
          selectedDay1={selectedDay1}
          selectedDay2={selectedDay2}
          otherRoutesOnVehicle={otherRoutesOnVehicle}
          moveTargets={moveTargets}
          computedById={computedById}
          issuesByRoute={issuesByRoute}
          viewIssues={viewIssues}
          errors={errors}
          warnings={warnings}
          onSelectStopDays={handleSetStopDays}
          onMoveWithinRoute={moveWithinRoute}
          onMoveStopToRoute={handleMove}
          onFocusStop={(lat, lon) => mapRef.current?.focusStop(lat, lon)}
          onFocusRoute={(routeId) => mapRef.current?.focusRoute(routeId)}
          onFocusIssue={focusIssue}
          onAssignDepot={handleAssignDepot}
          onAssignVehicle={handleAssignVehicle}
          onSetLaundry={handleSetLaundry}
          onOptimizeRoute={handleOptimizeRoute}
          onDeleteRoute={handleDeleteRoute}
          onOpenAddHotels={() => setAddHotelsOpen(true)}
          onOpenVehicles={() => setVehiclesOpen(true)}
          onOpenNewFacility={(role) => {
            setFacilityRole(role);
            setNewFacilityOpen(true);
          }}
        />
      </main>

      <PlanStatusBar
        routeCount={plan.routes.length}
        hotelCount={computation.totals.hotels}
        bags={computation.totals.bags}
        rooms={computation.totals.rooms}
        distanceKm={computation.totals.distance_km}
        shiftStartMin={plan.shift.start_min}
        shiftEndMin={plan.shift.end_min}
        depotTotals={depotTotals}
        isSyncing={updatingRoutes.size > 0}
        errorCount={errors.length}
        warningCount={warnings.length}
        healthTone={healthTone}
        healthLabel={
          errors.length > 0
            ? `${errors.length} error${errors.length === 1 ? "" : "s"} · ${warnings.length} warning${warnings.length === 1 ? "" : "s"}`
            : warnings.length > 0
              ? `${warnings.length} warning${warnings.length === 1 ? "" : "s"} to review`
              : isDailyView
                ? "Daily core view"
                : isAllView
                  ? "All day trips within capacity"
                  : "All routes within capacity"
        }
      />

      <PlanSaveAsDialog
        open={saveAsOpen}
        initialName={`${plan.name} copy`}
        onClose={() => setSaveAsOpen(false)}
        onSubmit={handleSaveAsSubmit}
      />

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

      <PlanNewFacilityDialog
        open={newFacilityOpen}
        initialRole={facilityRole}
        selectedRouteName={
          selectedRoute ? shortRouteName(selectedRoute.name) : undefined
        }
        onClose={() => setNewFacilityOpen(false)}
        onAdd={handleAddNewFacility}
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
        <PlanToast
          toast={toast}
          canUndo={history.length > 0}
          onUndo={undo}
          onDismiss={() => setToast(null)}
        />
      )}
    </div>
  );
}
