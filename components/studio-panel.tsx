"use client";

import { useState, useMemo, useCallback } from "react";
import {
  AlertCircle,
  Building2,
  Calendar,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Clock,
  Compass,
  CornerDownRight,
  Download,
  Filter,
  Lock,
  MapPin,
  Maximize2,
  Navigation,
  Package,
  Play,
  RotateCcw,
  Search,
  Settings,
  Sparkles,
  Sliders,
  Truck,
  Unlock,
  Utensils,
  X,
  Zap,
} from "lucide-react";
import {
  DEFAULT_DEPOTS,
  DEFAULT_SHIFT_SETTINGS,
  DEFAULT_STUDIO_VEHICLES,
  formatDistance,
  formatMins,
  type DispatchRoute,
  type DispatchStop,
  type Hotel,
  type HotelPriority,
  type RegionMeta,
  type StudioDepot,
  type StudioHotelSetting,
  type StudioShiftSetting,
  type StudioVehicle,
} from "../lib/coverage";
import {
  runStudioOptimization,
  type OptimizationResult,
} from "../lib/studio-optimizer";
import { type OptimizationObjective } from "../lib/google-route-optimization";

type StudioPanelProps = {
  hotels: Hotel[];
  regions: RegionMeta[];
  routes: DispatchRoute[];
  onApplySimulatedRoutes: (
    simulatedRoutes: DispatchRoute[],
    simulatedDepots: StudioDepot[],
  ) => void;
  onSelectRoute: (index: number | null) => void;
  onSelectStop: (stop: DispatchStop) => void;
  onFocusRoute: (index: number) => void;
  onFocusStop: (lat: number, lon: number) => void;
  selectedRouteIndex: number | null;
  selectedStopNumber: number | null;
};

type StudioTab = "hotels" | "fleet" | "shifts" | "windows" | "simulate";

export default function StudioPanel({
  hotels,
  regions,
  routes: originalRoutes,
  onApplySimulatedRoutes,
  onSelectRoute,
  onSelectStop,
  onFocusRoute,
  onFocusStop,
  selectedRouteIndex,
  selectedStopNumber,
}: StudioPanelProps) {
  const [activeTab, setActiveTab] = useState<StudioTab>("hotels");

  // 1. Vehicles State
  const [vehicles, setVehicles] = useState<StudioVehicle[]>(() =>
    DEFAULT_STUDIO_VEHICLES.map((v) => ({ ...v })),
  );

  // Locked capacities tracker
  const [lockedCapacities, setLockedCapacities] = useState<Record<number, boolean>>({});

  // 2. Depots State
  const [depots] = useState<StudioDepot[]>(DEFAULT_DEPOTS);

  // 3. Shift & Lunch State
  const [shiftSettings, setShiftSettings] = useState<StudioShiftSetting>(
    DEFAULT_SHIFT_SETTINGS,
  );

  // 3b. Optimization Objective
  const [objective, setObjective] = useState<OptimizationObjective>("fastest_turnaround");

  // 4. Hotel Settings State
  const [hotelSettings, setHotelSettings] = useState<
    Record<string, StudioHotelSetting>
  >(() => {
    const map: Record<string, StudioHotelSetting> = {};
    for (const h of hotels) {
      map[h.name] = {
        name: h.name,
        selected: true,
        timeWindowEnabled: false,
        earliestArrival: "08:00",
        latestArrival: "13:00",
        priority: "Normal",
        customBags: h.load ?? 3,
      };
    }
    return map;
  });

  // Hotel search & region filter
  const [hotelQuery, setHotelQuery] = useState("");
  const [hotelRegionFilter, setHotelRegionFilter] = useState<number | "all">("all");

  // 5. Simulation Results State
  const [simulationResult, setSimulationResult] = useState<OptimizationResult | null>(
    null,
  );
  const [isSimulating, setIsSimulating] = useState(false);
  const [expandedRouteId, setExpandedRouteId] = useState<string | null>(null);
  const [solverProvider, setSolverProvider] = useState<"google" | "local">("google");
  const [apiNotice, setApiNotice] = useState<string | null>(null);

  // Computed summary metrics
  const selectedHotelsCount = useMemo(() => {
    return Object.values(hotelSettings).filter((s) => s.selected).length;
  }, [hotelSettings]);

  const totalDemandBags = useMemo(() => {
    let sum = 0;
    for (const h of hotels) {
      const s = hotelSettings[h.name];
      if (s?.selected) {
        sum += s.customBags !== undefined ? s.customBags : (h.load ?? 3);
      }
    }
    return sum;
  }, [hotels, hotelSettings]);

  const activeVehiclesCount = useMemo(() => {
    return vehicles.filter((v) => v.enabled).length;
  }, [vehicles]);

  const totalSafeCapacity = useMemo(() => {
    return vehicles
      .filter((v) => v.enabled)
      .reduce((sum, v) => sum + v.max_load, 0);
  }, [vehicles]);

  // Filtered hotels list for tab 1 and tab 4
  const filteredHotels = useMemo(() => {
    const q = hotelQuery.trim().toLowerCase();
    return hotels.filter((h) => {
      if (hotelRegionFilter !== "all" && h.region !== hotelRegionFilter) {
        return false;
      }
      if (
        q &&
        !h.name.toLowerCase().includes(q) &&
        !(h.locality?.toLowerCase().includes(q))
      ) {
        return false;
      }
      return true;
    });
  }, [hotels, hotelQuery, hotelRegionFilter]);

  // Handlers for Hotels
  const handleToggleHotel = useCallback((hotelName: string) => {
    setHotelSettings((prev) => {
      const current = prev[hotelName] ?? {
        name: hotelName,
        selected: true,
        timeWindowEnabled: false,
        earliestArrival: "08:00",
        latestArrival: "13:00",
        priority: "Normal",
      };
      return {
        ...prev,
        [hotelName]: {
          ...current,
          selected: !current.selected,
        },
      };
    });
  }, []);

  const handleSelectAllHotels = useCallback(() => {
    setHotelSettings((prev) => {
      const next = { ...prev };
      for (const h of hotels) {
        if (!next[h.name]) {
          next[h.name] = {
            name: h.name,
            selected: true,
            timeWindowEnabled: false,
            earliestArrival: "08:00",
            latestArrival: "13:00",
            priority: "Normal",
          };
        } else {
          next[h.name] = { ...next[h.name], selected: true };
        }
      }
      return next;
    });
  }, [hotels]);

  const handleDeselectAllHotels = useCallback(() => {
    setHotelSettings((prev) => {
      const next = { ...prev };
      for (const key of Object.keys(next)) {
        next[key] = { ...next[key], selected: false };
      }
      return next;
    });
  }, []);

  const handleSelectByRegion = useCallback(
    (regionId: number) => {
      setHotelSettings((prev) => {
        const next = { ...prev };
        for (const h of hotels) {
          if (h.region === regionId) {
            next[h.name] = {
              ...(next[h.name] ?? {
                name: h.name,
                timeWindowEnabled: false,
                earliestArrival: "08:00",
                latestArrival: "13:00",
                priority: "Normal",
              }),
              selected: true,
            };
          }
        }
        return next;
      });
    },
    [hotels],
  );

  // Handlers for Vehicles
  const handleToggleVehicle = useCallback((id: number) => {
    setVehicles((prev) =>
      prev.map((v) => (v.id === id ? { ...v, enabled: !v.enabled } : v)),
    );
  }, []);

  const handleToggleCapacityLock = useCallback((id: number) => {
    setLockedCapacities((prev) => ({
      ...prev,
      [id]: !prev[id],
    }));
  }, []);

  const handleUpdateVehicleCapacity = useCallback(
    (id: number, nominal: number, maxLoad: number) => {
      setVehicles((prev) =>
        prev.map((v) =>
          v.id === id
            ? {
                ...v,
                nominal_capacity: Math.max(1, nominal),
                max_load: Math.max(1, maxLoad),
              }
            : v,
        ),
      );
    },
    [],
  );

  const handleUpdateVehicleDepot = useCallback((id: number, depotId: string) => {
    setVehicles((prev) =>
      prev.map((v) => (v.id === id ? { ...v, depot_id: depotId } : v)),
    );
  }, []);

  // Handlers for Priority & Windows
  const handleUpdateHotelPriority = useCallback(
    (hotelName: string, priority: HotelPriority) => {
      setHotelSettings((prev) => ({
        ...prev,
        [hotelName]: {
          ...(prev[hotelName] ?? {
            name: hotelName,
            selected: true,
            timeWindowEnabled: false,
            earliestArrival: "08:00",
            latestArrival: "13:00",
            priority: "Normal",
          }),
          priority,
        },
      }));
    },
    [],
  );

  const handleToggleHotelTimeWindow = useCallback((hotelName: string) => {
    setHotelSettings((prev) => {
      const current = prev[hotelName] ?? {
        name: hotelName,
        selected: true,
        timeWindowEnabled: false,
        earliestArrival: "08:00",
        latestArrival: "13:00",
        priority: "Normal",
      };
      return {
        ...prev,
        [hotelName]: {
          ...current,
          timeWindowEnabled: !current.timeWindowEnabled,
        },
      };
    });
  }, []);

  const handleUpdateHotelWindowTimes = useCallback(
    (hotelName: string, earliest: string, latest: string) => {
      setHotelSettings((prev) => ({
        ...prev,
        [hotelName]: {
          ...(prev[hotelName] ?? {
            name: hotelName,
            selected: true,
            timeWindowEnabled: true,
            earliestArrival: "08:00",
            latestArrival: "13:00",
            priority: "Normal",
          }),
          earliestArrival: earliest,
          latestArrival: latest,
        },
      }));
    },
    [],
  );

  // Run Solver Optimization (Calls Google Cloud Route Optimization API)
  const handleRunOptimization = useCallback(async () => {
    setIsSimulating(true);
    setApiNotice(null);

    try {
      // 1. Send configuration to Google Route Optimization API endpoint
      const res = await fetch("/api/optimize", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          hotels,
          hotelSettings,
          vehicles,
          shiftSettings,
          objective,
        }),
      });

      const data = await res.json();

      if (res.ok && data.ok && data.routes && data.routes.length > 0) {
        setSolverProvider("google");
        setSimulationResult({
          routes: data.routes,
          unassignedHotels: data.unassignedHotels || [],
          totalHotelsSelected: data.totalHotelsSelected,
          totalHotelsAssigned: data.totalHotelsAssigned,
          totalBagsDemanded: data.totalBagsDemanded,
          totalFleetCapacity: data.totalFleetCapacity,
          fleetUtilizationPct: data.fleetUtilizationPct,
          isFeasible: data.isFeasible,
          warnings: data.warnings || [],
        });
        setActiveTab("simulate");
        setExpandedRouteId(data.routes[0].route_id ?? data.routes[0].vehicle_label);
        onApplySimulatedRoutes(data.routes, depots);
        return;
      }

      // If Google API returns an error or no routes, fall back to built-in local solver
      const errMsg = data.error || "Google API response not optimal. Used local fallback.";
      setApiNotice(errMsg);

      const localResult = runStudioOptimization({
        hotels,
        hotelSettings,
        vehicles,
        depots,
        shiftSettings,
      });

      setSolverProvider("local");
      setSimulationResult(localResult);
      setActiveTab("simulate");
      if (localResult.routes.length > 0) {
        setExpandedRouteId(
          localResult.routes[0].route_id ?? localResult.routes[0].vehicle_label,
        );
      }
      onApplySimulatedRoutes(localResult.routes, depots);
    } catch (err: any) {
      console.warn("Google API call failed, using local solver:", err);
      setApiNotice(`Network/Google error: ${err.message}. Switched to local fallback.`);

      const localResult = runStudioOptimization({
        hotels,
        hotelSettings,
        vehicles,
        depots,
        shiftSettings,
      });

      setSolverProvider("local");
      setSimulationResult(localResult);
      setActiveTab("simulate");
      if (localResult.routes.length > 0) {
        setExpandedRouteId(
          localResult.routes[0].route_id ?? localResult.routes[0].vehicle_label,
        );
      }
      onApplySimulatedRoutes(localResult.routes, depots);
    } finally {
      setIsSimulating(false);
    }
  }, [
    hotels,
    hotelSettings,
    vehicles,
    depots,
    shiftSettings,
    onApplySimulatedRoutes,
  ]);

  // Export CSV
  const handleDownloadManifest = useCallback(() => {
    const routesToExport = simulationResult ? simulationResult.routes : originalRoutes;
    if (!routesToExport.length) return;

    const headers = [
      "Vehicle",
      "Sector",
      "Nominal Cap",
      "Safe Max Load",
      "Stop #",
      "Type",
      "Stop Name",
      "Arrival",
      "Departure",
      "Service Mins",
      "Bags",
      "Latitude",
      "Longitude",
    ];

    const rows: string[] = [headers.join(",")];
    for (const r of routesToExport) {
      for (const s of r.stops) {
        const isLunch = s.name.includes("Lunch");
        rows.push(
          [
            `"${r.vehicle_label}"`,
            `"${r.region_name}"`,
            r.nominal_cap ?? r.nominal_capacity ?? 40,
            r.max_load ?? r.max_load_90pct ?? 36,
            s.stop_number,
            isLunch ? "Driver Rest" : "Hotel Pickup",
            `"${s.name.replace(/"/g, '""')}"`,
            s.arrival_time,
            s.departure_time,
            s.stop_mins,
            s.load_bags,
            s.lat.toFixed(6),
            s.lon.toFixed(6),
          ].join(","),
        );
      }
    }

    const blob = new Blob([rows.join("\n")], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `custom_studio_dispatch_plan_${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  }, [simulationResult, originalRoutes]);

  return (
    <div className={`studio-panel [display:flex] [flex-direction:column] [height:100%] [min-height:0] [background:var(--paper)] [color:var(--ink)] [font-family:var(--font-dm-sans),_sans-serif]`}>
      {/* 1. Header & Live Indicator */}
      <div className={`studio-header [padding:16px_20px_14px] [border-bottom:1px_solid_var(--line)] [background:var(--paper-strong)] [display:flex] [flex-direction:column] [gap:10px]`}>
        <div className={`studio-header__top [display:flex] [align-items:center] [justify-content:space-between] [gap:12px]`}>
          <div className={`studio-badge [display:inline-flex] [align-items:center] [gap:6px] [padding:4px_10px] [border-radius:6px] [background:rgba(139,_92,_246,_0.12)] [border:1px_solid_rgba(139,_92,_246,_0.28)] [color:#6d28d9] [font-size:11px] [font-weight:700] [letter-spacing:0.02em] [text-transform:uppercase]`}>
            <Sparkles size={13} className={`studio-badge__icon [color:#7c3aed]`} />
            <span>Optimizer Studio</span>
          </div>
          <button
            type="button"
            className={`studio-btn [display:inline-flex] [align-items:center] [gap:6px] [height:32px] [padding:0_14px] [border-radius:8px] [font-size:11.5px] [font-weight:600] [cursor:pointer] [transition:all_0.15s_ease] [border:1px_solid_transparent] studio-btn--primary [background:#15803d] [color:#ffffff] [box-shadow:0_1px_3px_rgba(21,_128,_61,_0.35)] [&:hover:not(:disabled)]:[background:#166534] [&:hover:not(:disabled)]:[transform:translateY(-0.5px)] disabled:[opacity:0.5] disabled:[cursor:not-allowed]`}
            onClick={handleRunOptimization}
            disabled={isSimulating || activeVehiclesCount === 0 || selectedHotelsCount === 0}
          >
            <Zap size={14} />
            <span>{isSimulating ? "Optimizing with Google Cloud..." : "Run Optimization (Google Cloud)"}</span>
          </button>
        </div>

        <p className={`studio-header__sub [font-size:11.5px] [color:var(--muted)] [line-height:1.4] [margin:0]`}>
          Manual constraint solver with hotel multi-select, 10-van capacity locking, Yeshwanthpur Central Laundry (HQ) fleet base, shift & lunch windows, and priority SLA rules.
        </p>

        {/* Live KPI Metric Chips */}
        <div className={`studio-kpi-bar [display:grid] [grid-template-columns:repeat(4,_1fr)] [gap:8px] [margin-top:2px]`}>
          <div className={`studio-kpi [display:flex] [flex-direction:column] [gap:2px] [padding:8px_10px] [border-radius:8px] [background:var(--bone)] [border:1px_solid_var(--line)]`}>
            <span className={`studio-kpi__label [font-size:9.5px] [font-weight:600] [color:var(--faint)] [text-transform:uppercase] [letter-spacing:0.04em]`}>Hotels</span>
            <span className={`studio-kpi__val [font-size:12px] [color:var(--ink)] [&_b]:[font-weight:700]`}>
              <b>{selectedHotelsCount}</b> / {hotels.length}
            </span>
          </div>
          <div className={`studio-kpi [display:flex] [flex-direction:column] [gap:2px] [padding:8px_10px] [border-radius:8px] [background:var(--bone)] [border:1px_solid_var(--line)]`}>
            <span className={`studio-kpi__label [font-size:9.5px] [font-weight:600] [color:var(--faint)] [text-transform:uppercase] [letter-spacing:0.04em]`}>Demand</span>
            <span className={`studio-kpi__val [font-size:12px] [color:var(--ink)] [&_b]:[font-weight:700]`}>
              <b>{totalDemandBags}</b> bags
            </span>
          </div>
          <div className={`studio-kpi [display:flex] [flex-direction:column] [gap:2px] [padding:8px_10px] [border-radius:8px] [background:var(--bone)] [border:1px_solid_var(--line)]`}>
            <span className={`studio-kpi__label [font-size:9.5px] [font-weight:600] [color:var(--faint)] [text-transform:uppercase] [letter-spacing:0.04em]`}>Fleet Vans</span>
            <span className={`studio-kpi__val [font-size:12px] [color:var(--ink)] [&_b]:[font-weight:700]`}>
              <b>{activeVehiclesCount}</b> / 10 active
            </span>
          </div>
          <div className={`studio-kpi [display:flex] [flex-direction:column] [gap:2px] [padding:8px_10px] [border-radius:8px] [background:var(--bone)] [border:1px_solid_var(--line)]`}>
            <span className={`studio-kpi__label [font-size:9.5px] [font-weight:600] [color:var(--faint)] [text-transform:uppercase] [letter-spacing:0.04em]`}>Capacity</span>
            <span
              className={`studio-kpi__val [font-size:12px] [color:var(--ink)] [&_b]:[font-weight:700] ${
                totalDemandBags > totalSafeCapacity ? `studio-kpi__val--alert [color:#dc2626]` : ""
              }`}
            >
              <b>{totalSafeCapacity}</b> safe limit
            </span>
          </div>
        </div>
      </div>

      {/* 2. Stepper / Tabs Bar */}
      <nav className={`studio-tabs [display:flex] [align-items:center] [gap:4px] [padding:6px_16px] [background:var(--bone)] [border-bottom:1px_solid_var(--line)] [overflow-x:auto] [scrollbar-width:none] [&::-webkit-scrollbar]:[display:none]`} aria-label="Optimizer Studio sections">
        <button
          type="button"
          className={`studio-tab [display:inline-flex] [align-items:center] [gap:6px] [padding:6px_11px] [border-radius:6px] [border:1px_solid_transparent] [background:transparent] [color:var(--muted)] [font-size:11.5px] [font-weight:600] [white-space:nowrap] [cursor:pointer] [transition:all_0.15s_ease] hover:[color:var(--ink)] hover:[background:rgba(0,_0,_0,_0.03)] ${activeTab === "hotels" ? `studio-tab--active [background:var(--paper-strong)] [color:var(--ink)] [border-color:var(--line-strong)] [box-shadow:0_1px_3px_rgba(24,_36,_30,_0.08)]` : ""}`}
          onClick={() => setActiveTab("hotels")}
        >
          <Building2 size={13} />
          <span>1. Hotels</span>
          <span className={`studio-tab__badge [padding:1px_6px] [border-radius:10px] [background:var(--bone-strong)] [font-size:9.5px] [font-weight:700] [color:var(--muted)]`}>{selectedHotelsCount}</span>
        </button>

        <button
          type="button"
          className={`studio-tab [display:inline-flex] [align-items:center] [gap:6px] [padding:6px_11px] [border-radius:6px] [border:1px_solid_transparent] [background:transparent] [color:var(--muted)] [font-size:11.5px] [font-weight:600] [white-space:nowrap] [cursor:pointer] [transition:all_0.15s_ease] hover:[color:var(--ink)] hover:[background:rgba(0,_0,_0,_0.03)] ${activeTab === "fleet" ? `studio-tab--active [background:var(--paper-strong)] [color:var(--ink)] [border-color:var(--line-strong)] [box-shadow:0_1px_3px_rgba(24,_36,_30,_0.08)]` : ""}`}
          onClick={() => setActiveTab("fleet")}
        >
          <Truck size={13} />
          <span>2. Fleet (10 Vans)</span>
          <span className={`studio-tab__badge [padding:1px_6px] [border-radius:10px] [background:var(--bone-strong)] [font-size:9.5px] [font-weight:700] [color:var(--muted)]`}>{activeVehiclesCount}</span>
        </button>

        <button
          type="button"
          className={`studio-tab [display:inline-flex] [align-items:center] [gap:6px] [padding:6px_11px] [border-radius:6px] [border:1px_solid_transparent] [background:transparent] [color:var(--muted)] [font-size:11.5px] [font-weight:600] [white-space:nowrap] [cursor:pointer] [transition:all_0.15s_ease] hover:[color:var(--ink)] hover:[background:rgba(0,_0,_0,_0.03)] ${activeTab === "shifts" ? `studio-tab--active [background:var(--paper-strong)] [color:var(--ink)] [border-color:var(--line-strong)] [box-shadow:0_1px_3px_rgba(24,_36,_30,_0.08)]` : ""}`}
          onClick={() => setActiveTab("shifts")}
        >
          <Clock size={13} />
          <span>3. Shifts & Lunch</span>
        </button>

        <button
          type="button"
          className={`studio-tab [display:inline-flex] [align-items:center] [gap:6px] [padding:6px_11px] [border-radius:6px] [border:1px_solid_transparent] [background:transparent] [color:var(--muted)] [font-size:11.5px] [font-weight:600] [white-space:nowrap] [cursor:pointer] [transition:all_0.15s_ease] hover:[color:var(--ink)] hover:[background:rgba(0,_0,_0,_0.03)] ${activeTab === "windows" ? `studio-tab--active [background:var(--paper-strong)] [color:var(--ink)] [border-color:var(--line-strong)] [box-shadow:0_1px_3px_rgba(24,_36,_30,_0.08)]` : ""}`}
          onClick={() => setActiveTab("windows")}
        >
          <Sliders size={13} />
          <span>4. SLA Windows</span>
        </button>

        <button
          type="button"
          className={`studio-tab [display:inline-flex] [align-items:center] [gap:6px] [padding:6px_11px] [border-radius:6px] [border:1px_solid_transparent] [background:transparent] [color:var(--muted)] [font-size:11.5px] [font-weight:600] [white-space:nowrap] [cursor:pointer] [transition:all_0.15s_ease] hover:[color:var(--ink)] hover:[background:rgba(0,_0,_0,_0.03)] studio-tab--simulate [&.studio-tab--active]:[border-color:rgba(16,_185,_129,_0.4)] [&.studio-tab--active]:[background:#f0fdf4] [&.studio-tab--active]:[color:#15803d] ${
            activeTab === "simulate" ? `studio-tab--active [background:var(--paper-strong)] [color:var(--ink)] [border-color:var(--line-strong)] [box-shadow:0_1px_3px_rgba(24,_36,_30,_0.08)]` : ""
          }`}
          onClick={() => setActiveTab("simulate")}
        >
          <Zap size={13} />
          <span>5. Results</span>
          {simulationResult && (
            <span className={`studio-tab__badge [padding:1px_6px] [border-radius:10px] [background:var(--bone-strong)] [font-size:9.5px] [font-weight:700] [color:var(--muted)] studio-tab__badge--success [background:#dcfce7] [color:#15803d]`}>
              {simulationResult.routes.length} routes
            </span>
          )}
        </button>
      </nav>

      {/* 3. Tab Contents */}
      <div className={`studio-content [flex:1_1_0%] [min-height:0] [overflow-y:auto] [padding:16px_20px]`}>
        {/* TAB 1: HOTELS SELECTION */}
        {activeTab === "hotels" && (
          <div className={`studio-section [display:flex] [flex-direction:column] [gap:14px]`}>
            <div className={`studio-section__header [display:flex] [align-items:flex-start] [justify-content:space-between] [gap:12px]`}>
              <div>
                <h3 className={`studio-section__title [font-size:15px] [font-weight:700] [color:var(--ink)] [margin:0]`}>Hotel Selection</h3>
                <p className={`studio-section__desc [font-size:11.5px] [color:var(--muted)] [margin:3px_0_0] [line-height:1.35]`}>
                  Select customer hotels to include in the dispatch run. Filter by region or search by name.
                </p>
              </div>
              <div className={`studio-actions-group [display:flex] [align-items:center] [gap:6px] [flex-shrink:0]`}>
                <button
                  type="button"
                  className={`studio-btn-tiny [padding:3px_9px] [border-radius:5px] [border:1px_solid_var(--line)] [background:var(--paper-strong)] [color:var(--ink)] [font-size:10.5px] [font-weight:600] [cursor:pointer] [transition:all_0.12s_ease] hover:[background:var(--bone)] hover:[border-color:var(--line-strong)]`}
                  onClick={handleSelectAllHotels}
                >
                  Select all 100
                </button>
                <button
                  type="button"
                  className={`studio-btn-tiny [padding:3px_9px] [border-radius:5px] [border:1px_solid_var(--line)] [background:var(--paper-strong)] [color:var(--ink)] [font-size:10.5px] [font-weight:600] [cursor:pointer] [transition:all_0.12s_ease] hover:[background:var(--bone)] hover:[border-color:var(--line-strong)]`}
                  onClick={handleDeselectAllHotels}
                >
                  Clear all
                </button>
              </div>
            </div>

            {/* Filter & Search Bar */}
            <div className={`studio-filter-bar [display:flex] [flex-direction:column] [gap:8px]`}>
              <div className={`studio-search-wrap [position:relative] [width:100%]`}>
                <Search size={13} className={`studio-search-icon [position:absolute] [left:11px] [top:50%] [transform:translateY(-50%)] [color:var(--faint)] [pointer-events:none]`} />
                <input
                  type="text"
                  placeholder="Filter hotels or localities..."
                  value={hotelQuery}
                  onChange={(e) => setHotelQuery(e.target.value)}
                  className={`studio-search-input [width:100%] [height:32px] [padding:0_30px_0_32px] [border-radius:8px] [border:1px_solid_var(--line)] [background:var(--paper-strong)] [color:var(--ink)] [font-size:11.5px] [outline:none] [transition:border-color_0.15s_ease] focus:[border-color:var(--ink)]`}
                />
                {hotelQuery && (
                  <button
                    type="button"
                    onClick={() => setHotelQuery("")}
                    className={`studio-search-clear [position:absolute] [right:9px] [top:50%] [transform:translateY(-50%)] [background:transparent] [border:none] [color:var(--faint)] [cursor:pointer]`}
                  >
                    <X size={12} />
                  </button>
                )}
              </div>

              <div className={`studio-region-pills [display:flex] [align-items:center] [gap:5px] [flex-wrap:wrap]`}>
                <button
                  type="button"
                  className={`studio-pill [padding:3px_9px] [border-radius:6px] [border:1px_solid_var(--line)] [background:var(--paper-strong)] [color:var(--muted)] [font-size:10.5px] [font-weight:600] [cursor:pointer] [transition:all_0.12s_ease] hover:[color:var(--ink)] hover:[border-color:var(--line-strong)] ${
                    hotelRegionFilter === "all" ? `studio-pill--active [background:var(--ink)] [color:var(--cream)] [border-color:var(--ink)]` : ""
                  }`}
                  onClick={() => setHotelRegionFilter("all")}
                >
                  All ({hotels.length})
                </button>
                {regions.map((r) => (
                  <button
                    key={r.id}
                    type="button"
                    className={`studio-pill [padding:3px_9px] [border-radius:6px] [border:1px_solid_var(--line)] [background:var(--paper-strong)] [color:var(--muted)] [font-size:10.5px] [font-weight:600] [cursor:pointer] [transition:all_0.12s_ease] hover:[color:var(--ink)] hover:[border-color:var(--line-strong)] ${
                      hotelRegionFilter === r.id ? `studio-pill--active [background:var(--ink)] [color:var(--cream)] [border-color:var(--ink)]` : ""
                    }`}
                    style={{ "--c": r.color } as React.CSSProperties}
                    onClick={() => setHotelRegionFilter(r.id)}
                  >
                    R{r.id} {r.name.split("/")[0].trim()}
                  </button>
                ))}
              </div>
            </div>

            {/* Quick Region Presets */}
            <div className={`studio-presets [display:flex] [align-items:center] [gap:6px] [font-size:11px]`}>
              <span className={`studio-presets__label [color:var(--faint)] [font-weight:600]`}>Quick select:</span>
              <button
                type="button"
                className={`studio-preset-chip [padding:2px_7px] [border-radius:4px] [border:1px_dashed_var(--line-strong)] [background:transparent] [color:var(--muted)] [font-size:10.5px] [cursor:pointer] hover:[background:var(--bone)] hover:[color:var(--ink)]`}
                onClick={() => handleSelectByRegion(1)}
              >
                + R1 Central ({hotels.filter((h) => h.region === 1).length})
              </button>
              <button
                type="button"
                className={`studio-preset-chip [padding:2px_7px] [border-radius:4px] [border:1px_dashed_var(--line-strong)] [background:transparent] [color:var(--muted)] [font-size:10.5px] [cursor:pointer] hover:[background:var(--bone)] hover:[color:var(--ink)]`}
                onClick={() => handleSelectByRegion(0)}
              >
                + R0 South-East ({hotels.filter((h) => h.region === 0).length})
              </button>
              <button
                type="button"
                className={`studio-preset-chip [padding:2px_7px] [border-radius:4px] [border:1px_dashed_var(--line-strong)] [background:transparent] [color:var(--muted)] [font-size:10.5px] [cursor:pointer] hover:[background:var(--bone)] hover:[color:var(--ink)]`}
                onClick={() => handleSelectByRegion(3)}
              >
                + R3 East ({hotels.filter((h) => h.region === 3).length})
              </button>
            </div>

            {/* Hotels Checklist */}
            <div className={`studio-hotels-list [display:flex] [flex-direction:column] [gap:6px] [max-height:480px] [overflow-y:auto] [padding-right:4px]`}>
              {filteredHotels.length === 0 ? (
                <div className="studio-empty">No hotels match this query.</div>
              ) : (
                filteredHotels.map((hotel) => {
                  const setting = hotelSettings[hotel.name] ?? {
                    name: hotel.name,
                    selected: true,
                    priority: "Normal",
                  };
                  const region = regions.find((r) => r.id === hotel.region);
                  const isSelected = setting.selected;

                  return (
                    <div
                      key={hotel.name}
                      className={`studio-hotel-card [display:flex] [align-items:center] [gap:10px] [padding:8px_12px] [border-radius:8px] [border:1px_solid_var(--line)] [background:var(--paper-strong)] [transition:all_0.12s_ease] hover:[border-color:var(--line-strong)] hover:[background:var(--bone)] ${
                        isSelected ? `studio-hotel-card--selected [border-color:rgba(24,_36,_30,_0.25)] [background:var(--paper-strong)]` : ""
                      }`}
                    >
                      <label className={`studio-hotel-card__check [display:flex] [align-items:center] [cursor:pointer] [&_input]:[display:none]`}>
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => handleToggleHotel(hotel.name)}
                        />
                        <span className={`studio-checkbox-custom [width:17px] [height:17px] [border-radius:4px] [border:1.5px_solid_var(--line-strong)] [background:var(--paper)] [display:flex] [align-items:center] [justify-content:center] [color:#ffffff] [transition:all_0.12s_ease] [.studio-hotel-card__check_input:checked_+_&]:[background:var(--ink)] [.studio-hotel-card__check_input:checked_+_&]:[border-color:var(--ink)] [.studio-vehicle-card__toggle_input:checked_+_&]:[background:var(--ink)] [.studio-vehicle-card__toggle_input:checked_+_&]:[border-color:var(--ink)]`}>
                          {isSelected && <Check size={12} />}
                        </span>
                      </label>

                      <div className={`studio-hotel-card__info [flex:1] [min-width:0] [display:flex] [flex-direction:column] [gap:2px]`}>
                        <div className={`studio-hotel-card__title-row [display:flex] [align-items:center] [justify-content:space-between] [gap:8px]`}>
                          <span className={`studio-hotel-card__name [font-size:12px] [font-weight:700] [color:var(--ink)] [white-space:nowrap] [overflow:hidden] [text-overflow:ellipsis]`}>
                            {hotel.name}
                          </span>
                          <span
                            className={`studio-region-badge [font-size:9.5px] [font-weight:700] [padding:1px_5px] [border-radius:4px] [border:1px_solid] [letter-spacing:0.02em]`}
                            style={{
                              backgroundColor: `${region?.color}22`,
                              color: region?.color,
                              borderColor: `${region?.color}55`,
                            }}
                          >
                            R{hotel.region}
                          </span>
                        </div>
                        <div className={`studio-hotel-card__sub [font-size:10.5px] [color:var(--muted)] [display:flex] [align-items:center] [gap:5px]`}>
                          <span>{hotel.locality ?? `Region ${hotel.region}`}</span>
                          <span className={`studio-dot-sep [color:var(--faint)]`}>·</span>
                          <span className={`studio-bag-tag [color:#0284c7] [font-weight:600]`}>
                            🧺 {setting.customBags ?? hotel.load ?? 3} bags
                          </span>
                          {setting.priority !== "Normal" && (
                            <>
                              <span className={`studio-dot-sep [color:var(--faint)]`}>·</span>
                              <span
                                className={`studio-priority-pill [font-size:9px] [font-weight:800] [padding:1px_5px] [border-radius:3px] [text-transform:uppercase] [letter-spacing:0.04em] studio-priority-pill--${setting.priority.toLowerCase()}`}
                              >
                                {setting.priority}
                              </span>
                            </>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        )}

        {/* TAB 2: FLEET & VEHICLE CAPACITY & DEPOT ASSIGNMENTS */}
        {activeTab === "fleet" && (
          <div className={`studio-section [display:flex] [flex-direction:column] [gap:14px]`}>
            <div className={`studio-section__header [display:flex] [align-items:flex-start] [justify-content:space-between] [gap:12px]`}>
              <div>
                <h3 className={`studio-section__title [font-size:15px] [font-weight:700] [color:var(--ink)] [margin:0]`}>Fleet & Vehicle Capacity</h3>
                <p className={`studio-section__desc [font-size:11.5px] [color:var(--muted)] [margin:3px_0_0] [line-height:1.35]`}>
                  Toggle active vehicles and lock customized capacity buffers. All routes operate out of LinenGrass HQ (Yeshwanthpur Central Laundry).
                </p>
              </div>
              <div className={`studio-actions-group [display:flex] [align-items:center] [gap:6px] [flex-shrink:0]`}>
                <button
                  type="button"
                  className={`studio-btn-tiny [padding:3px_9px] [border-radius:5px] [border:1px_solid_var(--line)] [background:var(--paper-strong)] [color:var(--ink)] [font-size:10.5px] [font-weight:600] [cursor:pointer] [transition:all_0.12s_ease] hover:[background:var(--bone)] hover:[border-color:var(--line-strong)]`}
                  onClick={() =>
                    setVehicles((prev) => prev.map((v) => ({ ...v, enabled: true })))
                  }
                >
                  Enable all 10
                </button>
              </div>
            </div>

            <div className={`studio-vehicles-grid [display:flex] [flex-direction:column] [gap:10px]`}>
              {vehicles.map((v) => {
                const isLocked = !!lockedCapacities[v.id];

                return (
                  <div
                    key={v.id}
                    className={`studio-vehicle-card [border-radius:9px] [border:1px_solid_var(--line)] [background:var(--paper-strong)] [overflow:hidden] [transition:all_0.15s_ease] ${
                      v.enabled ? `studio-vehicle-card--active [border-left:4px_solid_var(--van-color,_var(--ink))]` : `studio-vehicle-card--disabled [opacity:0.6] [background:var(--bone)] [border-left:4px_solid_var(--faint)]`
                    }`}
                    style={{ "--van-color": v.color } as React.CSSProperties}
                  >
                    <div className={`studio-vehicle-card__top [display:flex] [align-items:center] [justify-content:space-between] [padding:10px_14px] [border-bottom:1px_solid_var(--line)] [background:rgba(0,_0,_0,_0.015)]`}>
                      <label className={`studio-vehicle-card__toggle [display:flex] [align-items:center] [gap:9px] [cursor:pointer] [&_input]:[display:none]`}>
                        <input
                          type="checkbox"
                          checked={v.enabled}
                          onChange={() => handleToggleVehicle(v.id)}
                        />
                        <span className={`studio-checkbox-custom [width:17px] [height:17px] [border-radius:4px] [border:1.5px_solid_var(--line-strong)] [background:var(--paper)] [display:flex] [align-items:center] [justify-content:center] [color:#ffffff] [transition:all_0.12s_ease] [.studio-hotel-card__check_input:checked_+_&]:[background:var(--ink)] [.studio-hotel-card__check_input:checked_+_&]:[border-color:var(--ink)] [.studio-vehicle-card__toggle_input:checked_+_&]:[background:var(--ink)] [.studio-vehicle-card__toggle_input:checked_+_&]:[border-color:var(--ink)]`}>
                          {v.enabled && <Check size={12} />}
                        </span>
                        <span className={`studio-van-label [display:flex] [align-items:center] [gap:7px] [font-size:13px] [color:var(--ink)]`}>
                          <span
                            className={`studio-van-color-dot [width:9px] [height:9px] [border-radius:50%] [flex-shrink:0]`}
                            style={{ background: v.color }}
                          />
                          <b>{v.label}</b>
                        </span>
                      </label>

                      <span className={`studio-van-sector [font-size:11px] [font-weight:600] [color:var(--muted)]`}>
                        R{v.region_id} · {v.sector}
                      </span>
                    </div>

                    {v.enabled && (
                      <div className={`studio-vehicle-card__body [padding:12px_14px] [display:flex] [flex-direction:column] [gap:12px]`}>
                        {/* Single Unified HQ Depot Indicator */}
                        <div className={`studio-form-row [display:flex] [flex-direction:column] [gap:4px]`}>
                          <label className={`studio-field-label [display:flex] [align-items:center] [gap:5px] [font-size:10.5px] [font-weight:700] [color:var(--muted)] [text-transform:uppercase] [letter-spacing:0.03em]`}>
                            <MapPin size={11} />
                            <span>Origin & Return Depot</span>
                          </label>
                          <div className={`studio-depot-fixed-badge [display:flex] [align-items:center] [justify-content:space-between] [gap:8px] [height:32px] [padding:0_10px] [border-radius:6px] [border:1px_solid_var(--line)] [background:var(--bone)] [color:var(--ink)] [font-size:11px] [font-weight:600]`}>
                            <span className={`studio-depot-fixed-dot [width:7px] [height:7px] [border-radius:50%] [background:#18241e] [border:1px_solid_#fbbf24] [flex-shrink:0]`} />
                            <span className={`studio-depot-fixed-text [flex:1] [white-space:nowrap] [overflow:hidden] [text-overflow:ellipsis]`}>
                              LinenGrass HQ (Yeshwanthpur Central Laundry)
                            </span>
                            <span className={`studio-depot-hq-tag [font-size:8.5px] [font-weight:800] [padding:1px_5px] [border-radius:3px] [background:#18241e] [color:#fbbf24] [letter-spacing:0.05em] [text-transform:uppercase]`}>Unified HQ</span>
                          </div>
                        </div>

                        {/* Capacity and 90% Safe Max Load Override */}
                        <div className={`studio-capacity-controls [display:grid] [grid-template-columns:1fr_1fr] [gap:12px]`}>
                          <div className={`studio-cap-input-wrap [display:flex] [flex-direction:column] [gap:4px]`}>
                            <span className={`studio-cap-label [font-size:10px] [font-weight:600] [color:var(--faint)]`}>Nominal Cap</span>
                            <div className={`studio-cap-input-group [display:flex] [align-items:center] [height:32px] [border-radius:6px] [border:1px_solid_var(--line)] [background:var(--paper)] [overflow:hidden] [padding:0_8px]`}>
                              <input
                                type="number"
                                min={10}
                                max={100}
                                value={v.nominal_capacity}
                                onChange={(e) => {
                                  const nom = Number(e.target.value) || 20;
                                  const safe = Math.round(nom * 0.9);
                                  handleUpdateVehicleCapacity(v.id, nom, safe);
                                }}
                                className={`studio-num-input [width:100%] [border:none] [background:transparent] [font-size:12px] [font-weight:700] [color:var(--ink)] [outline:none]`}
                              />
                              <span className={`studio-unit [font-size:10px] [font-weight:600] [color:var(--faint)] [margin-left:4px]`}>bags</span>
                            </div>
                          </div>

                          <div className={`studio-cap-input-wrap [display:flex] [flex-direction:column] [gap:4px]`}>
                            <div className={`studio-cap-label-with-lock [display:flex] [align-items:center] [justify-content:space-between] [font-size:10px] [font-weight:600] [color:var(--faint)]`}>
                              <span>Safe Max Load (90%)</span>
                              <button
                                type="button"
                                className={`studio-lock-btn [background:transparent] [border:none] [color:var(--faint)] [cursor:pointer] [padding:1px] ${
                                  isLocked ? `studio-lock-btn--locked [color:#d97706]` : ""
                                }`}
                                title={
                                  isLocked
                                    ? "Capacity is locked manually"
                                    : "Auto-computed at 90% buffer. Click to lock custom value."
                                }
                                onClick={() => handleToggleCapacityLock(v.id)}
                              >
                                {isLocked ? <Lock size={11} /> : <Unlock size={11} />}
                              </button>
                            </div>
                            <div className={`studio-cap-input-group [display:flex] [align-items:center] [height:32px] [border-radius:6px] [border:1px_solid_var(--line)] [background:var(--paper)] [overflow:hidden] [padding:0_8px]`}>
                              <input
                                type="number"
                                min={5}
                                max={100}
                                value={v.max_load}
                                onChange={(e) => {
                                  const val = Number(e.target.value) || 10;
                                  handleUpdateVehicleCapacity(
                                    v.id,
                                    v.nominal_capacity,
                                    val,
                                  );
                                  setLockedCapacities((prev) => ({
                                    ...prev,
                                    [v.id]: true,
                                  }));
                                }}
                                className={`studio-num-input [width:100%] [border:none] [background:transparent] [font-size:12px] [font-weight:700] [color:var(--ink)] [outline:none] studio-num-input--safe [color:#0284c7]`}
                              />
                              <span className={`studio-unit [font-size:10px] [font-weight:600] [color:var(--faint)] [margin-left:4px]`}>limit</span>
                            </div>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* TAB 3: SHIFT WINDOWS & DRIVER LUNCH BREAK */}
        {activeTab === "shifts" && (
          <div className={`studio-section [display:flex] [flex-direction:column] [gap:14px]`}>
            <div className={`studio-section__header [display:flex] [align-items:flex-start] [justify-content:space-between] [gap:12px]`}>
              <div>
                <h3 className={`studio-section__title [font-size:15px] [font-weight:700] [color:var(--ink)] [margin:0]`}>Shift Limits & Rest Windows</h3>
                <p className={`studio-section__desc [font-size:11.5px] [color:var(--muted)] [margin:3px_0_0] [line-height:1.35]`}>
                  Define driver duty shift hours and enforce mandatory midday lunch rest intervals.
                </p>
              </div>
            </div>

            {/* Shift Window Config */}
            <div className={`studio-card-group [display:flex] [flex-direction:column] [gap:14px]`}>
              <div className={`studio-config-card [padding:16px] [border-radius:9px] [border:1px_solid_var(--line)] [background:var(--paper-strong)] [display:flex] [flex-direction:column] [gap:14px]`}>
                <div className={`studio-config-card__header [display:flex] [align-items:flex-start] [gap:10px]`}>
                  <Clock size={16} className={`studio-icon-ink [color:var(--ink)] [margin-top:2px]`} />
                  <div>
                    <h4 className={`studio-config-card__title [font-size:13.5px] [font-weight:700] [color:var(--ink)] [margin:0]`}>Fleet Shift Timing</h4>
                    <p className={`studio-config-card__desc [font-size:11px] [color:var(--muted)] [margin:2px_0_0] [line-height:1.35]`}>
                      Earliest warehouse departure time and latest return cutoff back to assigned depot.
                    </p>
                  </div>
                </div>

                <div className={`studio-timing-grid [display:grid] [grid-template-columns:1fr_1fr] [gap:12px]`}>
                  <div className={`studio-time-block [display:flex] [flex-direction:column] [gap:5px]`}>
                    <label className={`studio-field-label [display:flex] [align-items:center] [gap:5px] [font-size:10.5px] [font-weight:700] [color:var(--muted)] [text-transform:uppercase] [letter-spacing:0.03em]`}>Earliest Departure (HQ/Depot)</label>
                    <input
                      type="time"
                      value={shiftSettings.earliestDeparture}
                      onChange={(e) =>
                        setShiftSettings((prev) => ({
                          ...prev,
                          earliestDeparture: e.target.value,
                        }))
                      }
                      className={`studio-time-input [height:32px] [padding:0_10px] [border-radius:6px] [border:1px_solid_var(--line)] [background:var(--paper)] [color:var(--ink)] [font-size:12px] [font-weight:600] [outline:none]`}
                    />
                    <div className={`studio-time-presets [display:flex] [align-items:center] [gap:4px] [flex-wrap:wrap]`}>
                      {["06:30", "07:00", "07:30", "08:00"].map((t) => (
                        <button
                          key={t}
                          type="button"
                          className={`studio-btn-micro [padding:2px_7px] [border-radius:4px] [border:1px_solid_var(--line)] [background:var(--paper-strong)] [color:var(--muted)] [font-size:10px] [font-weight:600] [cursor:pointer] hover:[color:var(--ink)] hover:[background:var(--bone)]`}
                          onClick={() =>
                            setShiftSettings((prev) => ({
                              ...prev,
                              earliestDeparture: t,
                            }))
                          }
                        >
                          {t}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className={`studio-time-block [display:flex] [flex-direction:column] [gap:5px]`}>
                    <label className={`studio-field-label [display:flex] [align-items:center] [gap:5px] [font-size:10.5px] [font-weight:700] [color:var(--muted)] [text-transform:uppercase] [letter-spacing:0.03em]`}>Latest Shift Return Cutoff</label>
                    <input
                      type="time"
                      value={shiftSettings.latestReturn}
                      onChange={(e) =>
                        setShiftSettings((prev) => ({
                          ...prev,
                          latestReturn: e.target.value,
                        }))
                      }
                      className={`studio-time-input [height:32px] [padding:0_10px] [border-radius:6px] [border:1px_solid_var(--line)] [background:var(--paper)] [color:var(--ink)] [font-size:12px] [font-weight:600] [outline:none]`}
                    />
                    <div className={`studio-time-presets [display:flex] [align-items:center] [gap:4px] [flex-wrap:wrap]`}>
                      {["16:00", "17:00", "18:00", "19:00"].map((t) => (
                        <button
                          key={t}
                          type="button"
                          className={`studio-btn-micro [padding:2px_7px] [border-radius:4px] [border:1px_solid_var(--line)] [background:var(--paper-strong)] [color:var(--muted)] [font-size:10px] [font-weight:600] [cursor:pointer] hover:[color:var(--ink)] hover:[background:var(--bone)]`}
                          onClick={() =>
                            setShiftSettings((prev) => ({
                              ...prev,
                              latestReturn: t,
                            }))
                          }
                        >
                          {t}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              </div>

              {/* Lunch Break Config */}
              <div className={`studio-config-card [padding:16px] [border-radius:9px] [border:1px_solid_var(--line)] [background:var(--paper-strong)] [display:flex] [flex-direction:column] [gap:14px]`}>
                <div className={`studio-config-card__header [display:flex] [align-items:flex-start] [gap:10px]`}>
                  <Utensils size={16} className={`studio-icon-lunch [color:#d97706] [margin-top:2px]`} />
                  <div>
                    <h4 className={`studio-config-card__title [font-size:13.5px] [font-weight:700] [color:var(--ink)] [margin:0]`}>
                      Driver Lunch Break & Rest SLA
                    </h4>
                    <p className={`studio-config-card__desc [font-size:11px] [color:var(--muted)] [margin:2px_0_0] [line-height:1.35]`}>
                      Mandatory rest pause automatically inserted into the driver manifest when reaching the midday lunch window.
                    </p>
                  </div>
                </div>

                <div className={`studio-lunch-toggle-row [display:flex] [align-items:center] [gap:10px] [padding:8px_12px] [border-radius:7px] [background:var(--bone)] [border:1px_solid_var(--line)]`}>
                  <label className={`studio-toggle-switch [position:relative] [display:inline-block] [width:34px] [height:19px] [flex-shrink:0] [&_input]:[opacity:0] [&_input]:[width:0] [&_input]:[height:0]`}>
                    <input
                      type="checkbox"
                      checked={shiftSettings.lunchBreakEnabled}
                      onChange={(e) =>
                        setShiftSettings((prev) => ({
                          ...prev,
                          lunchBreakEnabled: e.target.checked,
                        }))
                      }
                    />
                    <span className={`studio-toggle-slider [position:absolute] [cursor:pointer] [top:0] [left:0] [right:0] [bottom:0] [background-color:var(--line-strong)] [transition:0.2s] [border-radius:20px] [&:before]:[position:absolute] [&:before]:[content:""] [&:before]:[height:13px] [&:before]:[width:13px] [&:before]:[left:3px] [&:before]:[bottom:3px] [&:before]:[background-color:white] [&:before]:[transition:0.2s] [&:before]:[border-radius:50%] [.studio-toggle-switch_input:checked_+_&]:[background-color:#15803d] [.studio-toggle-switch_input:checked_+_&]:[&:before]:[transform:translateX(15px)]`} />
                  </label>
                  <span className={`studio-toggle-text [font-size:11.5px] [color:var(--ink)]`}>
                    <b>Enforce mandatory driver lunch stop on all active routes</b>
                  </span>
                </div>

                {shiftSettings.lunchBreakEnabled && (
                  <div className={`studio-lunch-options [display:flex] [flex-direction:column] [gap:12px] [padding-left:6px]`}>
                    <div className={`studio-form-row [display:flex] [flex-direction:column] [gap:4px]`}>
                      <label className={`studio-field-label [display:flex] [align-items:center] [gap:5px] [font-size:10.5px] [font-weight:700] [color:var(--muted)] [text-transform:uppercase] [letter-spacing:0.03em]`}>Break Duration</label>
                      <div className={`studio-duration-btns [display:flex] [align-items:center] [gap:6px]`}>
                        {[30, 45, 60].map((mins) => (
                          <button
                            key={mins}
                            type="button"
                            className={`studio-duration-btn [padding:5px_12px] [border-radius:6px] [border:1px_solid_var(--line)] [background:var(--paper)] [color:var(--muted)] [font-size:11px] [font-weight:600] [cursor:pointer] ${
                              shiftSettings.lunchDurationMins === mins
                                ? `studio-duration-btn--active [background:var(--ink)] [color:var(--cream)] [border-color:var(--ink)]`
                                : ""
                            }`}
                            onClick={() =>
                              setShiftSettings((prev) => ({
                                ...prev,
                                lunchDurationMins: mins,
                              }))
                            }
                          >
                            {mins} mins
                          </button>
                        ))}
                      </div>
                    </div>

                    <div className={`studio-timing-grid [display:grid] [grid-template-columns:1fr_1fr] [gap:12px] studio-timing-grid--compact [margin-top:6px]`}>
                      <div className={`studio-time-block [display:flex] [flex-direction:column] [gap:5px]`}>
                        <label className={`studio-field-label [display:flex] [align-items:center] [gap:5px] [font-size:10.5px] [font-weight:700] [color:var(--muted)] [text-transform:uppercase] [letter-spacing:0.03em]`}>Lunch Window Start</label>
                        <input
                          type="time"
                          value={shiftSettings.lunchWindowStart}
                          onChange={(e) =>
                            setShiftSettings((prev) => ({
                              ...prev,
                              lunchWindowStart: e.target.value,
                            }))
                          }
                          className={`studio-time-input [height:32px] [padding:0_10px] [border-radius:6px] [border:1px_solid_var(--line)] [background:var(--paper)] [color:var(--ink)] [font-size:12px] [font-weight:600] [outline:none]`}
                        />
                      </div>
                      <div className={`studio-time-block [display:flex] [flex-direction:column] [gap:5px]`}>
                        <label className={`studio-field-label [display:flex] [align-items:center] [gap:5px] [font-size:10.5px] [font-weight:700] [color:var(--muted)] [text-transform:uppercase] [letter-spacing:0.03em]`}>Lunch Window End</label>
                        <input
                          type="time"
                          value={shiftSettings.lunchWindowEnd}
                          onChange={(e) =>
                            setShiftSettings((prev) => ({
                              ...prev,
                              lunchWindowEnd: e.target.value,
                            }))
                          }
                          className={`studio-time-input [height:32px] [padding:0_10px] [border-radius:6px] [border:1px_solid_var(--line)] [background:var(--paper)] [color:var(--ink)] [font-size:12px] [font-weight:600] [outline:none]`}
                        />
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {/* Optimization Objective Strategy */}
              <div className={`studio-config-card [padding:16px] [border-radius:9px] [border:1px_solid_var(--line)] [background:var(--paper-strong)] [display:flex] [flex-direction:column] [gap:14px]`}>
                <div className={`studio-config-card__header [display:flex] [align-items:flex-start] [gap:10px]`}>
                  <Zap size={16} className={`studio-icon-lunch [color:#d97706] [margin-top:2px]`} style={{ color: "var(--accent, #dc2626)" }} />
                  <div>
                    <h4 className={`studio-config-card__title [font-size:13.5px] [font-weight:700] [color:var(--ink)] [margin:0]`}>
                      Optimization Objective & Strategy
                    </h4>
                    <p className={`studio-config-card__desc [font-size:11px] [color:var(--muted)] [margin:2px_0_0] [line-height:1.35]`}>
                      Configure the algorithmic cost function that Google Cloud prioritizes during tour generation.
                    </p>
                  </div>
                </div>

                <div className={`studio-objective-grid [display:grid] [grid-template-columns:1fr_1fr] [gap:10px]`}>
                  <button
                    type="button"
                    className={`studio-objective-card [padding:12px_14px] [border-radius:8px] [border:1.5px_solid_var(--line)] [background:var(--paper)] [text-align:left] [cursor:pointer] [display:flex] [flex-direction:column] [gap:6px] [transition:all_0.15s_ease] hover:[border-color:var(--muted)] hover:[background:var(--paper-strong)] [&_b]:[font-size:12px] [&_b]:[color:var(--ink)] [&_p]:[font-size:11px] [&_p]:[color:var(--muted)] [&_p]:[margin:0] [&_p]:[line-height:1.35] ${objective === "fastest_turnaround" ? `studio-objective-card--active [border-color:var(--ink)] [background:var(--paper-strong)] [box-shadow:0_2px_6px_rgba(0,_0,_0,_0.05)]` : ""}`}
                    onClick={() => setObjective("fastest_turnaround")}
                  >
                    <div className={`studio-objective-card__head [display:flex] [align-items:center] [justify-content:space-between]`}>
                      <span className={`studio-objective-badge [font-size:10px] [font-weight:700] [text-transform:uppercase] [letter-spacing:0.04em] [padding:2px_7px] [border-radius:4px] [display:inline-flex] [align-items:center] [gap:4px] studio-objective-badge--speed [background:rgba(220,_38,_38,_0.1)] [color:#dc2626] [border:1px_solid_rgba(220,_38,_38,_0.2)]`}>⚡ Speed Priority</span>
                      {objective === "fastest_turnaround" && <Check size={14} />}
                    </div>
                    <b>Fastest Turnaround</b>
                    <p>Heavily penalizes shift time and slow traffic crawling. Vans avoid bottlenecks and return to HQ as early as possible.</p>
                  </button>

                  <button
                    type="button"
                    className={`studio-objective-card [padding:12px_14px] [border-radius:8px] [border:1.5px_solid_var(--line)] [background:var(--paper)] [text-align:left] [cursor:pointer] [display:flex] [flex-direction:column] [gap:6px] [transition:all_0.15s_ease] hover:[border-color:var(--muted)] hover:[background:var(--paper-strong)] [&_b]:[font-size:12px] [&_b]:[color:var(--ink)] [&_p]:[font-size:11px] [&_p]:[color:var(--muted)] [&_p]:[margin:0] [&_p]:[line-height:1.35] ${objective === "shortest_distance" ? `studio-objective-card--active [border-color:var(--ink)] [background:var(--paper-strong)] [box-shadow:0_2px_6px_rgba(0,_0,_0,_0.05)]` : ""}`}
                    onClick={() => setObjective("shortest_distance")}
                  >
                    <div className={`studio-objective-card__head [display:flex] [align-items:center] [justify-content:space-between]`}>
                      <span className={`studio-objective-badge [font-size:10px] [font-weight:700] [text-transform:uppercase] [letter-spacing:0.04em] [padding:2px_7px] [border-radius:4px] [display:inline-flex] [align-items:center] [gap:4px] studio-objective-badge--distance [background:rgba(21,_128,_61,_0.1)] [color:#15803d] [border:1px_solid_rgba(21,_128,_61,_0.2)]`}>🛣️ Fuel Priority</span>
                      {objective === "shortest_distance" && <Check size={14} />}
                    </div>
                    <b>Shortest Road Distance</b>
                    <p>Minimizes total kilometers driven across Bangalore to reduce diesel/battery consumption, even if taking local roads.</p>
                  </button>

                  <button
                    type="button"
                    className={`studio-objective-card [padding:12px_14px] [border-radius:8px] [border:1.5px_solid_var(--line)] [background:var(--paper)] [text-align:left] [cursor:pointer] [display:flex] [flex-direction:column] [gap:6px] [transition:all_0.15s_ease] hover:[border-color:var(--muted)] hover:[background:var(--paper-strong)] [&_b]:[font-size:12px] [&_b]:[color:var(--ink)] [&_p]:[font-size:11px] [&_p]:[color:var(--muted)] [&_p]:[margin:0] [&_p]:[line-height:1.35] ${objective === "balanced" ? `studio-objective-card--active [border-color:var(--ink)] [background:var(--paper-strong)] [box-shadow:0_2px_6px_rgba(0,_0,_0,_0.05)]` : ""}`}
                    onClick={() => setObjective("balanced")}
                  >
                    <div className={`studio-objective-card__head [display:flex] [align-items:center] [justify-content:space-between]`}>
                      <span className={`studio-objective-badge [font-size:10px] [font-weight:700] [text-transform:uppercase] [letter-spacing:0.04em] [padding:2px_7px] [border-radius:4px] [display:inline-flex] [align-items:center] [gap:4px] studio-objective-badge--balanced [background:rgba(30,_58,_138,_0.1)] [color:#1e3a8a] [border:1px_solid_rgba(30,_58,_138,_0.2)]`}>⚖️ 10:1 Ratio</span>
                      {objective === "balanced" && <Check size={14} />}
                    </div>
                    <b>Balanced Hybrid</b>
                    <p>Standard cost weighting ($100/hr total shift time and $10/km distance). Balances speed against driving distance.</p>
                  </button>

                  <button
                    type="button"
                    className={`studio-objective-card [padding:12px_14px] [border-radius:8px] [border:1.5px_solid_var(--line)] [background:var(--paper)] [text-align:left] [cursor:pointer] [display:flex] [flex-direction:column] [gap:6px] [transition:all_0.15s_ease] hover:[border-color:var(--muted)] hover:[background:var(--paper-strong)] [&_b]:[font-size:12px] [&_b]:[color:var(--ink)] [&_p]:[font-size:11px] [&_p]:[color:var(--muted)] [&_p]:[margin:0] [&_p]:[line-height:1.35] ${objective === "minimize_fleet" ? `studio-objective-card--active [border-color:var(--ink)] [background:var(--paper-strong)] [box-shadow:0_2px_6px_rgba(0,_0,_0,_0.05)]` : ""}`}
                    onClick={() => setObjective("minimize_fleet")}
                  >
                    <div className={`studio-objective-card__head [display:flex] [align-items:center] [justify-content:space-between]`}>
                      <span className={`studio-objective-badge [font-size:10px] [font-weight:700] [text-transform:uppercase] [letter-spacing:0.04em] [padding:2px_7px] [border-radius:4px] [display:inline-flex] [align-items:center] [gap:4px] studio-objective-badge--fleet [background:rgba(180,_83,_9,_0.1)] [color:#b45309] [border:1px_solid_rgba(180,_83,_9,_0.2)]`}>🚐 Fleet Consolidation</span>
                      {objective === "minimize_fleet" && <Check size={14} />}
                    </div>
                    <b>Minimum Fleet Size</b>
                    <p>Adds a fixed dispatch penalty per van ($3,000) so Google packs loads into fewer vehicles, keeping backup vans at HQ.</p>
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* TAB 4: TIME WINDOWS & PRIORITIES */}
        {activeTab === "windows" && (
          <div className={`studio-section [display:flex] [flex-direction:column] [gap:14px]`}>
            <div className={`studio-section__header [display:flex] [align-items:flex-start] [justify-content:space-between] [gap:12px]`}>
              <div>
                <h3 className={`studio-section__title [font-size:15px] [font-weight:700] [color:var(--ink)] [margin:0]`}>Hotel Time Windows & Priority</h3>
                <p className={`studio-section__desc [font-size:11.5px] [color:var(--muted)] [margin:3px_0_0] [line-height:1.35]`}>
                  Designate VIP accounts to sequence early in the morning and lock specific delivery time windows.
                </p>
              </div>
              <div className={`studio-actions-group [display:flex] [align-items:center] [gap:6px] [flex-shrink:0]`}>
                <button
                  type="button"
                  className={`studio-btn-tiny [padding:3px_9px] [border-radius:5px] [border:1px_solid_var(--line)] [background:var(--paper-strong)] [color:var(--ink)] [font-size:10.5px] [font-weight:600] [cursor:pointer] [transition:all_0.12s_ease] hover:[background:var(--bone)] hover:[border-color:var(--line-strong)]`}
                  onClick={() => {
                    // Quick VIP for selected 5-stars
                    const fiveStars = [
                      "THE LEELA PALACE BENGALURU",
                      "TAJ WEST END",
                      "ITC GARDENIA BENGALURU",
                      "FOUR SEASONS HOTEL BENGALURU",
                      "THE OBEROI BENGALURU",
                    ];
                    setHotelSettings((prev) => {
                      const next = { ...prev };
                      for (const name of fiveStars) {
                        if (next[name]) {
                          next[name] = { ...next[name], priority: "VIP" };
                        }
                      }
                      return next;
                    });
                  }}
                >
                  Mark 5-Star VIP
                </button>
              </div>
            </div>

            <div className={`studio-priority-legend [display:flex] [align-items:center] [gap:6px] [flex-wrap:wrap] [padding:6px_10px] [border-radius:6px] [background:var(--bone)] [font-size:10px]`}>
              <span className={`studio-legend-tag [padding:2px_6px] [border-radius:4px] studio-legend-tag--vip [color:#dc2626]`}>
                <b>VIP</b>: First morning priority
              </span>
              <span className={`studio-legend-tag [padding:2px_6px] [border-radius:4px] studio-legend-tag--high [color:#d97706]`}>
                <b>High</b>: Pre-noon delivery
              </span>
              <span className={`studio-legend-tag [padding:2px_6px] [border-radius:4px] studio-legend-tag--normal [color:#16a34a]`}>
                <b>Normal</b>: Standard SLA
              </span>
              <span className={`studio-legend-tag [padding:2px_6px] [border-radius:4px] studio-legend-tag--flex [color:#64748b]`}>
                <b>Flexible</b>: Wave 2 / Afternoon
              </span>
            </div>

            {/* List of Hotels with Priority & Window Controls */}
            <div className={`studio-sla-list [display:flex] [flex-direction:column] [gap:8px] [max-height:480px] [overflow-y:auto] [padding-right:4px]`}>
              {filteredHotels
                .filter((h) => hotelSettings[h.name]?.selected)
                .map((hotel) => {
                  const setting = hotelSettings[hotel.name] ?? {
                    name: hotel.name,
                    selected: true,
                    priority: "Normal",
                    timeWindowEnabled: false,
                    earliestArrival: "08:00",
                    latestArrival: "13:00",
                  };

                  return (
                    <div key={hotel.name} className={`studio-sla-card [padding:10px_12px] [border-radius:8px] [border:1px_solid_var(--line)] [background:var(--paper-strong)] [display:flex] [flex-direction:column] [gap:8px]`}>
                      <div className={`studio-sla-card__info [display:flex] [flex-direction:column] [gap:2px]`}>
                        <span className={`studio-sla-card__name [font-size:12px] [font-weight:700] [color:var(--ink)]`}>{hotel.name}</span>
                        <span className={`studio-sla-card__sub [font-size:10.5px] [color:var(--muted)]`}>
                          R{hotel.region} · {hotel.locality ?? `Region ${hotel.region}`} · {setting.customBags ?? hotel.load ?? 3} bags
                        </span>
                      </div>

                      <div className={`studio-sla-card__controls [display:flex] [align-items:center] [justify-content:space-between] [gap:12px] [flex-wrap:wrap]`}>
                        {/* Priority Selector */}
                        <div className={`studio-priority-selector [display:flex] [align-items:center] [gap:3px] [padding:2px] [border-radius:5px] [background:var(--bone)]`}>
                          {(["VIP", "High", "Normal", "Flexible"] as HotelPriority[]).map(
                            (p) => (
                              <button
                                key={p}
                                type="button"
                                className={`studio-p-btn [padding:2px_7px] [border-radius:4px] [border:none] [background:transparent] [color:var(--muted)] [font-size:10px] [font-weight:700] [cursor:pointer] [&.is-active]:[&.studio-p-btn--vip]:[background:#dc2626] [&.is-active]:[&.studio-p-btn--vip]:[color:#ffffff] [&.is-active]:[&.studio-p-btn--high]:[background:#d97706] [&.is-active]:[&.studio-p-btn--high]:[color:#ffffff] [&.is-active]:[&.studio-p-btn--normal]:[background:#16a34a] [&.is-active]:[&.studio-p-btn--normal]:[color:#ffffff] [&.is-active]:[&.studio-p-btn--flexible]:[background:#64748b] [&.is-active]:[&.studio-p-btn--flexible]:[color:#ffffff] studio-p-btn--${p.toLowerCase()} ${
                                  setting.priority === p ? `is-active [&_span]:[opacity:0.9] [.plan-mode-switch_&]:[background:var(--ink)] [.plan-mode-switch_&]:[color:var(--cream)]` : ""
                                }`}
                                onClick={() => handleUpdateHotelPriority(hotel.name, p)}
                              >
                                {p}
                              </button>
                            ),
                          )}
                        </div>

                        {/* Time Window Switch & Inputs */}
                        <div className={`studio-window-group [display:flex] [align-items:center] [gap:8px]`}>
                          <label className={`studio-window-toggle [display:flex] [align-items:center] [gap:5px] [font-size:11px] [font-weight:600] [color:var(--muted)] [cursor:pointer]`}>
                            <input
                              type="checkbox"
                              checked={setting.timeWindowEnabled}
                              onChange={() => handleToggleHotelTimeWindow(hotel.name)}
                            />
                            <span>SLA Window</span>
                          </label>

                          {setting.timeWindowEnabled && (
                            <div className={`studio-window-inputs [display:flex] [align-items:center] [gap:4px] [font-size:10.5px] [color:var(--faint)]`}>
                              <input
                                type="time"
                                value={setting.earliestArrival}
                                onChange={(e) =>
                                  handleUpdateHotelWindowTimes(
                                    hotel.name,
                                    e.target.value,
                                    setting.latestArrival,
                                  )
                                }
                                className={`studio-time-input [height:32px] [padding:0_10px] [border-radius:6px] [border:1px_solid_var(--line)] [background:var(--paper)] [color:var(--ink)] [font-size:12px] [font-weight:600] [outline:none] studio-time-input--sm [height:26px] [padding:0_6px] [font-size:11px] [width:78px]`}
                              />
                              <span>to</span>
                              <input
                                type="time"
                                value={setting.latestArrival}
                                onChange={(e) =>
                                  handleUpdateHotelWindowTimes(
                                    hotel.name,
                                    setting.earliestArrival,
                                    e.target.value,
                                  )
                                }
                                className={`studio-time-input [height:32px] [padding:0_10px] [border-radius:6px] [border:1px_solid_var(--line)] [background:var(--paper)] [color:var(--ink)] [font-size:12px] [font-weight:600] [outline:none] studio-time-input--sm [height:26px] [padding:0_6px] [font-size:11px] [width:78px]`}
                              />
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
            </div>
          </div>
        )}

        {/* TAB 5: SIMULATION RESULTS & MANIFESTS */}
        {activeTab === "simulate" && (
          <div className={`studio-section [display:flex] [flex-direction:column] [gap:14px]`}>
            {!simulationResult ? (
              <div className={`studio-empty-cta [display:flex] [flex-direction:column] [align-items:center] [justify-content:center] [text-align:center] [padding:48px_24px] [border-radius:12px] [border:1.5px_dashed_var(--line-strong)] [background:var(--paper-strong)] [gap:12px] [&_h4]:[font-size:16px] [&_h4]:[font-weight:700] [&_h4]:[color:var(--ink)] [&_h4]:[margin:0] [&_p]:[font-size:12px] [&_p]:[color:var(--muted)] [&_p]:[max-width:360px] [&_p]:[line-height:1.45] [&_p]:[margin:0]`}>
                <Sparkles size={32} className={`studio-empty-icon [color:#8b5cf6]`} />
                <h4>No Custom Plan Computed Yet</h4>
                <p>
                  Click "Run Optimization" below to cluster the selected {selectedHotelsCount}{" "}
                  hotels across your {activeVehiclesCount} active vehicles operating out of Yeshwanthpur Central Laundry (HQ),
                  shift hours, and priority rules.
                </p>
                <button
                  type="button"
                  className={`studio-btn [display:inline-flex] [align-items:center] [gap:6px] [height:32px] [padding:0_14px] [border-radius:8px] [font-size:11.5px] [font-weight:600] [cursor:pointer] [transition:all_0.15s_ease] [border:1px_solid_transparent] studio-btn--primary [background:#15803d] [color:#ffffff] [box-shadow:0_1px_3px_rgba(21,_128,_61,_0.35)] [&:hover:not(:disabled)]:[background:#166534] [&:hover:not(:disabled)]:[transform:translateY(-0.5px)] disabled:[opacity:0.5] disabled:[cursor:not-allowed]`}
                  onClick={handleRunOptimization}
                  disabled={isSimulating}
                >
                  <Zap size={14} />
                  <span>
                    {isSimulating
                      ? "Optimizing with Google Cloud..."
                      : "Run Google Cloud Optimization"}
                  </span>
                </button>
              </div>
            ) : (
              <div className={`studio-results [display:flex] [flex-direction:column] [gap:14px]`}>
                {/* Scorecard */}
                <div className={`studio-scorecard [padding:14px_16px] [border-radius:10px] [background:var(--bone)] [border:1px_solid_var(--line)] [display:flex] [flex-direction:column] [gap:12px]`}>
                  <div className={`studio-scorecard__status [display:flex] [align-items:center] [justify-content:space-between]`}>
                    <div className={`studio-status-pills-row [display:flex] [align-items:center] [gap:8px] [flex-wrap:wrap]`}>
                      {simulationResult.isFeasible ? (
                        <div className={`studio-status-pill [display:inline-flex] [align-items:center] [gap:6px] [padding:3px_9px] [border-radius:6px] [font-size:11px] [font-weight:700] studio-status-pill--success [background:#dcfce7] [color:#15803d] [border:1px_solid_rgba(22,_163,_74,_0.3)]`}>
                          <CheckCircle2 size={13} />
                          <span>Feasible Dispatch Plan</span>
                        </div>
                      ) : (
                        <div className={`studio-status-pill [display:inline-flex] [align-items:center] [gap:6px] [padding:3px_9px] [border-radius:6px] [font-size:11px] [font-weight:700] studio-status-pill--warning [background:#fef3c7] [color:#b45309] [border:1px_solid_rgba(217,_119,_6,_0.3)]`}>
                          <AlertCircle size={13} />
                          <span>Capacity Overflow Alert</span>
                        </div>
                      )}
                      {solverProvider === "google" ? (
                        <div className={`studio-provider-badge [display:inline-flex] [align-items:center] [gap:6px] [padding:3px_9px] [border-radius:6px] [font-size:10.5px] [font-weight:700] [letter-spacing:0.02em] studio-provider-badge--google [background:rgba(59,_130,_246,_0.12)] [color:#1d4ed8] [border:1px_solid_rgba(59,_130,_246,_0.3)]`}>
                          <span className={`studio-provider-dot [width:6px] [height:6px] [border-radius:50%] [background:#2563eb] [box-shadow:0_0_6px_rgba(37,_99,_235,_0.6)]`} />
                          <span>Google Cloud Route Optimization API</span>
                        </div>
                      ) : (
                        <div className={`studio-provider-badge [display:inline-flex] [align-items:center] [gap:6px] [padding:3px_9px] [border-radius:6px] [font-size:10.5px] [font-weight:700] [letter-spacing:0.02em] studio-provider-badge--local [background:var(--bone)] [color:var(--muted)] [border:1px_solid_var(--line)]`}>
                          <span>Local Routing Solver</span>
                        </div>
                      )}
                    </div>
                    <button
                      type="button"
                      className={`studio-btn-tiny [padding:3px_9px] [border-radius:5px] [border:1px_solid_var(--line)] [background:var(--paper-strong)] [color:var(--ink)] [font-size:10.5px] [font-weight:600] [cursor:pointer] [transition:all_0.12s_ease] hover:[background:var(--bone)] hover:[border-color:var(--line-strong)]`}
                      onClick={handleDownloadManifest}
                    >
                      <Download size={11} />
                      <span>Download Manifest CSV</span>
                    </button>
                  </div>

                  {apiNotice && (
                    <div className={`studio-api-notice [display:flex] [align-items:center] [gap:6px] [padding:6px_10px] [border-radius:6px] [background:#fffbeb] [border:1px_solid_rgba(245,_158,_11,_0.3)] [color:#b45309] [font-size:11px] [line-height:1.35]`}>
                      <AlertCircle size={13} />
                      <span>{apiNotice}</span>
                    </div>
                  )}

                  <div className={`studio-stats-grid [display:grid] [grid-template-columns:repeat(4,_1fr)] [gap:8px]`}>
                    <div className={`studio-stat-cell [display:flex] [flex-direction:column] [gap:2px]`}>
                      <span className={`studio-stat-cell__label [font-size:9.5px] [font-weight:600] [color:var(--faint)] [text-transform:uppercase]`}>Active Routes</span>
                      <span className={`studio-stat-cell__val [font-size:13px] [font-weight:700] [color:var(--ink)]`}>
                        {simulationResult.routes.length} vans
                      </span>
                    </div>
                    <div className={`studio-stat-cell [display:flex] [flex-direction:column] [gap:2px]`}>
                      <span className={`studio-stat-cell__label [font-size:9.5px] [font-weight:600] [color:var(--faint)] [text-transform:uppercase]`}>Assigned Hotels</span>
                      <span className={`studio-stat-cell__val [font-size:13px] [font-weight:700] [color:var(--ink)]`}>
                        {simulationResult.totalHotelsAssigned} /{" "}
                        {simulationResult.totalHotelsSelected}
                      </span>
                    </div>
                    <div className={`studio-stat-cell [display:flex] [flex-direction:column] [gap:2px]`}>
                      <span className={`studio-stat-cell__label [font-size:9.5px] [font-weight:600] [color:var(--faint)] [text-transform:uppercase]`}>Total Linen Bags</span>
                      <span className={`studio-stat-cell__val [font-size:13px] [font-weight:700] [color:var(--ink)]`}>
                        {simulationResult.totalBagsDemanded} bags
                      </span>
                    </div>
                    <div className={`studio-stat-cell [display:flex] [flex-direction:column] [gap:2px]`}>
                      <span className={`studio-stat-cell__label [font-size:9.5px] [font-weight:600] [color:var(--faint)] [text-transform:uppercase]`}>Fleet Utilization</span>
                      <span className={`studio-stat-cell__val [font-size:13px] [font-weight:700] [color:var(--ink)]`}>
                        {simulationResult.fleetUtilizationPct}%
                      </span>
                    </div>
                  </div>

                  {simulationResult.warnings.length > 0 && (
                    <div className={`studio-warnings [display:flex] [flex-direction:column] [gap:4px] [padding:8px_10px] [border-radius:6px] [background:#fffbeb] [border:1px_solid_rgba(245,_158,_11,_0.3)]`}>
                      {simulationResult.warnings.map((w, i) => (
                        <div key={i} className={`studio-warning-item [display:flex] [align-items:flex-start] [gap:6px] [font-size:11px] [color:#b45309] [line-height:1.35]`}>
                          <AlertCircle size={13} className={`studio-warning-icon [flex-shrink:0] [margin-top:1px]`} />
                          <span>{w}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Simulated Vehicle Routes List */}
                <div className={`studio-routes-accordion [display:flex] [flex-direction:column] [gap:8px]`}>
                  {simulationResult.routes.map((route, rIdx) => {
                    const routeKey = route.route_id ?? route.vehicle_label;
                    const isExpanded =
                      expandedRouteId === routeKey || selectedRouteIndex === rIdx;
                    const vehicleId = route.vehicle_id ?? rIdx + 1;
                    const assignedDepot = depots.find(
                      (d) =>
                        d.id ===
                        vehicles.find((v) => v.id === vehicleId)?.depot_id,
                    ) ?? depots[0];

                    return (
                      <div
                        key={routeKey}
                        className={`studio-route-card [border-radius:9px] [border:1px_solid_var(--line)] [background:var(--paper-strong)] [overflow:hidden] [transition:all_0.15s_ease] ${
                          isExpanded ? "studio-route-card--expanded" : ""
                        }`}
                        style={{ "--route-c": route.color } as React.CSSProperties}
                      >
                        <div
                          className={`studio-route-card__header [padding:10px_14px] [cursor:pointer] [display:flex] [flex-direction:column] [gap:6px] hover:[background:rgba(0,_0,_0,_0.015)]`}
                          onClick={() => {
                            setExpandedRouteId(isExpanded ? null : routeKey);
                            onSelectRoute(isExpanded ? null : rIdx);
                            onFocusRoute(rIdx);
                          }}
                        >
                          <div className={`studio-route-card__title-row [display:flex] [align-items:center] [gap:8px]`}>
                            <span
                              className={`studio-route-bullet [width:9px] [height:9px] [border-radius:50%] [flex-shrink:0]`}
                              style={{ background: route.color }}
                            />
                            <span className={`studio-route-van-name [font-size:13px] [font-weight:700] [color:var(--ink)] [flex:1]`}>
                              {route.vehicle_label}
                            </span>
                            <span className={`studio-route-depot-tag [font-size:10px] [font-weight:600] [color:var(--muted)] [background:var(--bone)] [padding:1px_6px] [border-radius:4px]`}>
                              📍 Yeshwanthpur HQ
                            </span>
                          </div>

                          <div className={`studio-route-card__meta-row [display:flex] [align-items:center] [gap:6px] [font-size:11px] [color:var(--muted)]`}>
                            <span>{route.total_hotels} stops</span>
                            <span className={`studio-dot-sep [color:var(--faint)]`}>·</span>
                            <span>{route.total_dist_km} km</span>
                            <span className={`studio-dot-sep [color:var(--faint)]`}>·</span>
                            <span>
                              {formatMins(
                                route.shift_duration_mins ??
                                  route.total_drive_mins + route.total_service_mins,
                              )}
                            </span>
                            <span className={`studio-dot-sep [color:var(--faint)]`}>·</span>
                            <span className={`studio-load-badge [color:#0284c7] [font-weight:600] [margin-right:auto]`}>
                              🧺 {route.total_bags} /{" "}
                              {route.max_load_90pct ?? route.max_load} bags (
                              {route.capacity_utilization_pct}%)
                            </span>
                            {isExpanded ? (
                              <ChevronDown size={14} />
                            ) : (
                              <ChevronRight size={14} />
                            )}
                          </div>

                          {/* Capacity Progress Bar */}
                          <div className={`studio-cap-bar-track [width:100%] [height:4px] [border-radius:2px] [background:var(--line)] [overflow:hidden] [margin-top:2px]`}>
                            <div
                              className={`studio-cap-bar-fill [height:100%] [border-radius:2px] [transition:width_0.3s_ease]`}
                              style={{
                                width: `${Math.min(
                                  100,
                                  route.capacity_utilization_pct,
                                )}%`,
                                background:
                                  route.capacity_utilization_pct > 95
                                    ? "#ef4444"
                                    : route.color,
                              }}
                            />
                          </div>
                        </div>

                        {/* Accordion Stops Manifest */}
                        {isExpanded && (
                          <div className={`studio-route-stops-manifest [border-top:1px_solid_var(--line)] [background:var(--bone)] [padding:8px_12px] [display:flex] [flex-direction:column] [gap:6px]`}>
                            <div className={`studio-manifest-depot-step [display:flex] [align-items:center] [gap:9px] [padding:6px_8px] [border-radius:6px] [background:var(--paper-strong)] [font-size:11px] [color:var(--ink)]`}>
                              <span className={`studio-depot-icon [font-size:9px] [font-weight:800] [padding:2px_5px] [border-radius:4px] [background:#18241e] [color:#ffffff]`}>HQ</span>
                              <div>
                                <b>Departure: {assignedDepot.name}</b>
                                <div className={`studio-step-time [font-size:10px] [color:var(--muted)]`}>
                                  ⏱️ {route.stops[0]?.arrival_time ?? "07:00 AM"}
                                </div>
                              </div>
                            </div>

                            {route.stops.map((stop) => {
                              const isLunch = stop.name.includes("Lunch");
                              const isSelectedStop =
                                selectedStopNumber === stop.stop_number;

                              return (
                                <div
                                  key={stop.stop_number}
                                  className={`studio-stop-row [display:flex] [align-items:center] [gap:9px] [padding:6px_8px] [border-radius:6px] [background:var(--paper-strong)] [cursor:pointer] [border:1px_solid_transparent] [transition:all_0.12s_ease] hover:[border-color:var(--line-strong)] ${
                                    isLunch ? `studio-stop-row--lunch [background:#fffbeb] [border-color:rgba(245,_158,_11,_0.3)]` : ""
                                  } ${
                                    isSelectedStop ? `studio-stop-row--active [border-color:var(--ink)] [box-shadow:0_1px_4px_rgba(24,_36,_30,_0.12)]` : ""
                                  }`}
                                  onClick={() => {
                                    if (!isLunch) {
                                      onSelectStop(stop);
                                      onFocusStop(stop.lat, stop.lon);
                                    }
                                  }}
                                >
                                  <span
                                    className={`studio-stop-num [width:20px] [height:20px] [border-radius:50%] [border:1.5px_solid_var(--line-strong)] [display:flex] [align-items:center] [justify-content:center] [font-size:10px] [font-weight:700] [color:var(--ink)] [flex-shrink:0] ${
                                      isLunch ? `studio-stop-num--lunch [border:none] [font-size:12px]` : ""
                                    }`}
                                    style={
                                      !isLunch
                                        ? { borderColor: route.color }
                                        : undefined
                                    }
                                  >
                                    {isLunch ? "🍱" : stop.stop_number}
                                  </span>

                                  <div className={`studio-stop-details [flex:1] [min-width:0] [display:flex] [flex-direction:column] [gap:1px]`}>
                                    <div className={`studio-stop-name [font-size:11.5px] [font-weight:700] [color:var(--ink)] [white-space:nowrap] [overflow:hidden] [text-overflow:ellipsis]`}>
                                      {stop.name}
                                    </div>
                                    <div className={`studio-stop-meta [font-size:10px] [color:var(--muted)] [display:flex] [align-items:center] [gap:4px]`}>
                                      <span>
                                        {stop.arrival_time} - {stop.departure_time}
                                      </span>
                                      <span className={`studio-dot-sep [color:var(--faint)]`}>·</span>
                                      <span>{stop.stop_mins}m on-site</span>
                                      {!isLunch && (
                                        <>
                                          <span className={`studio-dot-sep [color:var(--faint)]`}>·</span>
                                          <span className={`studio-stop-bags [color:#0284c7] [font-weight:600]`}>
                                            🧺 {stop.load_bags} bags
                                          </span>
                                        </>
                                      )}
                                    </div>
                                  </div>
                                </div>
                              );
                            })}

                            <div className={`studio-manifest-depot-step [display:flex] [align-items:center] [gap:9px] [padding:6px_8px] [border-radius:6px] [background:var(--paper-strong)] [font-size:11px] [color:var(--ink)]`}>
                              <span className={`studio-depot-icon [font-size:9px] [font-weight:800] [padding:2px_5px] [border-radius:4px] [background:#18241e] [color:#ffffff]`}>HQ</span>
                              <div>
                                <b>Return: {assignedDepot.name}</b>
                                <div className={`studio-step-time [font-size:10px] [color:var(--muted)]`}>
                                  ⏱️{" "}
                                  {route.stops[route.stops.length - 1]
                                    ?.departure_time ?? "04:30 PM"}
                                </div>
                              </div>
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* 4. Bottom Sticky Action Bar */}
      <div className={`studio-footer-bar [display:flex] [align-items:center] [justify-content:space-between] [padding:10px_20px] [border-top:1px_solid_var(--line)] [background:var(--paper-strong)] [flex-shrink:0]`}>
        <div className={`studio-footer-info [font-size:11.5px] [color:var(--muted)] [font-weight:600]`}>
          <span>
            {selectedHotelsCount} hotels · {totalDemandBags} bags · {activeVehiclesCount}{" "}
            active vans
          </span>
          <span className={`studio-footer-objective-tag [display:inline-flex] [align-items:center] [font-size:11px] [font-weight:700] [color:var(--ink)] [background:var(--paper)] [border:1px_solid_var(--line)] [padding:3px_8px] [border-radius:5px] [margin-left:8px]`}>
            {objective === "fastest_turnaround" && "⚡ Fastest Turnaround"}
            {objective === "shortest_distance" && "🛣️ Shortest Distance"}
            {objective === "balanced" && "⚖️ Balanced Hybrid"}
            {objective === "minimize_fleet" && "🚐 Minimize Fleet"}
          </span>
        </div>
        <button
          type="button"
          className={`studio-btn [display:inline-flex] [align-items:center] [gap:6px] [height:32px] [padding:0_14px] [border-radius:8px] [font-size:11.5px] [font-weight:600] [cursor:pointer] [transition:all_0.15s_ease] [border:1px_solid_transparent] studio-btn--primary [background:#15803d] [color:#ffffff] [box-shadow:0_1px_3px_rgba(21,_128,_61,_0.35)] [&:hover:not(:disabled)]:[background:#166534] [&:hover:not(:disabled)]:[transform:translateY(-0.5px)] disabled:[opacity:0.5] disabled:[cursor:not-allowed]`}
          onClick={handleRunOptimization}
          disabled={isSimulating || activeVehiclesCount === 0 || selectedHotelsCount === 0}
        >
          <Zap size={14} />
          <span>{isSimulating ? "Optimizing with Google Cloud..." : "Run Optimization (Google Cloud)"}</span>
        </button>
      </div>
    </div>
  );
}
