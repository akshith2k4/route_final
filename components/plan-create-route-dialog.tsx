"use client";

import { useEffect, useRef, useState } from "react";
import { Plus, Route, X } from "lucide-react";
import {
  depotLabel,
  safeLoadForCapacity,
  sortVehicles,
  type PlanDepot,
  type PlanVehicle,
} from "../lib/plan";

type PlanCreateRouteDialogProps = {
  open: boolean;
  defaultName: string;
  depots: PlanDepot[];
  defaultDepotId: string;
  vehicles: PlanVehicle[];
  usedVehicleIds: string[];
  onClose: () => void;
  onCreate: (
    name: string,
    capacity: number,
    depotId: string,
    vehicleId: string | null,
  ) => void;
};

export default function PlanCreateRouteDialog({
  open,
  defaultName,
  depots,
  defaultDepotId,
  vehicles,
  usedVehicleIds,
  onClose,
  onCreate,
}: PlanCreateRouteDialogProps) {
  const [name, setName] = useState(defaultName);
  const [capacity, setCapacity] = useState("40");
  const [depotId, setDepotId] = useState(defaultDepotId);
  const [vehicleId, setVehicleId] = useState("");
  const nameRef = useRef<HTMLInputElement | null>(null);

  const sortedVehicles = sortVehicles(vehicles);
  const availableVehicles = sortedVehicles.filter(
    (vehicle) => !usedVehicleIds.includes(vehicle.id),
  );
  const initialVehicle = availableVehicles[0] ?? null;

  useEffect(() => {
    if (!open) return;
    setName(defaultName);
    setCapacity(initialVehicle ? String(initialVehicle.nominal_cap) : "40");
    setDepotId(defaultDepotId);
    setVehicleId(initialVehicle?.id ?? "");
    const timer = window.setTimeout(() => {
      nameRef.current?.focus();
      nameRef.current?.select();
    }, 40);
    return () => window.clearTimeout(timer);
  }, [open, defaultName, defaultDepotId]);

  useEffect(() => {
    if (!open) return;
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [open, onClose]);

  if (!open) return null;

  const selectedVehicle =
    vehicles.find((vehicle) => vehicle.id === vehicleId) ?? null;
  const selectedVehicleUsed = selectedVehicle
    ? usedVehicleIds.includes(selectedVehicle.id)
    : false;
  const capacityValue = Number(capacity);
  const capacityValid =
    capacity.trim().length > 0 &&
    Number.isInteger(capacityValue) &&
    capacityValue >= 1 &&
    capacityValue <= 999;
  const nameValid = name.trim().length > 0;
  const valid =
    nameValid &&
    capacityValid &&
    selectedVehicle !== null &&
    !selectedVehicleUsed;
  const safeLoad = selectedVehicle
    ? selectedVehicle.max_load
    : capacityValid
      ? safeLoadForCapacity(capacityValue)
      : null;

  return (
    <div
      className="modal-backdrop"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <form
        className="plan-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="plan-create-route-title"
        onSubmit={(event) => {
          event.preventDefault();
          if (!valid) return;
          onCreate(
            name.trim(),
            capacityValue,
            depotId,
            vehicleId || null,
          );
        }}
      >
        <button
          type="button"
          className="dialog-close"
          onClick={onClose}
          aria-label="Close new route dialog"
        >
          <X size={16} />
        </button>

        <span className="dialog-eyebrow">
          <Route size={12} />
          Custom route
        </span>
        <h2 id="plan-create-route-title">Create a new route</h2>
        <p className="dialog-lede">
          Name the route and choose one of your available vehicles. Safe load
          follows the vehicle.
        </p>

        <label className="plan-dialog__field">
          <span>Route name</span>
          <input
            ref={nameRef}
            type="text"
            value={name}
            maxLength={80}
            placeholder="Route 9 - North"
            onChange={(event) => setName(event.target.value)}
          />
        </label>

        <label className="plan-dialog__field">
          <span>Vehicle</span>
          <select
            value={vehicleId}
            onChange={(event) => {
              const nextId = event.target.value;
              setVehicleId(nextId);
              const vehicle = vehicles.find(
                (candidate) => candidate.id === nextId,
              );
              if (vehicle) setCapacity(String(vehicle.nominal_cap));
            }}
          >
            <option value="" disabled>
              {availableVehicles.length === 0
                ? "No vehicle available"
                : "Select a vehicle"}
            </option>
            {sortedVehicles.map((vehicle) => {
              const used = usedVehicleIds.includes(vehicle.id);
              return (
                <option
                  key={vehicle.id}
                  value={vehicle.id}
                  disabled={used}
                  title={
                    used ? "Already allocated to another route" : undefined
                  }
                >
                  {vehicle.name} · {vehicle.nominal_cap} bags
                  {used ? " · in use" : ""}
                </option>
              );
            })}
          </select>
        </label>
        {availableVehicles.length === 0 && (
          <p className="plan-inspector__note plan-inspector__note--warning">
            All vehicles are allocated. Add a vehicle from Vehicles first.
          </p>
        )}

        <label className="plan-dialog__field">
          <span>Vehicle capacity (bags)</span>
          <input
            type="number"
            inputMode="numeric"
            min={1}
            max={999}
            step={1}
            value={capacity}
            disabled={selectedVehicle !== null}
            title={
              selectedVehicle
                ? "Edit this vehicle's capacity from Manage vehicles"
                : undefined
            }
            onChange={(event) => setCapacity(event.target.value)}
          />
        </label>

        <label className="plan-dialog__field">
          <span>Warehouse</span>
          <select
            value={depotId}
            onChange={(event) => setDepotId(event.target.value)}
          >
            {depots.map((depot) => (
              <option key={depot.id} value={depot.id}>
                {depot.name}
              </option>
            ))}
          </select>
        </label>

        <div className="plan-dialog__preview">
          <div>
            <span>Safe load</span>
            <b>{safeLoad === null ? "—" : `${safeLoad} bags`}</b>
          </div>
          <div>
            <span>Vehicle</span>
            <b>{selectedVehicle ? selectedVehicle.name : "Manual"}</b>
          </div>
          <div>
            <span>Starts at</span>
            <b>
              {depotLabel(
                depots.find((depot) => depot.id === depotId) ?? depots[0],
              )}
            </b>
          </div>
        </div>

        <div className="plan-dialog__actions">
          <button type="button" className="btn btn--ghost" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className="btn btn--primary" disabled={!valid}>
            <Plus size={14} />
            Create route
          </button>
        </div>
      </form>
    </div>
  );
}
