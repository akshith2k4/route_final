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
    <div className="studio-panel">
      {/* 1. Header & Live Indicator */}
      <div className="studio-header">
        <div className="studio-header__top">
          <div className="studio-badge">
            <Sparkles size={13} className="studio-badge__icon" />
            <span>Optimizer Studio</span>
          </div>
          <button
            type="button"
            className="studio-btn studio-btn--primary"
            onClick={handleRunOptimization}
            disabled={isSimulating || activeVehiclesCount === 0 || selectedHotelsCount === 0}
          >
            <Zap size={14} />
            <span>{isSimulating ? "Optimizing with Google Cloud..." : "Run Optimization (Google Cloud)"}</span>
          </button>
        </div>

        <p className="studio-header__sub">
          Manual constraint solver with hotel multi-select, 10-van capacity locking, Yeshwanthpur Central Laundry (HQ) fleet base, shift & lunch windows, and priority SLA rules.
        </p>

        {/* Live KPI Metric Chips */}
        <div className="studio-kpi-bar">
          <div className="studio-kpi">
            <span className="studio-kpi__label">Hotels</span>
            <span className="studio-kpi__val">
              <b>{selectedHotelsCount}</b> / {hotels.length}
            </span>
          </div>
          <div className="studio-kpi">
            <span className="studio-kpi__label">Demand</span>
            <span className="studio-kpi__val">
              <b>{totalDemandBags}</b> bags
            </span>
          </div>
          <div className="studio-kpi">
            <span className="studio-kpi__label">Fleet Vans</span>
            <span className="studio-kpi__val">
              <b>{activeVehiclesCount}</b> / 10 active
            </span>
          </div>
          <div className="studio-kpi">
            <span className="studio-kpi__label">Capacity</span>
            <span
              className={`studio-kpi__val ${
                totalDemandBags > totalSafeCapacity ? "studio-kpi__val--alert" : ""
              }`}
            >
              <b>{totalSafeCapacity}</b> safe limit
            </span>
          </div>
        </div>
      </div>

      {/* 2. Stepper / Tabs Bar */}
      <nav className="studio-tabs" aria-label="Optimizer Studio sections">
        <button
          type="button"
          className={`studio-tab ${activeTab === "hotels" ? "studio-tab--active" : ""}`}
          onClick={() => setActiveTab("hotels")}
        >
          <Building2 size={13} />
          <span>1. Hotels</span>
          <span className="studio-tab__badge">{selectedHotelsCount}</span>
        </button>

        <button
          type="button"
          className={`studio-tab ${activeTab === "fleet" ? "studio-tab--active" : ""}`}
          onClick={() => setActiveTab("fleet")}
        >
          <Truck size={13} />
          <span>2. Fleet (10 Vans)</span>
          <span className="studio-tab__badge">{activeVehiclesCount}</span>
        </button>

        <button
          type="button"
          className={`studio-tab ${activeTab === "shifts" ? "studio-tab--active" : ""}`}
          onClick={() => setActiveTab("shifts")}
        >
          <Clock size={13} />
          <span>3. Shifts & Lunch</span>
        </button>

        <button
          type="button"
          className={`studio-tab ${activeTab === "windows" ? "studio-tab--active" : ""}`}
          onClick={() => setActiveTab("windows")}
        >
          <Sliders size={13} />
          <span>4. SLA Windows</span>
        </button>

        <button
          type="button"
          className={`studio-tab studio-tab--simulate ${
            activeTab === "simulate" ? "studio-tab--active" : ""
          }`}
          onClick={() => setActiveTab("simulate")}
        >
          <Zap size={13} />
          <span>5. Results</span>
          {simulationResult && (
            <span className="studio-tab__badge studio-tab__badge--success">
              {simulationResult.routes.length} routes
            </span>
          )}
        </button>
      </nav>

      {/* 3. Tab Contents */}
      <div className="studio-content">
        {/* TAB 1: HOTELS SELECTION */}
        {activeTab === "hotels" && (
          <div className="studio-section">
            <div className="studio-section__header">
              <div>
                <h3 className="studio-section__title">Hotel Selection</h3>
                <p className="studio-section__desc">
                  Select customer hotels to include in the dispatch run. Filter by region or search by name.
                </p>
              </div>
              <div className="studio-actions-group">
                <button
                  type="button"
                  className="studio-btn-tiny"
                  onClick={handleSelectAllHotels}
                >
                  Select all 100
                </button>
                <button
                  type="button"
                  className="studio-btn-tiny"
                  onClick={handleDeselectAllHotels}
                >
                  Clear all
                </button>
              </div>
            </div>

            {/* Filter & Search Bar */}
            <div className="studio-filter-bar">
              <div className="studio-search-wrap">
                <Search size={13} className="studio-search-icon" />
                <input
                  type="text"
                  placeholder="Filter hotels or localities..."
                  value={hotelQuery}
                  onChange={(e) => setHotelQuery(e.target.value)}
                  className="studio-search-input"
                />
                {hotelQuery && (
                  <button
                    type="button"
                    onClick={() => setHotelQuery("")}
                    className="studio-search-clear"
                  >
                    <X size={12} />
                  </button>
                )}
              </div>

              <div className="studio-region-pills">
                <button
                  type="button"
                  className={`studio-pill ${
                    hotelRegionFilter === "all" ? "studio-pill--active" : ""
                  }`}
                  onClick={() => setHotelRegionFilter("all")}
                >
                  All ({hotels.length})
                </button>
                {regions.map((r) => (
                  <button
                    key={r.id}
                    type="button"
                    className={`studio-pill ${
                      hotelRegionFilter === r.id ? "studio-pill--active" : ""
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
            <div className="studio-presets">
              <span className="studio-presets__label">Quick select:</span>
              <button
                type="button"
                className="studio-preset-chip"
                onClick={() => handleSelectByRegion(1)}
              >
                + R1 Central ({hotels.filter((h) => h.region === 1).length})
              </button>
              <button
                type="button"
                className="studio-preset-chip"
                onClick={() => handleSelectByRegion(0)}
              >
                + R0 South-East ({hotels.filter((h) => h.region === 0).length})
              </button>
              <button
                type="button"
                className="studio-preset-chip"
                onClick={() => handleSelectByRegion(3)}
              >
                + R3 East ({hotels.filter((h) => h.region === 3).length})
              </button>
            </div>

            {/* Hotels Checklist */}
            <div className="studio-hotels-list">
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
                      className={`studio-hotel-card ${
                        isSelected ? "studio-hotel-card--selected" : ""
                      }`}
                    >
                      <label className="studio-hotel-card__check">
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => handleToggleHotel(hotel.name)}
                        />
                        <span className="studio-checkbox-custom">
                          {isSelected && <Check size={12} />}
                        </span>
                      </label>

                      <div className="studio-hotel-card__info">
                        <div className="studio-hotel-card__title-row">
                          <span className="studio-hotel-card__name">
                            {hotel.name}
                          </span>
                          <span
                            className="studio-region-badge"
                            style={{
                              backgroundColor: `${region?.color}22`,
                              color: region?.color,
                              borderColor: `${region?.color}55`,
                            }}
                          >
                            R{hotel.region}
                          </span>
                        </div>
                        <div className="studio-hotel-card__sub">
                          <span>{hotel.locality ?? `Region ${hotel.region}`}</span>
                          <span className="studio-dot-sep">·</span>
                          <span className="studio-bag-tag">
                            🧺 {setting.customBags ?? hotel.load ?? 3} bags
                          </span>
                          {setting.priority !== "Normal" && (
                            <>
                              <span className="studio-dot-sep">·</span>
                              <span
                                className={`studio-priority-pill studio-priority-pill--${setting.priority.toLowerCase()}`}
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
          <div className="studio-section">
            <div className="studio-section__header">
              <div>
                <h3 className="studio-section__title">Fleet & Vehicle Capacity</h3>
                <p className="studio-section__desc">
                  Toggle active vehicles and lock customized capacity buffers. All routes operate out of LinenGrass HQ (Yeshwanthpur Central Laundry).
                </p>
              </div>
              <div className="studio-actions-group">
                <button
                  type="button"
                  className="studio-btn-tiny"
                  onClick={() =>
                    setVehicles((prev) => prev.map((v) => ({ ...v, enabled: true })))
                  }
                >
                  Enable all 10
                </button>
              </div>
            </div>

            <div className="studio-vehicles-grid">
              {vehicles.map((v) => {
                const isLocked = !!lockedCapacities[v.id];

                return (
                  <div
                    key={v.id}
                    className={`studio-vehicle-card ${
                      v.enabled ? "studio-vehicle-card--active" : "studio-vehicle-card--disabled"
                    }`}
                    style={{ "--van-color": v.color } as React.CSSProperties}
                  >
                    <div className="studio-vehicle-card__top">
                      <label className="studio-vehicle-card__toggle">
                        <input
                          type="checkbox"
                          checked={v.enabled}
                          onChange={() => handleToggleVehicle(v.id)}
                        />
                        <span className="studio-checkbox-custom">
                          {v.enabled && <Check size={12} />}
                        </span>
                        <span className="studio-van-label">
                          <span
                            className="studio-van-color-dot"
                            style={{ background: v.color }}
                          />
                          <b>{v.label}</b>
                        </span>
                      </label>

                      <span className="studio-van-sector">
                        R{v.region_id} · {v.sector}
                      </span>
                    </div>

                    {v.enabled && (
                      <div className="studio-vehicle-card__body">
                        {/* Single Unified HQ Depot Indicator */}
                        <div className="studio-form-row">
                          <label className="studio-field-label">
                            <MapPin size={11} />
                            <span>Origin & Return Depot</span>
                          </label>
                          <div className="studio-depot-fixed-badge">
                            <span className="studio-depot-fixed-dot" />
                            <span className="studio-depot-fixed-text">
                              LinenGrass HQ (Yeshwanthpur Central Laundry)
                            </span>
                            <span className="studio-depot-hq-tag">Unified HQ</span>
                          </div>
                        </div>

                        {/* Capacity and 90% Safe Max Load Override */}
                        <div className="studio-capacity-controls">
                          <div className="studio-cap-input-wrap">
                            <span className="studio-cap-label">Nominal Cap</span>
                            <div className="studio-cap-input-group">
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
                                className="studio-num-input"
                              />
                              <span className="studio-unit">bags</span>
                            </div>
                          </div>

                          <div className="studio-cap-input-wrap">
                            <div className="studio-cap-label-with-lock">
                              <span>Safe Max Load (90%)</span>
                              <button
                                type="button"
                                className={`studio-lock-btn ${
                                  isLocked ? "studio-lock-btn--locked" : ""
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
                            <div className="studio-cap-input-group">
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
                                className="studio-num-input studio-num-input--safe"
                              />
                              <span className="studio-unit">limit</span>
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
          <div className="studio-section">
            <div className="studio-section__header">
              <div>
                <h3 className="studio-section__title">Shift Limits & Rest Windows</h3>
                <p className="studio-section__desc">
                  Define driver duty shift hours and enforce mandatory midday lunch rest intervals.
                </p>
              </div>
            </div>

            {/* Shift Window Config */}
            <div className="studio-card-group">
              <div className="studio-config-card">
                <div className="studio-config-card__header">
                  <Clock size={16} className="studio-icon-ink" />
                  <div>
                    <h4 className="studio-config-card__title">Fleet Shift Timing</h4>
                    <p className="studio-config-card__desc">
                      Earliest warehouse departure time and latest return cutoff back to assigned depot.
                    </p>
                  </div>
                </div>

                <div className="studio-timing-grid">
                  <div className="studio-time-block">
                    <label className="studio-field-label">Earliest Departure (HQ/Depot)</label>
                    <input
                      type="time"
                      value={shiftSettings.earliestDeparture}
                      onChange={(e) =>
                        setShiftSettings((prev) => ({
                          ...prev,
                          earliestDeparture: e.target.value,
                        }))
                      }
                      className="studio-time-input"
                    />
                    <div className="studio-time-presets">
                      {["06:30", "07:00", "07:30", "08:00"].map((t) => (
                        <button
                          key={t}
                          type="button"
                          className="studio-btn-micro"
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

                  <div className="studio-time-block">
                    <label className="studio-field-label">Latest Shift Return Cutoff</label>
                    <input
                      type="time"
                      value={shiftSettings.latestReturn}
                      onChange={(e) =>
                        setShiftSettings((prev) => ({
                          ...prev,
                          latestReturn: e.target.value,
                        }))
                      }
                      className="studio-time-input"
                    />
                    <div className="studio-time-presets">
                      {["16:00", "17:00", "18:00", "19:00"].map((t) => (
                        <button
                          key={t}
                          type="button"
                          className="studio-btn-micro"
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
              <div className="studio-config-card">
                <div className="studio-config-card__header">
                  <Utensils size={16} className="studio-icon-lunch" />
                  <div>
                    <h4 className="studio-config-card__title">
                      Driver Lunch Break & Rest SLA
                    </h4>
                    <p className="studio-config-card__desc">
                      Mandatory rest pause automatically inserted into the driver manifest when reaching the midday lunch window.
                    </p>
                  </div>
                </div>

                <div className="studio-lunch-toggle-row">
                  <label className="studio-toggle-switch">
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
                    <span className="studio-toggle-slider" />
                  </label>
                  <span className="studio-toggle-text">
                    <b>Enforce mandatory driver lunch stop on all active routes</b>
                  </span>
                </div>

                {shiftSettings.lunchBreakEnabled && (
                  <div className="studio-lunch-options">
                    <div className="studio-form-row">
                      <label className="studio-field-label">Break Duration</label>
                      <div className="studio-duration-btns">
                        {[30, 45, 60].map((mins) => (
                          <button
                            key={mins}
                            type="button"
                            className={`studio-duration-btn ${
                              shiftSettings.lunchDurationMins === mins
                                ? "studio-duration-btn--active"
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

                    <div className="studio-timing-grid studio-timing-grid--compact">
                      <div className="studio-time-block">
                        <label className="studio-field-label">Lunch Window Start</label>
                        <input
                          type="time"
                          value={shiftSettings.lunchWindowStart}
                          onChange={(e) =>
                            setShiftSettings((prev) => ({
                              ...prev,
                              lunchWindowStart: e.target.value,
                            }))
                          }
                          className="studio-time-input"
                        />
                      </div>
                      <div className="studio-time-block">
                        <label className="studio-field-label">Lunch Window End</label>
                        <input
                          type="time"
                          value={shiftSettings.lunchWindowEnd}
                          onChange={(e) =>
                            setShiftSettings((prev) => ({
                              ...prev,
                              lunchWindowEnd: e.target.value,
                            }))
                          }
                          className="studio-time-input"
                        />
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {/* Optimization Objective Strategy */}
              <div className="studio-config-card">
                <div className="studio-config-card__header">
                  <Zap size={16} className="studio-icon-lunch" style={{ color: "var(--accent, #dc2626)" }} />
                  <div>
                    <h4 className="studio-config-card__title">
                      Optimization Objective & Strategy
                    </h4>
                    <p className="studio-config-card__desc">
                      Configure the algorithmic cost function that Google Cloud prioritizes during tour generation.
                    </p>
                  </div>
                </div>

                <div className="studio-objective-grid">
                  <button
                    type="button"
                    className={`studio-objective-card ${objective === "fastest_turnaround" ? "studio-objective-card--active" : ""}`}
                    onClick={() => setObjective("fastest_turnaround")}
                  >
                    <div className="studio-objective-card__head">
                      <span className="studio-objective-badge studio-objective-badge--speed">⚡ Speed Priority</span>
                      {objective === "fastest_turnaround" && <Check size={14} />}
                    </div>
                    <b>Fastest Turnaround</b>
                    <p>Heavily penalizes shift time and slow traffic crawling. Vans avoid bottlenecks and return to HQ as early as possible.</p>
                  </button>

                  <button
                    type="button"
                    className={`studio-objective-card ${objective === "shortest_distance" ? "studio-objective-card--active" : ""}`}
                    onClick={() => setObjective("shortest_distance")}
                  >
                    <div className="studio-objective-card__head">
                      <span className="studio-objective-badge studio-objective-badge--distance">🛣️ Fuel Priority</span>
                      {objective === "shortest_distance" && <Check size={14} />}
                    </div>
                    <b>Shortest Road Distance</b>
                    <p>Minimizes total kilometers driven across Bangalore to reduce diesel/battery consumption, even if taking local roads.</p>
                  </button>

                  <button
                    type="button"
                    className={`studio-objective-card ${objective === "balanced" ? "studio-objective-card--active" : ""}`}
                    onClick={() => setObjective("balanced")}
                  >
                    <div className="studio-objective-card__head">
                      <span className="studio-objective-badge studio-objective-badge--balanced">⚖️ 10:1 Ratio</span>
                      {objective === "balanced" && <Check size={14} />}
                    </div>
                    <b>Balanced Hybrid</b>
                    <p>Standard cost weighting ($100/hr total shift time and $10/km distance). Balances speed against driving distance.</p>
                  </button>

                  <button
                    type="button"
                    className={`studio-objective-card ${objective === "minimize_fleet" ? "studio-objective-card--active" : ""}`}
                    onClick={() => setObjective("minimize_fleet")}
                  >
                    <div className="studio-objective-card__head">
                      <span className="studio-objective-badge studio-objective-badge--fleet">🚐 Fleet Consolidation</span>
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
          <div className="studio-section">
            <div className="studio-section__header">
              <div>
                <h3 className="studio-section__title">Hotel Time Windows & Priority</h3>
                <p className="studio-section__desc">
                  Designate VIP accounts to sequence early in the morning and lock specific delivery time windows.
                </p>
              </div>
              <div className="studio-actions-group">
                <button
                  type="button"
                  className="studio-btn-tiny"
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

            <div className="studio-priority-legend">
              <span className="studio-legend-tag studio-legend-tag--vip">
                <b>VIP</b>: First morning priority
              </span>
              <span className="studio-legend-tag studio-legend-tag--high">
                <b>High</b>: Pre-noon delivery
              </span>
              <span className="studio-legend-tag studio-legend-tag--normal">
                <b>Normal</b>: Standard SLA
              </span>
              <span className="studio-legend-tag studio-legend-tag--flex">
                <b>Flexible</b>: Wave 2 / Afternoon
              </span>
            </div>

            {/* List of Hotels with Priority & Window Controls */}
            <div className="studio-sla-list">
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
                    <div key={hotel.name} className="studio-sla-card">
                      <div className="studio-sla-card__info">
                        <span className="studio-sla-card__name">{hotel.name}</span>
                        <span className="studio-sla-card__sub">
                          R{hotel.region} · {hotel.locality ?? `Region ${hotel.region}`} · {setting.customBags ?? hotel.load ?? 3} bags
                        </span>
                      </div>

                      <div className="studio-sla-card__controls">
                        {/* Priority Selector */}
                        <div className="studio-priority-selector">
                          {(["VIP", "High", "Normal", "Flexible"] as HotelPriority[]).map(
                            (p) => (
                              <button
                                key={p}
                                type="button"
                                className={`studio-p-btn studio-p-btn--${p.toLowerCase()} ${
                                  setting.priority === p ? "is-active" : ""
                                }`}
                                onClick={() => handleUpdateHotelPriority(hotel.name, p)}
                              >
                                {p}
                              </button>
                            ),
                          )}
                        </div>

                        {/* Time Window Switch & Inputs */}
                        <div className="studio-window-group">
                          <label className="studio-window-toggle">
                            <input
                              type="checkbox"
                              checked={setting.timeWindowEnabled}
                              onChange={() => handleToggleHotelTimeWindow(hotel.name)}
                            />
                            <span>SLA Window</span>
                          </label>

                          {setting.timeWindowEnabled && (
                            <div className="studio-window-inputs">
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
                                className="studio-time-input studio-time-input--sm"
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
                                className="studio-time-input studio-time-input--sm"
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
          <div className="studio-section">
            {!simulationResult ? (
              <div className="studio-empty-cta">
                <Sparkles size={32} className="studio-empty-icon" />
                <h4>No Custom Plan Computed Yet</h4>
                <p>
                  Click "Run Optimization" below to cluster the selected {selectedHotelsCount}{" "}
                  hotels across your {activeVehiclesCount} active vehicles operating out of Yeshwanthpur Central Laundry (HQ),
                  shift hours, and priority rules.
                </p>
                <button
                  type="button"
                  className="studio-btn studio-btn--primary"
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
              <div className="studio-results">
                {/* Scorecard */}
                <div className="studio-scorecard">
                  <div className="studio-scorecard__status">
                    <div className="studio-status-pills-row">
                      {simulationResult.isFeasible ? (
                        <div className="studio-status-pill studio-status-pill--success">
                          <CheckCircle2 size={13} />
                          <span>Feasible Dispatch Plan</span>
                        </div>
                      ) : (
                        <div className="studio-status-pill studio-status-pill--warning">
                          <AlertCircle size={13} />
                          <span>Capacity Overflow Alert</span>
                        </div>
                      )}
                      {solverProvider === "google" ? (
                        <div className="studio-provider-badge studio-provider-badge--google">
                          <span className="studio-provider-dot" />
                          <span>Google Cloud Route Optimization API</span>
                        </div>
                      ) : (
                        <div className="studio-provider-badge studio-provider-badge--local">
                          <span>Local Routing Solver</span>
                        </div>
                      )}
                    </div>
                    <button
                      type="button"
                      className="studio-btn-tiny"
                      onClick={handleDownloadManifest}
                    >
                      <Download size={11} />
                      <span>Download Manifest CSV</span>
                    </button>
                  </div>

                  {apiNotice && (
                    <div className="studio-api-notice">
                      <AlertCircle size={13} />
                      <span>{apiNotice}</span>
                    </div>
                  )}

                  <div className="studio-stats-grid">
                    <div className="studio-stat-cell">
                      <span className="studio-stat-cell__label">Active Routes</span>
                      <span className="studio-stat-cell__val">
                        {simulationResult.routes.length} vans
                      </span>
                    </div>
                    <div className="studio-stat-cell">
                      <span className="studio-stat-cell__label">Assigned Hotels</span>
                      <span className="studio-stat-cell__val">
                        {simulationResult.totalHotelsAssigned} /{" "}
                        {simulationResult.totalHotelsSelected}
                      </span>
                    </div>
                    <div className="studio-stat-cell">
                      <span className="studio-stat-cell__label">Total Linen Bags</span>
                      <span className="studio-stat-cell__val">
                        {simulationResult.totalBagsDemanded} bags
                      </span>
                    </div>
                    <div className="studio-stat-cell">
                      <span className="studio-stat-cell__label">Fleet Utilization</span>
                      <span className="studio-stat-cell__val">
                        {simulationResult.fleetUtilizationPct}%
                      </span>
                    </div>
                  </div>

                  {simulationResult.warnings.length > 0 && (
                    <div className="studio-warnings">
                      {simulationResult.warnings.map((w, i) => (
                        <div key={i} className="studio-warning-item">
                          <AlertCircle size={13} className="studio-warning-icon" />
                          <span>{w}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Simulated Vehicle Routes List */}
                <div className="studio-routes-accordion">
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
                        className={`studio-route-card ${
                          isExpanded ? "studio-route-card--expanded" : ""
                        }`}
                        style={{ "--route-c": route.color } as React.CSSProperties}
                      >
                        <div
                          className="studio-route-card__header"
                          onClick={() => {
                            setExpandedRouteId(isExpanded ? null : routeKey);
                            onSelectRoute(isExpanded ? null : rIdx);
                            onFocusRoute(rIdx);
                          }}
                        >
                          <div className="studio-route-card__title-row">
                            <span
                              className="studio-route-bullet"
                              style={{ background: route.color }}
                            />
                            <span className="studio-route-van-name">
                              {route.vehicle_label}
                            </span>
                            <span className="studio-route-depot-tag">
                              📍 Yeshwanthpur HQ
                            </span>
                          </div>

                          <div className="studio-route-card__meta-row">
                            <span>{route.total_hotels} stops</span>
                            <span className="studio-dot-sep">·</span>
                            <span>{route.total_dist_km} km</span>
                            <span className="studio-dot-sep">·</span>
                            <span>
                              {formatMins(
                                route.shift_duration_mins ??
                                  route.total_drive_mins + route.total_service_mins,
                              )}
                            </span>
                            <span className="studio-dot-sep">·</span>
                            <span className="studio-load-badge">
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
                          <div className="studio-cap-bar-track">
                            <div
                              className="studio-cap-bar-fill"
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
                          <div className="studio-route-stops-manifest">
                            <div className="studio-manifest-depot-step">
                              <span className="studio-depot-icon">HQ</span>
                              <div>
                                <b>Departure: {assignedDepot.name}</b>
                                <div className="studio-step-time">
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
                                  className={`studio-stop-row ${
                                    isLunch ? "studio-stop-row--lunch" : ""
                                  } ${
                                    isSelectedStop ? "studio-stop-row--active" : ""
                                  }`}
                                  onClick={() => {
                                    if (!isLunch) {
                                      onSelectStop(stop);
                                      onFocusStop(stop.lat, stop.lon);
                                    }
                                  }}
                                >
                                  <span
                                    className={`studio-stop-num ${
                                      isLunch ? "studio-stop-num--lunch" : ""
                                    }`}
                                    style={
                                      !isLunch
                                        ? { borderColor: route.color }
                                        : undefined
                                    }
                                  >
                                    {isLunch ? "🍱" : stop.stop_number}
                                  </span>

                                  <div className="studio-stop-details">
                                    <div className="studio-stop-name">
                                      {stop.name}
                                    </div>
                                    <div className="studio-stop-meta">
                                      <span>
                                        {stop.arrival_time} - {stop.departure_time}
                                      </span>
                                      <span className="studio-dot-sep">·</span>
                                      <span>{stop.stop_mins}m on-site</span>
                                      {!isLunch && (
                                        <>
                                          <span className="studio-dot-sep">·</span>
                                          <span className="studio-stop-bags">
                                            🧺 {stop.load_bags} bags
                                          </span>
                                        </>
                                      )}
                                    </div>
                                  </div>
                                </div>
                              );
                            })}

                            <div className="studio-manifest-depot-step">
                              <span className="studio-depot-icon">HQ</span>
                              <div>
                                <b>Return: {assignedDepot.name}</b>
                                <div className="studio-step-time">
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
      <div className="studio-footer-bar">
        <div className="studio-footer-info">
          <span>
            {selectedHotelsCount} hotels · {totalDemandBags} bags · {activeVehiclesCount}{" "}
            active vans
          </span>
          <span className="studio-footer-objective-tag">
            {objective === "fastest_turnaround" && "⚡ Fastest Turnaround"}
            {objective === "shortest_distance" && "🛣️ Shortest Distance"}
            {objective === "balanced" && "⚖️ Balanced Hybrid"}
            {objective === "minimize_fleet" && "🚐 Minimize Fleet"}
          </span>
        </div>
        <button
          type="button"
          className="studio-btn studio-btn--primary"
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
