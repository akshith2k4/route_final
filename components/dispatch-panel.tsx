"use client";

import { useMemo } from "react";
import {
  ArrowLeft,
  ArrowRight,
  Clock,
  Download,
  Gauge,
  MapPin,
  Navigation,
  Package,
  RotateCcw,
  Route as RouteIcon,
  Truck,
  Building2,
  CheckCircle2,
  AlertCircle,
} from "lucide-react";
import {
  formatDistance,
  formatMins,
  type DispatchRoute,
  type DispatchStop,
  type FleetDepot,
  type RegionMeta,
} from "../lib/coverage";

type DispatchPanelProps = {
  routes: DispatchRoute[];
  depot: FleetDepot;
  regions: RegionMeta[];
  selectedRouteIndex: number | null;
  onSelectRoute: (index: number | null) => void;
  selectedStopNumber: number | null;
  onSelectStop: (stop: DispatchStop) => void;
  selectedRegionFilter: number | null;
  onSelectRegionFilter: (regionId: number | null) => void;
  onFocusRoute: (index: number) => void;
  onFocusStop: (lat: number, lon: number) => void;
  title?: string;
  description?: string;
  manifestDownloadName?: string;
};

export default function DispatchPanel({
  routes,
  depot,
  regions,
  selectedRouteIndex,
  onSelectRoute,
  selectedStopNumber,
  onSelectStop,
  selectedRegionFilter,
  onSelectRegionFilter,
  onFocusRoute,
  onFocusStop,
  title,
  description,
  manifestDownloadName,
}: DispatchPanelProps) {
  const filteredRoutes = useMemo(() => {
    if (selectedRegionFilter === null) return routes;
    return routes.filter(
      (r) =>
        r.region_id === selectedRegionFilter ||
        r.stops.some((s: any) => s.region === selectedRegionFilter),
    );
  }, [routes, selectedRegionFilter]);

  const activeRoute = selectedRouteIndex !== null ? routes[selectedRouteIndex] : null;

  const fleetStats = useMemo(() => {
    const totalVans = routes.length;
    const totalStops = routes.reduce((sum, r) => sum + r.total_hotels, 0);
    const totalBags = routes.reduce((sum, r) => sum + r.total_bags, 0);
    const totalDistance = routes.reduce((sum, r) => sum + r.total_dist_km, 0);
    const totalDriveMins = routes.reduce((sum, r) => sum + r.total_drive_mins, 0);
    const avgUtilization =
      routes.reduce((sum, r) => sum + r.capacity_utilization_pct, 0) / (totalVans || 1);

    return {
      totalVans,
      totalStops,
      totalBags,
      totalDistance: Math.round(totalDistance),
      totalDriveMins,
      avgUtilization: Math.round(avgUtilization * 10) / 10,
    };
  }, [routes]);

  const handleDownloadManifest = (route?: DispatchRoute) => {
    const targetRoutes = route ? [route] : routes;
    const header = [
      "Region",
      "Vehicle",
      "Nominal Cap",
      "90% Cap Limit",
      "Stop Number",
      "Hotel Name",
      "Arrival Time",
      "Departure Time",
      "Service Mins",
      "Bags",
      "Latitude",
      "Longitude",
    ];

    const rows: string[] = [header.join(",")];
    for (const r of targetRoutes) {
      for (const s of r.stops) {
        rows.push(
          [
            r.region_id ? `R${r.region_id}` : `R${s.region ?? "Fleet"}`,
            `"${r.vehicle_label}"`,
            r.nominal_cap,
            r.max_load,
            s.stop_number,
            `"${s.name}"`,
            s.arrival_time,
            s.departure_time,
            s.stop_mins,
            s.load_bags,
            s.lat,
            s.lon,
          ].join(","),
        );
      }
    }

    const blob = new Blob([rows.join("\n")], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.setAttribute(
      "download",
      route
        ? `linengrass_manifest_${route.vehicle_label.toLowerCase().replace(/[^a-z0-9]/g, "_")}.csv`
        : manifestDownloadName ?? `linengrass_fleet_dispatch_manifest_101hotels.csv`,
    );
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className={`dispatch-panel [display:flex] [flex-direction:column] [height:100%] [overflow-y:auto] [overflow-x:hidden] [background:var(--paper)] [&::-webkit-scrollbar]:[width:6px] [&::-webkit-scrollbar-track]:[background:transparent] [&::-webkit-scrollbar-thumb]:[background:var(--line-strong)] [&::-webkit-scrollbar-thumb]:[border-radius:3px]`}>
      {/* Intro Header */}
      <div className={`panel-intro [flex:0_0_auto] [padding:21px_22px_16px] [&_h1]:[margin:11px_0_7px] [&_h1]:[color:var(--ink)] [&_h1]:[font-family:var(--font-instrument-serif),_Georgia,_"Times_New_Roman",_serif] [&_h1]:[font-size:40px] [&_h1]:[font-weight:400] [&_h1]:[letter-spacing:-0.022em] [&_h1]:[line-height:0.98] [&_p]:[max-width:307px] [&_p]:[color:var(--muted)] [&_p]:[font-size:12px] [&_p]:[line-height:1.58] max-[1180px]:[padding:23px_18px_17px] max-[760px]:[padding:22px_18px_16px] max-[760px]:[&_h1]:[font-size:39px] max-[560px]:[padding:21px_16px_15px] max-[560px]:[&_h1]:[font-size:36px] max-[560px]:[&_p]:[font-size:11.5px] dispatch-intro [padding-bottom:14px] [border-bottom:1px_solid_var(--line)]`}>
        <span className={`eyebrow [display:flex] [align-items:center] [gap:8px] [color:var(--muted)] [font-size:9px] [font-weight:700] [letter-spacing:0.145em] [text-transform:uppercase] [display:flex] [align-items:center] [gap:8px] [color:var(--muted)] [font-size:9px] [font-weight:700] [letter-spacing:0.145em] [text-transform:uppercase]`}>
          <span className={`eyebrow__dot [width:5px] [height:5px] [border-radius:50%] [background:#3c7a55] [box-shadow:0_0_0_3px_rgba(60,_122,_85,_0.1)] [width:5px] [height:5px] [border-radius:50%] [background:#3c7a55] [box-shadow:0_0_0_3px_rgba(60,_122,_85,_0.1)] eyebrow__dot--dispatch [background:#0891b2] [box-shadow:0_0_0_3px_rgba(8,_145,_178,_0.22)] [background:#0891b2] [box-shadow:0_0_0_3px_rgba(8,_145,_178,_0.22)]`} />
          Bengaluru · Fleet Operations
        </span>
        <h1>{title ?? "Fleet dispatch"}</h1>
        <p>
          {description ??
            `${fleetStats.totalVans} multi-van routes across 5 regions. Central HQ: Yeshwanthpur Central Laundry.`}
        </p>

        <div className={`intro-stats [display:grid] [grid-template-columns:repeat(3,_1fr)] [margin-top:15px] [padding:10px_0] [border-top:1px_solid_var(--line)] [border-bottom:1px_solid_var(--line)] dispatch-stats-strip [margin-top:14px] [grid-template-columns:repeat(4,_1fr)] [gap:8px]`}>
          <div className={`intro-stat [padding:0_12px] [border-left:1px_solid_var(--line)] first:[padding-left:0] first:[border-left:0] [&_b]:[display:block] [&_b]:[color:var(--ink)] [&_b]:[font-size:19px] [&_b]:[font-weight:600] [&_b]:[font-variant-numeric:tabular-nums] [&_b]:[letter-spacing:-0.035em] [&_b]:[line-height:1] [&_span]:[display:block] [&_span]:[margin-top:5px] [&_span]:[color:var(--faint)] [&_span]:[font-size:8.5px] [&_span]:[font-weight:600] [&_span]:[letter-spacing:0.1em] [&_span]:[text-transform:uppercase]`}>
            <b>{fleetStats.totalVans}</b>
            <span>Vehicles</span>
          </div>
          <div className={`intro-stat [padding:0_12px] [border-left:1px_solid_var(--line)] first:[padding-left:0] first:[border-left:0] [&_b]:[display:block] [&_b]:[color:var(--ink)] [&_b]:[font-size:19px] [&_b]:[font-weight:600] [&_b]:[font-variant-numeric:tabular-nums] [&_b]:[letter-spacing:-0.035em] [&_b]:[line-height:1] [&_span]:[display:block] [&_span]:[margin-top:5px] [&_span]:[color:var(--faint)] [&_span]:[font-size:8.5px] [&_span]:[font-weight:600] [&_span]:[letter-spacing:0.1em] [&_span]:[text-transform:uppercase]`}>
            <b>{fleetStats.totalStops}</b>
            <span>Stops</span>
          </div>
          <div className={`intro-stat [padding:0_12px] [border-left:1px_solid_var(--line)] first:[padding-left:0] first:[border-left:0] [&_b]:[display:block] [&_b]:[color:var(--ink)] [&_b]:[font-size:19px] [&_b]:[font-weight:600] [&_b]:[font-variant-numeric:tabular-nums] [&_b]:[letter-spacing:-0.035em] [&_b]:[line-height:1] [&_span]:[display:block] [&_span]:[margin-top:5px] [&_span]:[color:var(--faint)] [&_span]:[font-size:8.5px] [&_span]:[font-weight:600] [&_span]:[letter-spacing:0.1em] [&_span]:[text-transform:uppercase]`}>
            <b>{fleetStats.totalBags}</b>
            <span>Bags</span>
          </div>
          <div className={`intro-stat [padding:0_12px] [border-left:1px_solid_var(--line)] first:[padding-left:0] first:[border-left:0] [&_b]:[display:block] [&_b]:[color:var(--ink)] [&_b]:[font-size:19px] [&_b]:[font-weight:600] [&_b]:[font-variant-numeric:tabular-nums] [&_b]:[letter-spacing:-0.035em] [&_b]:[line-height:1] [&_span]:[display:block] [&_span]:[margin-top:5px] [&_span]:[color:var(--faint)] [&_span]:[font-size:8.5px] [&_span]:[font-weight:600] [&_span]:[letter-spacing:0.1em] [&_span]:[text-transform:uppercase]`}>
            <b>{fleetStats.totalDistance} km</b>
            <span>Fleet dist</span>
          </div>
        </div>
      </div>

      {/* Region Filter Bar */}
      <div className={`dispatch-filter-bar [padding:12px_20px] [border-bottom:1px_solid_var(--line)] [background:var(--bone)] [display:flex] [flex-direction:column] [gap:8px]`}>
        <div className={`dispatch-filter-bar__head [display:flex] [align-items:center] [justify-content:space-between] [font-size:11px] [font-weight:600] [text-transform:uppercase] [letter-spacing:0.05em] [color:var(--muted)]`}>
          <span>Filter by Region</span>
          {selectedRegionFilter !== null && (
            <button
              type="button"
              className={`dispatch-clear-filter [background:none] [border:none] [color:var(--green)] [font-size:11px] [font-weight:600] [cursor:pointer] [text-decoration:underline] [padding:0] hover:[color:var(--green-deep)]`}
              onClick={() => onSelectRegionFilter(null)}
            >
              Show all 10 vans
            </button>
          )}
        </div>
        <div className={`dispatch-region-pills [display:flex] [gap:6px] [flex-wrap:wrap]`}>
          <button
            type="button"
            className={`dispatch-region-pill [display:inline-flex] [align-items:center] [gap:5px] [padding:4px_10px] [border-radius:999px] [border:1px_solid_var(--line-strong)] [background:var(--paper-strong)] [color:var(--ink)] [font-size:11px] [font-weight:500] [cursor:pointer] [transition:all_0.15s_ease] hover:[background:#ffffff] hover:[border-color:var(--line-focus)] [&.is-active]:[background:var(--ink)] [&.is-active]:[color:#ffffff] [&.is-active]:[border-color:var(--ink)] [&_span]:[font-size:10px] [&_span]:[opacity:0.7] ${selectedRegionFilter === null ? `is-active [&_span]:[opacity:0.9] [.plan-mode-switch_&]:[background:var(--ink)] [.plan-mode-switch_&]:[color:var(--cream)]` : ""}`}
            onClick={() => onSelectRegionFilter(null)}
          >
            All regions <span>10</span>
          </button>
          {regions.map((reg) => {
            const vansInRegion = routes.filter((r) => r.region_id === reg.id).length;
            const isSelected = selectedRegionFilter === reg.id;
            return (
              <button
                type="button"
                key={reg.id}
                className={`dispatch-region-pill [display:inline-flex] [align-items:center] [gap:5px] [padding:4px_10px] [border-radius:999px] [border:1px_solid_var(--line-strong)] [background:var(--paper-strong)] [color:var(--ink)] [font-size:11px] [font-weight:500] [cursor:pointer] [transition:all_0.15s_ease] hover:[background:#ffffff] hover:[border-color:var(--line-focus)] [&.is-active]:[background:var(--ink)] [&.is-active]:[color:#ffffff] [&.is-active]:[border-color:var(--ink)] [&_span]:[font-size:10px] [&_span]:[opacity:0.7] ${isSelected ? `is-active [&_span]:[opacity:0.9] [.plan-mode-switch_&]:[background:var(--ink)] [.plan-mode-switch_&]:[color:var(--cream)]` : ""}`}
                style={{ "--pill-color": reg.color } as React.CSSProperties}
                onClick={() => onSelectRegionFilter(isSelected ? null : reg.id)}
              >
                <span className={`pill-dot [.dispatch-region-pill_&]:[width:7px] [.dispatch-region-pill_&]:[height:7px] [.dispatch-region-pill_&]:[border-radius:50%] [.dispatch-region-pill_&]:[display:inline-block]`} style={{ backgroundColor: reg.color }} />
                {reg.code} <span>{vansInRegion}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Main Content Area: Vehicle List OR Vehicle Detail Timeline */}
      {activeRoute ? (
        /* ================= SINGLE VEHICLE DETAIL & TIMELINE ================= */
        <div className={`dispatch-detail-view [padding:16px_20px_48px] [display:flex] [flex-direction:column] [gap:16px]`}>
          <div className={`dispatch-detail-top [display:flex] [align-items:center] [justify-content:space-between]`}>
            <button
              type="button"
              className={`dispatch-back-btn [display:inline-flex] [align-items:center] [gap:6px] [background:none] [border:none] [font-size:12px] [font-weight:600] [color:var(--muted)] [cursor:pointer] [padding:4px_0] [transition:color_0.15s_ease] hover:[color:var(--ink)]`}
              onClick={() => onSelectRoute(null)}
            >
              <ArrowLeft size={14} />
              <span>All vehicles</span>
            </button>
            <button
              type="button"
              className={`dispatch-export-btn [display:inline-flex] [align-items:center] [gap:5px] [padding:5px_10px] [border-radius:6px] [border:1px_solid_var(--line-strong)] [background:var(--paper-strong)] [color:var(--ink)] [font-size:11px] [font-weight:500] [cursor:pointer] [transition:all_0.15s_ease] hover:[background:var(--bone)] hover:[border-color:var(--line-focus)]`}
              onClick={() => handleDownloadManifest(activeRoute)}
              title="Download Driver Manifest CSV"
            >
              <Download size={13} />
              <span>Export run-sheet</span>
            </button>
          </div>

          <div
            className={`dispatch-hero-card [display:flex] [flex-direction:column] [gap:14px] [padding:18px_20px] [border-radius:12px] [border:1px_solid_var(--line-strong)] [background:var(--paper-strong)] [box-shadow:0_4px_16px_rgba(24,_36,_30,_0.05)] [border-top:4px_solid_var(--van-color,_var(--ink))]`}
            style={{ "--van-color": activeRoute.color } as React.CSSProperties}
          >
            <div className={`dispatch-hero-card__header [display:flex] [align-items:center] [justify-content:space-between]`}>
              <div className={`dispatch-hero-card__badge [display:flex] [align-items:center] [gap:8px]`}>
                <span
                  className={`dispatch-van-swatch [width:10px] [height:10px] [border-radius:50%]`}
                  style={{ backgroundColor: activeRoute.color }}
                />
                <span className={`dispatch-van-code [font-size:11.5px] [font-weight:700] [text-transform:uppercase] [letter-spacing:0.04em] [color:var(--muted)]`}>
                  {activeRoute.region_id ? `R${activeRoute.region_id} · ` : ""}
                  {activeRoute.vehicle_label.split(" (")[0]}
                </span>
              </div>
              <span className={`dispatch-status-chip [font-size:10.5px] [font-weight:700] [padding:2px_8px] [border-radius:999px] [background:rgba(16,_185,_129,_0.14)] [color:#065f46] [border:1px_solid_rgba(16,_185,_129,_0.3)]`}>
                {activeRoute.capacity_utilization_pct >= 95
                  ? "At 90% Limit"
                  : "Optimal Load"}
              </span>
            </div>

            <h2 className={`dispatch-hero-card__title [font-family:var(--font-instrument-serif),_Georgia,_serif] [font-size:26px] [color:var(--ink)] [line-height:1.15] [margin:0]`}>
              {activeRoute.vehicle_label.includes(" - ")
                ? activeRoute.vehicle_label.split(" - ")[1].replace(")", "")
                : activeRoute.vehicle_label}
            </h2>

            <div className={`dispatch-hero-card__meta [font-size:12px] [color:var(--muted)]`}>
              <span>{activeRoute.region_name}</span>
            </div>

            {/* Capacity Gauge */}
            <div className={`dispatch-capacity-gauge [display:flex] [flex-direction:column] [gap:6px] [padding:14px_16px] [border-radius:10px] [background:var(--bone)] [border:1px_solid_var(--line)]`}>
              <div className={`dispatch-capacity-gauge__labels [display:flex] [align-items:center] [justify-content:space-between] [font-size:12px]`}>
                <span className={`dispatch-capacity-gauge__title [display:flex] [align-items:center] [gap:5px] [font-weight:600] [color:var(--ink)]`}>
                  <Package size={13} />
                  Operational Payload (90% Cap)
                </span>
                <span className={`dispatch-capacity-gauge__nums [color:var(--muted)] [font-size:12px] [&_b]:[color:var(--ink)] [&_b]:[font-size:14px]`}>
                  <b>{activeRoute.total_bags}</b> / {activeRoute.max_load} bags{" "}
                  <span className={`dispatch-pct [.dispatch-capacity-gauge__nums_&]:[font-weight:700] [.dispatch-capacity-gauge__nums_&]:[color:var(--ink)]`}>
                    ({activeRoute.capacity_utilization_pct}%)
                  </span>
                </span>
              </div>
              <div className={`dispatch-progress-bar [width:100%] [height:10px] [border-radius:5px] [background:rgba(24,_36,_30,_0.1)] [overflow:hidden] [position:relative]`}>
                <div
                  className={`dispatch-progress-fill [height:100%] [border-radius:5px] [transition:width_0.4s_cubic-bezier(0.4,_0,_0.2,_1)]`}
                  style={{
                    width: `${Math.min(activeRoute.capacity_utilization_pct, 100)}%`,
                    backgroundColor:
                      activeRoute.capacity_utilization_pct >= 95
                        ? "#f59e0b"
                        : activeRoute.color,
                  }}
                />
              </div>
              <div className={`dispatch-capacity-foot [display:flex] [align-items:center] [justify-content:space-between] [font-size:10px] [color:var(--faint)] [margin-top:2px]`}>
                <span>Nominal capacity: {activeRoute.nominal_cap} bags</span>
                <span>Buffer reserve: {activeRoute.nominal_cap - activeRoute.max_load} bags</span>
              </div>
            </div>

            {/* Quick Trip Metrics */}
            <div className={`dispatch-trip-metrics [display:grid] [grid-template-columns:repeat(2,_1fr)] [gap:10px]`}>
              <div className={`dispatch-trip-metric [display:flex] [align-items:flex-start] [gap:9px] [padding:10px_12px] [border-radius:8px] [background:var(--paper)] [border:1px_solid_var(--line)]`}>
                <span className={`metric-icon [margin-top:2px] [color:var(--muted)]`}><Navigation size={13} /></span>
                <div className={`metric-data [display:flex] [flex-direction:column] [gap:1px] [&_b]:[font-size:12.5px] [&_b]:[color:var(--ink)] [&_b]:[font-weight:600] [&_span]:[font-size:10px] [&_span]:[color:var(--muted)] [&_span]:[text-transform:uppercase] [&_span]:[letter-spacing:0.03em]`}>
                  <b>{activeRoute.total_dist_km} km</b>
                  <span>Total distance</span>
                </div>
              </div>
              <div className={`dispatch-trip-metric [display:flex] [align-items:flex-start] [gap:9px] [padding:10px_12px] [border-radius:8px] [background:var(--paper)] [border:1px_solid_var(--line)]`}>
                <span className={`metric-icon [margin-top:2px] [color:var(--muted)]`}><Clock size={13} /></span>
                <div className={`metric-data [display:flex] [flex-direction:column] [gap:1px] [&_b]:[font-size:12.5px] [&_b]:[color:var(--ink)] [&_b]:[font-weight:600] [&_span]:[font-size:10px] [&_span]:[color:var(--muted)] [&_span]:[text-transform:uppercase] [&_span]:[letter-spacing:0.03em]`}>
                  <b>{activeRoute.departure_hq} - {activeRoute.return_hq}</b>
                  <span>Shift window</span>
                </div>
              </div>
              <div className={`dispatch-trip-metric [display:flex] [align-items:flex-start] [gap:9px] [padding:10px_12px] [border-radius:8px] [background:var(--paper)] [border:1px_solid_var(--line)]`}>
                <span className={`metric-icon [margin-top:2px] [color:var(--muted)]`}><Truck size={13} /></span>
                <div className={`metric-data [display:flex] [flex-direction:column] [gap:1px] [&_b]:[font-size:12.5px] [&_b]:[color:var(--ink)] [&_b]:[font-weight:600] [&_span]:[font-size:10px] [&_span]:[color:var(--muted)] [&_span]:[text-transform:uppercase] [&_span]:[letter-spacing:0.03em]`}>
                  <b>{formatMins(activeRoute.total_drive_mins)}</b>
                  <span>Drive time</span>
                </div>
              </div>
              <div className={`dispatch-trip-metric [display:flex] [align-items:flex-start] [gap:9px] [padding:10px_12px] [border-radius:8px] [background:var(--paper)] [border:1px_solid_var(--line)]`}>
                <span className={`metric-icon [margin-top:2px] [color:var(--muted)]`}><Package size={13} /></span>
                <div className={`metric-data [display:flex] [flex-direction:column] [gap:1px] [&_b]:[font-size:12.5px] [&_b]:[color:var(--ink)] [&_b]:[font-weight:600] [&_span]:[font-size:10px] [&_span]:[color:var(--muted)] [&_span]:[text-transform:uppercase] [&_span]:[letter-spacing:0.03em]`}>
                  <b>{formatMins(activeRoute.total_service_mins)}</b>
                  <span>Service time</span>
                </div>
              </div>
            </div>

            <div className={`dispatch-hero-card__actions [display:flex]`}>
              <button
                type="button"
                className={`dispatch-focus-route-btn [width:100%] [display:flex] [align-items:center] [justify-content:center] [gap:7px] [padding:9px_16px] [border-radius:8px] [background:var(--ink)] [color:#ffffff] [border:none] [font-size:12px] [font-weight:600] [cursor:pointer] [transition:background_0.15s_ease,_transform_0.1s_ease] hover:[background:#2b3a32]`}
                onClick={() => {
                  if (selectedRouteIndex !== null) onFocusRoute(selectedRouteIndex);
                }}
              >
                <RouteIcon size={14} />
                <span>Fit Route on Map</span>
              </button>
            </div>
          </div>

          {/* Chronological Driver Shift Timeline */}
          <div className={`dispatch-timeline-section [display:flex] [flex-direction:column] [gap:12px]`}>
            <div className={`dispatch-timeline-head [display:flex] [align-items:center] [justify-content:space-between] [padding:4px_0] [&_h3]:[font-size:13px] [&_h3]:[font-weight:700] [&_h3]:[text-transform:uppercase] [&_h3]:[letter-spacing:0.04em] [&_h3]:[color:var(--ink)] [&_h3]:[margin:0]`}>
              <h3>Sequential Stop Manifest</h3>
              <span className={`dispatch-stop-counter [font-size:11px] [color:var(--muted)] [font-weight:500]`}>
                {activeRoute.total_hotels} on-site stops
              </span>
            </div>

            <div className={`dispatch-timeline [position:relative] [display:flex] [flex-direction:column] [gap:14px] [padding-left:36px] before:[content:""] before:[position:absolute] before:[top:14px] before:[bottom:24px] before:[left:13px] before:[width:2px] before:[background:repeating-linear-gradient(_to_bottom,_var(--line-strong)_0px,_var(--line-strong)_4px,_transparent_4px,_transparent_8px_)]`}>
              {/* Origin: Central Depot */}
              <div className={`dispatch-timeline-item [position:relative] dispatch-timeline-item--origin`}>
                <div className={`timeline-node [position:absolute] [left:-36px] [top:10px] [width:26px] [height:26px] [border-radius:50%] [display:flex] [align-items:center] [justify-content:center] [background:var(--ink)] [color:#ffffff] [font-size:11px] [font-weight:700] [border:2px_solid_var(--paper)] [box-shadow:0_1px_4px_rgba(24,_36,_30,_0.15)] [z-index:2] timeline-node--depot [background:#18241e] [color:#fbbf24] [border-color:#fbbf24]`}>
                  <Building2 size={13} />
                </div>
                <div className={`timeline-card [display:flex] [flex-direction:column] [gap:6px] [padding:12px_14px] [border-radius:9px] [background:var(--paper-strong)] [border:1px_solid_var(--line)] [box-shadow:0_1px_3px_rgba(24,_36,_30,_0.04)] [cursor:pointer] [transition:all_0.15s_ease] hover:[border-color:var(--line-focus)] hover:[box-shadow:0_4px_12px_rgba(24,_36,_30,_0.06)] [&.is-active]:[border-color:var(--ink)] [&.is-active]:[background:#ffffff] [&.is-active]:[box-shadow:0_0_0_1.5px_var(--ink),_0_4px_14px_rgba(24,_36,_30,_0.08)] timeline-card--depot [background:var(--bone)] [border-color:var(--line-strong)]`}>
                  <div className={`timeline-card__top [display:flex] [align-items:center] [justify-content:space-between] [font-size:11px]`}>
                    <span className={`timeline-time [font-weight:700] [color:var(--ink)] [letter-spacing:-0.01em]`}>{activeRoute.departure_hq}</span>
                    <span className={`timeline-badge [font-size:9.5px] [font-weight:700] [text-transform:uppercase] [padding:1px_6px] [border-radius:4px] [letter-spacing:0.04em] timeline-badge--depot [background:rgba(251,_191,_36,_0.2)] [color:#92400e] [border:1px_solid_rgba(251,_191,_36,_0.4)]`}>HQ Depot</span>
                  </div>
                  <div className={`timeline-card__title [font-family:var(--font-dm-sans),_sans-serif] [font-size:13px] [font-weight:600] [color:var(--ink)] [line-height:1.3]`}>
                    {depot.name}
                  </div>
                  <div className={`timeline-card__sub [font-size:11px] [color:var(--muted)] [line-height:1.35]`}>
                    Van departure · Initial cargo empty · Begins delivery circuit
                  </div>
                  <button
                    type="button"
                    className={`timeline-locate-btn [display:inline-flex] [align-items:center] [gap:4px] [margin-left:auto] [padding:2px_7px] [border-radius:4px] [background:var(--paper)] [border:1px_solid_var(--line-strong)] [font-size:10px] [font-weight:600] [color:var(--green)] [cursor:pointer] [transition:all_0.15s_ease] hover:[background:var(--ink)] hover:[color:#ffffff] hover:[border-color:var(--ink)]`}
                    onClick={() => onFocusStop(depot.latitude, depot.longitude)}
                  >
                    <MapPin size={12} />
                    <span>Locate HQ</span>
                  </button>
                </div>
              </div>

              {/* Sequential Hotel Stops */}
              {activeRoute.stops.map((stop, sIdx) => {
                const isSelectedStop = selectedStopNumber === stop.stop_number;
                // Calculate cumulative bags up to this stop
                const cumBags = activeRoute.stops
                  .slice(0, sIdx + 1)
                  .reduce((sum, s) => sum + s.load_bags, 0);

                return (
                  <div
                    key={stop.stop_number}
                    className={`dispatch-timeline-item [position:relative] ${isSelectedStop ? "is-selected-stop" : ""}`}
                  >
                    <div
                      className={`timeline-node [position:absolute] [left:-36px] [top:10px] [width:26px] [height:26px] [border-radius:50%] [display:flex] [align-items:center] [justify-content:center] [background:var(--ink)] [color:#ffffff] [font-size:11px] [font-weight:700] [border:2px_solid_var(--paper)] [box-shadow:0_1px_4px_rgba(24,_36,_30,_0.15)] [z-index:2] timeline-node--stop`}
                      style={{ backgroundColor: activeRoute.color }}
                    >
                      {stop.stop_number}
                    </div>

                    <div
                      className={`timeline-card [display:flex] [flex-direction:column] [gap:6px] [padding:12px_14px] [border-radius:9px] [background:var(--paper-strong)] [border:1px_solid_var(--line)] [box-shadow:0_1px_3px_rgba(24,_36,_30,_0.04)] [cursor:pointer] [transition:all_0.15s_ease] hover:[border-color:var(--line-focus)] hover:[box-shadow:0_4px_12px_rgba(24,_36,_30,_0.06)] [&.is-active]:[border-color:var(--ink)] [&.is-active]:[background:#ffffff] [&.is-active]:[box-shadow:0_0_0_1.5px_var(--ink),_0_4px_14px_rgba(24,_36,_30,_0.08)] ${isSelectedStop ? `is-active [&_span]:[opacity:0.9] [.plan-mode-switch_&]:[background:var(--ink)] [.plan-mode-switch_&]:[color:var(--cream)]` : ""}`}
                      onClick={() => onSelectStop(stop)}
                    >
                      <div className={`timeline-card__top [display:flex] [align-items:center] [justify-content:space-between] [font-size:11px]`}>
                        <span className={`timeline-time [font-weight:700] [color:var(--ink)] [letter-spacing:-0.01em]`}>
                          {stop.arrival_time} - {stop.departure_time}
                        </span>
                        <span className={`timeline-duration [font-size:10.5px] [color:var(--muted)] [font-weight:500]`}>
                          ⏱️ {stop.stop_mins} min stop
                        </span>
                      </div>

                      <div className={`timeline-card__title [font-family:var(--font-dm-sans),_sans-serif] [font-size:13px] [font-weight:600] [color:var(--ink)] [line-height:1.3]`}>
                        {stop.name}
                      </div>

                      <div className={`timeline-card__chips [display:flex] [align-items:center] [gap:6px] [flex-wrap:wrap] [margin-top:2px]`}>
                        <span className={`timeline-chip [font-size:10px] [padding:2px_7px] [border-radius:4px] [background:var(--bone)] [border:1px_solid_var(--line)] [color:var(--ink)] [font-weight:500] timeline-chip--bags [background:rgba(8,_145,_178,_0.08)] [border-color:rgba(8,_145,_178,_0.2)] [color:#0e7490] [font-weight:600]`}>
                          🧺 +{stop.load_bags} bags
                        </span>
                        <span className={`timeline-chip [font-size:10px] [padding:2px_7px] [border-radius:4px] [background:var(--bone)] [border:1px_solid_var(--line)] [color:var(--ink)] [font-weight:500] timeline-chip--cum [background:var(--bone)] [color:var(--muted)]`}>
                          Van load: {cumBags} / {activeRoute.max_load}
                        </span>
                        <button
                          type="button"
                          className={`timeline-locate-btn [display:inline-flex] [align-items:center] [gap:4px] [margin-left:auto] [padding:2px_7px] [border-radius:4px] [background:var(--paper)] [border:1px_solid_var(--line-strong)] [font-size:10px] [font-weight:600] [color:var(--green)] [cursor:pointer] [transition:all_0.15s_ease] hover:[background:var(--ink)] hover:[color:#ffffff] hover:[border-color:var(--ink)]`}
                          onClick={(e) => {
                            e.stopPropagation();
                            onFocusStop(stop.lat, stop.lon);
                          }}
                        >
                          <MapPin size={12} />
                          <span>Map</span>
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}

              {/* Terminal: Central Depot Return */}
              <div className={`dispatch-timeline-item [position:relative] dispatch-timeline-item--terminal`}>
                <div className={`timeline-node [position:absolute] [left:-36px] [top:10px] [width:26px] [height:26px] [border-radius:50%] [display:flex] [align-items:center] [justify-content:center] [background:var(--ink)] [color:#ffffff] [font-size:11px] [font-weight:700] [border:2px_solid_var(--paper)] [box-shadow:0_1px_4px_rgba(24,_36,_30,_0.15)] [z-index:2] timeline-node--depot [background:#18241e] [color:#fbbf24] [border-color:#fbbf24]`}>
                  <CheckCircle2 size={13} />
                </div>
                <div className={`timeline-card [display:flex] [flex-direction:column] [gap:6px] [padding:12px_14px] [border-radius:9px] [background:var(--paper-strong)] [border:1px_solid_var(--line)] [box-shadow:0_1px_3px_rgba(24,_36,_30,_0.04)] [cursor:pointer] [transition:all_0.15s_ease] hover:[border-color:var(--line-focus)] hover:[box-shadow:0_4px_12px_rgba(24,_36,_30,_0.06)] [&.is-active]:[border-color:var(--ink)] [&.is-active]:[background:#ffffff] [&.is-active]:[box-shadow:0_0_0_1.5px_var(--ink),_0_4px_14px_rgba(24,_36,_30,_0.08)] timeline-card--depot [background:var(--bone)] [border-color:var(--line-strong)]`}>
                  <div className={`timeline-card__top [display:flex] [align-items:center] [justify-content:space-between] [font-size:11px]`}>
                    <span className={`timeline-time [font-weight:700] [color:var(--ink)] [letter-spacing:-0.01em]`}>{activeRoute.return_hq}</span>
                    <span className={`timeline-badge [font-size:9.5px] [font-weight:700] [text-transform:uppercase] [padding:1px_6px] [border-radius:4px] [letter-spacing:0.04em] timeline-badge--return [background:rgba(16,_185,_129,_0.15)] [color:#065f46] [border:1px_solid_rgba(16,_185,_129,_0.3)]`}>Shift Complete</span>
                  </div>
                  <div className={`timeline-card__title [font-family:var(--font-dm-sans),_sans-serif] [font-size:13px] [font-weight:600] [color:var(--ink)] [line-height:1.3]`}>
                    {depot.name}
                  </div>
                  <div className={`timeline-card__sub [font-size:11px] [color:var(--muted)] [line-height:1.35]`}>
                    Van returns to Central Laundry · {activeRoute.total_bags} soiled bags unloaded for wash cycle
                  </div>
                  <button
                    type="button"
                    className={`timeline-locate-btn [display:inline-flex] [align-items:center] [gap:4px] [margin-left:auto] [padding:2px_7px] [border-radius:4px] [background:var(--paper)] [border:1px_solid_var(--line-strong)] [font-size:10px] [font-weight:600] [color:var(--green)] [cursor:pointer] [transition:all_0.15s_ease] hover:[background:var(--ink)] hover:[color:#ffffff] hover:[border-color:var(--ink)]`}
                    onClick={() => onFocusStop(depot.latitude, depot.longitude)}
                  >
                    <MapPin size={12} />
                    <span>Locate HQ</span>
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      ) : (
        /* ================= ALL VEHICLES LIST ================= */
        <div className={`dispatch-vehicle-list [padding:18px_20px_36px] [display:flex] [flex-direction:column] [gap:14px]`}>
          <div className={`dispatch-vehicle-list__head [display:flex] [align-items:center] [justify-content:space-between] [&_h3]:[font-size:13px] [&_h3]:[font-weight:600] [&_h3]:[text-transform:uppercase] [&_h3]:[letter-spacing:0.04em] [&_h3]:[color:var(--ink)] [&_h3]:[margin:0]`}>
            <div className={`list-title [.dispatch-vehicle-list__head_&]:[display:flex] [.dispatch-vehicle-list__head_&]:[align-items:center] [.dispatch-vehicle-list__head_&]:[gap:8px]`}>
              <h3>Vehicles in Active Plan</h3>
              <span className={`count-pill [.dispatch-vehicle-list__head_&]:[font-size:11px] [.dispatch-vehicle-list__head_&]:[padding:2px_7px] [.dispatch-vehicle-list__head_&]:[border-radius:999px] [.dispatch-vehicle-list__head_&]:[background:var(--bone)] [.dispatch-vehicle-list__head_&]:[border:1px_solid_var(--line)] [.dispatch-vehicle-list__head_&]:[color:var(--muted)]`}>{filteredRoutes.length} of 10 vans</span>
            </div>
            <button
              type="button"
              className={`dispatch-export-all-btn [display:inline-flex] [align-items:center] [gap:5px] [padding:5px_10px] [border-radius:6px] [border:1px_solid_var(--line-strong)] [background:var(--paper-strong)] [color:var(--ink)] [font-size:11px] [font-weight:500] [cursor:pointer] [transition:all_0.15s_ease] hover:[background:var(--bone)] hover:[border-color:var(--line-focus)]`}
              onClick={() => handleDownloadManifest()}
              title="Download Full Dispatch Manifest CSV"
            >
              <Download size={13} />
              <span>Export fleet CSV</span>
            </button>
          </div>

          <div className={`dispatch-cards-grid [display:grid] [grid-template-columns:1fr] [gap:12px]`}>
            {filteredRoutes.map((route) => {
              const actualIdx = routes.indexOf(route);
              return (
                <div
                  key={route.vehicle_label}
                  className={`dispatch-van-card [position:relative] [display:flex] [flex-direction:column] [gap:10px] [padding:14px_16px] [border-radius:10px] [border:1px_solid_var(--line)] [background:var(--paper-strong)] [box-shadow:0_1px_3px_rgba(24,_36,_30,_0.04)] [cursor:pointer] [transition:transform_0.15s_ease,_box-shadow_0.15s_ease,_border-color_0.15s_ease] [border-left:4px_solid_var(--van-color,_var(--ink))] hover:[transform:translateY(-2px)] hover:[box-shadow:0_6px_18px_rgba(24,_36,_30,_0.08)] hover:[border-color:var(--line-focus)] hover:[border-left-color:var(--van-color,_var(--ink))]`}
                  style={{ "--van-color": route.color } as React.CSSProperties}
                  onClick={() => onSelectRoute(actualIdx)}
                >
                  <div className={`dispatch-van-card__top [display:flex] [align-items:center] [justify-content:space-between]`}>
                    <div className={`van-label-group [display:flex] [align-items:center] [gap:7px]`}>
                      <span
                        className={`van-dot [width:8px] [height:8px] [border-radius:50%]`}
                        style={{ backgroundColor: route.color }}
                      />
                      <span className={`van-name [font-size:13px] [font-weight:700] [color:var(--ink)] [letter-spacing:-0.01em]`}>
                        {route.vehicle_label.split(" (")[0]}
                      </span>
                      {route.region_id ? (
                        <span className={`van-region-tag [font-size:10px] [font-weight:700] [padding:1px_5px] [border-radius:4px] [background:var(--bone)] [color:var(--muted)]`}>R{route.region_id}</span>
                      ) : route.route_id ? (
                        <span className={`van-region-tag [font-size:10px] [font-weight:700] [padding:1px_5px] [border-radius:4px] [background:var(--bone)] [color:var(--muted)]`}>#{route.route_id}</span>
                      ) : null}
                    </div>

                    <span
                      className={`van-status-tag [font-size:10px] [font-weight:600] [padding:2px_7px] [border-radius:999px] [line-height:1.2] ${
                        route.capacity_utilization_pct >= 95
                          ? `van-status-tag--high [background:rgba(245,_158,_11,_0.14)] [color:#92400e] [border:1px_solid_rgba(245,_158,_11,_0.35)]`
                          : `van-status-tag--optimal [background:rgba(16,_185,_129,_0.12)] [color:#065f46] [border:1px_solid_rgba(16,_185,_129,_0.25)]`
                      }`}
                    >
                      {route.capacity_utilization_pct}% load
                    </span>
                  </div>

                  <div className={`van-sector-title [font-family:var(--font-instrument-serif),_Georgia,_serif] [font-size:18px] [color:var(--ink)] [line-height:1.25]`}>
                    {route.vehicle_label.includes(" - ")
                      ? route.vehicle_label.split(" - ")[1].replace(")", "")
                      : route.region_name}
                  </div>

                  {/* Capacity Bar */}
                  <div className={`van-mini-capacity [display:flex] [flex-direction:column] [gap:4px] [padding:8px_10px] [background:var(--bone)] [border-radius:6px]`}>
                    <div className={`mini-labels [display:flex] [justify-content:space-between] [align-items:center] [font-size:10.5px] [color:var(--muted)] [&_b]:[color:var(--ink)] [&_b]:[font-weight:600]`}>
                      <span>Payload load</span>
                      <b>
                        {route.total_bags} / {route.max_load} bags
                      </b>
                    </div>
                    <div className={`mini-progress-bar [width:100%] [height:6px] [border-radius:3px] [background:rgba(24,_36,_30,_0.08)] [overflow:hidden] [position:relative]`}>
                      <div
                        className={`mini-progress-fill [height:100%] [border-radius:3px] [transition:width_0.3s_ease]`}
                        style={{
                          width: `${Math.min(route.capacity_utilization_pct, 100)}%`,
                          backgroundColor: route.color,
                        }}
                      />
                    </div>
                  </div>

                  <div className={`van-card-stats [display:grid] [grid-template-columns:repeat(3,_1fr)] [gap:8px] [padding-top:6px] [border-top:1px_dashed_var(--line)] [&>div]:[display:flex] [&>div]:[flex-direction:column] [&>div]:[gap:2px] [&_span]:[font-size:9.5px] [&_span]:[text-transform:uppercase] [&_span]:[letter-spacing:0.04em] [&_span]:[color:var(--muted)] [&_b]:[font-size:11px] [&_b]:[color:var(--ink)] [&_b]:[white-space:nowrap]`}>
                    <div>
                      <span>Stops</span>
                      <b>{route.total_hotels}</b>
                    </div>
                    <div>
                      <span>Distance</span>
                      <b>{route.total_dist_km} km</b>
                    </div>
                    <div>
                      <span>Shift</span>
                      <b>
                        {route.departure_hq} - {route.return_hq}
                      </b>
                    </div>
                  </div>

                  <div className={`van-card-footer [display:flex] [align-items:center] [justify-content:space-between] [font-size:11px] [font-weight:600] [color:var(--green)] [padding-top:4px] [.dispatch-van-card:hover_&]:[color:var(--green-deep)]`}>
                    <span>Explore shift run-sheet</span>
                    <ArrowRight size={13} />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
