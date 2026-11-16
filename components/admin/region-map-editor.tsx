"use client";

import { useEffect, useRef, useState } from "react";
import {
  cellToBoundary,
  cellToLatLng,
  gridDisk,
  latLngToCell,
} from "h3-js";
import type * as Leaflet from "leaflet";
import { haversineKm } from "../../lib/coverage";
import type { RegionDraft } from "../../lib/city-presets";

const TILE_URL = "https://tile.openstreetmap.org/{z}/{x}/{y}.png";
const TILE_ATTRIBUTION =
  '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">OpenStreetMap</a> contributors';

/**
 * Territory preview resolution. Coarser than the city's own H3 resolution so
 * the preview stays fast; assignment uses the same nearest-centre rule the
 * real pipeline uses for hotels.
 */
const PREVIEW_RESOLUTION = 6;
const PREVIEW_RADIUS_CELLS = 12;

type RegionMapEditorProps = {
  center: { lat: number; lon: number };
  zoom: number;
  regions: RegionDraft[];
  selectedId: string | null;
  showTerritories: boolean;
  onAddRegion: (lat: number, lon: number) => void;
  onMoveRegion: (id: string, lat: number, lon: number) => void;
  onSelectRegion: (id: string) => void;
};

export default function RegionMapEditor({
  center,
  zoom,
  regions,
  selectedId,
  showTerritories,
  onAddRegion,
  onMoveRegion,
  onSelectRegion,
}: RegionMapEditorProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<Leaflet.Map | null>(null);
  const leafletRef = useRef<typeof import("leaflet") | null>(null);
  const markerLayerRef = useRef<Leaflet.LayerGroup | null>(null);
  const territoryLayerRef = useRef<Leaflet.LayerGroup | null>(null);
  const [status, setStatus] = useState<"loading" | "ready">("loading");

  const callbacksRef = useRef({ onAddRegion, onMoveRegion, onSelectRegion });
  useEffect(() => {
    callbacksRef.current = { onAddRegion, onMoveRegion, onSelectRegion };
  }, [onAddRegion, onMoveRegion, onSelectRegion]);

  const regionsRef = useRef(regions);
  useEffect(() => {
    regionsRef.current = regions;
  }, [regions]);

  // Initialise the map once.
  useEffect(() => {
    let cancelled = false;
    let map: Leaflet.Map | null = null;

    async function initialise() {
      const L = (await import("leaflet")).default;
      if (cancelled || !containerRef.current) return;
      leafletRef.current = L;

      map = L.map(containerRef.current, {
        center: [center.lat, center.lon],
        zoom,
        minZoom: 8,
        maxZoom: 18,
        zoomControl: true,
        attributionControl: true,
      });
      mapRef.current = map;

      L.tileLayer(TILE_URL, {
        attribution: TILE_ATTRIBUTION,
        maxZoom: 19,
      }).addTo(map);

      map.createPane("admin-territories");
      const pane = map.getPane("admin-territories");
      if (pane) {
        pane.style.zIndex = "350";
        pane.style.pointerEvents = "none";
      }

      territoryLayerRef.current = L.layerGroup().addTo(map);
      markerLayerRef.current = L.layerGroup().addTo(map);

      map.on("click", (event) => {
        callbacksRef.current.onAddRegion(event.latlng.lat, event.latlng.lng);
      });

      setStatus("ready");
      requestAnimationFrame(() => {
        if (!cancelled && map) map.invalidateSize();
      });
    }

    initialise().catch((error) => {
      console.error("Could not initialise the region editor map:", error);
    });

    return () => {
      cancelled = true;
      map?.remove();
      mapRef.current = null;
      markerLayerRef.current = null;
      territoryLayerRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Keep the view on the city centre when it changes.
  useEffect(() => {
    mapRef.current?.setView([center.lat, center.lon], zoom);
  }, [center.lat, center.lon, zoom]);

  // Sync region pins.
  useEffect(() => {
    const L = leafletRef.current;
    const layer = markerLayerRef.current;
    if (status !== "ready" || !L || !layer) return;

    layer.clearLayers();
    regions.forEach((region, index) => {
      const isSelected = region.id === selectedId;
      const marker = L.marker([region.center.lat, region.center.lon], {
        draggable: true,
        bubblingMouseEvents: false,
        zIndexOffset: isSelected ? 1000 : 500,
        icon: L.divIcon({
          className: "admin-region-marker",
          html: `
            <div class="admin-region-pin ${isSelected ? "admin-region-pin--selected" : ""}" style="--pin-color:${region.color}">
              <span class="admin-region-pin__code">R${index}</span>
            </div>
          `,
          iconSize: [34, 34],
          iconAnchor: [17, 17],
        }),
      });

      marker.bindTooltip(
        `<b>R${index} · ${region.map_label}</b><br/><span>${region.short_name}</span>`,
        { direction: "top", offset: [0, -14], className: "admin-region-tooltip" },
      );

      marker.on("click", () => {
        callbacksRef.current.onSelectRegion(region.id);
      });
      marker.on("dragend", () => {
        const position = marker.getLatLng();
        callbacksRef.current.onMoveRegion(region.id, position.lat, position.lng);
      });

      marker.addTo(layer);
    });
  }, [status, regions, selectedId]);

  // Territory preview: H3 cells coloured by nearest region centre.
  useEffect(() => {
    const L = leafletRef.current;
    const layer = territoryLayerRef.current;
    if (status !== "ready" || !L || !layer) return;

    layer.clearLayers();
    if (!showTerritories || regions.length === 0) return;

    let cells: string[] = [];
    try {
      const origin = latLngToCell(center.lat, center.lon, PREVIEW_RESOLUTION);
      cells = gridDisk(origin, PREVIEW_RADIUS_CELLS);
    } catch {
      return;
    }

    for (const cell of cells) {
      const [lat, lon] = cellToLatLng(cell);
      let bestRegion = regions[0];
      let bestDistance = Number.POSITIVE_INFINITY;
      for (const region of regions) {
        const distance = haversineKm(lat, lon, region.center.lat, region.center.lon);
        if (distance < bestDistance) {
          bestDistance = distance;
          bestRegion = region;
        }
      }

      const boundary = cellToBoundary(cell);
      L.polygon(
        boundary.map(([pointLat, pointLon]) => [pointLat, pointLon] as [number, number]),
        {
          pane: "admin-territories",
          interactive: false,
          color: bestRegion.color,
          weight: 1,
          opacity: 0.45,
          fillColor: bestRegion.color,
          fillOpacity: 0.2,
        },
      ).addTo(layer);
    }
  }, [status, showTerritories, regions, center.lat, center.lon]);

  return (
    <div className="relative h-full w-full overflow-hidden rounded-xl border border-line-strong bg-map-bg">
      <div ref={containerRef} className="absolute inset-0 z-0" />
      {status === "loading" && (
        <div className="absolute inset-0 z-10 grid place-items-center bg-bone text-[12px] font-semibold text-muted">
          Loading map…
        </div>
      )}
      <div className="pointer-events-none absolute bottom-3 left-3 z-[500] rounded-lg border border-line bg-paper/95 px-3 py-2 text-[10.5px] font-medium text-muted shadow-sm backdrop-blur">
        Click the map to add a region · drag pins to move them
      </div>
    </div>
  );
}
