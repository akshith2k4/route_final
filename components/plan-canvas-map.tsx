"use client";

import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from "react";
import { cellToBoundary, cellsToMultiPolygon } from "h3-js";
import type * as Leaflet from "leaflet";
import type { HexMap, RegionMeta } from "../lib/coverage";
import { escapeHtml } from "../lib/coverage";
import {
  depotLabel,
  getPlanDepots,
  getPlanLaundries,
  laundryLabel,
  resolveDepot,
  routeDepotId,
  type ComputedRoute,
  type Plan,
} from "../lib/plan";

const TILE_URL = "https://tile.openstreetmap.org/{z}/{x}/{y}.png";
const TILE_ATTRIBUTION =
  '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">OpenStreetMap</a> contributors';
const REGION_PANE = "plan-region-pane";

type PlanCanvasMapProps = {
  plan: Plan;
  routes: ComputedRoute[];
  selectedRouteId: string | null;
  selectedStopId: string | null;
  geometries: Record<string, [number, number][]>;
  regions: RegionMeta[];
  hexMap: HexMap;
  onSelectRoute: (routeId: string) => void;
  onSelectStop: (routeId: string, hotelId: string) => void;
};

export type PlanCanvasMapHandle = {
  focusRoute: (routeId: string) => void;
  focusStop: (lat: number, lon: number) => void;
  fitPlan: () => void;
  zoomIn: () => void;
  zoomOut: () => void;
};

type MapStatus = "loading" | "ready" | "error";

const PlanCanvasMap = forwardRef<PlanCanvasMapHandle, PlanCanvasMapProps>(
  function PlanCanvasMap(
    {
      plan,
      routes,
      selectedRouteId,
      selectedStopId,
      geometries,
      regions,
      hexMap,
      onSelectRoute,
      onSelectStop,
    },
    ref,
  ) {
    const containerRef = useRef<HTMLDivElement | null>(null);
    const mapRef = useRef<Leaflet.Map | null>(null);
    const leafletRef = useRef<typeof import("leaflet") | null>(null);
    const regionLayerRef = useRef<Leaflet.LayerGroup | null>(null);
    const depotLayerRef = useRef<Leaflet.LayerGroup | null>(null);
    const routeLayerRef = useRef<Leaflet.LayerGroup | null>(null);
    const stopLayerRef = useRef<Leaflet.LayerGroup | null>(null);
    const allBoundsRef = useRef<Leaflet.LatLngBounds | null>(null);
    const lastFitKeyRef = useRef<string | null>(null);
    const [status, setStatus] = useState<MapStatus>("loading");

    const dataRef = useRef({
      plan,
      routes,
      selectedRouteId,
      selectedStopId,
      geometries,
    });
    const callbacksRef = useRef({ onSelectRoute, onSelectStop });

    useEffect(() => {
      dataRef.current = {
        plan,
        routes,
        selectedRouteId,
        selectedStopId,
        geometries,
      };
    }, [plan, routes, selectedRouteId, selectedStopId, geometries]);

    useEffect(() => {
      callbacksRef.current = { onSelectRoute, onSelectStop };
    }, [onSelectRoute, onSelectStop]);

    useEffect(() => {
      let cancelled = false;
      let map: Leaflet.Map | null = null;

      async function initialise() {
        try {
          const L = (await import("leaflet")).default;
          if (cancelled || !containerRef.current) return;

          leafletRef.current = L;
          map = L.map(containerRef.current, {
            center: [12.9716, 77.5946],
            zoom: 11,
            minZoom: 9,
            maxZoom: 17,
            zoomControl: false,
            attributionControl: true,
            zoomSnap: 0.25,
            zoomDelta: 0.5,
            wheelPxPerZoomLevel: 90,
          });
          mapRef.current = map;

          const regionPane = map.createPane(REGION_PANE);
          regionPane.style.zIndex = "390";
          regionPane.style.pointerEvents = "none";

          L.tileLayer(TILE_URL, {
            attribution: TILE_ATTRIBUTION,
            maxZoom: 19,
          }).addTo(map);

          regionLayerRef.current = L.layerGroup().addTo(map);
          depotLayerRef.current = L.layerGroup().addTo(map);
          routeLayerRef.current = L.layerGroup().addTo(map);
          stopLayerRef.current = L.layerGroup().addTo(map);

          window.setTimeout(() => map?.invalidateSize(), 0);
          if (!cancelled) setStatus("ready");
        } catch {
          if (!cancelled) setStatus("error");
        }
      }

      initialise();

      return () => {
        cancelled = true;
        if (map) {
          map.remove();
          map = null;
        }
        mapRef.current = null;
        regionLayerRef.current = null;
        routeLayerRef.current = null;
        stopLayerRef.current = null;
        depotLayerRef.current = null;
      };
    }, []);

    useEffect(() => {
      if (status !== "ready") return;
      const L = leafletRef.current;
      const regionLayer = regionLayerRef.current;
      if (!L || !regionLayer) return;

      regionLayer.clearLayers();

      const regionById = new Map(
        regions.map((region) => [region.id, region]),
      );
      const cellsByRegion = new Map<number, string[]>();

      for (const [hexId, regionId] of Object.entries(hexMap)) {
        const meta = regionById.get(regionId);
        if (!meta) continue;

        const boundary = cellToBoundary(hexId);
        const latLngs = boundary.map(
          ([lat, lon]) => [lat, lon] as Leaflet.LatLngTuple,
        );

        L.polygon(latLngs, {
          pane: REGION_PANE,
          color: meta.color,
          weight: 0.7,
          opacity: 0.35,
          fillColor: meta.color,
          fillOpacity: 0.18,
          interactive: false,
          className: "plan-region-hex",
        }).addTo(regionLayer);

        const regionCells = cellsByRegion.get(regionId) ?? [];
        regionCells.push(hexId);
        cellsByRegion.set(regionId, regionCells);
      }

      for (const [regionId, cells] of cellsByRegion) {
        const meta = regionById.get(regionId);
        if (!meta) continue;

        const multiPolygon = cellsToMultiPolygon(
          cells,
          false,
        ) as number[][][][];

        for (const polygon of multiPolygon) {
          const rings = polygon.map((ring) =>
            ring.map(([lat, lon]) => [lat, lon] as Leaflet.LatLngTuple),
          );

          L.polygon(rings, {
            pane: REGION_PANE,
            color: "#111827",
            weight: 1.8,
            opacity: 0.55,
            fill: false,
            interactive: false,
            dashArray: meta.route_status === "Proposed" ? "6 5" : undefined,
            className: "plan-region-outline",
          }).addTo(regionLayer);
        }
      }
    }, [status, regions, hexMap]);

    useEffect(() => {
      if (status !== "ready") return;
      const map = mapRef.current;
      const L = leafletRef.current;
      const routeLayer = routeLayerRef.current;
      const stopLayer = stopLayerRef.current;
      const depotLayer = depotLayerRef.current;
      if (!map || !L || !routeLayer || !stopLayer || !depotLayer) return;

      routeLayer.clearLayers();
      stopLayer.clearLayers();
      depotLayer.clearLayers();

      const { plan: currentPlan, routes: currentRoutes, selectedRouteId: selected, selectedStopId: activeStop, geometries: currentGeometries } =
        dataRef.current;

      const allBounds = L.latLngBounds([]);
      const depots = getPlanDepots(currentPlan);
      const depotLatLngById = new Map<string, Leaflet.LatLngTuple>();
      const laundries = getPlanLaundries(currentPlan);
      const laundryById = new Map(
        laundries.map((laundry) => [laundry.id, laundry]),
      );
      const laundryLatLngById = new Map<string, Leaflet.LatLngTuple>();

      for (const [index, depot] of depots.entries()) {
        const depotLatLng: Leaflet.LatLngTuple = [depot.lat, depot.lon];
        depotLatLngById.set(depot.id, depotLatLng);
        allBounds.extend(depotLatLng);

        const isPrimary = index === 0;
        const depotMarker = L.marker(depotLatLng, {
          icon: L.divIcon({
            className: "dispatch-depot-marker",
            html: `
              <div class="depot-pin ${isPrimary ? "depot-pin--hq" : "depot-pin--second"}">
                <span class="depot-pin__pulse"></span>
                <span class="depot-pin__badge">${escapeHtml(depotLabel(depot))}</span>
              </div>
            `,
            iconSize: [32, 32],
            iconAnchor: [16, 16],
          }),
          zIndexOffset: 2000,
        });
        depotMarker.bindTooltip(
          `<div class="depot-leaflet-tooltip"><b>${escapeHtml(
            depot.name,
          )}</b><span>Fleet origin &amp; terminus</span></div>`,
          {
            direction: "top",
            offset: [0, -16],
            className: "depot-leaflet-tooltip",
          },
        );
        depotMarker.addTo(depotLayer);
      }

      for (const laundry of laundries) {
        const laundryLatLng: Leaflet.LatLngTuple = [laundry.lat, laundry.lon];
        laundryLatLngById.set(laundry.id, laundryLatLng);
        allBounds.extend(laundryLatLng);

        const laundryMarker = L.marker(laundryLatLng, {
          icon: L.divIcon({
            className: "dispatch-depot-marker",
            html: `
              <div class="depot-pin depot-pin--laundry">
                <span class="depot-pin__badge">${escapeHtml(laundryLabel(laundry))}</span>
              </div>
            `,
            iconSize: [32, 32],
            iconAnchor: [16, 16],
          }),
          zIndexOffset: 1800,
        });
        laundryMarker.bindTooltip(
          `<div class="depot-leaflet-tooltip"><b>${escapeHtml(
            laundry.name,
          )}</b><span>Laundry · ${laundry.service_mins} min on site</span></div>`,
          {
            direction: "top",
            offset: [0, -16],
            className: "depot-leaflet-tooltip",
          },
        );
        laundryMarker.addTo(depotLayer);
      }

      const primaryDepotLatLng: Leaflet.LatLngTuple = depots[0]
        ? [depots[0].lat, depots[0].lon]
        : [currentPlan.depot.lat, currentPlan.depot.lon];

      const routeBounds = new Map<string, Leaflet.LatLngBounds>();

      for (const route of currentRoutes) {
        const routeBoundsEntry = L.latLngBounds([]);
        routeBounds.set(route.route_id, routeBoundsEntry);
        const routeDepotLatLng =
          depotLatLngById.get(routeDepotId(currentPlan, route)) ??
          primaryDepotLatLng;
        routeBoundsEntry.extend(routeDepotLatLng);

        const routeLaundry = route.laundry_id
          ? (laundryById.get(route.laundry_id) ?? null)
          : null;
        const routeLaundryLatLng = routeLaundry
          ? (laundryLatLngById.get(routeLaundry.id) ?? null)
          : null;
        if (routeLaundryLatLng) {
          routeBoundsEntry.extend(routeLaundryLatLng);
          allBounds.extend(routeLaundryLatLng);
        }

        const stopLatLngs = route.stops.map(
          (stop) => [stop.lat, stop.lon] as Leaflet.LatLngTuple,
        );
        for (const latLng of stopLatLngs) {
          routeBoundsEntry.extend(latLng);
          allBounds.extend(latLng);
        }

        const stored = currentGeometries[route.route_id];
        const fallback = !stored || stored.length < 2;
        const latLngs: Leaflet.LatLngTuple[] = fallback
          ? [
              routeDepotLatLng,
              ...stopLatLngs,
              ...(routeLaundryLatLng ? [routeLaundryLatLng] : []),
              routeDepotLatLng,
            ]
          : stored.map(([lat, lon]) => [lat, lon] as Leaflet.LatLngTuple);

        if (latLngs.length < 2) continue;

        const isSelected = selected === route.route_id;
        const dimmed = selected !== null && !isSelected;
        const polyline = L.polyline(latLngs, {
          color: route.color,
          weight: isSelected ? 5.5 : dimmed ? 2.1 : 3.4,
          opacity: isSelected ? 1 : dimmed ? 0.18 : 0.82,
          lineJoin: "round",
          lineCap: "round",
          dashArray: fallback ? "5 7" : undefined,
          className: isSelected
            ? "dispatch-route-polyline is-selected"
            : "dispatch-route-polyline",
        });

        polyline.bindTooltip(
          `<div class="plan-route-tooltip"><b>${escapeHtml(
            route.name,
          )}</b><span>${route.total_hotels} stops · ${route.total_bags} bags · ${route.total_rooms} rooms · ${
            route.total_dist_km
          } km · ${escapeHtml(route.depot_name)}${
            routeLaundry
              ? ` · via ${escapeHtml(routeLaundry.name)}`
              : ""
          }</span></div>`,
          { direction: "top", sticky: true, className: "plan-route-tooltip" },
        );
        polyline.on("click", () => {
          callbacksRef.current.onSelectRoute(route.route_id);
        });
        polyline.addTo(routeLayer);
        if (isSelected) polyline.bringToFront();
      }

      const visibleRoutes =
        selected === null
          ? currentRoutes
          : currentRoutes.filter((route) => route.route_id === selected);

      for (const route of currentRoutes) {
        const isSelected = selected === route.route_id;
        const routeIsVisible = visibleRoutes.some(
          (candidate) => candidate.route_id === route.route_id,
        );

        for (const stop of route.stops) {
          if (routeIsVisible) {
            const active = isSelected && activeStop === stop.hotel_id;
            const marker = L.marker([stop.lat, stop.lon], {
              icon: L.divIcon({
                className: "dispatch-stop-pin-container",
                html: `
                  <div class="dispatch-stop-pin ${
                    active ? "is-active" : ""
                  }" style="--c:${route.color}">
                    <span>${stop.stop_number}</span>
                  </div>
                `,
                iconSize: [26, 26],
                iconAnchor: [13, 13],
              }),
              zIndexOffset: active ? 1600 : 1200,
            });

            marker.bindTooltip(
              `<div class="dispatch-stop-leaflet-tooltip">
                <div class="tooltip-stop-badge" style="background:${route.color}">STOP #${stop.stop_number}</div>
                <div class="tooltip-stop-title">${escapeHtml(stop.name)}</div>
                <div class="tooltip-stop-meta">${stop.arrival_time} – ${stop.departure_time} · ${stop.service_mins}m on-site</div>
                <div class="tooltip-stop-load">${stop.load_bags} bags pickup · ${stop.rooms ?? 0} rooms</div>
              </div>`,
              {
                direction: "top",
                offset: [0, -14],
                className: "stop-leaflet-tooltip",
              },
            );

            marker.on("click", () => {
              callbacksRef.current.onSelectRoute(route.route_id);
              callbacksRef.current.onSelectStop(route.route_id, stop.hotel_id);
            });
            marker.addTo(stopLayer);
          } else {
            const dot = L.circleMarker([stop.lat, stop.lon], {
              radius: 3,
              color: "#ffffff",
              weight: 1,
              fillColor: route.color,
              fillOpacity: 0.42,
              opacity: 0.55,
            });
            dot.bindTooltip(
              `<b>${escapeHtml(stop.name)}</b><br/><span style="color:${route.color};font-weight:600">${escapeHtml(
                route.name,
              )}</span> · ${stop.load_bags} bags · ${stop.rooms ?? 0} rooms`,
              { direction: "top", offset: [0, -5] },
            );
            dot.on("click", () => {
              callbacksRef.current.onSelectRoute(route.route_id);
              callbacksRef.current.onSelectStop(route.route_id, stop.hotel_id);
            });
            dot.addTo(stopLayer);
          }
        }
      }

      allBoundsRef.current = allBounds;

      const selectedRoute =
        selected !== null
          ? currentRoutes.find((route) => route.route_id === selected)
          : null;
      const fitKey = selected
        ? `${selected}:${selectedRoute?.depot_id ?? ""}:${
            selectedRoute?.laundry_id ?? ""
          }`
        : "all";
      if (lastFitKeyRef.current !== fitKey) {
        lastFitKeyRef.current = fitKey;
        const bounds =
          selected !== null ? routeBounds.get(selected) ?? allBounds : allBounds;
        if (bounds.isValid()) {
          window.setTimeout(() => {
            map.flyToBounds(bounds, {
              paddingTopLeft: [58, 58],
              paddingBottomRight: [58, 58],
              maxZoom: selected !== null ? 14 : 12,
              duration: 0.75,
            });
          }, 0);
        }
      }
    }, [status, plan, routes, selectedRouteId, selectedStopId, geometries]);

    useImperativeHandle(
      ref,
      () => ({
        focusRoute(routeId: string) {
          const map = mapRef.current;
          const L = leafletRef.current;
          const route = dataRef.current.routes.find(
            (candidate) => candidate.route_id === routeId,
          );
          if (!map || !L || !route) return;

          const bounds = L.latLngBounds([]);
          const depot = resolveDepot(dataRef.current.plan, route.depot_id);
          bounds.extend([depot.lat, depot.lon]);
          for (const stop of route.stops) bounds.extend([stop.lat, stop.lon]);
          if (route.laundry_id) {
            const laundry = getPlanLaundries(dataRef.current.plan).find(
              (candidate) => candidate.id === route.laundry_id,
            );
            if (laundry) bounds.extend([laundry.lat, laundry.lon]);
          }
          if (bounds.isValid()) {
            map.flyToBounds(bounds, {
              paddingTopLeft: [58, 58],
              paddingBottomRight: [58, 58],
              maxZoom: 14,
              duration: 0.75,
            });
          }
        },
        focusStop(lat: number, lon: number) {
          mapRef.current?.flyTo([lat, lon], 15, { duration: 0.7 });
        },
        fitPlan() {
          const map = mapRef.current;
          const bounds = allBoundsRef.current;
          if (!map || !bounds || !bounds.isValid()) return;
          map.flyToBounds(bounds, {
            paddingTopLeft: [58, 58],
            paddingBottomRight: [58, 58],
            maxZoom: 12,
            duration: 0.75,
          });
        },
        zoomIn() {
          mapRef.current?.zoomIn();
        },
        zoomOut() {
          mapRef.current?.zoomOut();
        },
      }),
      [],
    );

    return (
      <div className="plan-map">
        <div ref={containerRef} className="plan-map__canvas" />
        {status === "loading" && (
          <div className="plan-map__status">
            <div className="plan-map__status-card">
              <b>Loading canvas</b>
              <span>Preparing the route surface…</span>
            </div>
          </div>
        )}
        {status === "error" && (
          <div className="plan-map__status">
            <div className="plan-map__status-card">
              <b>Map unavailable</b>
              <span>Leaflet could not initialise. Reload the page.</span>
            </div>
          </div>
        )}
      </div>
    );
  },
);

export default PlanCanvasMap;
