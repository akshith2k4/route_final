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
  MapPin,
  Pencil,
  Plus,
  Power,
  Search,
  Trash2,
  Warehouse,
  X,
} from "lucide-react";
import type { FacilityAdminItem, FacilityInput } from "../lib/facilities";

type FacilitiesDashboardProps = {
  initialFacilities: FacilityAdminItem[];
};

type RoleFilter = "all" | "warehouses" | "laundries" | "both";
type StatusFilter = "all" | "active" | "inactive";

type FacilityFormState = {
  name: string;
  shortName: string;
  address: string;
  latitude: string;
  longitude: string;
  isWarehouse: boolean;
  isLaundry: boolean;
  serviceMins: string;
  isActive: boolean;
};

function sortFacilities(list: FacilityAdminItem[]): FacilityAdminItem[] {
  return [...list].sort((a, b) =>
    a.name.localeCompare(b.name, "en", { sensitivity: "base" }),
  );
}

function formFromFacility(item: FacilityAdminItem | null): FacilityFormState {
  if (!item) {
    return {
      name: "",
      shortName: "",
      address: "",
      latitude: "",
      longitude: "",
      isWarehouse: true,
      isLaundry: false,
      serviceMins: "180",
      isActive: true,
    };
  }

  return {
    name: item.name,
    shortName: item.shortName,
    address: item.address ?? "",
    latitude: String(item.latitude),
    longitude: String(item.longitude),
    isWarehouse: item.isWarehouse,
    isLaundry: item.isLaundry,
    serviceMins: String(item.serviceMins),
    isActive: item.isActive,
  };
}

function buildPayload(form: FacilityFormState): {
  payload?: FacilityInput;
  error?: string;
} {
  const name = form.name.trim();
  if (!name) return { error: "Facility name is required." };
  if (name.length > 120) {
    return { error: "Facility name must be 120 characters or less." };
  }

  let shortName = form.shortName.trim();
  if (!shortName) {
    shortName = name
      .split(/\s+/)
      .map((word) => word[0])
      .filter(Boolean)
      .join("")
      .toUpperCase()
      .slice(0, 8);
    if (!shortName) shortName = name.slice(0, 8);
  }

  const address = form.address.trim() || null;
  const latitude = Number(form.latitude);
  const longitude = Number(form.longitude);

  if (!Number.isFinite(latitude) || latitude < -90 || latitude > 90) {
    return { error: "Latitude must be between -90 and 90." };
  }
  if (!Number.isFinite(longitude) || longitude < -180 || longitude > 180) {
    return { error: "Longitude must be between -180 and 180." };
  }

  if (!form.isWarehouse && !form.isLaundry) {
    return {
      error: "Select at least one role: Warehouse, Laundry, or both.",
    };
  }

  const serviceMins = form.isLaundry ? Number(form.serviceMins) : 180;
  if (
    form.isLaundry &&
    (!Number.isInteger(serviceMins) || serviceMins < 0 || serviceMins > 1440)
  ) {
    return {
      error: "Service minutes must be a whole number between 0 and 1440.",
    };
  }

  return {
    payload: {
      name,
      shortName,
      address,
      latitude,
      longitude,
      isWarehouse: form.isWarehouse,
      isLaundry: form.isLaundry,
      serviceMins,
      isActive: form.isActive,
    },
  };
}

export default function FacilitiesDashboard({
  initialFacilities,
}: FacilitiesDashboardProps) {
  const [facilities, setFacilities] = useState<FacilityAdminItem[]>(() =>
    sortFacilities(initialFacilities),
  );
  const [query, setQuery] = useState("");
  const [roleFilter, setRoleFilter] = useState<RoleFilter>("all");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");

  const [editorOpen, setEditorOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<FacilityFormState>(() =>
    formFromFacility(null),
  );
  const [formError, setFormError] = useState<string | null>(null);
  const [geocoding, setGeocoding] = useState(false);
  const [geocodeError, setGeocodeError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [togglingId, setTogglingId] = useState<string | null>(null);

  const [notice, setNotice] = useState<{
    message: string;
    kind: "success" | "error";
  } | null>(null);

  const noticeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const showNotice = (message: string, kind: "success" | "error") => {
    if (noticeTimer.current) clearTimeout(noticeTimer.current);
    setNotice({ message, kind });
    noticeTimer.current = setTimeout(() => {
      setNotice(null);
      noticeTimer.current = null;
    }, 5000);
  };

  useEffect(() => {
    return () => {
      if (noticeTimer.current) clearTimeout(noticeTimer.current);
    };
  }, []);

  const totals = useMemo(() => {
    const total = facilities.length;
    let warehouses = 0;
    let laundries = 0;
    let both = 0;
    let active = 0;

    for (const f of facilities) {
      if (f.isActive) active += 1;
      if (f.isWarehouse && f.isLaundry) {
        both += 1;
        warehouses += 1;
        laundries += 1;
      } else if (f.isWarehouse) {
        warehouses += 1;
      } else if (f.isLaundry) {
        laundries += 1;
      }
    }

    return { total, warehouses, laundries, both, active };
  }, [facilities]);

  const filtered = useMemo(() => {
    const search = query.trim().toLowerCase();
    return facilities.filter((f) => {
      if (statusFilter === "active" && !f.isActive) return false;
      if (statusFilter === "inactive" && f.isActive) return false;

      if (roleFilter === "warehouses" && !f.isWarehouse) return false;
      if (roleFilter === "laundries" && !f.isLaundry) return false;
      if (roleFilter === "both" && (!f.isWarehouse || !f.isLaundry)) return false;

      if (!search) return true;
      return (
        f.name.toLowerCase().includes(search) ||
        f.id.toLowerCase().includes(search) ||
        f.shortName.toLowerCase().includes(search) ||
        (f.address ?? "").toLowerCase().includes(search)
      );
    });
  }, [facilities, query, roleFilter, statusFilter]);

  const openCreate = () => {
    setEditingId(null);
    setForm(formFromFacility(null));
    setFormError(null);
    setGeocodeError(null);
    setEditorOpen(true);
  };

  const openEdit = (item: FacilityAdminItem) => {
    setEditingId(item.id);
    setForm(formFromFacility(item));
    setFormError(null);
    setGeocodeError(null);
    setEditorOpen(true);
  };

  const closeEditor = () => {
    if (saving) return;
    setEditorOpen(false);
    setFormError(null);
    setGeocodeError(null);
  };

  const lookupCoordinates = async (): Promise<{
    lat: number;
    lon: number;
    formattedAddress: string;
  } | null> => {
    const address = form.address.trim();
    if (!address) {
      setGeocodeError("Enter the facility address first.");
      return null;
    }

    setGeocoding(true);
    setGeocodeError(null);
    try {
      const response = await fetch("/api/geocode", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ address }),
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

      setForm((current) => ({
        ...current,
        latitude: String(data.result!.latitude),
        longitude: String(data.result!.longitude),
        address: data.result!.formattedAddress,
      }));
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
  };

  const saveFacility = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (saving) return;

    let effectiveForm = form;
    const latitude = Number(form.latitude);
    const longitude = Number(form.longitude);
    const coordsMissing =
      !form.latitude.trim() ||
      !form.longitude.trim() ||
      !Number.isFinite(latitude) ||
      !Number.isFinite(longitude);

    if (coordsMissing && form.address.trim()) {
      setSaving(true);
      const geocoded = await lookupCoordinates();
      if (!geocoded) {
        setSaving(false);
        setFormError("Could not find coordinates for that address.");
        return;
      }
      effectiveForm = {
        ...form,
        latitude: String(geocoded.lat),
        longitude: String(geocoded.lon),
        address: geocoded.formattedAddress,
      };
    }

    const { payload, error } = buildPayload(effectiveForm);
    if (!payload) {
      setFormError(error ?? "Check the facility details.");
      return;
    }

    setSaving(true);
    setFormError(null);

    try {
      const url = editingId ? `/api/facilities/${editingId}` : "/api/facilities";
      const method = editingId ? "PATCH" : "POST";
      const response = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const data = (await response.json().catch(() => null)) as
        | { facility?: FacilityAdminItem; error?: string }
        | null;

      if (!response.ok || !data?.facility) {
        setFormError(data?.error ?? "Could not save this facility.");
        return;
      }

      const saved = data.facility;
      setFacilities((current) =>
        sortFacilities(
          editingId
            ? current.map((f) => (f.id === saved.id ? saved : f))
            : [...current, saved],
        ),
      );
      setEditorOpen(false);
      showNotice(
        editingId ? "Facility updated." : "Facility added.",
        "success",
      );
    } catch {
      setFormError("Could not reach the server. Try again.");
    } finally {
      setSaving(false);
    }
  };

  const toggleActiveStatus = async (item: FacilityAdminItem) => {
    const nextStatus = !item.isActive;
    setTogglingId(item.id);
    try {
      const response = await fetch(`/api/facilities/${item.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: item.name,
          shortName: item.shortName,
          address: item.address,
          latitude: item.latitude,
          longitude: item.longitude,
          isWarehouse: item.isWarehouse,
          isLaundry: item.isLaundry,
          serviceMins: item.serviceMins,
          isActive: nextStatus,
        }),
      });

      const data = (await response.json().catch(() => null)) as
        | { facility?: FacilityAdminItem; error?: string }
        | null;

      if (!response.ok || !data?.facility) {
        showNotice(
          data?.error ?? "Could not update facility status.",
          "error",
        );
        return;
      }

      const updated = data.facility;
      setFacilities((current) =>
        current.map((f) => (f.id === updated.id ? updated : f)),
      );
      showNotice(
        nextStatus ? "Facility activated." : "Facility deactivated.",
        "success",
      );
    } catch {
      showNotice("Could not reach the server. Try again.", "error");
    } finally {
      setTogglingId(null);
    }
  };

  const removeFacility = async (item: FacilityAdminItem) => {
    if (
      !window.confirm(
        `Delete ${item.name}? This permanently removes it from the master.`,
      )
    ) {
      return;
    }

    setDeletingId(item.id);
    try {
      const response = await fetch(`/api/facilities/${item.id}`, {
        method: "DELETE",
      });
      const data = (await response.json().catch(() => null)) as
        | { error?: string }
        | null;

      if (!response.ok) {
        showNotice(data?.error ?? "Could not delete this facility.", "error");
        return;
      }

      setFacilities((current) =>
        current.filter((candidate) => candidate.id !== item.id),
      );
      showNotice("Facility deleted.", "success");
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
            <span className="brand-sub">Facility master</span>
          </span>
        </Link>

        <div className="plan-heading">
          <span className="eyebrow">
            <span className="eyebrow__dot" />
            Operations · Logistics master
          </span>
          <div className="plan-heading__row">
            <h1>Facilities</h1>
          </div>
        </div>

        <div className="plan-actions">
          <Link href="/hotels" className="btn btn--ghost">
            Hotels
          </Link>
          <Link href="/vehicles" className="btn btn--ghost">
            Vehicles
          </Link>
          <Link href="/plan" className="btn btn--ghost">
            Plan canvas
          </Link>
          <button
            type="button"
            className="btn btn--primary"
            onClick={openCreate}
          >
            <Plus size={14} />
            Add facility
          </button>
        </div>
      </header>

      <main className="hotels-main">
        <div className="hotels-summary">
          <div className="hotels-summary__card">
            <span>Total facilities</span>
            <b>{totals.total}</b>
          </div>
          <div className="hotels-summary__card hotels-summary__card--daily">
            <span>Active</span>
            <b>{totals.active}</b>
          </div>
          <div className="hotels-summary__card hotels-summary__card--day1">
            <span>Warehouses</span>
            <b>{totals.warehouses}</b>
          </div>
          <div className="hotels-summary__card hotels-summary__card--day2">
            <span>Laundries</span>
            <b>{totals.laundries}</b>
          </div>
          <div className="hotels-summary__card">
            <span>Dual Role (Both)</span>
            <b>{totals.both}</b>
          </div>
        </div>

        <section className="hotels-panel" aria-label="Facility master list">
          <div className="hotels-toolbar">
            <label className="hotels-search">
              <Search size={14} />
              <input
                type="search"
                value={query}
                placeholder="Search name, id, badge or address"
                onChange={(event) => setQuery(event.target.value)}
                aria-label="Search facilities"
              />
            </label>

            <select
              className="hotels-filter"
              value={roleFilter}
              onChange={(event) =>
                setRoleFilter(event.target.value as RoleFilter)
              }
              aria-label="Filter by role"
            >
              <option value="all">All roles</option>
              <option value="warehouses">Warehouses only</option>
              <option value="laundries">Laundries only</option>
              <option value="both">Both (Dual role)</option>
            </select>

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

            <span className="hotels-count">
              {filtered.length} of {facilities.length} facilities
            </span>
          </div>

          <div className="hotels-table-wrap">
            <table className="hotels-table facilities-table">
              <thead>
                <tr>
                  <th>Facility</th>
                  <th>Role</th>
                  <th>Badge</th>
                  <th>Address</th>
                  <th>Service Time</th>
                  <th>Coordinates</th>
                  <th>In Use</th>
                  <th>Status</th>
                  <th aria-label="Actions" />
                </tr>
              </thead>
              <tbody>
                {filtered.map((item) => {
                  const roleLabel =
                    item.isWarehouse && item.isLaundry
                      ? "Both"
                      : item.isWarehouse
                        ? "Warehouse"
                        : "Laundry";

                  const roleBadgeClass =
                    item.isWarehouse && item.isLaundry
                      ? "hotels-day hotels-day--daily"
                      : item.isWarehouse
                        ? "hotels-day hotels-day--day1"
                        : "hotels-day hotels-day--day2";

                  return (
                    <tr
                      key={item.id}
                      className={item.isActive ? "" : "is-inactive"}
                    >
                      <td>
                        <div className="hotels-name">
                          <span>
                            <b>{item.name}</b>
                            <small>{item.id}</small>
                          </span>
                        </div>
                      </td>
                      <td>
                        <span className={roleBadgeClass}>{roleLabel}</span>
                      </td>
                      <td>
                        <span
                          style={{
                            display: "inline-block",
                            padding: "2px 8px",
                            borderRadius: "4px",
                            backgroundColor: "var(--color-surface-2, #f1f5f9)",
                            fontFamily: "monospace",
                            fontWeight: 600,
                            fontSize: "12px",
                          }}
                        >
                          {item.shortName}
                        </span>
                      </td>
                      <td className="hotels-address">
                        {item.address || "—"}
                      </td>
                      <td>
                        {item.isLaundry
                          ? `${item.serviceMins} min`
                          : "—"}
                      </td>
                      <td className="hotels-coords">
                        {item.latitude.toFixed(5)}, {item.longitude.toFixed(5)}
                      </td>
                      <td>
                        <span
                          title={
                            item.usedByPlans.length > 0
                              ? `Referenced in: ${item.usedByPlans.join(", ")}`
                              : "Not referenced in any active plan"
                          }
                          style={{
                            cursor: "help",
                            fontWeight: item.usedByRouteCount > 0 ? 600 : 400,
                            color:
                              item.usedByRouteCount > 0
                                ? "inherit"
                                : "var(--color-text-muted, #94a3b8)",
                          }}
                        >
                          {item.usedByRouteCount > 0
                            ? `${item.usedByRouteCount} route${item.usedByRouteCount > 1 ? "s" : ""}`
                            : "None"}
                        </span>
                      </td>
                      <td>
                        <span
                          className={`hotels-day ${
                            item.isActive
                              ? "hotels-day--daily"
                              : "hotels-day--day2"
                          }`}
                        >
                          {item.isActive ? "Active" : "Inactive"}
                        </span>
                      </td>
                      <td>
                        <div className="hotels-row-actions">
                          <button
                            type="button"
                            className="hotels-icon-btn"
                            title="Edit facility"
                            onClick={() => openEdit(item)}
                            aria-label={`Edit ${item.name}`}
                          >
                            <Pencil size={14} />
                          </button>
                          <button
                            type="button"
                            className="hotels-icon-btn"
                            title={
                              item.isActive
                                ? "Deactivate facility"
                                : "Activate facility"
                            }
                            disabled={togglingId === item.id}
                            onClick={() => toggleActiveStatus(item)}
                            aria-label={
                              item.isActive
                                ? `Deactivate ${item.name}`
                                : `Activate ${item.name}`
                            }
                          >
                            <Power
                              size={14}
                              color={item.isActive ? "#f59e0b" : "#10b981"}
                            />
                          </button>
                          <button
                            type="button"
                            className="hotels-icon-btn hotels-icon-btn--danger"
                            title={
                              item.usedByPlans.length > 0
                                ? "Cannot delete while in use by a plan or vehicle. Deactivate instead."
                                : "Delete facility"
                            }
                            disabled={deletingId === item.id}
                            onClick={() => removeFacility(item)}
                            aria-label={`Delete ${item.name}`}
                          >
                            <Trash2 size={14} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}

                {filtered.length === 0 && (
                  <tr>
                    <td
                      colSpan={9}
                      style={{ textAlign: "center", padding: "40px" }}
                    >
                      No facilities match the current filters.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>
      </main>

      {editorOpen && (
        <div
          className="modal-backdrop"
          onClick={closeEditor}
          role="presentation"
        >
          <div
            className="plan-dialog hotels-dialog"
            onClick={(event) => event.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-labelledby="facility-dialog-title"
            style={{
              display: "flex",
              flexDirection: "column",
              overflow: "hidden",
              padding: 0,
            }}
          >
            <header
              className="plan-dialog__head"
              style={{ padding: "24px 24px 0", flexShrink: 0 }}
            >
              <div>
                <span className="eyebrow">
                  <span className="eyebrow__dot" />
                  {editingId ? "Edit facility" : "New facility"}
                </span>
                <h2 id="facility-dialog-title">
                  {editingId ? "Update facility" : "Add facility"}
                </h2>
              </div>
              <button
                type="button"
                className="dialog-close"
                onClick={closeEditor}
                disabled={saving}
                aria-label="Close dialog"
              >
                <X size={16} />
              </button>
            </header>

            <form
              onSubmit={saveFacility}
              style={{ display: "contents" }}
            >
              <div
                style={{
                  flex: 1,
                  overflowY: "auto",
                  padding: "16px 24px",
                }}
              >
              {formError && (
                <div className="hotels-form-error" role="alert">
                  {formError}
                </div>
              )}

              <div className="plan-dialog__grid">
                <label className="plan-field plan-dialog__full">
                  <span className="plan-field__label">
                    Facility Name <b>*</b>
                  </span>
                  <input
                    type="text"
                    required
                    maxLength={120}
                    value={form.name}
                    placeholder="e.g. LinenGrass HQ, Pioneer, Second Warehouse"
                    onChange={(event) =>
                      setForm((current) => ({
                        ...current,
                        name: event.target.value,
                      }))
                    }
                  />
                </label>

                <label className="plan-field">
                  <span className="plan-field__label">
                    Short Name / Badge <b>*</b>
                  </span>
                  <input
                    type="text"
                    maxLength={16}
                    value={form.shortName}
                    placeholder="e.g. HQ, WH2, LS"
                    onChange={(event) =>
                      setForm((current) => ({
                        ...current,
                        shortName: event.target.value,
                      }))
                    }
                  />
                </label>

                <div className="plan-field">
                  <span className="plan-field__label">
                    Roles <b>*</b>
                  </span>
                  <div
                    style={{
                      display: "flex",
                      gap: "16px",
                      marginTop: "8px",
                      alignItems: "center",
                    }}
                  >
                    <label
                      style={{
                        display: "flex",
                        gap: "6px",
                        alignItems: "center",
                        cursor: "pointer",
                      }}
                    >
                      <input
                        type="checkbox"
                        checked={form.isWarehouse}
                        onChange={(event) =>
                          setForm((current) => ({
                            ...current,
                            isWarehouse: event.target.checked,
                          }))
                        }
                      />
                      <span>Warehouse</span>
                    </label>

                    <label
                      style={{
                        display: "flex",
                        gap: "6px",
                        alignItems: "center",
                        cursor: "pointer",
                      }}
                    >
                      <input
                        type="checkbox"
                        checked={form.isLaundry}
                        onChange={(event) =>
                          setForm((current) => ({
                            ...current,
                            isLaundry: event.target.checked,
                          }))
                        }
                      />
                      <span>Laundry</span>
                    </label>
                  </div>
                </div>

                <label className="plan-field plan-dialog__full">
                  <span className="plan-field__label">Full Address</span>
                  <div className="plan-address-row">
                    <input
                      type="text"
                      maxLength={300}
                      value={form.address}
                      placeholder="e.g. 12/A, Industrial Area, Yeshwanthpur, Bengaluru"
                      onChange={(event) =>
                        setForm((current) => ({
                          ...current,
                          address: event.target.value,
                        }))
                      }
                    />
                    <button
                      type="button"
                      className="btn btn--ghost plan-address-row__button"
                      onClick={lookupCoordinates}
                      disabled={geocoding || !form.address.trim()}
                    >
                      <MapPin size={14} />
                      {geocoding ? "Looking up..." : "Find coordinates"}
                    </button>
                  </div>
                </label>

                {geocodeError && (
                  <div
                    className="hotels-form-error plan-dialog__full"
                    role="alert"
                  >
                    {geocodeError}
                  </div>
                )}

                <label className="plan-field">
                  <span className="plan-field__label">
                    Latitude <b>*</b>
                  </span>
                  <input
                    type="number"
                    step="any"
                    value={form.latitude}
                    placeholder="e.g. 13.017275"
                    onChange={(event) =>
                      setForm((current) => ({
                        ...current,
                        latitude: event.target.value,
                      }))
                    }
                  />
                </label>

                <label className="plan-field">
                  <span className="plan-field__label">
                    Longitude <b>*</b>
                  </span>
                  <input
                    type="number"
                    step="any"
                    value={form.longitude}
                    placeholder="e.g. 77.546578"
                    onChange={(event) =>
                      setForm((current) => ({
                        ...current,
                        longitude: event.target.value,
                      }))
                    }
                  />
                </label>

                {form.isLaundry && (
                  <label className="plan-field">
                    <span className="plan-field__label">
                      Service Time (minutes on site)
                    </span>
                    <input
                      type="number"
                      min={0}
                      max={1440}
                      value={form.serviceMins}
                      onChange={(event) =>
                        setForm((current) => ({
                          ...current,
                          serviceMins: event.target.value,
                        }))
                      }
                    />
                  </label>
                )}

                <div className="plan-field">
                  <span className="plan-field__label">Status</span>
                  <label
                    style={{
                      display: "flex",
                      gap: "6px",
                      alignItems: "center",
                      marginTop: "8px",
                      cursor: "pointer",
                    }}
                  >
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
                    <span>Active in dispatch operations</span>
                  </label>
                </div>
              </div>
              </div>{/* end scrollable wrapper */}

              <footer
                className="plan-dialog__actions"
                style={{ padding: "16px 24px", flexShrink: 0 }}
              >
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
                    ? "Saving..."
                    : editingId
                      ? "Save changes"
                      : "Create facility"}
                </button>
              </footer>
            </form>
          </div>
        </div>
      )}

      {notice && (
        <div
          className={`hotels-notice hotels-notice--${notice.kind}`}
          role="status"
        >
          {notice.kind === "success" ? <Check size={14} /> : <X size={14} />}
          <span>{notice.message}</span>
        </div>
      )}
    </div>
  );
}

