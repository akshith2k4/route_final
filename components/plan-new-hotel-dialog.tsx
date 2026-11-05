"use client";

import { useEffect, useState } from "react";
import { Hotel, Plus, X } from "lucide-react";
import { nearestRegionId, type RegionMeta } from "../lib/coverage";
import {
  resolveVehicle,
  type NewHotelInput,
  type Plan,
} from "../lib/plan";

type PlanNewHotelDialogProps = {
  open: boolean;
  plan: Plan;
  regions: RegionMeta[];
  defaultRouteId: string | null;
  onClose: () => void;
  onAdd: (values: NewHotelInput, routeId: string) => boolean;
};

function shortRouteName(name: string): string {
  return name.replace(/\s*\(ID:[^)]*\)\s*$/, "").trim();
}

function routeBags(routeId: string, plan: Plan): number {
  return (
    plan.routes
      .find((route) => route.route_id === routeId)
      ?.stops.reduce((sum, stop) => sum + stop.load_bags, 0) ?? 0
  );
}

export default function PlanNewHotelDialog({
  open,
  plan,
  regions,
  defaultRouteId,
  onClose,
  onAdd,
}: PlanNewHotelDialogProps) {
  const [name, setName] = useState("");
  const [lat, setLat] = useState("");
  const [lon, setLon] = useState("");
  const [bags, setBags] = useState("0");
  const [rooms, setRooms] = useState("0");
  const [serviceMins, setServiceMins] = useState("15");
  const [regionId, setRegionId] = useState("");
  const [routeId, setRouteId] = useState(defaultRouteId ?? "");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setName("");
    setLat("");
    setLon("");
    setBags("0");
    setRooms("0");
    setServiceMins("15");
    setRegionId("");
    setRouteId(defaultRouteId ?? plan.routes[0]?.route_id ?? "");
    setError(null);
  }, [open, defaultRouteId, plan.routes]);

  useEffect(() => {
    if (!open) return;
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [open, onClose]);

  if (!open) return null;

  const selectedRoute =
    plan.routes.find((route) => route.route_id === routeId) ?? null;
  const selectedVehicle = selectedRoute
    ? resolveVehicle(plan, selectedRoute)
    : null;
  const currentBags = selectedRoute ? routeBags(selectedRoute.route_id, plan) : 0;
  const projectedBags = currentBags + (Number(bags) || 0);
  const overCapacity =
    selectedRoute !== null &&
    selectedVehicle !== null &&
    projectedBags > selectedVehicle.nominal_cap;

  const latValue = Number(lat);
  const lonValue = Number(lon);
  const coordsValid =
    lat.trim().length > 0 &&
    lon.trim().length > 0 &&
    Number.isFinite(latValue) &&
    Number.isFinite(lonValue) &&
    latValue >= -90 &&
    latValue <= 90 &&
    lonValue >= -180 &&
    lonValue <= 180;
  const bagsValue = Number(bags);
  const roomsValue = Number(rooms);
  const serviceValue = Number(serviceMins);
  const numbersValid =
    Number.isInteger(bagsValue) &&
    bagsValue >= 0 &&
    Number.isInteger(roomsValue) &&
    roomsValue >= 0 &&
    Number.isInteger(serviceValue) &&
    serviceValue >= 0;
  const detectedRegion = coordsValid
    ? nearestRegionId(latValue, lonValue)
    : null;
  const effectiveRegion = regionId
    ? Number(regionId)
    : detectedRegion ?? regions[0]?.id ?? 0;
  const regionLabel =
    regions.find((region) => region.id === effectiveRegion)?.short_name ??
    `Region ${effectiveRegion}`;
  const routeValid = selectedRoute !== null;
  const nameValid = name.trim().length > 0;
  const valid =
    nameValid &&
    coordsValid &&
    numbersValid &&
    routeValid &&
    !overCapacity;

  function submit() {
    if (!valid || !selectedRoute) {
      if (overCapacity) setError("This hotel would exceed the route's vehicle limit.");
      else if (!nameValid) setError("Give the hotel a name.");
      else if (!coordsValid) setError("Enter valid latitude and longitude.");
      else if (!numbersValid) setError("Bags, rooms and service time must be whole numbers.");
      else if (!routeValid) setError("Choose a route.");
      return;
    }
    const added = onAdd(
      {
        name: name.trim(),
        lat: latValue,
        lon: lonValue,
        region: effectiveRegion,
        service_mins: serviceValue,
        load_bags: bagsValue,
        rooms: roomsValue,
      },
      selectedRoute.route_id,
    );
    if (!added) {
      setError("Could not add this hotel to the route.");
    }
  }

  return (
    <div
      className="modal-backdrop"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <form
        className="plan-dialog plan-new-hotel-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="plan-new-hotel-title"
        onSubmit={(event) => {
          event.preventDefault();
          submit();
        }}
      >
        <button
          type="button"
          className="dialog-close"
          onClick={onClose}
          aria-label="Close new hotel dialog"
        >
          <X size={16} />
        </button>

        <span className="dialog-eyebrow">
          <Hotel size={12} />
          New hotel
        </span>
        <h2 id="plan-new-hotel-title">Add a hotel to a route</h2>
        <p className="dialog-lede">
          Add a hotel that is not in the master list. It is saved in this plan
          draft and placed on the route at the cheapest insertion point.
        </p>

        <label className="plan-dialog__field">
          <span>Hotel name</span>
          <input
            type="text"
            value={name}
            maxLength={100}
            placeholder="e.g. New Suites"
            onChange={(event) => setName(event.target.value)}
            autoFocus
          />
        </label>

        <div className="plan-dialog__grid">
          <label className="plan-dialog__field">
            <span>Latitude</span>
            <input
              type="number"
              inputMode="decimal"
              step="any"
              value={lat}
              placeholder="12.9716"
              onChange={(event) => setLat(event.target.value)}
            />
          </label>
          <label className="plan-dialog__field">
            <span>Longitude</span>
            <input
              type="number"
              inputMode="decimal"
              step="any"
              value={lon}
              placeholder="77.5946"
              onChange={(event) => setLon(event.target.value)}
            />
          </label>
          <label className="plan-dialog__field">
            <span>Bags</span>
            <input
              type="number"
              inputMode="numeric"
              min={0}
              step={1}
              value={bags}
              onChange={(event) => setBags(event.target.value)}
            />
          </label>
          <label className="plan-dialog__field">
            <span>Rooms</span>
            <input
              type="number"
              inputMode="numeric"
              min={0}
              step={1}
              value={rooms}
              onChange={(event) => setRooms(event.target.value)}
            />
          </label>
          <label className="plan-dialog__field">
            <span>Service time (min)</span>
            <input
              type="number"
              inputMode="numeric"
              min={0}
              step={1}
              value={serviceMins}
              onChange={(event) => setServiceMins(event.target.value)}
            />
          </label>
          <label className="plan-dialog__field">
            <span>Region</span>
            <select
              value={regionId}
              onChange={(event) => setRegionId(event.target.value)}
            >
              <option value="">
                Auto · {regionLabel}
              </option>
              {regions.map((region) => (
                <option key={region.id} value={String(region.id)}>
                  {region.short_name}
                </option>
              ))}
            </select>
          </label>
        </div>

        <label className="plan-dialog__field">
          <span>Assign to route</span>
          <select
            value={routeId}
            onChange={(event) => setRouteId(event.target.value)}
          >
            {plan.routes.map((route) => {
              const routeVehicle = resolveVehicle(plan, route);
              return (
                <option key={route.route_id} value={route.route_id}>
                  {shortRouteName(route.name)} · {routeBags(route.route_id, plan)}
                  {routeVehicle ? `/${routeVehicle.max_load}` : ""} bags
                </option>
              );
            })}
          </select>
        </label>

        <div className="plan-dialog__preview">
          <div>
            <span>Route load</span>
            <b>
              {currentBags} → {projectedBags} bags
            </b>
          </div>
          <div>
            <span>Vehicle limit</span>
            <b>
              {selectedVehicle
                ? `${selectedVehicle.nominal_cap} bags`
                : "No vehicle"}
            </b>
          </div>
          <div>
            <span>Region</span>
            <b>{regionLabel}</b>
          </div>
        </div>

        {overCapacity && (
          <p className="plan-dialog__capacity-note plan-dialog__capacity-note--over">
            This would put the route {projectedBags - (selectedRoute?.nominal_cap ?? 0)}{" "}
            bags over its vehicle limit. Add it to a different route or adjust
            the vehicle capacity first.
          </p>
        )}
        {error && (
          <p className="plan-dialog__capacity-note plan-dialog__capacity-note--over">
            {error}
          </p>
        )}

        <p className="plan-inspector__note">
          New hotels use estimated travel times until the travel matrix is
          rebuilt; the map path is still fetched from OSRM.
        </p>

        <div className="plan-dialog__actions">
          <button type="button" className="btn btn--ghost" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className="btn btn--primary" disabled={!valid}>
            <Plus size={14} />
            Add hotel
          </button>
        </div>
      </form>
    </div>
  );
}
