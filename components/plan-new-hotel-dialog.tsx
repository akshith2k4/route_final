"use client";

import { useEffect, useState } from "react";
import { Hotel, MapPin, Plus, X } from "lucide-react";
import { nearestRegionId, type RegionMeta } from "../lib/coverage";
import {
  dayLabel,
  overCapacityDays,
  projectRouteDayBags,
  resolveVehicle,
  routeDayBags,
  type NewHotelInput,
  type Plan,
  type PlanDay,
} from "../lib/plan";

type NewHotelDayValue = "both" | "day1" | "day2";

type PlanNewHotelDialogProps = {
  open: boolean;
  plan: Plan;
  regions: RegionMeta[];
  defaultRouteId: string | null;
  defaultDay: NewHotelDayValue;
  onClose: () => void;
  onAdd: (values: NewHotelInput, routeId: string) => Promise<boolean>;
};

function shortRouteName(name: string): string {
  return name.replace(/\s*\(ID:[^)]*\)\s*$/, "").trim();
}

function dayValuesFor(value: NewHotelDayValue): PlanDay[] {
  return value === "both" ? ["day1", "day2"] : [value];
}

export default function PlanNewHotelDialog({
  open,
  plan,
  regions,
  defaultRouteId,
  defaultDay,
  onClose,
  onAdd,
}: PlanNewHotelDialogProps) {
  const [name, setName] = useState("");
  const [address, setAddress] = useState("");
  const [lat, setLat] = useState("");
  const [lon, setLon] = useState("");
  const [bags, setBags] = useState("0");
  const [rooms, setRooms] = useState("0");
  const [serviceMins, setServiceMins] = useState("15");
  const [regionId, setRegionId] = useState("");
  const [routeId, setRouteId] = useState(defaultRouteId ?? "");
  const [dayValue, setDayValue] = useState<NewHotelDayValue>(defaultDay);
  const [error, setError] = useState<string | null>(null);
  const [geocodeError, setGeocodeError] = useState<string | null>(null);
  const [geocoding, setGeocoding] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!open) return;
    setName("");
    setAddress("");
    setLat("");
    setLon("");
    setBags("0");
    setRooms("0");
    setServiceMins("15");
    setRegionId("");
    setRouteId(defaultRouteId ?? plan.routes[0]?.route_id ?? "");
    setDayValue(defaultDay);
    setError(null);
    setGeocodeError(null);
    setGeocoding(false);
    setSubmitting(false);
  }, [open, defaultDay, defaultRouteId, plan.routes]);

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
  const bagsValue = Number(bags);
  const selectedDays = dayValuesFor(dayValue);
  const currentDayBags = selectedRoute
    ? routeDayBags(selectedRoute)
    : { day1: 0, day2: 0 };
  const projectedDayBags = selectedRoute
    ? projectRouteDayBags(selectedRoute, [
        {
          days: selectedDays,
          load_bags: Number.isFinite(bagsValue) ? bagsValue : 0,
        },
      ])
    : { day1: 0, day2: 0 };
  const overDays =
    selectedRoute && selectedVehicle
      ? overCapacityDays(selectedRoute, projectedDayBags, selectedDays)
      : [];
  const overCapacity = overDays.length > 0;

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
  const hasAddress = address.trim().length > 0;
  const valid =
    nameValid &&
    (coordsValid || hasAddress) &&
    numbersValid &&
    routeValid &&
    !overCapacity;

  async function lookupCoordinates(): Promise<{
    lat: number;
    lon: number;
    formattedAddress: string;
  } | null> {
    const value = address.trim();
    if (!value) {
      setGeocodeError("Enter the hotel address first.");
      return null;
    }

    setGeocoding(true);
    setGeocodeError(null);
    try {
      const response = await fetch("/api/geocode", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ address: value }),
      });
      const data = (await response.json().catch(() => null)) as
        | {
            result?: {
              latitude: number;
              longitude: number;
              formattedAddress: string;
            };
            error?: string;
          }
        | null;

      if (!response.ok || !data?.result) {
        setGeocodeError(
          data?.error ?? "Could not find coordinates for that address.",
        );
        return null;
      }

      setLat(String(data.result.latitude));
      setLon(String(data.result.longitude));
      setAddress(data.result.formattedAddress);
      return {
        lat: data.result.latitude,
        lon: data.result.longitude,
        formattedAddress: data.result.formattedAddress,
      };
    } catch {
      setGeocodeError("Could not reach the geocoding service.");
      return null;
    } finally {
      setGeocoding(false);
    }
  }

  async function submit() {
    if (submitting) return;

    setSubmitting(true);
    try {
      if (overCapacity && selectedRoute) {
        setError(
          `${overDays
            .map(
              (day) =>
                `${dayLabel(day)} would carry ${projectedDayBags[day]} bags`,
            )
            .join(" and ")} — above the ${selectedRoute.nominal_cap}-bag vehicle limit.`,
        );
        return;
      }
      if (!nameValid) {
        setError("Give the hotel a name.");
        return;
      }
      if (!numbersValid) {
        setError("Bags, rooms and service time must be whole numbers.");
        return;
      }
      if (!selectedRoute) {
        setError("Choose a route.");
        return;
      }

      let finalLat = latValue;
      let finalLon = lonValue;
      let finalAddress = address.trim();
      if (!coordsValid) {
        if (!hasAddress) {
          setError("Enter an address and find its coordinates first.");
          return;
        }
        const geocoded = await lookupCoordinates();
        if (!geocoded) {
          setError("Could not find coordinates for that address.");
          return;
        }
        finalLat = geocoded.lat;
        finalLon = geocoded.lon;
        finalAddress = geocoded.formattedAddress;
      }

      const finalRegion = regionId
        ? Number(regionId)
        : (nearestRegionId(finalLat, finalLon) ?? regions[0]?.id ?? 0);

      const added = await onAdd(
        {
          name: name.trim(),
          address: finalAddress || null,
          lat: finalLat,
          lon: finalLon,
          region: finalRegion,
          service_mins: serviceValue,
          load_bags: bagsValue,
          rooms: roomsValue,
          days:
            dayValue === "day1"
              ? ["day1"]
              : dayValue === "day2"
                ? ["day2"]
                : ["day1", "day2"],
        },
        selectedRoute.route_id,
      );
      if (!added) {
        setError("Could not add this hotel to the route.");
      }
    } finally {
      setSubmitting(false);
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
          Add a hotel to the master list and place it on the route at the
          cheapest insertion point. You can enter an address and let Google
          fill the coordinates.
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

        <label className="plan-dialog__field">
          <span>Address</span>
          <div className="plan-address-row">
            <input
              type="text"
              value={address}
              maxLength={300}
              placeholder="e.g. 12 MG Road, Bengaluru"
              onChange={(event) => setAddress(event.target.value)}
            />
            <button
              type="button"
              className="btn btn--ghost plan-address-row__button"
              onClick={() => void lookupCoordinates()}
              disabled={geocoding || !hasAddress}
            >
              <MapPin size={13} />
              {geocoding ? "Finding…" : "Find coordinates"}
            </button>
          </div>
          <small className="plan-address-hint">
            Enter the full address and let Google fill the coordinates.
          </small>
        </label>

        {geocodeError && (
          <div className="hotels-form-error">
            <MapPin size={13} />
            {geocodeError}
          </div>
        )}

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
          <span>Days</span>
          <select
            value={dayValue}
            onChange={(event) =>
              setDayValue(event.target.value as NewHotelDayValue)
            }
          >
            <option value="both">Both days (daily)</option>
            <option value="day1">Day 1 only</option>
            <option value="day2">Day 2 only</option>
          </select>
        </label>

        <label className="plan-dialog__field">
          <span>Assign to route</span>
          <select
            value={routeId}
            onChange={(event) => setRouteId(event.target.value)}
          >
            {plan.routes.map((route) => {
              const routeVehicle = resolveVehicle(plan, route);
              const routeLoads = routeDayBags(route);
              return (
                <option key={route.route_id} value={route.route_id}>
                  {shortRouteName(route.name)} · D1 {routeLoads.day1} · D2{" "}
                  {routeLoads.day2}
                  {routeVehicle ? ` / ${route.nominal_cap}` : ""} bags
                </option>
              );
            })}
          </select>
        </label>

        <div className="plan-dialog__preview">
          {selectedDays.map((day) => (
            <div key={day}>
              <span>{dayLabel(day)} load</span>
              <b>
                {currentDayBags[day]} → {projectedDayBags[day]} bags
              </b>
            </div>
          ))}
          <div>
            <span>Vehicle limit</span>
            <b>
              {selectedVehicle && selectedRoute
                ? `${selectedRoute.nominal_cap} bags`
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
            {overDays
              .map(
                (day) =>
                  `${dayLabel(day)} would carry ${projectedDayBags[day]} bags`,
              )
              .join(" and ")}{" "}
            — above the {selectedRoute?.nominal_cap ?? 0}-bag vehicle limit. Add
            it to a different route or adjust the vehicle capacity first.
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
          <button
            type="submit"
            className="btn btn--primary"
            disabled={!valid || submitting}
          >
            <Plus size={14} />
            {submitting ? "Adding…" : "Add hotel"}
          </button>
        </div>
      </form>
    </div>
  );
}
