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
import { cn } from "./ui/cn";
import {
  btnPrimary,
  dialogActions,
  dialogBackdrop,
  dialogClose,
  dialogEyebrow,
  dialogField,
  dialogLede,
  dialogSelection,
  dialogTall,
  dialogWide,
  vehicle as vehicleClass,
  vehicleActions,
  vehicleAdd,
  vehicleAddButton,
  vehicleEdit,
  vehicleEditing,
  vehicleError,
  vehicleIconButton,
  vehicleIconDanger,
  vehicleIconSave,
  vehicleList,
  vehicleListEmpty,
  vehicleMain,
  vehicleSummary,
  vehicleSwatch,
  vehicleWarning,
} from "./ui/plan-styles";

type PlanVehiclesDialogProps = {
  open: boolean;
  plan: Plan;
  onClose: () => void;
  onAdd: (name: string, capacity: number) => Promise<void>;
  onUpdate: (
    vehicleId: string,
    name: string,
    capacity: number,
  ) => Promise<void>;
  onDelete: (vehicleId: string) => Promise<void>;
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
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setAddName("");
    setAddCapacity("40");
    setEditingId(null);
    setEditName("");
    setEditCapacity("");
    setError(null);
    setSaving(false);
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

  async function submitAdd() {
    if (saving) return;
    const capacity = capacityValue(addCapacity);
    if (!addName.trim()) {
      setError("Give the vehicle a name.");
      return;
    }
    if (capacity === null) {
      setError("Vehicle capacity must be a whole number of at least 1 bag.");
      return;
    }
    setSaving(true);
    try {
      await onAdd(addName.trim(), capacity);
      setAddName("");
      setAddCapacity("40");
      setError(null);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not add the vehicle.");
    } finally {
      setSaving(false);
    }
  }

  async function submitEdit() {
    if (!editingVehicle || saving) return;
    const capacity = capacityValue(editCapacity);
    if (!editName.trim()) {
      setError("Give the vehicle a name.");
      return;
    }
    if (capacity === null) {
      setError("Vehicle capacity must be a whole number of at least 1 bag.");
      return;
    }
    setSaving(true);
    try {
      await onUpdate(editingVehicle.id, editName.trim(), capacity);
      setEditingId(null);
      setError(null);
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : "Could not update the vehicle.",
      );
    } finally {
      setSaving(false);
    }
  }

  async function submitDelete(vehicle: PlanVehicle) {
    if (saving) return;
    setSaving(true);
    try {
      await onDelete(vehicle.id);
      setError(null);
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "Could not delete the vehicle.",
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <div
      className={dialogBackdrop}
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        className={cn(dialogTall, dialogWide)}
        role="dialog"
        aria-modal="true"
        aria-labelledby="plan-vehicles-title"
      >
        <button
          type="button"
          className={dialogClose}
          onClick={onClose}
          aria-label="Close vehicles dialog"
        >
          <X size={16} />
        </button>

        <span className={dialogEyebrow}>
          <Truck size={12} />
          Fleet inventory
        </span>
        <h2 id="plan-vehicles-title">Vehicles</h2>
        <p className={dialogLede}>
          Add the vehicles you have and their capacities. Assign a vehicle to
          each route in the inspector. Changing a capacity updates every route
          using that vehicle and warns when a route is already over the new
          limit.
        </p>

        <div className={vehicleAdd}>
          <label className={dialogField}>
            <span>Vehicle name</span>
            <input
              type="text"
              value={addName}
              placeholder="e.g. Vehicle 11"
              onChange={(event) => setAddName(event.target.value)}
            />
          </label>
          <label className={dialogField}>
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
            className={cn(btnPrimary, vehicleAddButton)}
            onClick={submitAdd}
            disabled={saving}
          >
            <Plus size={14} />
            {saving ? "Saving…" : "Add vehicle"}
          </button>
        </div>

        {error && (
          <p className={vehicleError}>
            <AlertTriangle size={12} />
            {error}
          </p>
        )}

        <div className={vehicleSummary}>
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

        <div className={vehicleList}>
          {vehicles.length === 0 ? (
            <p className={vehicleListEmpty}>
              No vehicles yet. Add the first vehicle above.
            </p>
          ) : (
            vehicles.map((vehicle) => {
              const assigned = routesByVehicle.get(vehicle.id) ?? [];
              const isEditing = vehicle.id === editingId;
              return (
                <div
                  key={vehicle.id}
                  className={isEditing ? vehicleEditing : vehicleClass}
                >
                  <span
                    className={vehicleSwatch}
                    style={{ background: vehicle.color ?? "var(--ink-soft)" }}
                  />
                  {isEditing ? (
                    <div className={vehicleEdit}>
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
                        className={vehicleIconSave}
                        onClick={submitEdit}
                        disabled={saving}
                        title="Save vehicle"
                        aria-label="Save vehicle"
                      >
                        <Check size={13} />
                      </button>
                      <button
                        type="button"
                        className={vehicleIconButton}
                        onClick={cancelEdit}
                        title="Cancel"
                        aria-label="Cancel editing"
                      >
                        <X size={13} />
                      </button>
                    </div>
                  ) : (
                    <div className={vehicleMain}>
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
                    <div className={vehicleActions}>
                      <button
                        type="button"
                        className={vehicleIconButton}
                        onClick={() => beginEdit(vehicle)}
                        title="Edit name or capacity"
                        aria-label={`Edit ${vehicle.name}`}
                      >
                        <Pencil size={13} />
                      </button>
                      <button
                        type="button"
                        className={vehicleIconDanger}
                        onClick={() => submitDelete(vehicle)}
                        disabled={assigned.length > 0 || saving}
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
                    <p className={vehicleWarning}>
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

        <div className={dialogActions}>
          <span className={dialogSelection}>
            {assignedCount} of {vehicles.length} vehicles in use
          </span>
          <button type="button" className={btnPrimary} onClick={onClose}>
            Done
          </button>
        </div>
      </div>
    </div>
  );
}
