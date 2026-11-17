"use client";

import { useEffect, useRef, useState } from "react";
import type * as Leaflet from "leaflet";

const TILE_URL = "https://tile.openstreetmap.org/{z}/{x}/{y}.png";
const TILE_ATTRIBUTION =
  '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">OpenStreetMap</a> contributors';

type CenterPickerMapProps = {
  /** Where the map looks. Does not place a marker by itself. */
  center: { lat: number; lon: number };
  zoom: number;
  /** Marker position. Null means nothing is picked yet. */
  value?: { lat: number; lon: number } | null;
  onChange: (lat: number, lon: number) => void;
  /** Optional hint shown over the map. */
  hint?: string;
};

/** Small map used to pick a point: click or drag the pin. */
export default function CenterPickerMap({
  center,
  zoom,
  value,
  onChange,
  hint,
}: CenterPickerMapProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<Leaflet.Map | null>(null);
  const markerRef = useRef<Leaflet.Marker | null>(null);
  const leafletRef = useRef<typeof import("leaflet") | null>(null);
  const [status, setStatus] = useState<"loading" | "ready">("loading");

  const onChangeRef = useRef(onChange);
  useEffect(() => {
    onChangeRef.current = onChange;
  }, [onChange]);

  function placeMarker(L: typeof import("leaflet"), lat: number, lon: number) {
    const map = mapRef.current;
    if (!map) return;
    if (!markerRef.current) {
      const marker = L.marker([lat, lon], {
        draggable: true,
        icon: L.divIcon({
          className: "admin-center-marker",
          html: `<div class="admin-center-pin"><span></span></div>`,
          iconSize: [26, 26],
          iconAnchor: [13, 13],
        }),
      }).addTo(map);
      marker.on("dragend", () => {
        const position = marker.getLatLng();
        onChangeRef.current(position.lat, position.lng);
      });
      markerRef.current = marker;
    } else {
      markerRef.current.setLatLng([lat, lon]);
    }
  }

  function removeMarker() {
    markerRef.current?.remove();
    markerRef.current = null;
  }

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
        minZoom: 4,
        maxZoom: 18,
        zoomControl: true,
        attributionControl: true,
      });
      mapRef.current = map;

      L.tileLayer(TILE_URL, {
        attribution: TILE_ATTRIBUTION,
        maxZoom: 19,
      }).addTo(map);

      map.on("click", (event) => {
        onChangeRef.current(event.latlng.lat, event.latlng.lng);
      });

      if (value) placeMarker(L, value.lat, value.lon);
      setStatus("ready");
      requestAnimationFrame(() => {
        if (!cancelled && map) map.invalidateSize();
      });
    }

    initialise().catch((error) => {
      console.error("Could not initialise the map:", error);
    });

    return () => {
      cancelled = true;
      map?.remove();
      mapRef.current = null;
      markerRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Reflect external edits (numeric inputs) on the map.
  useEffect(() => {
    if (status !== "ready" || !leafletRef.current) return;
    if (value) {
      placeMarker(leafletRef.current, value.lat, value.lon);
      mapRef.current?.panTo([value.lat, value.lon], { animate: false });
    } else {
      removeMarker();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status, value?.lat, value?.lon]);

  return (
    <div className="relative h-full w-full overflow-hidden rounded-xl border border-line-strong bg-map-bg">
      <div ref={containerRef} className="absolute inset-0 z-0" />
      {status === "loading" && (
        <div className="absolute inset-0 z-10 grid place-items-center bg-bone text-[12px] font-semibold text-muted">
          Loading map…
        </div>
      )}
      {hint && (
        <div className="pointer-events-none absolute bottom-3 left-3 z-[500] rounded-lg border border-line bg-paper/95 px-3 py-2 text-[10.5px] font-medium text-muted shadow-sm backdrop-blur">
          {hint}
        </div>
      )}
    </div>
  );
}
