"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { cellToBoundary, cellsToMultiPolygon } from "h3-js";
import type * as Leaflet from "leaflet";
import {
  escapeHtml,
  type HexMap,
  type RegionMeta,
} from "../lib/coverage";
import type { DayHotel } from "../lib/day-plan";

const TILE_URL = "https://tile.openstreetmap.org/{z}/{x}/{y}.png";
const TILE_ATTRIBUTION =
  '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">OpenStreetMap</a> contributors';
const OSRM_BASE_URL = "https://router.project-osrm.org";
const BENGALURU: Leaflet.LatLngTuple = [12.9716, 77.5946];
const REGION_PANE = "day-region-pane";

type DayMapRoute = {
  routeId: string;
  routeName: string;
  color: string;
  hotels: DayHotel[];
};

type DayHotelsMapProps = {
  routes: DayMapRoute[];
  hq: { lat: number; lon: number; name: string };
  hexMap: HexMap;
  regions: RegionMeta[];
  dayLabel: string;
  modeLabel: string;
};

type RouteGeometry = [number, number][];

function routeCacheKey(route: DayMapRoute): string {
  return `${route.routeId}:${route.hotels.map((hotel) => hotel.key).join(",")}`;
}

function mappedRoutePoints(
  route: DayMapRoute,
  hq: DayHotelsMapProps["hq"],
): [number, number][] {
  const points: [number, number][] = [[hq.lat, hq.lon]];
  const seen = new Set<string>();
  for (const hotel of route.hotels) {
    if (hotel.lat === null || hotel.lon === null) continue;
    if (seen.has(hotel.key)) continue;
    seen.add(hotel.key);
    points.push([hotel.lat, hotel.lon]);
  }
  points.push([hq.lat, hq.lon]);
  return points;
}

export default function DayHotelsMap({
  routes,
  hq,
  hexMap,
  regions,
  dayLabel,
  modeLabel,
}: DayHotelsMapProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<Leaflet.Map | null>(null);
  const leafletRef = useRef<typeof import("leaflet") | null>(null);
  const regionLayerRef = useRef<Leaflet.LayerGroup | null>(null);
  const layerRef = useRef<Leaflet.LayerGroup | null>(null);
  const cacheRef = useRef<Map<string, RouteGeometry>>(new Map());
  const [ready, setReady] = useState(false);
  const [routing, setRouting] = useState(false);
  const [geometries, setGeometries] = useState<Record<string, RouteGeometry>>(
    {},
  );

  const mappedRoutes = useMemo(
    () =>
      routes
        .map((route) => ({
          ...route,
          hotels: route.hotels.filter(
            (hotel) => hotel.lat !== null && hotel.lon !== null,
          ),
        }))
        .filter((route) => route.hotels.length > 0),
    [routes],
  );

  const mappedHotels = useMemo(() => {
    const seen = new Set<string>();
    return mappedRoutes
      .flatMap((route) => route.hotels)
      .filter((hotel) => {
        if (seen.has(hotel.key)) return false;
        seen.add(hotel.key);
        return true;
      });
  }, [mappedRoutes]);

  const viewKey = useMemo(
    () =>
      mappedRoutes
        .map(
          (route) =>
            `${route.routeId}:${route.hotels
              .map((hotel) => hotel.key)
              .join(",")}`,
        )
        .join("|"),
    [mappedRoutes],
  );

  useEffect(() => {
    let disposed = false;
    let observer: ResizeObserver | null = null;

    void import("leaflet").then((L) => {
      if (disposed || !containerRef.current) return;
      const map = L.map(containerRef.current, {
        center: BENGALURU,
        zoom: 11,
        zoomControl: true,
        attributionControl: true,
      });
      L.tileLayer(TILE_URL, {
        attribution: TILE_ATTRIBUTION,
        maxZoom: 19,
      }).addTo(map);

      const regionPane = map.createPane(REGION_PANE);
      regionPane.style.zIndex = "390";
      regionPane.style.pointerEvents = "none";

      mapRef.current = map;
      leafletRef.current = L;
      regionLayerRef.current = L.layerGroup().addTo(map);
      layerRef.current = L.layerGroup().addTo(map);
      setReady(true);

      observer = new ResizeObserver(() => map.invalidateSize());
      observer.observe(containerRef.current);
    });

    return () => {
      disposed = true;
      observer?.disconnect();
      mapRef.current?.remove();
      mapRef.current = null;
      leafletRef.current = null;
      regionLayerRef.current = null;
      layerRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (!ready) return;
    const L = leafletRef.current;
    const regionLayer = regionLayerRef.current;
    if (!L || !regionLayer) return;

    regionLayer.clearLayers();
    const regionById = new Map(regions.map((region) => [region.id, region]));
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
        weight: 0.8,
        opacity: 0.45,
        fillColor: meta.color,
        fillOpacity: 0.17,
        interactive: false,
        className: "day-region-hex",
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
          opacity: 0.5,
          fill: false,
          interactive: false,
          dashArray: meta.route_status === "Proposed" ? "6 5" : undefined,
          className: "day-region-outline",
        }).addTo(regionLayer);
      }
    }
  }, [ready, regions, hexMap]);

  useEffect(() => {
    if (!ready || mappedRoutes.length === 0) {
      setRouting(false);
      return;
    }

    const controller = new AbortController();
    let cancelled = false;

    const syncCached = () => {
      const next: Record<string, RouteGeometry> = {};
      for (const route of mappedRoutes) {
        const cached = cacheRef.current.get(routeCacheKey(route));
        if (cached) next[route.routeId] = cached;
      }
      setGeometries(next);
    };

    const pending = mappedRoutes.filter(
      (route) => !cacheRef.current.has(routeCacheKey(route)),
    );
    syncCached();
    if (pending.length === 0) {
      setRouting(false);
      return;
    }

    setRouting(true);
    void (async () => {
      for (const route of pending) {
        if (cancelled) return;
        const points = mappedRoutePoints(route, hq);
        const coords = points
          .map(([lat, lon]) => `${lon.toFixed(6)},${lat.toFixed(6)}`)
          .join(";");
        let geometry: RouteGeometry = points;
        try {
          const response = await fetch(
            `${OSRM_BASE_URL}/route/v1/driving/${coords}?overview=full&geometries=geojson&steps=false`,
            { signal: controller.signal },
          );
          if (!response.ok) throw new Error(`OSRM ${response.status}`);
          const payload = (await response.json()) as {
            code?: string;
            routes?: { geometry?: { coordinates?: [number, number][] } }[];
          };
          const coordinates = payload.routes?.[0]?.geometry?.coordinates;
          if (payload.code === "Ok" && coordinates?.length) {
            geometry = coordinates.map(([lon, lat]) => [lat, lon]);
          }
        } catch {
          // Keep the dashed direct line as the fallback.
        }
        if (cancelled) return;
        cacheRef.current.set(routeCacheKey(route), geometry);
        setGeometries((current) => ({
          ...current,
          [route.routeId]: geometry,
        }));
        await new Promise((resolve) => setTimeout(resolve, 80));
      }
      if (!cancelled) setRouting(false);
    })();

    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [ready, mappedRoutes, hq, viewKey]);

  useEffect(() => {
    const map = mapRef.current;
    const L = leafletRef.current;
    const layer = layerRef.current;
    if (!ready || !map || !L || !layer) return;

    layer.clearLayers();
    const bounds = L.latLngBounds([]);
    bounds.extend([hq.lat, hq.lon]);

    for (const hexId of Object.keys(hexMap)) {
      for (const [lat, lon] of cellToBoundary(hexId)) {
        bounds.extend([lat, lon] as Leaflet.LatLngTuple);
      }
    }

    for (const route of mappedRoutes) {
      const points = mappedRoutePoints(route, hq);
      if (points.length < 2) continue;
      const geometry = geometries[route.routeId];
      const fallback = !geometry || geometry.length < 2;
      const latLngs = fallback ? points : geometry;

      const line = L.polyline(latLngs, {
        color: route.color,
        weight: 3.4,
        opacity: fallback ? 0.3 : 0.72,
        dashArray: fallback ? "6 8" : undefined,
        lineJoin: "round",
        lineCap: "round",
      });
      line.bindTooltip(
        `<div class="day-map-tooltip"><b>${escapeHtml(
          route.routeName,
        )}</b><span>${route.hotels.length} hotels · HQ → hotels → HQ</span>${
          fallback ? "<em>direct line · road path loading</em>" : ""
        }</div>`,
        { direction: "top", sticky: true, className: "day-map-tooltip-wrap" },
      );
      line.addTo(layer);
      for (const [lat, lon] of latLngs) bounds.extend([lat, lon]);
    }

    for (const hotel of mappedHotels) {
      if (hotel.lat === null || hotel.lon === null) continue;
      const marker = L.circleMarker([hotel.lat, hotel.lon], {
        radius: 6,
        color: "#ffffff",
        weight: 1.5,
        fillColor: hotel.color,
        fillOpacity: 0.95,
      });
      marker.bindTooltip(
        `<div class="day-map-tooltip"><b>${escapeHtml(
          hotel.name,
        )}</b><span>${escapeHtml(hotel.routeName)}</span><em>${
          hotel.daily ? "Daily" : "Alternative"
        }${hotel.mappedName ? " · mapped to master hotel" : ""}</em></div>`,
        {
          direction: "top",
          offset: [0, -6],
          className: "day-map-tooltip-wrap",
        },
      );
      marker.addTo(layer);
      bounds.extend([hotel.lat, hotel.lon]);
    }

    const hqIcon = L.divIcon({
      className: "days-hq-marker",
      html: `<div class="days-hq-pin"><span>HQ</span></div>`,
      iconSize: [30, 30],
      iconAnchor: [15, 15],
    });
    L.marker([hq.lat, hq.lon], {
      icon: hqIcon,
      zIndexOffset: 1200,
    })
      .addTo(layer)
      .bindTooltip(
        `<div class="day-map-tooltip"><b>${escapeHtml(
          hq.name,
        )}</b><span>Every route starts and ends here</span></div>`,
        {
          direction: "top",
          offset: [0, -14],
          className: "day-map-tooltip-wrap",
        },
      );

    if (bounds.isValid()) {
      map.fitBounds(bounds, {
        padding: [32, 32],
        maxZoom: 13,
        animate: false,
      });
    } else {
      map.setView(BENGALURU, 11, { animate: false });
    }
  }, [ready, mappedRoutes, mappedHotels, geometries, hq, hexMap]);

  return (
    <div className="day-map">
      <div ref={containerRef} className="day-map__canvas" />
      {routing && (
        <div className="day-map__routing">
          <span className="day-map__routing-dot" />
          Drawing HQ routes
        </div>
      )}
      <div className="day-map__caption">
        <span>{dayLabel}</span>
        <b>{modeLabel}</b>
        <span>{mappedHotels.length} mapped</span>
      </div>
      {mappedHotels.length === 0 && (
        <div className="day-map__empty">No mapped hotels for this view.</div>
      )}
    </div>
  );
}
