"use client";

import Link from "next/link";
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
} from "react";
import {
  Check,
  Pencil,
  Plus,
  Search,
  Trash2,
  Truck,
  X,
} from "lucide-react";
import type {
  VehicleAdminItem,
  VehicleInput,
} from "../lib/vehicles";

type VehicleRegion = {
  id: number;
  name: string;
  short_name: string;
};

type VehicleDepot = {
  id: string;
  name: string;
  isActive?: boolean;
};

type VehiclesDashboardProps = {
  initialVehicles: VehicleAdminItem[];
  regions: VehicleRegion[];
  depots?: VehicleDepot[];
};

type StatusFilter = "all" | "active" | "inactive";

type VehicleFormState = {
  name: string;
  realCapacity: string;
  color: string;
  regionId: string;
  sector: string;
  depotId: string;
  departureTime: string;
  returnTime: string;
  isActive: boolean;
};

const COLORS = [
  "#1d4ed8",
  "#0f766e",
  "#b45309",
  "#7c3aed",
  "#be185d",
  "#0369a1",
  "#4d7c0f",
  "#c2410c",
];

const DEFAULT_DEPOTS: VehicleDepot[] = [
  { id: "depot-yeshwanthpur", name: "LinenGrass HQ" },
  { id: "depot-second-warehouse", name: "Second Warehouse" },
];

function sortVehicles(vehicles: VehicleAdminItem[]): VehicleAdminItem[] {
  return [...vehicles].sort((a, b) =>
    a.name.localeCompare(b.name, "en", { sensitivity: "base" }),
  );
}

function formFromVehicle(
  vehicle: VehicleAdminItem | null,
  regions: VehicleRegion[],
  defaultDepotId = "depot-yeshwanthpur",
): VehicleFormState {
  if (!vehicle) {
    return {
      name: "",
      realCapacity: "40",
      color: COLORS[0],
      regionId: regions[0] ? String(regions[0].id) : "",
      sector: "",
      depotId: defaultDepotId,
      departureTime: "07:00",
      returnTime: "17:00",
      isActive: true,
    };
  }

  return {
    name: vehicle.name,
    realCapacity: String(vehicle.realCapacity),
    color: vehicle.color,
    regionId: vehicle.regionId === null ? "" : String(vehicle.regionId),
    sector: vehicle.sector ?? "",
    depotId: vehicle.depotId,
    departureTime: vehicle.departureTime,
    returnTime: vehicle.returnTime,
    isActive: vehicle.isActive,
  };
}

function buildPayload(
  form: VehicleFormState,
  regions: VehicleRegion[],
): { payload?: VehicleInput; error?: string } {
  const name = form.name.trim();
  if (!name) return { error: "Vehicle name is required." };

  const realCapacity = Number(form.realCapacity);
  if (!Number.isInteger(realCapacity) || realCapacity < 1) {
    return { error: "Capacity must be a whole number of 1 or more." };
  }

  if (!/^#[0-9a-f]{6}$/i.test(form.color)) {
    return { error: "Color must be a hex value like #3b82f6." };
  }

  const regionId = form.regionId === "" ? null : Number(form.regionId);
  const region = regions.find((candidate) => candidate.id === regionId);

  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(form.departureTime)) {
    return { error: "Departure time must use HH:MM." };
  }
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(form.returnTime)) {
    return { error: "Return time must use HH:MM." };
  }

  return {
    payload: {
      name,
      realCapacity,
      color: form.color,
      regionId: region?.id ?? null,
      regionName: region?.short_name ?? null,
      sector: form.sector.trim() || null,
      depotId: form.depotId,
      departureTime: form.departureTime,
      returnTime: form.returnTime,
      isActive: form.isActive,
    },
  };
}

export default function VehiclesDashboard({
  initialVehicles,
  regions,
  depots = DEFAULT_DEPOTS,
}: VehiclesDashboardProps) {
  const allDepots = depots.length > 0 ? depots : DEFAULT_DEPOTS;
  const activeDepots = allDepots.filter(
    (depot) => depot.isActive !== false,
  );
  const defaultDepotId = activeDepots[0]?.id ?? allDepots[0]?.id;
  const [vehicles, setVehicles] = useState(() =>
    sortVehicles(initialVehicles),
  );
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [regionFilter, setRegionFilter] = useState("all");
  const [editorOpen, setEditorOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<VehicleFormState>(() =>
    formFromVehicle(null, regions, defaultDepotId),
  );
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [notice, setNotice] = useState<{
    tone: "success" | "error";
    message: string;
  } | null>(null);
  const noticeTimerRef = useRef<number | null>(null);

  useEffect(
    () => () => {
      if (noticeTimerRef.current !== null) {
        window.clearTimeout(noticeTimerRef.current);
      }
    },
    [],
  );

  const showNotice = (message: string, tone: "success" | "error") => {
    setNotice({ message, tone });
    if (noticeTimerRef.current !== null) {
      window.clearTimeout(noticeTimerRef.current);
    }
    noticeTimerRef.current = window.setTimeout(() => setNotice(null), 3500);
  };

  const totals = useMemo(() => {
    let active = 0;
    let real = 0;
    let safe = 0;

    for (const vehicle of vehicles) {
      if (vehicle.isActive) active += 1;
      real += vehicle.realCapacity;
      safe += vehicle.safeCapacity;
    }

    return {
      total: vehicles.length,
      active,
      real,
      safe,
    };
  }, [vehicles]);

  const filteredVehicles = useMemo(() => {
    const search = query.trim().toLowerCase();

    return vehicles.filter((vehicle) => {
      if (statusFilter === "active" && !vehicle.isActive) return false;
      if (statusFilter === "inactive" && vehicle.isActive) return false;
      if (
        regionFilter !== "all" &&
        (vehicle.regionName ?? "") !== regionFilter
      ) {
        return false;
      }
      if (!search) return true;

      return (
        vehicle.name.toLowerCase().includes(search) ||
        vehicle.id.toLowerCase().includes(search) ||
        (vehicle.regionName ?? "").toLowerCase().includes(search) ||
        (vehicle.sector ?? "").toLowerCase().includes(search)
      );
    });
  }, [vehicles, query, statusFilter, regionFilter]);

  const openCreate = () => {
    setEditingId(null);
    setForm(formFromVehicle(null, regions, defaultDepotId));
    setFormError(null);
    setEditorOpen(true);
  };

  const openEdit = (vehicle: VehicleAdminItem) => {
    setEditingId(vehicle.id);
    setForm(formFromVehicle(vehicle, regions, defaultDepotId));
    setFormError(null);
    setEditorOpen(true);
  };

  const closeEditor = () => {
    if (saving) return;
    setEditorOpen(false);
    setFormError(null);
  };

  const saveVehicle = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (saving) return;

    const { payload, error } = buildPayload(form, regions);
    if (!payload) {
      setFormError(error ?? "Check the vehicle details.");
      return;
    }

    setSaving(true);
    setFormError(null);

    try {
      const response = await fetch(
        editingId ? `/api/vehicles/${editingId}` : "/api/vehicles",
        {
          method: editingId ? "PATCH" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        },
      );
      const data = (await response.json().catch(() => null)) as
        | { vehicle?: VehicleAdminItem; error?: string }
        | null;

      if (!response.ok || !data?.vehicle) {
        setFormError(data?.error ?? "Could not save this vehicle.");
        return;
      }

      const saved = data.vehicle;
      setVehicles((current) =>
        sortVehicles(
          editingId
            ? current.map((vehicle) =>
                vehicle.id === saved.id ? saved : vehicle,
              )
            : [...current, saved],
        ),
      );
      setEditorOpen(false);
      showNotice(editingId ? "Vehicle updated." : "Vehicle added.", "success");
    } catch {
      setFormError("Could not reach the server. Try again.");
    } finally {
      setSaving(false);
    }
  };

  const removeVehicle = async (vehicle: VehicleAdminItem) => {
    if (
      !window.confirm(
        `Delete ${vehicle.name}? This removes it from the vehicle master.`,
      )
    ) {
      return;
    }

    setDeletingId(vehicle.id);
    try {
      const response = await fetch(`/api/vehicles/${vehicle.id}`, {
        method: "DELETE",
      });
      const data = (await response.json().catch(() => null)) as
        | { error?: string }
        | null;

      if (!response.ok) {
        showNotice(data?.error ?? "Could not delete this vehicle.", "error");
        return;
      }

      setVehicles((current) =>
        current.filter((candidate) => candidate.id !== vehicle.id),
      );
      showNotice("Vehicle deleted.", "success");
    } catch {
      showNotice("Could not reach the server. Try again.", "error");
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <div className="plan-app hotels-app">
      <header className="topbar plan-topbar">
        <Link className="brand" href="/" aria-label="Back to the coverage atlas">
          <span className="brand-mark" aria-hidden="true">
            <svg viewBox="0 0 24 24" fill="none">
              <path
                d="M4.5 7.5c2.4-2 4.8-2 7.2 0s4.8 2 7.2 0"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
              />
              <path
                d="M4.5 12c2.4-2 4.8-2 7.2 0s4.8 2 7.2 0"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
              />
              <path
                d="M4.5 16.5c2.4-2 4.8-2 7.2 0s4.8 2 7.2 0"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
              />
            </svg>
          </span>
          <span className="brand-copy">
            <span className="brand-name">LinenGrass</span>
            <span className="brand-sub">Vehicle dashboard</span>
          </span>
        </Link>

        <div className="plan-heading">
          <span className="eyebrow">
            <span className="eyebrow__dot" />
            Operations · Fleet master
          </span>
          <div className="plan-heading__row">
            <h1>Vehicles</h1>
          </div>
        </div>

        <div className="plan-actions">
          <Link href="/facilities" className="btn btn--ghost">
            Facilities
          </Link>
          <Link href="/hotels" className="btn btn--ghost">
            Hotels
          </Link>
          <Link href="/plan" className="btn btn--ghost">
            Plan canvas
          </Link>
          <button type="button" className="btn btn--primary" onClick={openCreate}>
            <Plus size={14} />
            Add vehicle
          </button>
        </div>
      </header>

      <main className="hotels-main">
        <div className="hotels-summary">
          <div className="hotels-summary__card">
            <span>Total vehicles</span>
            <b>{totals.total}</b>
          </div>
          <div className="hotels-summary__card hotels-summary__card--daily">
            <span>Active</span>
            <b>{totals.active}</b>
          </div>
          <div className="hotels-summary__card">
            <span>Real capacity</span>
            <b>{totals.real}</b>
          </div>
          <div className="hotels-summary__card hotels-summary__card--day1">
            <span>Safe capacity</span>
            <b>{totals.safe}</b>
          </div>
          <div className="hotels-summary__card hotels-summary__card--day2">
            <span>Regions</span>
            <b>
              {
                new Set(
                  vehicles
                    .map((vehicle) => vehicle.regionName)
                    .filter(Boolean),
                ).size
              }
            </b>
          </div>
        </div>

        <section className="hotels-panel" aria-label="Vehicle master list">
          <div className="hotels-toolbar">
            <label className="hotels-search">
              <Search size={14} />
              <input
                type="search"
                value={query}
                placeholder="Search name, id, region or sector"
                onChange={(event) => setQuery(event.target.value)}
                aria-label="Search vehicles"
              />
            </label>

            <select
              className="hotels-filter"
              value={statusFilter}
              onChange={(event) =>
                setStatusFilter(event.target.value as StatusFilter)
              }
              aria-label="Filter by status"
            >
              <option value="all">All statuses</option>
              <option value="active">Active</option>
              <option value="inactive">Inactive</option>
            </select>

            <select
              className="hotels-filter"
              value={regionFilter}
              onChange={(event) => setRegionFilter(event.target.value)}
              aria-label="Filter by region"
            >
              <option value="all">All regions</option>
              {regions.map((region) => (
                <option key={region.id} value={region.short_name}>
                  {region.short_name}
                </option>
              ))}
            </select>

            <span className="hotels-count">
              {filteredVehicles.length} of {vehicles.length}
            </span>
          </div>

          {notice && (
            <div className={`hotels-notice hotels-notice--${notice.tone}`}>
              {notice.tone === "success" ? (
                <Check size={13} />
              ) : (
                <X size={13} />
              )}
              <span>{notice.message}</span>
            </div>
          )}

          <div className="hotels-table-wrap">
            <table className="hotels-table">
              <thead>
                <tr>
                  <th>Vehicle</th>
                  <th>Region / sector</th>
                  <th className="is-number">Real cap</th>
                  <th className="is-number">Safe cap</th>
                  <th>Depot</th>
                  <th>Shift</th>
                  <th>Status</th>
                  <th aria-label="Actions" />
                </tr>
              </thead>
              <tbody>
                {filteredVehicles.map((vehicle) => (
                  <tr key={vehicle.id}>
                    <td>
                      <div className="hotels-name">
                        <Truck size={14} />
                        <span>
                          <b>{vehicle.name}</b>
                          <small>{vehicle.id}</small>
                        </span>
                      </div>
                    </td>
                    <td>
                      <span className="hotels-region">
                        {vehicle.regionName ?? "Unassigned"}
                        {vehicle.sector ? ` · ${vehicle.sector}` : ""}
                      </span>
                    </td>
                    <td className="is-number">{vehicle.realCapacity}</td>
                    <td className="is-number">{vehicle.safeCapacity}</td>
                    <td>
                      <span className="hotels-region">
                        {allDepots.find((depot) => depot.id === vehicle.depotId)
                          ?.name ?? vehicle.depotId}
                      </span>
                    </td>
                    <td>
                      <span className="hotels-coords">
                        {vehicle.departureTime}–{vehicle.returnTime}
                      </span>
                    </td>
                    <td>
                      <span
                        className={`hotels-day ${
                          vehicle.isActive
                            ? "hotels-day--daily"
                            : "hotels-day--day2"
                        }`}
                      >
                        {vehicle.isActive ? "Active" : "Inactive"}
                      </span>
                    </td>
                    <td>
                      <div className="hotels-row-actions">
                        <span
                          className="vehicles-color"
                          style={{ background: vehicle.color }}
                          title={vehicle.color}
                        />
                        <button
                          type="button"
                          className="hotels-icon-btn"
                          onClick={() => openEdit(vehicle)}
                          title={`Edit ${vehicle.name}`}
                          aria-label={`Edit ${vehicle.name}`}
                        >
                          <Pencil size={13} />
                        </button>
                        <button
                          type="button"
                          className="hotels-icon-btn hotels-icon-btn--danger"
                          onClick={() => void removeVehicle(vehicle)}
                          disabled={deletingId === vehicle.id}
                          title={`Delete ${vehicle.name}`}
                          aria-label={`Delete ${vehicle.name}`}
                        >
                          <Trash2 size={13} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {filteredVehicles.length === 0 && (
            <div className="hotels-empty">
              <Search size={18} />
              <b>No vehicles match this filter</b>
              <span>Try a different search, region or status.</span>
            </div>
          )}
        </section>
      </main>

      {editorOpen && (
        <div
          className="modal-backdrop"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) closeEditor();
          }}
        >
          <form
            className="plan-dialog hotels-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="vehicle-dialog-title"
            onSubmit={saveVehicle}
          >
            <button
              type="button"
              className="dialog-close"
              onClick={closeEditor}
              aria-label="Close vehicle dialog"
            >
              <X size={16} />
            </button>

            <span className="dialog-eyebrow">
              <Truck size={12} />
              {editingId ? "Edit vehicle" : "New vehicle"}
            </span>
            <h2 id="vehicle-dialog-title">
              {editingId ? "Update vehicle details" : "Add a vehicle"}
            </h2>
            <p className="dialog-lede">
              This updates the fleet master used by the Plan Canvas and
              optimizer studio.
            </p>

            <label className="plan-dialog__field">
              <span>Vehicle name</span>
              <input
                type="text"
                value={form.name}
                maxLength={120}
                placeholder="e.g. Vehicle 11"
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    name: event.target.value,
                  }))
                }
                autoFocus
              />
            </label>

            <div className="plan-dialog__grid">
              <label className="plan-dialog__field">
                <span>Region</span>
                <select
                  value={form.regionId}
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      regionId: event.target.value,
                    }))
                  }
                >
                  <option value="">Unassigned</option>
                  {regions.map((region) => (
                    <option key={region.id} value={region.id}>
                      {region.short_name}
                    </option>
                  ))}
                </select>
              </label>

              <label className="plan-dialog__field">
                <span>Sector</span>
                <input
                  type="text"
                  value={form.sector}
                  maxLength={120}
                  placeholder="e.g. Whitefield & ITPL"
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      sector: event.target.value,
                    }))
                  }
                />
              </label>

              <label className="plan-dialog__field">
                <span>Real capacity (bags)</span>
                <input
                  type="number"
                  inputMode="numeric"
                  min={1}
                  step={1}
                  value={form.realCapacity}
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      realCapacity: event.target.value,
                    }))
                  }
                />
              </label>

              <label className="plan-dialog__field">
                <span>Color</span>
                <input
                  type="color"
                  value={form.color}
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      color: event.target.value,
                    }))
                  }
                />
              </label>

              <label className="plan-dialog__field">
                <span>Depot</span>
                <select
                  value={form.depotId}
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      depotId: event.target.value,
                    }))
                  }
                >
                  {allDepots.map((depot) => (
                    <option
                      key={depot.id}
                      value={depot.id}
                      disabled={
                        depot.isActive === false &&
                        form.depotId !== depot.id
                      }
                    >
                      {depot.name}
                      {depot.isActive === false ? " (inactive)" : ""}
                    </option>
                  ))}
                </select>
              </label>

              <label className="plan-dialog__field">
                <span>Departure</span>
                <input
                  type="time"
                  value={form.departureTime}
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      departureTime: event.target.value,
                    }))
                  }
                />
              </label>

              <label className="plan-dialog__field">
                <span>Return</span>
                <input
                  type="time"
                  value={form.returnTime}
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      returnTime: event.target.value,
                    }))
                  }
                />
              </label>

              <label className="hotels-check">
                <input
                  type="checkbox"
                  checked={form.isActive}
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      isActive: event.target.checked,
                    }))
                  }
                />
                Active vehicle
              </label>
            </div>

            {formError && (
              <div className="hotels-form-error">
                <X size={13} />
                {formError}
              </div>
            )}

            <div className="plan-dialog__actions">
              <button
                type="button"
                className="btn btn--ghost"
                onClick={closeEditor}
                disabled={saving}
              >
                Cancel
              </button>
              <button
                type="submit"
                className="btn btn--primary"
                disabled={saving}
              >
                {saving
                  ? "Saving…"
                  : editingId
                    ? "Save changes"
                    : "Add vehicle"}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
