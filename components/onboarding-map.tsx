"use client";

import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from "react";
import { cellToBoundary, cellsToMultiPolygon, latLngToCell } from "h3-js";
import type * as Leaflet from "leaflet";
import {
  Compass,
  Crosshair,
  Eye,
  EyeOff,
  Layers,
  MapPin,
  Minus,
  Navigation,
  Plus,
  Warehouse,
  X,
} from "lucide-react";
import {
  ONBOARDING_H3_RESOLUTION,
  haversineKm,
  type OnboardingHotel,
  type RegionMetaDefinition,
} from "../lib/onboarding";

export type OnboardingMapHandle = {
  fitAll: () => void;
  focusRegion: (regionId: number) => void;
  focusHotel: (hotel: OnboardingHotel) => void;
  zoomIn: () => void;
  zoomOut: () => void;
};

export type OnboardingMapProps = {
  center: { lat: number; lon: number; name: string };
  hotels: OnboardingHotel[];
  hexMap: Record<string, number>;
  regions: RegionMetaDefinition[];
  selectedRegionId: number | null;
  hoveredRegionId: number | null;
  selectedHotel: OnboardingHotel | null;
  pickCenterMode: boolean;
  onPickCenter: (lat: number, lon: number) => void;
  onSelectRegion: (id: number | null) => void;
  onHoverRegion: (id: number | null) => void;
  onSelectHotel: (hotel: OnboardingHotel | null) => void;
  showHexagons: boolean;
  showHotels: boolean;
  showOutlines: boolean;
  hexOpacity: number;
  pinnedCoord: { lat: number; lon: number; cell?: string; regionId?: number } | null;
  onPinCoord: (coord: { lat: number; lon: number; cell: string; regionId?: number }) => void;
  onClearPinned: () => void;
};

const TILE_URL = "https://tile.openstreetmap.org/{z}/{x}/{y}.png";
const TILE_ATTRIBUTION =
  '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">OpenStreetMap</a> contributors';

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

const OnboardingMap = forwardRef<OnboardingMapHandle, OnboardingMapProps>(
  function OnboardingMap(
    {
      center,
      hotels,
      hexMap,
      regions,
      selectedRegionId,
      hoveredRegionId,
      selectedHotel,
      pickCenterMode,
      onPickCenter,
      onSelectRegion,
      onHoverRegion,
      onSelectHotel,
      showHexagons,
      showHotels,
      showOutlines,
      hexOpacity,
      pinnedCoord,
      onPinCoord,
      onClearPinned,
    },
    ref
  ) {
    const containerRef = useRef<HTMLDivElement | null>(null);
    const mapRef = useRef<Leaflet.Map | null>(null);
    const leafletRef = useRef<typeof Leaflet | null>(null);

    const [mapStatus, setMapStatus] = useState<"loading" | "ready" | "error">("loading");

    // Leaflet Layer References
    const hexLayersRef = useRef<Map<number, Leaflet.Polygon[]>>(new Map());
    const boundaryLayersRef = useRef<Map<number, Leaflet.Polygon[]>>(new Map());
    const hotelMarkersRef = useRef<Map<string, Leaflet.CircleMarker>>(new Map());
    const hotelLayerRef = useRef<Leaflet.LayerGroup | null>(null);
    const centerMarkerRef = useRef<Leaflet.Marker | null>(null);
    const pinnedMarkerRef = useRef<Leaflet.Marker | null>(null);
    const centroidMarkersRef = useRef<Leaflet.Marker[]>([]);
    const regionBoundsRef = useRef<Map<number, Leaflet.LatLngBounds>>(new Map());
    const allBoundsRef = useRef<Leaflet.LatLngBounds | null>(null);

    // Callbacks container
    const callbacksRef = useRef({
      onPickCenter,
      onSelectRegion,
      onHoverRegion,
      onSelectHotel,
      onPinCoord,
    });
    useEffect(() => {
      callbacksRef.current = {
        onPickCenter,
        onSelectRegion,
        onHoverRegion,
        onSelectHotel,
        onPinCoord,
      };
    }, [onPickCenter, onSelectRegion, onHoverRegion, onSelectHotel, onPinCoord]);

    // Data ref
    const dataRef = useRef({
      center,
      hotels,
      hexMap,
      regions,
      pickCenterMode,
    });
    useEffect(() => {
      dataRef.current = {
        center,
        hotels,
        hexMap,
        regions,
        pickCenterMode,
      };
    }, [center, hotels, hexMap, regions, pickCenterMode]);

    // Initialize Map
    useEffect(() => {
      let cancelled = false;
      let map: Leaflet.Map | null = null;

      async function init() {
        if (!containerRef.current || mapRef.current) return;
        const L = (await import("leaflet")).default;
        if (cancelled || !containerRef.current) return;

        leafletRef.current = L;

        map = L.map(containerRef.current, {
          center: [center.lat, center.lon],
          zoom: 11,
          minZoom: 6,
          maxZoom: 18,
          zoomControl: false,
          attributionControl: true,
          zoomSnap: 0.25,
          zoomDelta: 0.5,
        });

        mapRef.current = map;

        L.tileLayer(TILE_URL, {
          attribution: TILE_ATTRIBUTION,
          maxZoom: 19,
        }).addTo(map);

        map.on("click", (e) => {
          const { lat, lng } = e.latlng;
          if (dataRef.current.pickCenterMode) {
            callbacksRef.current.onPickCenter(lat, lng);
          } else {
            let cell = "";
            try {
              cell = latLngToCell(lat, lng, ONBOARDING_H3_RESOLUTION);
            } catch {
              // ignore
            }
            const regId = dataRef.current.hexMap[cell];
            callbacksRef.current.onPinCoord({
              lat,
              lon: lng,
              cell,
              regionId: regId,
            });
          }
        });

        setMapStatus("ready");
      }

      init().catch((err) => {
        console.error("Map initialization failed", err);
        setMapStatus("error");
      });

      return () => {
        cancelled = true;
        if (map) {
          map.remove();
        }
        mapRef.current = null;
        leafletRef.current = null;
      };
    }, []);

    // Rebuild data layers whenever regions, hexMap, or hotels change
    useEffect(() => {
      const map = mapRef.current;
      const L = leafletRef.current;
      if (!map || !L || mapStatus !== "ready") return;

      // 1. Clear old layers
      for (const layers of hexLayersRef.current.values()) {
        layers.forEach((p) => p.remove());
      }
      hexLayersRef.current.clear();

      for (const layers of boundaryLayersRef.current.values()) {
        layers.forEach((p) => p.remove());
      }
      boundaryLayersRef.current.clear();

      if (hotelLayerRef.current) {
        hotelLayerRef.current.clearLayers();
        hotelLayerRef.current.remove();
      }
      hotelMarkersRef.current.clear();

      centroidMarkersRef.current.forEach((m) => m.remove());
      centroidMarkersRef.current = [];

      regionBoundsRef.current.clear();
      const allBounds = L.latLngBounds([]);

      // Add center to bounds
      allBounds.extend([center.lat, center.lon]);

      // Region map lookup
      const regionById = new Map(regions.map((r) => [r.id, r]));

      // 2. Build Hexagon Layers
      const cellsByRegion = new Map<number, string[]>();
      for (const [hexId, regionId] of Object.entries(hexMap)) {
        const meta = regionById.get(regionId);
        if (!meta) continue;

        let boundary: [number, number][];
        try {
          boundary = cellToBoundary(hexId);
        } catch {
          continue;
        }

        const latLngs = boundary.map(
          ([lat, lon]) => [lat, lon] as Leaflet.LatLngTuple
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
          opacity: 0.5,
          fillColor: meta.color,
          fillOpacity: hexOpacity,
          className: "onboarding-hex-poly",
        });

        polygon.on("mouseover", () => {
          callbacksRef.current.onHoverRegion(regionId);
        });
        polygon.on("mouseout", () => {
          callbacksRef.current.onHoverRegion(null);
        });
        polygon.on("click", (e) => {
          L.DomEvent.stopPropagation(e);
          callbacksRef.current.onSelectRegion(regionId);
        });

        if (showHexagons) {
          polygon.addTo(map);
        }

        const regHexes = hexLayersRef.current.get(regionId) ?? [];
        regHexes.push(polygon);
        hexLayersRef.current.set(regionId, regHexes);

        const regCells = cellsByRegion.get(regionId) ?? [];
        regCells.push(hexId);
        cellsByRegion.set(regionId, regCells);
      }

      // 3. Build Region MultiPolygon Outlines
      for (const [regionId, cells] of cellsByRegion) {
        const meta = regionById.get(regionId);
        if (!meta) continue;

        try {
          const multiPolygon = cellsToMultiPolygon(cells, false) as number[][][][];
          const outlines: Leaflet.Polygon[] = [];

          for (const poly of multiPolygon) {
            const rings = poly.map((ring) =>
              ring.map(([lat, lon]) => [lat, lon] as Leaflet.LatLngTuple)
            );

            const outline = L.polygon(rings, {
              color: meta.color,
              weight: 2.2,
              opacity: 0.9,
              fill: false,
              interactive: false,
              className: "onboarding-region-outline",
            });

            if (showOutlines) {
              outline.addTo(map);
            }
            outlines.push(outline);
          }

          boundaryLayersRef.current.set(regionId, outlines);
        } catch {
          // ignore
        }
      }

      // 4. Centroid Labels
      for (const reg of regions) {
        if (!reg.centroid || reg.hotelCount === 0) continue;
        const icon = L.divIcon({
          className: "onboarding-centroid-label",
          html: `<div style="background:${reg.color};" class="centroid-pill">
                  <span class="centroid-code">${reg.code}</span>
                  <span class="centroid-count">${reg.hotelCount} stops</span>
                 </div>`,
          iconSize: [80, 24],
          iconAnchor: [40, 12],
        });

        const centroidMarker = L.marker([reg.centroid.lat, reg.centroid.lon], {
          icon,
          interactive: true,
          zIndexOffset: 100,
        });

        centroidMarker.on("click", (e) => {
          L.DomEvent.stopPropagation(e);
          callbacksRef.current.onSelectRegion(reg.id);
        });

        centroidMarker.addTo(map);
        centroidMarkersRef.current.push(centroidMarker);
      }

      // 5. Hotel Markers
      const hotelLayer = L.layerGroup();
      hotelLayerRef.current = hotelLayer;

      for (const hotel of hotels) {
        const regId = hotel.regionId ?? 0;
        const meta = regionById.get(regId);
        const color = meta?.color ?? "#2d5b42";

        allBounds.extend([hotel.lat, hotel.lon]);

        const marker = L.circleMarker([hotel.lat, hotel.lon], {
          radius: 4.5,
          color: "#FFFDF8",
          weight: 1.5,
          opacity: 1,
          fillColor: color,
          fillOpacity: 0.95,
          bubblingMouseEvents: false,
        });

        const distKm = Math.round(haversineKm(center.lat, center.lon, hotel.lat, hotel.lon) * 10) / 10;

        marker.bindTooltip(
          `<div class="onboarding-tooltip">
            <div class="tooltip-name">${escapeHtml(hotel.name)}</div>
            <div class="tooltip-sub">${escapeHtml(meta?.code ?? "R?")} · ${hotel.load} bags · ${distKm} km from hub</div>
           </div>`,
          {
            className: "onboarding-leaflet-tooltip",
            direction: "top",
            offset: [0, -7],
            opacity: 1,
          }
        );

        marker.on("click", (e) => {
          L.DomEvent.stopPropagation(e);
          callbacksRef.current.onSelectHotel(hotel);
        });

        marker.on("mouseover", () => {
          marker.setStyle({ radius: 7, weight: 2.5 });
          marker.bringToFront();
        });

        marker.on("mouseout", () => {
          marker.setStyle({ radius: 4.5, weight: 1.5 });
        });

        marker.addTo(hotelLayer);
        hotelMarkersRef.current.set(hotel.id, marker);
      }

      if (showHotels) {
        hotelLayer.addTo(map);
      }

      allBoundsRef.current = allBounds;

      // Fit map if bounds valid
      if (allBounds.isValid()) {
        map.fitBounds(allBounds, { padding: [50, 50], maxZoom: 14 });
      }
    }, [center, hotels, hexMap, regions, mapStatus]);

    // Handle Center Depot Marker
    useEffect(() => {
      const map = mapRef.current;
      const L = leafletRef.current;
      if (!map || !L || mapStatus !== "ready") return;

      if (centerMarkerRef.current) {
        centerMarkerRef.current.remove();
        centerMarkerRef.current = null;
      }

      const depotIcon = L.divIcon({
        className: "onboarding-depot-pin",
        html: `
          <div class="depot-pin-wrapper ${pickCenterMode ? "depot-pin-pulse" : ""}">
            <div class="depot-pin-dot">
              <svg viewBox="0 0 24 24" fill="currentColor" width="14" height="14">
                <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5"/>
              </svg>
            </div>
            <div class="depot-pin-label">${escapeHtml(center.name || "Central Operating Hub")}</div>
          </div>
        `,
        iconSize: [160, 40],
        iconAnchor: [80, 20],
      });

      const marker = L.marker([center.lat, center.lon], {
        icon: depotIcon,
        zIndexOffset: 1000,
        draggable: pickCenterMode,
      });

      marker.on("dragend", () => {
        const pos = marker.getLatLng();
        callbacksRef.current.onPickCenter(pos.lat, pos.lng);
      });

      marker.addTo(map);
      centerMarkerRef.current = marker;
    }, [center, pickCenterMode, mapStatus]);

    // Handle Pinned Coordinate Marker
    useEffect(() => {
      const map = mapRef.current;
      const L = leafletRef.current;
      if (!map || !L || mapStatus !== "ready") return;

      if (pinnedMarkerRef.current) {
        pinnedMarkerRef.current.remove();
        pinnedMarkerRef.current = null;
      }

      if (!pinnedCoord) return;

      const pinIcon = L.divIcon({
        className: "onboarding-pinned-marker",
        html: `
          <div class="pinned-pulse-marker">
            <div class="pinned-pulse-core"></div>
            <div class="pinned-pulse-ring"></div>
          </div>
        `,
        iconSize: [24, 24],
        iconAnchor: [12, 12],
      });

      const marker = L.marker([pinnedCoord.lat, pinnedCoord.lon], {
        icon: pinIcon,
        zIndexOffset: 1500,
      }).addTo(map);

      pinnedMarkerRef.current = marker;
    }, [pinnedCoord, mapStatus]);

    // Handle Visibility & Opacity Changes
    useEffect(() => {
      const map = mapRef.current;
      if (!map || mapStatus !== "ready") return;

      for (const [regionId, layers] of hexLayersRef.current) {
        const isSelected = selectedRegionId === regionId;
        const isHovered = hoveredRegionId === regionId;
        const hasSelection = selectedRegionId !== null;

        const effectiveFillOpacity = hasSelection
          ? isSelected
            ? Math.min(0.8, hexOpacity + 0.2)
            : 0.12
          : isHovered
            ? Math.min(0.75, hexOpacity + 0.15)
            : hexOpacity;

        const strokeOpacity = hasSelection
          ? isSelected
            ? 0.9
            : 0.2
          : isHovered
            ? 0.8
            : 0.5;

        const weight = isSelected ? 1.6 : isHovered ? 1.2 : 0.8;

        layers.forEach((p) => {
          p.setStyle({
            fillOpacity: effectiveFillOpacity,
            opacity: strokeOpacity,
            weight,
          });

          if (showHexagons && !map.hasLayer(p)) {
            p.addTo(map);
          } else if (!showHexagons && map.hasLayer(p)) {
            p.remove();
          }
        });
      }

      // Boundary outlines
      for (const [regionId, layers] of boundaryLayersRef.current) {
        const isSelected = selectedRegionId === regionId;
        layers.forEach((outline) => {
          outline.setStyle({
            weight: isSelected ? 3.0 : 2.0,
            opacity: isSelected ? 1.0 : 0.7,
          });
          if (showOutlines && !map.hasLayer(outline)) {
            outline.addTo(map);
          } else if (!showOutlines && map.hasLayer(outline)) {
            outline.remove();
          }
        });
      }

      // Hotel layer
      if (hotelLayerRef.current) {
        if (showHotels && !map.hasLayer(hotelLayerRef.current)) {
          hotelLayerRef.current.addTo(map);
        } else if (!showHotels && map.hasLayer(hotelLayerRef.current)) {
          hotelLayerRef.current.remove();
        }
      }
    }, [
      showHexagons,
      showHotels,
      showOutlines,
      hexOpacity,
      selectedRegionId,
      hoveredRegionId,
      mapStatus,
    ]);

    // Imperative Handle
    useImperativeHandle(ref, () => ({
      fitAll: () => {
        if (mapRef.current && allBoundsRef.current?.isValid()) {
          mapRef.current.fitBounds(allBoundsRef.current, {
            padding: [40, 40],
            maxZoom: 15,
          });
        }
      },
      focusRegion: (regionId: number) => {
        const bounds = regionBoundsRef.current.get(regionId);
        if (mapRef.current && bounds?.isValid()) {
          mapRef.current.fitBounds(bounds, { padding: [50, 50], maxZoom: 15 });
        }
      },
      focusHotel: (hotel: OnboardingHotel) => {
        if (mapRef.current) {
          mapRef.current.setView([hotel.lat, hotel.lon], 14, { animate: true });
          const marker = hotelMarkersRef.current.get(hotel.id);
          if (marker) {
            marker.openTooltip();
          }
        }
      },
      zoomIn: () => {
        mapRef.current?.zoomIn();
      },
      zoomOut: () => {
        mapRef.current?.zoomOut();
      },
    }));

    return (
      <div className="onboarding-map-container">
        <div ref={containerRef} className="onboarding-map" />

        {/* Floating Controls */}
        <div className="onboarding-map-toolbar">
          <div className="map-btn-group">
            <button
              type="button"
              className="map-btn"
              onClick={() => mapRef.current?.zoomIn()}
              title="Zoom In"
              aria-label="Zoom In"
            >
              <Plus size={15} />
            </button>
            <button
              type="button"
              className="map-btn"
              onClick={() => mapRef.current?.zoomOut()}
              title="Zoom Out"
              aria-label="Zoom Out"
            >
              <Minus size={15} />
            </button>
            <button
              type="button"
              className="map-btn"
              onClick={() => {
                if (allBoundsRef.current?.isValid()) {
                  mapRef.current?.fitBounds(allBoundsRef.current, {
                    padding: [40, 40],
                  });
                }
              }}
              title="Fit Entire Fleet Footprint"
              aria-label="Fit Entire Fleet Footprint"
            >
              <Compass size={15} />
            </button>
          </div>
        </div>

        {/* Pick Center Mode Banner */}
        {pickCenterMode && (
          <div className="pick-center-banner">
            <Crosshair size={16} className="spin-slow" />
            <span>Click anywhere on the map to set the operating center / depot</span>
          </div>
        )}

        {/* Pinned Inspector Card */}
        {pinnedCoord && !pickCenterMode && (
          <div className="pinned-inspector-card">
            <div className="pinned-inspector-header">
              <div className="pinned-tag">
                <MapPin size={12} />
                <span>Coordinate Inspector</span>
              </div>
              <button
                type="button"
                className="close-pin-btn"
                onClick={onClearPinned}
                aria-label="Close coordinate inspector"
              >
                <X size={12} />
              </button>
            </div>
            <div className="pinned-inspector-coords">
              {pinnedCoord.lat.toFixed(5)}° N, {pinnedCoord.lon.toFixed(5)}° E
            </div>
            <div className="pinned-inspector-details">
              <div className="inspector-row">
                <span className="lbl">H3 Cell (Res 7)</span>
                <span className="val font-mono">{pinnedCoord.cell || "—"}</span>
              </div>
              <div className="inspector-row">
                <span className="lbl">Assigned Region</span>
                <span className="val font-bold">
                  {pinnedCoord.regionId !== undefined
                    ? `Region ${pinnedCoord.regionId} (${regions.find((r) => r.id === pinnedCoord.regionId)?.dominantCorridor ?? "Active"})`
                    : "Outside active territory"}
                </span>
              </div>
              <div className="inspector-row">
                <span className="lbl">Distance to Depot</span>
                <span className="val">
                  {Math.round(haversineKm(center.lat, center.lon, pinnedCoord.lat, pinnedCoord.lon) * 10) / 10} km
                </span>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }
);

export default OnboardingMap;
