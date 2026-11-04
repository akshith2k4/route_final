"use client";

import { useEffect, useRef, useState } from "react";
import { Plus, Route, X } from "lucide-react";
import { depotLabel, type PlanDepot } from "../lib/plan";

type PlanCreateRouteDialogProps = {
  open: boolean;
  defaultName: string;
  depots: PlanDepot[];
  defaultDepotId: string;
  onClose: () => void;
  onCreate: (name: string, capacity: number, depotId: string) => void;
};

export default function PlanCreateRouteDialog({
  open,
  defaultName,
  depots,
  defaultDepotId,
  onClose,
  onCreate,
}: PlanCreateRouteDialogProps) {
  const [name, setName] = useState(defaultName);
  const [capacity, setCapacity] = useState("40");
  const [depotId, setDepotId] = useState(defaultDepotId);
  const nameRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (!open) return;
    setName(defaultName);
    setCapacity("40");
    setDepotId(defaultDepotId);
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

  const capacityValue = Number(capacity);
  const capacityValid =
    capacity.trim().length > 0 &&
    Number.isInteger(capacityValue) &&
    capacityValue >= 1 &&
    capacityValue <= 999;
  const nameValid = name.trim().length > 0;
  const valid = nameValid && capacityValid;
  const safeLoad = capacityValid
    ? Math.max(1, Math.floor(capacityValue * 0.9))
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
          onCreate(name.trim(), capacityValue, depotId);
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
          Name the route and enter the vehicle capacity. Safe load is set to
          90% automatically, and hotels will be pulled from the routes they are
          on today.
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
          <span>Vehicle capacity (bags)</span>
          <input
            type="number"
            inputMode="numeric"
            min={1}
            max={999}
            step={1}
            value={capacity}
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
            <span>Departs</span>
            <b>07:00 AM</b>
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
