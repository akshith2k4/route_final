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
}: DispatchPanelProps) {
  const filteredRoutes = useMemo(() => {
    if (selectedRegionFilter === null) return routes;
    return routes.filter((r) => r.region_id === selectedRegionFilter);
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
            `R${r.region_id}`,
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
        : `linengrass_fleet_dispatch_manifest_102hotels.csv`,
    );
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="dispatch-panel">
      {/* Intro Header */}
      <div className="panel-intro dispatch-intro">
        <span className="eyebrow">
          <span className="eyebrow__dot eyebrow__dot--dispatch" />
          Bengaluru · Fleet Operations
        </span>
        <h1>Fleet dispatch</h1>
        <p>
          10 multi-van routes across 5 regions. Central HQ: Yeshwanthpur Central
          Laundry.
        </p>

        <div className="intro-stats dispatch-stats-strip">
          <div className="intro-stat">
            <b>{fleetStats.totalVans}</b>
            <span>Vehicles</span>
          </div>
          <div className="intro-stat">
            <b>{fleetStats.totalStops}</b>
            <span>Stops</span>
          </div>
          <div className="intro-stat">
            <b>{fleetStats.totalBags}</b>
            <span>Bags</span>
          </div>
          <div className="intro-stat">
            <b>{fleetStats.totalDistance} km</b>
            <span>Fleet dist</span>
          </div>
        </div>
      </div>

      {/* Region Filter Bar */}
      <div className="dispatch-filter-bar">
        <div className="dispatch-filter-bar__head">
          <span>Filter by Region</span>
          {selectedRegionFilter !== null && (
            <button
              type="button"
              className="dispatch-clear-filter"
              onClick={() => onSelectRegionFilter(null)}
            >
              Show all 10 vans
            </button>
          )}
        </div>
        <div className="dispatch-region-pills">
          <button
            type="button"
            className={`dispatch-region-pill ${selectedRegionFilter === null ? "is-active" : ""}`}
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
                className={`dispatch-region-pill ${isSelected ? "is-active" : ""}`}
                style={{ "--pill-color": reg.color } as React.CSSProperties}
                onClick={() => onSelectRegionFilter(isSelected ? null : reg.id)}
              >
                <span className="pill-dot" style={{ backgroundColor: reg.color }} />
                {reg.code} <span>{vansInRegion}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Main Content Area: Vehicle List OR Vehicle Detail Timeline */}
      {activeRoute ? (
        /* ================= SINGLE VEHICLE DETAIL & TIMELINE ================= */
        <div className="dispatch-detail-view">
          <div className="dispatch-detail-top">
            <button
              type="button"
              className="dispatch-back-btn"
              onClick={() => onSelectRoute(null)}
            >
              <ArrowLeft size={14} />
              <span>All vehicles</span>
            </button>
            <button
              type="button"
              className="dispatch-export-btn"
              onClick={() => handleDownloadManifest(activeRoute)}
              title="Download Driver Manifest CSV"
            >
              <Download size={13} />
              <span>Export run-sheet</span>
            </button>
          </div>

          <div
            className="dispatch-hero-card"
            style={{ "--van-color": activeRoute.color } as React.CSSProperties}
          >
            <div className="dispatch-hero-card__header">
              <div className="dispatch-hero-card__badge">
                <span
                  className="dispatch-van-swatch"
                  style={{ backgroundColor: activeRoute.color }}
                />
                <span className="dispatch-van-code">
                  R{activeRoute.region_id} · Vehicle {activeRoute.vehicle_label.split(" (")[0].replace("Vehicle ", "")}
                </span>
              </div>
              <span className="dispatch-status-chip">
                {activeRoute.capacity_utilization_pct >= 95
                  ? "At 90% Limit"
                  : "Optimal Load"}
              </span>
            </div>

            <h2 className="dispatch-hero-card__title">
              {activeRoute.vehicle_label.includes(" - ")
                ? activeRoute.vehicle_label.split(" - ")[1].replace(")", "")
                : activeRoute.vehicle_label}
            </h2>

            <div className="dispatch-hero-card__meta">
              <span>{activeRoute.region_name}</span>
            </div>

            {/* Capacity Gauge */}
            <div className="dispatch-capacity-gauge">
              <div className="dispatch-capacity-gauge__labels">
                <span className="dispatch-capacity-gauge__title">
                  <Package size={13} />
                  Operational Payload (90% Cap)
                </span>
                <span className="dispatch-capacity-gauge__nums">
                  <b>{activeRoute.total_bags}</b> / {activeRoute.max_load} bags{" "}
                  <span className="dispatch-pct">
                    ({activeRoute.capacity_utilization_pct}%)
                  </span>
                </span>
              </div>
              <div className="dispatch-progress-bar">
                <div
                  className="dispatch-progress-fill"
                  style={{
                    width: `${Math.min(activeRoute.capacity_utilization_pct, 100)}%`,
                    backgroundColor:
                      activeRoute.capacity_utilization_pct >= 95
                        ? "#f59e0b"
                        : activeRoute.color,
                  }}
                />
              </div>
              <div className="dispatch-capacity-foot">
                <span>Nominal capacity: {activeRoute.nominal_cap} bags</span>
                <span>Buffer reserve: {activeRoute.nominal_cap - activeRoute.max_load} bags</span>
              </div>
            </div>

            {/* Quick Trip Metrics */}
            <div className="dispatch-trip-metrics">
              <div className="dispatch-trip-metric">
                <span className="metric-icon"><Navigation size={13} /></span>
                <div className="metric-data">
                  <b>{activeRoute.total_dist_km} km</b>
                  <span>Total distance</span>
                </div>
              </div>
              <div className="dispatch-trip-metric">
                <span className="metric-icon"><Clock size={13} /></span>
                <div className="metric-data">
                  <b>{activeRoute.departure_hq} - {activeRoute.return_hq}</b>
                  <span>Shift window</span>
                </div>
              </div>
              <div className="dispatch-trip-metric">
                <span className="metric-icon"><Truck size={13} /></span>
                <div className="metric-data">
                  <b>{formatMins(activeRoute.total_drive_mins)}</b>
                  <span>Drive time</span>
                </div>
              </div>
              <div className="dispatch-trip-metric">
                <span className="metric-icon"><Package size={13} /></span>
                <div className="metric-data">
                  <b>{formatMins(activeRoute.total_service_mins)}</b>
                  <span>Service time</span>
                </div>
              </div>
            </div>

            <div className="dispatch-hero-card__actions">
              <button
                type="button"
                className="dispatch-focus-route-btn"
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
          <div className="dispatch-timeline-section">
            <div className="dispatch-timeline-head">
              <h3>Sequential Stop Manifest</h3>
              <span className="dispatch-stop-counter">
                {activeRoute.total_hotels} on-site stops
              </span>
            </div>

            <div className="dispatch-timeline">
              {/* Origin: Central Depot */}
              <div className="dispatch-timeline-item dispatch-timeline-item--origin">
                <div className="timeline-node timeline-node--depot">
                  <Building2 size={13} />
                </div>
                <div className="timeline-card timeline-card--depot">
                  <div className="timeline-card__top">
                    <span className="timeline-time">{activeRoute.departure_hq}</span>
                    <span className="timeline-badge timeline-badge--depot">HQ Depot</span>
                  </div>
                  <div className="timeline-card__title">
                    {depot.name}
                  </div>
                  <div className="timeline-card__sub">
                    Van departure · Initial cargo empty · Begins delivery circuit
                  </div>
                  <button
                    type="button"
                    className="timeline-locate-btn"
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
                    className={`dispatch-timeline-item ${isSelectedStop ? "is-selected-stop" : ""}`}
                  >
                    <div
                      className="timeline-node timeline-node--stop"
                      style={{ backgroundColor: activeRoute.color }}
                    >
                      {stop.stop_number}
                    </div>

                    <div
                      className={`timeline-card ${isSelectedStop ? "is-active" : ""}`}
                      onClick={() => onSelectStop(stop)}
                    >
                      <div className="timeline-card__top">
                        <span className="timeline-time">
                          {stop.arrival_time} - {stop.departure_time}
                        </span>
                        <span className="timeline-duration">
                          ⏱️ {stop.stop_mins} min stop
                        </span>
                      </div>

                      <div className="timeline-card__title">
                        {stop.name}
                      </div>

                      <div className="timeline-card__chips">
                        <span className="timeline-chip timeline-chip--bags">
                          🧺 +{stop.load_bags} bags
                        </span>
                        <span className="timeline-chip timeline-chip--cum">
                          Van load: {cumBags} / {activeRoute.max_load}
                        </span>
                        <button
                          type="button"
                          className="timeline-locate-btn"
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
              <div className="dispatch-timeline-item dispatch-timeline-item--terminal">
                <div className="timeline-node timeline-node--depot">
                  <CheckCircle2 size={13} />
                </div>
                <div className="timeline-card timeline-card--depot">
                  <div className="timeline-card__top">
                    <span className="timeline-time">{activeRoute.return_hq}</span>
                    <span className="timeline-badge timeline-badge--return">Shift Complete</span>
                  </div>
                  <div className="timeline-card__title">
                    {depot.name}
                  </div>
                  <div className="timeline-card__sub">
                    Van returns to Central Laundry · {activeRoute.total_bags} soiled bags unloaded for wash cycle
                  </div>
                  <button
                    type="button"
                    className="timeline-locate-btn"
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
        <div className="dispatch-vehicle-list">
          <div className="dispatch-vehicle-list__head">
            <div className="list-title">
              <h3>Vehicles in Active Plan</h3>
              <span className="count-pill">{filteredRoutes.length} of 10 vans</span>
            </div>
            <button
              type="button"
              className="dispatch-export-all-btn"
              onClick={() => handleDownloadManifest()}
              title="Download Full Dispatch Manifest CSV"
            >
              <Download size={13} />
              <span>Export fleet CSV</span>
            </button>
          </div>

          <div className="dispatch-cards-grid">
            {filteredRoutes.map((route) => {
              const actualIdx = routes.indexOf(route);
              return (
                <div
                  key={route.vehicle_label}
                  className="dispatch-van-card"
                  style={{ "--van-color": route.color } as React.CSSProperties}
                  onClick={() => onSelectRoute(actualIdx)}
                >
                  <div className="dispatch-van-card__top">
                    <div className="van-label-group">
                      <span
                        className="van-dot"
                        style={{ backgroundColor: route.color }}
                      />
                      <span className="van-name">
                        {route.vehicle_label.split(" (")[0]}
                      </span>
                      <span className="van-region-tag">R{route.region_id}</span>
                    </div>

                    <span
                      className={`van-status-tag ${
                        route.capacity_utilization_pct >= 95
                          ? "van-status-tag--high"
                          : "van-status-tag--optimal"
                      }`}
                    >
                      {route.capacity_utilization_pct}% load
                    </span>
                  </div>

                  <div className="van-sector-title">
                    {route.vehicle_label.includes(" - ")
                      ? route.vehicle_label.split(" - ")[1].replace(")", "")
                      : route.region_name}
                  </div>

                  {/* Capacity Bar */}
                  <div className="van-mini-capacity">
                    <div className="mini-labels">
                      <span>Payload load</span>
                      <b>
                        {route.total_bags} / {route.max_load} bags
                      </b>
                    </div>
                    <div className="mini-progress-bar">
                      <div
                        className="mini-progress-fill"
                        style={{
                          width: `${Math.min(route.capacity_utilization_pct, 100)}%`,
                          backgroundColor: route.color,
                        }}
                      />
                    </div>
                  </div>

                  <div className="van-card-stats">
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

                  <div className="van-card-footer">
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
