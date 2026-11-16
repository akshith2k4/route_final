"use client";

import { useEffect, useRef, useState } from "react";
import type * as Leaflet from "leaflet";

const TILE_URL = "https://tile.openstreetmap.org/{z}/{x}/{y}.png";
const TILE_ATTRIBUTION =
  '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">OpenStreetMap</a> contributors';

type CenterPickerMapProps = {
  center: { lat: number; lon: number };
  zoom: number;
  onChange: (lat: number, lon: number) => void;
};

/** Small map used in the Basics step: click or drag to set the city centre. */
export default function CenterPickerMap({
  center,
  zoom,
  onChange,
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

      const marker = L.marker([center.lat, center.lon], {
        draggable: true,
        icon: L.divIcon({
          className: "admin-center-marker",
          html: `<div class="admin-center-pin"><span></span></div>`,
          iconSize: [26, 26],
          iconAnchor: [13, 13],
        }),
      }).addTo(map);
      markerRef.current = marker;

      marker.on("dragend", () => {
        const position = marker.getLatLng();
        onChangeRef.current(position.lat, position.lng);
      });
      map.on("click", (event) => {
        onChangeRef.current(event.latlng.lat, event.latlng.lng);
      });

      setStatus("ready");
      requestAnimationFrame(() => map?.invalidateSize());
    }

    initialise().catch((error) => {
      console.error("Could not initialise the centre picker map:", error);
    });

    return () => {
      cancelled = true;
      map?.remove();
      mapRef.current = null;
      markerRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Reflect external centre edits (numeric inputs) on the map.
  useEffect(() => {
    if (status !== "ready") return;
    markerRef.current?.setLatLng([center.lat, center.lon]);
    mapRef.current?.panTo([center.lat, center.lon], { animate: false });
  }, [status, center.lat, center.lon]);

  return (
    <div className="relative h-full w-full overflow-hidden rounded-xl border border-line-strong bg-map-bg">
      <div ref={containerRef} className="absolute inset-0 z-0" />
      {status === "loading" && (
        <div className="absolute inset-0 z-10 grid place-items-center bg-bone text-[12px] font-semibold text-muted">
          Loading map…
        </div>
      )}
    </div>
  );
}
