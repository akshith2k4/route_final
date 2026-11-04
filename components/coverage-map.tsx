"use client";

import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
  type CSSProperties,
} from "react";
import {
  cellToBoundary,
  cellsToMultiPolygon,
  latLngToCell,
} from "h3-js";
import type * as Leaflet from "leaflet";
import {
  Eye,
  EyeOff,
  Frame,
  Hotel as HotelIcon,
  MapPin,
  Minus,
  Plus,
  Truck,
  Building2,
  X,
} from "lucide-react";
import {
  H3_RESOLUTION,
  REGION_LABEL_POINTS,
  REGION_MAP_LABELS,
  escapeHtml,
  formatDistance,
  formatMins,
  hotelKey,
  type CoordinateResult,
  type DispatchRoute,
  type DispatchStop,
  type FleetDepot,
  type HexMap,
  type Hotel,
  type RegionMeta,
  type StudioDepot,
} from "../lib/coverage";

type CoverageMapProps = {
  workspace: "coverage" | "dispatch" | "studio" | "manual";
  regions: RegionMeta[];
  hotels: Hotel[];
  hexMap: HexMap;
  routes?: DispatchRoute[];
  depot?: FleetDepot;
  depots?: StudioDepot[];
  selectedRouteIndex?: number | null;
  selectedStopNumber?: number | null;
  selectedRegion: number | null;
  hoveredRegion: number | null;
  activeHotel: Hotel | null;
  pinned: CoordinateResult | null;
  hotelsVisible: boolean;
  onSelectRegion: (id: number | null, fly?: boolean) => void;
  onSelectHotel: (hotel: Hotel, fly?: boolean) => void;
  onSelectRoute?: (index: number | null) => void;
  onSelectStop?: (stop: DispatchStop) => void;
  onHoverRegion: (id: number | null) => void;
  onToggleHotels: () => void;
  onCloseHotel: () => void;
  onClearPinned: () => void;
  onResetView: () => void;
};

export type CoverageMapHandle = {
  focusRegion: (id: number) => void;
  focusHotel: (hotel: Hotel) => void;
  focusRoute: (index: number) => void;
  focusStop: (lat: number, lon: number) => void;
  fitAll: () => void;
  zoomIn: () => void;
  zoomOut: () => void;
};

type MapStatus = "loading" | "ready" | "error";

const TILE_URL = "https://tile.openstreetmap.org/{z}/{x}/{y}.png";
const TILE_ATTRIBUTION =
  '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">OpenStreetMap</a> contributors';

function regionStyle(color: string): CSSProperties {
  return { "--region": color, "--c": color } as CSSProperties;
}

const CoverageMap = forwardRef<CoverageMapHandle, CoverageMapProps>(
  function CoverageMap(
    {
      workspace = "coverage",
      regions,
      hotels,
      hexMap,
      routes = [],
      depot,
      depots = [],
      selectedRouteIndex = null,
      selectedStopNumber = null,
      selectedRegion,
      hoveredRegion,
      activeHotel,
      pinned,
      hotelsVisible,
      onSelectRegion,
      onSelectHotel,
      onSelectRoute,
      onSelectStop,
      onHoverRegion,
      onToggleHotels,
      onCloseHotel,
      onClearPinned,
      onResetView,
    },
    ref,
  ) {
    const containerRef = useRef<HTMLDivElement | null>(null);
    const mapRef = useRef<Leaflet.Map | null>(null);
    const leafletRef = useRef<typeof import("leaflet") | null>(null);
    const hexLayersRef = useRef(new Map<number, Leaflet.Polygon[]>());
    const boundaryLayersRef = useRef(new Map<number, Leaflet.Polygon[]>());
    const regionLabelMarkersRef = useRef(new Map<number, Leaflet.Marker>());
    const regionBoundsRef = useRef(new Map<number, Leaflet.LatLngBounds>());
    const allBoundsRef = useRef<Leaflet.LatLngBounds | null>(null);
    const hotelLayerRef = useRef<Leaflet.LayerGroup | null>(null);
    const hotelMarkersRef = useRef(new Map<string, Leaflet.CircleMarker>());
    const pinnedLayerRef = useRef<Leaflet.LayerGroup | null>(null);
    const dispatchGroupRef = useRef<Leaflet.LayerGroup | null>(null);
    const activeHotelKeyRef = useRef<string | null>(null);
    const [status, setStatus] = useState<MapStatus>("loading");

    const dataRef = useRef({ regions, hotels, hexMap, routes, depot, workspace });
    const callbacksRef = useRef({
      onSelectRegion,
      onSelectHotel,
      onSelectRoute,
      onSelectStop,
      onHoverRegion,
    });

    useEffect(() => {
      dataRef.current = { regions, hotels, hexMap, routes, depot, workspace };
    }, [regions, hotels, hexMap, routes, depot, workspace]);

    useEffect(() => {
      callbacksRef.current = {
        onSelectRegion,
        onSelectHotel,
        onSelectRoute,
        onSelectStop,
        onHoverRegion,
      };
    }, [onSelectRegion, onSelectHotel, onSelectRoute, onSelectStop, onHoverRegion]);

    useEffect(() => {
      let cancelled = false;
      let map: Leaflet.Map | null = null;

      async function initialise() {
        const L = (await import("leaflet")).default;
        if (cancelled || !containerRef.current) return;

        const { regions: currentRegions, hotels: currentHotels, hexMap: currentHexMap } =
          dataRef.current;

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

        L.tileLayer(TILE_URL, {
          attribution: TILE_ATTRIBUTION,
          maxZoom: 19,
        }).addTo(map);

        const regionById = new Map(
          currentRegions.map((region) => [region.id, region]),
        );
        const hotelCounts = new Map<number, number>();
        for (const hotel of currentHotels) {
          hotelCounts.set(
            hotel.region,
            (hotelCounts.get(hotel.region) ?? 0) + 1,
          );
        }

        const allBounds = L.latLngBounds([]);
        const cellsByRegion = new Map<number, string[]>();

        for (const [hexId, regionId] of Object.entries(currentHexMap)) {
          const meta = regionById.get(regionId);
          if (!meta) continue;

          const boundary = cellToBoundary(hexId);
          const latLngs = boundary.map(
            ([lat, lon]) => [lat, lon] as Leaflet.LatLngTuple,
          );

          let bounds = regionBoundsRef.current.get(regionId);
          if (!bounds) {
            bounds = L.latLngBounds([]);
            regionBoundsRef.current.set(regionId, bounds);
          }
          bounds.extend(latLngs);
          allBounds.extend(latLngs);

          const polygon = L.polygon(latLngs, {
            color: meta.color,
            weight: 0.8,
            opacity: 0.45,
            fillColor: meta.color,
            fillOpacity: 0.35,
            className: "hex-poly",
          });

          polygon.on("mouseover", () => {
            callbacksRef.current.onHoverRegion(regionId);
          });
          polygon.on("mouseout", () => {
            callbacksRef.current.onHoverRegion(null);
          });

          polygon.addTo(map);

          const regionHexLayers = hexLayersRef.current.get(regionId) ?? [];
          regionHexLayers.push(polygon);
          hexLayersRef.current.set(regionId, regionHexLayers);

          const regionCells = cellsByRegion.get(regionId) ?? [];
          regionCells.push(hexId);
          cellsByRegion.set(regionId, regionCells);
        }

        for (const [regionId, cells] of cellsByRegion) {
          const meta = regionById.get(regionId);
          if (!meta) continue;

          const multiPolygon = cellsToMultiPolygon(cells, false) as number[][][][];
          const outlines: Leaflet.Polygon[] = [];

          for (const polygon of multiPolygon) {
            const rings = polygon.map((ring) =>
              ring.map(([lat, lon]) => [lat, lon] as Leaflet.LatLngTuple),
            );

            const outline = L.polygon(rings, {
              color: "#111827",
              weight: 2.2,
              opacity: 0.9,
              fill: false,
              interactive: false,
              dashArray:
                meta.route_status === "Proposed" ? "6 5" : undefined,
              className: "region-outline",
            });

            outline.addTo(map);
            outlines.push(outline);
          }

          boundaryLayersRef.current.set(regionId, outlines);
        }

        const hotelLayer = L.layerGroup().addTo(map);
        hotelLayerRef.current = hotelLayer;

        for (const hotel of currentHotels) {
          const meta = regionById.get(hotel.region);
          const color = meta?.color ?? "#3E4C43";

          const marker = L.circleMarker([hotel.lat, hotel.lon], {
            radius: 4.2,
            color: "#FFFDF8",
            weight: 1.4,
            opacity: 1,
            fillColor: color,
            fillOpacity: 0.96,
            bubblingMouseEvents: false,
          });

          marker.bindTooltip(
            `<span class="hotel-hover-tooltip__name">${escapeHtml(hotel.name)}</span>
             <span class="hotel-hover-tooltip__meta">${escapeHtml(meta?.code ?? "")} · ${hotel.stop_mins} min stop · ${hotel.load} bags</span>`,
            {
              className: "hotel-hover-tooltip",
              direction: "top",
              offset: [0, -7],
              opacity: 1,
            },
          );

          const key = hotelKey(hotel);
          marker.on("click", () => {
            callbacksRef.current.onSelectHotel(hotel, false);
          });
          marker.on("mouseover", () => {
            marker.setStyle({ radius: 6, weight: 2 });
            marker.bringToFront();
          });
          marker.on("mouseout", () => {
            if (activeHotelKeyRef.current === key) return;
            marker.setStyle({ radius: 4.2, weight: 1.4 });
          });

          marker.addTo(hotelLayer);
          hotelMarkersRef.current.set(key, marker);

          const hotelPoint = L.latLng(hotel.lat, hotel.lon);
          regionBoundsRef.current.get(hotel.region)?.extend(hotelPoint);
          allBounds.extend(hotelPoint);
        }

        allBoundsRef.current = allBounds;

        const dispatchGroup = L.layerGroup().addTo(map);
        dispatchGroupRef.current = dispatchGroup;

        map.on("click", (event) => {
          if (dataRef.current.workspace !== "coverage") return;
          let regionId: number | undefined;
          try {
            const cell = latLngToCell(
              event.latlng.lat,
              event.latlng.lng,
              H3_RESOLUTION,
            );
            regionId = dataRef.current.hexMap[cell];
          } catch {
            regionId = undefined;
          }
          callbacksRef.current.onSelectRegion(regionId ?? null, false);
        });

        setStatus("ready");

        if (allBounds.isValid()) {
          map.fitBounds(allBounds, {
            padding: [36, 36],
            maxZoom: 12,
            animate: false,
          });
        }

        requestAnimationFrame(() => {
          map?.invalidateSize();
        });
      }

      initialise().catch((error: unknown) => {
        console.error("Could not initialise the coverage map", error);
        if (!cancelled) setStatus("error");
      });

      return () => {
        cancelled = true;
        if (map) map.remove();
        mapRef.current = null;
        leafletRef.current = null;
        hexLayersRef.current.clear();
        boundaryLayersRef.current.clear();
        regionLabelMarkersRef.current.clear();
        regionBoundsRef.current.clear();
        hotelMarkersRef.current.clear();
        hotelLayerRef.current = null;
        pinnedLayerRef.current = null;
        dispatchGroupRef.current = null;
        allBoundsRef.current = null;
      };
    }, []);

    useEffect(() => {
      if (status !== "ready") return;

      const isDispatch = workspace === "dispatch";

      for (const [regionId, layers] of hexLayersRef.current) {
        const isSelected = selectedRegion === regionId;
        const isHovered = hoveredRegion === regionId;
        const hasSelection = selectedRegion !== null;

        let fillOpacity = isDispatch
          ? 0.12
          : hasSelection
            ? isSelected
              ? 0.48
              : 0.20
            : 0.35;
        let strokeOpacity = isDispatch
          ? 0.22
          : isSelected
            ? 0.75
            : hasSelection
              ? 0.30
              : 0.45;
        let weight = isDispatch ? 0.6 : isSelected ? 1.4 : 0.8;

        if (!isDispatch && isHovered && !isSelected) {
          fillOpacity = hasSelection ? 0.30 : 0.44;
          strokeOpacity = 0.65;
          weight = 1.1;
        }

        for (const layer of layers) {
          layer.setStyle({ fillOpacity, opacity: strokeOpacity, weight });
        }
      }

      for (const [regionId, layers] of boundaryLayersRef.current) {
        const isSelected = selectedRegion === regionId;
        const isHovered = hoveredRegion === regionId;
        const hasSelection = selectedRegion !== null;

        for (const layer of layers) {
          layer.setStyle({
            color: "#111827",
            weight: isDispatch ? 1.6 : isSelected ? 3.2 : isHovered ? 2.6 : 2.2,
            opacity: isDispatch
              ? 0.45
              : isSelected
                ? 1
                : isHovered
                  ? 0.95
                  : hasSelection
                    ? 0.6
                    : 0.9,
          });
        }
      }
    }, [status, workspace, selectedRegion, hoveredRegion]);

    useEffect(() => {
      if (status !== "ready") return;
      const map = mapRef.current;
      const layer = hotelLayerRef.current;
      if (!map || !layer) return;

      if (workspace === "coverage" && hotelsVisible) {
        if (!map.hasLayer(layer)) layer.addTo(map);
      } else if (map.hasLayer(layer)) {
        map.removeLayer(layer);
      }
    }, [status, workspace, hotelsVisible]);

    /* Render Dispatch Routes, Depot and Stop Markers */
    useEffect(() => {
      if (status !== "ready") return;
      const map = mapRef.current;
      const L = leafletRef.current;
      const dispatchGroup = dispatchGroupRef.current;
      if (!map || !L || !dispatchGroup) return;

      dispatchGroup.clearLayers();

      if (
        (workspace !== "dispatch" &&
          workspace !== "studio" &&
          workspace !== "manual") ||
        !routes ||
        !routes.length
      ) {
        return;
      }

      // 1. Add Depot Markers (HQ and Satellite Hubs)
      const depotsToRender =
        depots && depots.length > 0
          ? depots
          : depot
            ? [
                {
                  id: "depot-hq",
                  name: depot.name,
                  latitude: depot.latitude,
                  longitude: depot.longitude,
                  isPrimary: true,
                },
              ]
            : [];

      depotsToRender.forEach((d) => {
        const isHQ = d.isPrimary || d.id === "depot-yeshwanthpur";
        const badgeLabel = isHQ
          ? "HQ"
          : d.name.includes("Whitefield")
            ? "WF"
            : d.name.includes("Electronic")
              ? "EC"
              : "JN";

        const depotMarker = L.marker([d.latitude, d.longitude], {
          icon: L.divIcon({
            className: "dispatch-depot-marker",
            html: `
              <div class="depot-pin ${isHQ ? "depot-pin--hq" : "depot-pin--hub"}">
                <span class="depot-pin__pulse"></span>
                <span class="depot-pin__badge">${badgeLabel}</span>
              </div>
            `,
            iconSize: [32, 32],
            iconAnchor: [16, 16],
          }),
          zIndexOffset: isHQ ? 2000 : 1900,
        });

        depotMarker.bindTooltip(
          `<div class="depot-leaflet-tooltip">
            <b>${escapeHtml(d.name)}</b>
            <span>${isHQ ? "Central Laundry HQ · Fleet Origin & Terminus" : "Regional Satellite Logistics Hub"}</span>
          </div>`,
          { direction: "top", offset: [0, -16], className: "depot-leaflet-tooltip" }
        );
        depotMarker.addTo(dispatchGroup);
      });

      // 2. Add Route Polylines
      const hasRouteSelection = selectedRouteIndex !== null && selectedRouteIndex !== undefined;

      routes.forEach((route, rIdx) => {
        const isSelected = selectedRouteIndex === rIdx;
        const polyline = L.polyline(
          route.path_coordinates.map(([lat, lon]) => [lat, lon] as Leaflet.LatLngTuple),
          {
            color: route.color,
            weight: isSelected ? 5.5 : hasRouteSelection ? 2.2 : 3.5,
            opacity: isSelected ? 1 : hasRouteSelection ? 0.22 : 0.85,
            lineJoin: "round",
            lineCap: "round",
            className: isSelected
              ? "dispatch-route-polyline is-selected"
              : "dispatch-route-polyline",
          }
        );

        polyline.on("mouseover", () => {
          if (selectedRouteIndex !== rIdx) {
            polyline.setStyle({ weight: 5, opacity: 0.95 });
            polyline.bringToFront();
          }
        });

        polyline.on("mouseout", () => {
          if (selectedRouteIndex !== rIdx) {
            polyline.setStyle({
              weight: hasRouteSelection ? 2.2 : 3.5,
              opacity: hasRouteSelection ? 0.22 : 0.85,
            });
          }
        });

        polyline.on("click", () => {
          callbacksRef.current.onSelectRoute?.(rIdx);
        });

        polyline.addTo(dispatchGroup);
        if (isSelected) polyline.bringToFront();
      });

      // 3. Add Stop Markers
      if (hasRouteSelection && routes[selectedRouteIndex!]) {
        const activeRoute = routes[selectedRouteIndex!];
        activeRoute.stops.forEach((stop) => {
          const isSelectedStop = selectedStopNumber === stop.stop_number;
          const stopMarker = L.marker([stop.lat, stop.lon], {
            icon: L.divIcon({
              className: "dispatch-stop-pin-container",
              html: `
                <div class="dispatch-stop-pin ${isSelectedStop ? "is-active" : ""}" style="--c:${activeRoute.color}">
                  <span>${stop.stop_number}</span>
                </div>
              `,
              iconSize: [26, 26],
              iconAnchor: [13, 13],
            }),
            zIndexOffset: isSelectedStop ? 1600 : 1200,
          });

          stopMarker.bindTooltip(
            `<div class="dispatch-stop-leaflet-tooltip">
              <div class="tooltip-stop-badge" style="background:${activeRoute.color}">STOP #${stop.stop_number}</div>
              <div class="tooltip-stop-title">${escapeHtml(stop.name)}</div>
              <div class="tooltip-stop-meta">⏱️ ${stop.arrival_time} - ${stop.departure_time} · ${stop.stop_mins}m on-site</div>
              <div class="tooltip-stop-load">🧺 ${stop.load_bags} bags pickup</div>
            </div>`,
            { direction: "top", offset: [0, -14], className: "stop-leaflet-tooltip" }
          );

          stopMarker.on("click", () => {
            callbacksRef.current.onSelectStop?.(stop);
          });

          stopMarker.addTo(dispatchGroup);
        });
      } else {
        // Draw small clean dots for all stops in all routes
        routes.forEach((route) => {
          route.stops.forEach((stop) => {
            const dot = L.circleMarker([stop.lat, stop.lon], {
              radius: 4,
              color: "#ffffff",
              weight: 1.4,
              fillColor: route.color,
              fillOpacity: 0.95,
            });
            dot.bindTooltip(
              `<b>${escapeHtml(stop.name)}</b><br/><span style="color:${route.color};font-weight:600">${route.vehicle_label.split(" (")[0]}</span> · Stop #${stop.stop_number} (${stop.load_bags} bags)`,
              { direction: "top", offset: [0, -6] }
            );
            dot.on("click", () => {
              const rIdx = routes.indexOf(route);
              callbacksRef.current.onSelectRoute?.(rIdx);
              callbacksRef.current.onSelectStop?.(stop);
            });
            dot.addTo(dispatchGroup);
          });
        });
      }
    }, [status, workspace, routes, depot, depots, selectedRouteIndex, selectedStopNumber]);

    useEffect(() => {
      if (status !== "ready") return;

      const activeKey = activeHotel ? hotelKey(activeHotel) : null;
      activeHotelKeyRef.current = activeKey;

      for (const [key, marker] of hotelMarkersRef.current) {
        if (key === activeKey) {
          marker.setStyle({
            radius: 7,
            weight: 2.4,
            color: "#18241E",
            fillOpacity: 1,
          });
          marker.bringToFront();
        } else {
          marker.setStyle({
            radius: 4.2,
            weight: 1.4,
            color: "#FFFDF8",
            fillOpacity: 0.96,
          });
        }
      }
    }, [status, activeHotel]);

    useEffect(() => {
      if (status !== "ready") return;

      const map = mapRef.current;
      const L = leafletRef.current;
      if (!map || !L) return;

      if (pinnedLayerRef.current) {
        map.removeLayer(pinnedLayerRef.current);
        pinnedLayerRef.current = null;
      }

      if (!pinned) return;

      const meta = dataRef.current.regions.find(
        (region) => region.id === pinned.regionId,
      );
      const color = meta?.color ?? "#EF4444";
      const group = L.layerGroup().addTo(map);

      L.circle([pinned.lat, pinned.lon], {
        radius: 320,
        color,
        weight: 1,
        opacity: 0.35,
        fillColor: color,
        fillOpacity: 0.08,
        interactive: false,
      }).addTo(group);

      L.marker([pinned.lat, pinned.lon], {
        icon: L.divIcon({
          className: "pin-marker",
          html: `
            <span class="pin-marker__pulse" style="--pin-color:${color}"></span>
            <span class="pin-marker__core" style="--pin-color:${color}"></span>
          `,
          iconSize: [28, 28],
          iconAnchor: [14, 14],
        }),
        interactive: false,
        keyboard: false,
      }).addTo(group);

      pinnedLayerRef.current = group;
      map.flyTo([pinned.lat, pinned.lon], 14, { duration: 0.9 });
    }, [status, pinned]);

    useImperativeHandle(
      ref,
      () => ({
        focusRegion(id: number) {
          const map = mapRef.current;
          const bounds = regionBoundsRef.current.get(id);
          if (!map || !bounds) return;

          map.flyToBounds(bounds, {
            paddingTopLeft: [64, 64],
            paddingBottomRight: [64, 64],
            maxZoom: 13,
            duration: 0.85,
          });
        },
        focusHotel(hotel: Hotel) {
          const map = mapRef.current;
          if (!map) return;
          map.flyTo([hotel.lat, hotel.lon], 14.2, { duration: 0.8 });
        },
        focusRoute(index: number) {
          const map = mapRef.current;
          const L = leafletRef.current;
          const route = dataRef.current.routes?.[index];
          if (!map || !L || !route || !route.path_coordinates?.length) return;
          const latLngs = route.path_coordinates.map(
            ([lat, lon]) => [lat, lon] as Leaflet.LatLngTuple,
          );
          const bounds = L.latLngBounds(latLngs);
          map.flyToBounds(bounds, {
            padding: [60, 60],
            maxZoom: 13.5,
            duration: 0.85,
          });
        },
        focusStop(lat: number, lon: number) {
          const map = mapRef.current;
          if (!map) return;
          map.flyTo([lat, lon], 14.5, { duration: 0.8 });
        },
        fitAll() {
          const map = mapRef.current;
          const bounds = allBoundsRef.current;
          if (!map || !bounds) return;
          map.flyToBounds(bounds, {
            padding: [40, 40],
            maxZoom: 12,
            duration: 0.8,
          });
        },
        zoomIn() {
          mapRef.current?.zoomIn(0.5);
        },
        zoomOut() {
          mapRef.current?.zoomOut(0.5);
        },
      }),
      [],
    );

    const selectedMeta =
      regions.find((region) => region.id === selectedRegion) ?? null;
    const activeMeta =
      regions.find((region) => region.id === activeHotel?.region) ?? null;
    const pinnedMeta =
      regions.find((region) => region.id === pinned?.regionId) ?? null;
    const activeRouteOnMap =
      selectedRouteIndex !== null && routes ? routes[selectedRouteIndex] : null;
    const isReady = status === "ready";

    return (
      <div className="map-shell">
        <div
          ref={containerRef}
          className="coverage-map"
          role="application"
          aria-label="Map of LinenGrass hotel coverage across five Bengaluru regions"
        />

        {status === "loading" && (
          <div className="map-skeleton" aria-hidden="true">
            <div className="map-skeleton__card">
              <span className="spinner" />
              Plotting the coverage footprint
            </div>
          </div>
        )}

        {status === "error" && (
          <div className="map-error" role="alert">
            <div className="map-error__card">
              <strong>The map could not load.</strong>
              <span>Refresh the page to try again.</span>
              <button
                type="button"
                className="btn btn--primary"
                onClick={() => window.location.reload()}
              >
                Reload map
              </button>
            </div>
          </div>
        )}

        <div className="map-context">
          {workspace === "dispatch" ? (
            activeRouteOnMap ? (
              <>
                <span
                  className="map-context__dot"
                  style={{ backgroundColor: activeRouteOnMap.color }}
                />
                <span className="map-context__code">
                  {activeRouteOnMap.vehicle_label.split(" (")[0]}
                </span>
                <span className="map-context__name">
                  {activeRouteOnMap.vehicle_label.includes(" - ")
                    ? activeRouteOnMap.vehicle_label.split(" - ")[1].replace(")", "")
                    : activeRouteOnMap.region_name}
                </span>
                <button
                  type="button"
                  className="map-context__clear"
                  onClick={() => onSelectRoute?.(null)}
                  aria-label="Clear route selection"
                  title="Show all vehicles"
                >
                  <X size={12} />
                </button>
              </>
            ) : (
              <>
                <span className="map-context__dot map-context__dot--dispatch" />
                <span className="map-context__name">Fleet dispatch · 10 vehicles</span>
                <span className="map-context__count">102 stops · 608 km</span>
              </>
            )
          ) : selectedMeta ? (
            <>
              <span
                className="map-context__dot"
                style={regionStyle(selectedMeta.color)}
              />
              <span className="map-context__code">{selectedMeta.code}</span>
              <span className="map-context__name">
                {REGION_MAP_LABELS[selectedMeta.id] ?? selectedMeta.short_name}
              </span>
              <button
                type="button"
                className="map-context__clear"
                onClick={() => onSelectRegion(null, true)}
                aria-label="Clear region selection"
                title="Show all regions"
              >
                <X size={12} />
              </button>
            </>
          ) : (
            <>
              <span className="map-context__dot map-context__dot--all" />
              <span className="map-context__name">All five regions</span>
              <span className="map-context__count">{hotels.length} hotels</span>
            </>
          )}
        </div>

        <div className="map-toolbar" role="group" aria-label="Map controls">
          <button
            type="button"
            className="map-tool"
            onClick={() => mapRef.current?.zoomIn(0.5)}
            aria-label="Zoom in"
            title="Zoom in"
            disabled={!isReady}
          >
            <Plus size={15} />
          </button>
          <button
            type="button"
            className="map-tool"
            onClick={() => mapRef.current?.zoomOut(0.5)}
            aria-label="Zoom out"
            title="Zoom out"
            disabled={!isReady}
          >
            <Minus size={15} />
          </button>
          <span className="map-toolbar__sep" />
          <button
            type="button"
            className="map-tool"
            onClick={onResetView}
            aria-label="Fit all regions"
            title="Fit all regions"
            disabled={!isReady}
          >
            <Frame size={15} />
          </button>
          <span className="map-toolbar__sep" />
          <button
            type="button"
            className="map-tool"
            onClick={onToggleHotels}
            aria-label={hotelsVisible ? "Hide hotel pins" : "Show hotel pins"}
            aria-pressed={hotelsVisible}
            title={hotelsVisible ? "Hide hotel pins" : "Show hotel pins"}
            disabled={!isReady}
          >
            {hotelsVisible ? <Eye size={15} /> : <EyeOff size={15} />}
          </button>
        </div>

        {workspace === "coverage" ? (
          <div className="map-legend" aria-label="Region legend">
            <div className="map-legend__head">
              <span>Coverage footprint</span>
              <span className="map-legend__res">H3 · R7</span>
            </div>
            {regions.map((region) => (
              <button
                type="button"
                key={region.id}
                className="map-legend__row"
                data-proposed={region.route_status === "Proposed"}
                style={regionStyle(region.color)}
                onClick={() => onSelectRegion(region.id, true)}
                onMouseEnter={() => onHoverRegion(region.id)}
                onMouseLeave={() => onHoverRegion(null)}
                aria-label={`${region.code} ${region.short_name}, ${region.route_status}`}
              >
                <span className="map-legend__dot" />
                <span className="map-legend__code">{region.code}</span>
                <span className="map-legend__name">
                  {REGION_MAP_LABELS[region.id] ?? region.short_name}
                </span>
                <span className="map-legend__count">
                  {hotels.filter((hotel) => hotel.region === region.id).length}
                </span>
              </button>
            ))}
            <div className="map-legend__foot">
              <span>{hotels.length} hotels</span>
              <span>R1 is proposed</span>
            </div>
          </div>
        ) : (
          <div className="map-legend map-legend--dispatch" aria-label="Dispatch legend">
            <div className="map-legend__head">
              <span>
                {workspace === "studio"
                  ? "Studio solver"
                  : workspace === "manual"
                    ? "Manual route plan"
                    : "Fleet dispatch"}
              </span>
              <span className="map-legend__res">
                {workspace === "studio"
                  ? `${routes.length} active vans`
                  : workspace === "manual"
                    ? `${routes.length} Routes`
                    : "10 Vans"}
              </span>
            </div>
            <div className="dispatch-legend__depot">
              <span className="depot-legend-dot" />
              <span>LinenGrass HQ (Yeshwanthpur Central Laundry)</span>
            </div>
            {routes.slice(0, 8).map((route, idx) => (
              <button
                type="button"
                key={route.vehicle_label}
                className="map-legend__row"
                style={{ "--region": route.color } as CSSProperties}
                onClick={() => onSelectRoute?.(idx)}
              >
                <span className="map-legend__dot" style={{ backgroundColor: route.color }} />
                <span className="map-legend__code">{route.vehicle_label.split(" - ")[0]}</span>
                <span className="map-legend__name">
                  {route.vehicle_label.split(" - ")[1]?.split(" (")[0] ?? route.vehicle_label}
                </span>
                <span className="map-legend__count">{route.total_hotels} stops</span>
              </button>
            ))}
            <div className="map-legend__foot">
              <span>{routes.reduce((acc, r) => acc + r.total_hotels, 0)} stops total</span>
              <span>
                {workspace === "studio"
                  ? "Simulated plan"
                  : workspace === "manual"
                    ? "Manual route plan"
                    : "100% delivered"}
              </span>
            </div>
          </div>
        )}

        {activeHotel && activeMeta ? (
          <div className="map-card">
            <div className="map-card__head">
              <span className="map-card__kicker">
                <HotelIcon size={12} />
                Hotel pin
              </span>
              <button
                type="button"
                className="map-card__close"
                onClick={onCloseHotel}
                aria-label="Close hotel details"
              >
                <X size={14} />
              </button>
            </div>
            <div className="map-card__title">{activeHotel.name}</div>
            <div className="map-card__sub">
              <span
                className="map-card__dot"
                style={regionStyle(activeMeta.color)}
              />
              {activeMeta.code} ·{" "}
              {REGION_MAP_LABELS[activeMeta.id] ?? activeMeta.short_name}
            </div>
            <div className="map-card__metrics">
              <div className="map-card__metric">
                <span>Stop</span>
                <b>{activeHotel.stop_mins} min</b>
              </div>
              <div className="map-card__metric">
                <span>Load</span>
                <b>{activeHotel.load} bags</b>
              </div>
              <div className="map-card__metric">
                <span>Route</span>
                <b>{activeMeta.route_status}</b>
              </div>
            </div>
          </div>
        ) : pinned && pinnedMeta ? (
          <div className="map-card" role="status">
            <div className="map-card__head">
              <span className="map-card__kicker">
                <MapPin size={12} />
                Pinned coordinate
              </span>
              <button
                type="button"
                className="map-card__close"
                onClick={onClearPinned}
                aria-label="Clear pinned coordinate"
              >
                <X size={14} />
              </button>
            </div>
            <div className="map-card__title">
              {pinned.inside
                ? "Inside the coverage footprint"
                : "Outside the footprint"}
            </div>
            <div className="map-card__coords">
              {pinned.lat.toFixed(5)}, {pinned.lon.toFixed(5)}
            </div>
            <div className="map-card__badge-row">
              <span
                className={
                  pinned.inside
                    ? "map-badge map-badge--inside"
                    : "map-badge map-badge--outside"
                }
              >
                {pinned.inside ? "Mapped cell" : "Nearest region assigned"}
              </span>
            </div>
            <dl className="map-card__rows">
              <div className="map-card__row">
                <dt>Region</dt>
                <dd>
                  <span
                    className="map-card__inline-dot"
                    style={regionStyle(pinnedMeta.color)}
                  />
                  {pinnedMeta.code} ·{" "}
                  {REGION_MAP_LABELS[pinnedMeta.id] ?? pinnedMeta.short_name}
                </dd>
              </div>
              <div className="map-card__row">
                <dt>Nearest hotel</dt>
                <dd>{pinned.nearestHotel?.name ?? "None on record"}</dd>
              </div>
              <div className="map-card__row">
                <dt>Distance</dt>
                <dd>{formatDistance(pinned.nearestDistanceKm)}</dd>
              </div>
            </dl>
          </div>
        ) : null}
      </div>
    );
  },
);

export default CoverageMap;
