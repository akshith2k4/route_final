"use client";

import { useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  Check,
  Pencil,
  Plus,
  Trash2,
  Truck,
  X,
} from "lucide-react";
import {
  sortVehicles,
  type Plan,
  type PlanRoute,
  type PlanVehicle,
} from "../lib/plan";

type PlanVehiclesDialogProps = {
  open: boolean;
  plan: Plan;
  onClose: () => void;
  onAdd: (name: string, capacity: number) => void;
  onUpdate: (vehicleId: string, name: string, capacity: number) => void;
  onDelete: (vehicleId: string) => void;
};

function shortRouteName(name: string): string {
  return name.replace(/\s*\(ID:[^)]*\)\s*$/, "").trim();
}

function routeBags(route: PlanRoute): number {
  return route.stops.reduce((sum, stop) => sum + stop.load_bags, 0);
}

function capacityValue(value: string): number | null {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed >= 1 ? parsed : null;
}

export default function PlanVehiclesDialog({
  open,
  plan,
  onClose,
  onAdd,
  onUpdate,
  onDelete,
}: PlanVehiclesDialogProps) {
  const [addName, setAddName] = useState("");
  const [addCapacity, setAddCapacity] = useState("40");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [editCapacity, setEditCapacity] = useState("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setAddName("");
    setAddCapacity("40");
    setEditingId(null);
    setEditName("");
    setEditCapacity("");
    setError(null);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [open, onClose]);

  const routesByVehicle = useMemo(() => {
    const map = new Map<string, PlanRoute[]>();
    for (const route of plan.routes) {
      if (!route.vehicle_id) continue;
      const list = map.get(route.vehicle_id) ?? [];
      list.push(route);
      map.set(route.vehicle_id, list);
    }
    return map;
  }, [plan.routes]);

  const vehicles = sortVehicles(plan.vehicles ?? []);
  const assignedCount = vehicles.filter(
    (vehicle) => (routesByVehicle.get(vehicle.id) ?? []).length > 0,
  ).length;

  if (!open) return null;

  const editingVehicle = editingId
    ? (vehicles.find((vehicle) => vehicle.id === editingId) ?? null)
    : null;
  const editingRoutes = editingId
    ? (routesByVehicle.get(editingId) ?? [])
    : [];
  const projectedCapacity = capacityValue(editCapacity);
  const overloadedRoutes =
    projectedCapacity === null
      ? []
      : editingRoutes.filter((route) => routeBags(route) > projectedCapacity);
  const doubleBooked = editingRoutes.length > 1;

  function beginEdit(vehicle: PlanVehicle) {
    setEditingId(vehicle.id);
    setEditName(vehicle.name);
    setEditCapacity(String(vehicle.nominal_cap));
    setError(null);
  }

  function cancelEdit() {
    setEditingId(null);
    setError(null);
  }

  function submitAdd() {
    const capacity = capacityValue(addCapacity);
    if (!addName.trim()) {
      setError("Give the vehicle a name.");
      return;
    }
    if (capacity === null) {
      setError("Vehicle capacity must be a whole number of at least 1 bag.");
      return;
    }
    try {
      onAdd(addName.trim(), capacity);
      setAddName("");
      setAddCapacity("40");
      setError(null);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not add the vehicle.");
    }
  }

  function submitEdit() {
    if (!editingVehicle) return;
    const capacity = capacityValue(editCapacity);
    if (!editName.trim()) {
      setError("Give the vehicle a name.");
      return;
    }
    if (capacity === null) {
      setError("Vehicle capacity must be a whole number of at least 1 bag.");
      return;
    }
    try {
      onUpdate(editingVehicle.id, editName.trim(), capacity);
      setEditingId(null);
      setError(null);
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : "Could not update the vehicle.",
      );
    }
  }

  function submitDelete(vehicle: PlanVehicle) {
    try {
      onDelete(vehicle.id);
      setError(null);
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "Could not delete the vehicle.",
      );
    }
  }

  return (
    <div
      className="modal-backdrop"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        className="plan-dialog plan-dialog--wide plan-vehicles-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="plan-vehicles-title"
      >
        <button
          type="button"
          className="dialog-close"
          onClick={onClose}
          aria-label="Close vehicles dialog"
        >
          <X size={16} />
        </button>

        <span className="dialog-eyebrow">
          <Truck size={12} />
          Fleet inventory
        </span>
        <h2 id="plan-vehicles-title">Vehicles</h2>
        <p className="dialog-lede">
          Add the vehicles you have and their capacities. Assign a vehicle to
          each route in the inspector. Changing a capacity updates every route
          using that vehicle and warns when a route is already over the new
          limit.
        </p>

        <div className="plan-vehicle-add">
          <label className="plan-dialog__field">
            <span>Vehicle name</span>
            <input
              type="text"
              value={addName}
              placeholder="e.g. Vehicle 11"
              onChange={(event) => setAddName(event.target.value)}
            />
          </label>
          <label className="plan-dialog__field plan-dialog__field--short">
            <span>Capacity (bags)</span>
            <input
              type="number"
              inputMode="numeric"
              min={1}
              max={999}
              step={1}
              value={addCapacity}
              onChange={(event) => setAddCapacity(event.target.value)}
            />
          </label>
          <button
            type="button"
            className="btn btn--primary plan-vehicle-add__button"
            onClick={submitAdd}
          >
            <Plus size={14} />
            Add vehicle
          </button>
        </div>

        {error && (
          <p className="plan-vehicle-error">
            <AlertTriangle size={12} />
            {error}
          </p>
        )}

        <div className="plan-vehicle-summary">
          <span>
            <b>{vehicles.length}</b> vehicles
          </span>
          <span>
            <b>{vehicles.length - assignedCount}</b> unassigned
          </span>
          <span>
            <b>{plan.routes.length}</b> routes
          </span>
        </div>

        <div className="plan-vehicle-list">
          {vehicles.length === 0 ? (
            <p className="plan-vehicle-list__empty">
              No vehicles yet. Add the first vehicle above.
            </p>
          ) : (
            vehicles.map((vehicle) => {
              const assigned = routesByVehicle.get(vehicle.id) ?? [];
              const isEditing = vehicle.id === editingId;
              return (
                <div
                  key={vehicle.id}
                  className={`plan-vehicle ${isEditing ? "is-editing" : ""}`}
                >
                  <span
                    className="plan-vehicle__swatch"
                    style={{ background: vehicle.color ?? "var(--ink-soft)" }}
                  />
                  {isEditing ? (
                    <div className="plan-vehicle__edit">
                      <input
                        type="text"
                        value={editName}
                        onChange={(event) => setEditName(event.target.value)}
                        aria-label="Vehicle name"
                      />
                      <input
                        type="number"
                        inputMode="numeric"
                        min={1}
                        max={999}
                        step={1}
                        value={editCapacity}
                        onChange={(event) => setEditCapacity(event.target.value)}
                        aria-label="Vehicle capacity"
                      />
                      <button
                        type="button"
                        className="plan-vehicle__icon-btn plan-vehicle__icon-btn--save"
                        onClick={submitEdit}
                        title="Save vehicle"
                        aria-label="Save vehicle"
                      >
                        <Check size={13} />
                      </button>
                      <button
                        type="button"
                        className="plan-vehicle__icon-btn"
                        onClick={cancelEdit}
                        title="Cancel"
                        aria-label="Cancel editing"
                      >
                        <X size={13} />
                      </button>
                    </div>
                  ) : (
                    <div className="plan-vehicle__main">
                      <b>{vehicle.name}</b>
                      <span>
                        {vehicle.nominal_cap} bags · safe {vehicle.max_load}
                        {assigned.length === 0
                          ? " · unassigned"
                          : ` · ${assigned
                              .map((route) => shortRouteName(route.name))
                              .join(", ")}`}
                      </span>
                    </div>
                  )}

                  {!isEditing && (
                    <div className="plan-vehicle__actions">
                      <button
                        type="button"
                        className="plan-vehicle__icon-btn"
                        onClick={() => beginEdit(vehicle)}
                        title="Edit name or capacity"
                        aria-label={`Edit ${vehicle.name}`}
                      >
                        <Pencil size={13} />
                      </button>
                      <button
                        type="button"
                        className="plan-vehicle__icon-btn plan-vehicle__icon-btn--danger"
                        onClick={() => submitDelete(vehicle)}
                        disabled={assigned.length > 0}
                        title={
                          assigned.length > 0
                            ? "Reassign this vehicle's routes before deleting it"
                            : "Delete vehicle"
                        }
                        aria-label={`Delete ${vehicle.name}`}
                      >
                        <Trash2 size={13} />
                      </button>
                    </div>
                  )}

                  {isEditing && (overloadedRoutes.length > 0 || doubleBooked) && (
                    <p className="plan-vehicle-warning">
                      <AlertTriangle size={11} />
                      {overloadedRoutes.length > 0
                        ? `${overloadedRoutes
                            .map(
                              (route) =>
                                `${shortRouteName(route.name)} carries ${routeBags(route)} bags`,
                            )
                            .join("; ")}. The new capacity is ${projectedCapacity} bags.`
                        : `${vehicle.name} is assigned to ${editingRoutes.length} routes.`}
                    </p>
                  )}
                </div>
              );
            })
          )}
        </div>

        <div className="plan-dialog__actions">
          <span className="plan-dialog__selection">
            {assignedCount} of {vehicles.length} vehicles in use
          </span>
          <button type="button" className="btn btn--primary" onClick={onClose}>
            Done
          </button>
        </div>
      </div>
    </div>
  );
}
