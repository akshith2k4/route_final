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
  Hotel,
  MapPin,
  Pencil,
  Plus,
  Search,
  Trash2,
  X,
} from "lucide-react";
import type {
  HotelAdminItem,
  HotelDayPlan,
  HotelInput,
} from "../lib/hotels";

type HotelsDashboardProps = {
  initialHotels: HotelAdminItem[];
  regionNames: string[];
};

type DayFilter = "all" | HotelDayPlan;

type HotelFormState = {
  name: string;
  address: string;
  latitude: string;
  longitude: string;
  regionName: string;
  stopMins: string;
  loadBags: string;
  alternateLoadBags: string;
  rooms: string;
  dayPlan: HotelDayPlan;
};

const DAY_LABELS: Record<HotelDayPlan, string> = {
  daily: "Daily",
  day1: "Day 1",
  day2: "Day 2",
};

const DAY_OPTIONS: HotelDayPlan[] = ["daily", "day1", "day2"];

function sortHotels(hotels: HotelAdminItem[]): HotelAdminItem[] {
  return [...hotels].sort((a, b) =>
    a.name.localeCompare(b.name, "en", { sensitivity: "base" }),
  );
}

function formFromHotel(
  hotel: HotelAdminItem | null,
  regionNames: string[],
): HotelFormState {
  if (!hotel) {
    return {
      name: "",
      address: "",
      latitude: "",
      longitude: "",
      regionName: regionNames[0] ?? "",
      stopMins: "15",
      loadBags: "0",
      alternateLoadBags: "0",
      rooms: "0",
      dayPlan: "daily",
    };
  }

  return {
    name: hotel.name,
    address: hotel.address ?? "",
    latitude: String(hotel.latitude),
    longitude: String(hotel.longitude),
    regionName: hotel.regionName,
    stopMins: String(hotel.stopMins),
    loadBags: String(hotel.loadBags),
    alternateLoadBags: String(hotel.alternateLoadBags),
    rooms: String(hotel.rooms),
    dayPlan: hotel.dayPlan,
  };
}

function buildPayload(form: HotelFormState): {
  payload?: HotelInput;
  error?: string;
} {
  const name = form.name.trim();
  if (!name) return { error: "Hotel name is required." };

  const latitude = Number(form.latitude);
  const longitude = Number(form.longitude);
  if (!Number.isFinite(latitude) || latitude < -90 || latitude > 90) {
    return { error: "Enter a latitude between -90 and 90." };
  }
  if (!Number.isFinite(longitude) || longitude < -180 || longitude > 180) {
    return { error: "Enter a longitude between -180 and 180." };
  }
  if (!form.regionName.trim()) return { error: "Choose a region." };

  const stopMins = Number(form.stopMins);
  const loadBags = Number(form.loadBags);
  const alternateLoadBags = Number(form.alternateLoadBags);
  const rooms = Number(form.rooms);
  if (!Number.isInteger(stopMins) || stopMins < 0) {
    return { error: "Stop minutes must be a whole number of 0 or more." };
  }
  if (!Number.isInteger(loadBags) || loadBags < 0) {
    return { error: "Daily bags must be a whole number of 0 or more." };
  }
  if (!Number.isInteger(alternateLoadBags) || alternateLoadBags < 0) {
    return {
      error: "Alternate-day bags must be a whole number of 0 or more.",
    };
  }
  if (!Number.isInteger(rooms) || rooms < 0) {
    return { error: "Rooms must be a whole number of 0 or more." };
  }

  return {
    payload: {
      name,
      address: form.address.trim() || null,
      latitude,
      longitude,
      regionName: form.regionName.trim(),
      stopMins,
      loadBags,
      alternateLoadBags,
      rooms,
      dayPlan: form.dayPlan,
    },
  };
}

export default function HotelsDashboard({
  initialHotels,
  regionNames,
}: HotelsDashboardProps) {
  const [hotels, setHotels] = useState(() => sortHotels(initialHotels));
  const [query, setQuery] = useState("");
  const [dayFilter, setDayFilter] = useState<DayFilter>("all");
  const [regionFilter, setRegionFilter] = useState("all");
  const [editorOpen, setEditorOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<HotelFormState>(() =>
    formFromHotel(null, regionNames),
  );
  const [formError, setFormError] = useState<string | null>(null);
  const [geocodeError, setGeocodeError] = useState<string | null>(null);
  const [geocoding, setGeocoding] = useState(false);
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
    let daily = 0;
    let day1 = 0;
    let day2 = 0;
    let bags = 0;
    let rooms = 0;

    for (const hotel of hotels) {
      if (hotel.dayPlan === "daily") daily += 1;
      if (hotel.dayPlan === "day1") day1 += 1;
      if (hotel.dayPlan === "day2") day2 += 1;
      bags +=
        hotel.dayPlan === "daily"
          ? hotel.loadBags
          : hotel.alternateLoadBags;
      rooms += hotel.rooms;
    }

    return {
      total: hotels.length,
      daily,
      day1,
      day2,
      bags,
      rooms,
    };
  }, [hotels]);

  const filteredHotels = useMemo(() => {
    const search = query.trim().toLowerCase();

    return hotels.filter((hotel) => {
      if (dayFilter !== "all" && hotel.dayPlan !== dayFilter) return false;
      if (regionFilter !== "all" && hotel.regionName !== regionFilter) {
        return false;
      }
      if (!search) return true;

      return (
        hotel.name.toLowerCase().includes(search) ||
        hotel.id.toLowerCase().includes(search) ||
        (hotel.address ?? "").toLowerCase().includes(search) ||
        hotel.regionName.toLowerCase().includes(search)
      );
    });
  }, [hotels, query, dayFilter, regionFilter]);

  const openCreate = () => {
    setEditingId(null);
    setForm(formFromHotel(null, regionNames));
    setFormError(null);
    setGeocodeError(null);
    setEditorOpen(true);
  };

  const openEdit = (hotel: HotelAdminItem) => {
    setEditingId(hotel.id);
    setForm(formFromHotel(hotel, regionNames));
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
      setGeocodeError("Enter the hotel address first.");
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

  const saveHotel = async (event: FormEvent<HTMLFormElement>) => {
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
      setSaving(false);
      setFormError(error ?? "Check the hotel details.");
      return;
    }

    setSaving(true);
    setFormError(null);

    try {
      const response = await fetch(
        editingId ? `/api/hotels/${editingId}` : "/api/hotels",
        {
          method: editingId ? "PATCH" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        },
      );
      const data = (await response.json().catch(() => null)) as
        | { hotel?: HotelAdminItem; error?: string }
        | null;

      if (!response.ok || !data?.hotel) {
        setFormError(data?.error ?? "Could not save this hotel.");
        return;
      }

      const saved = data.hotel;
      setHotels((current) =>
        sortHotels(
          editingId
            ? current.map((hotel) => (hotel.id === saved.id ? saved : hotel))
            : [...current, saved],
        ),
      );
      setEditorOpen(false);
      showNotice(editingId ? "Hotel updated." : "Hotel added.", "success");
    } catch {
      setFormError("Could not reach the server. Try again.");
    } finally {
      setSaving(false);
    }
  };

  const removeHotel = async (hotel: HotelAdminItem) => {
    if (
      !window.confirm(
        `Delete ${hotel.name}? This removes it from the hotel master.`,
      )
    ) {
      return;
    }

    setDeletingId(hotel.id);
    try {
      const response = await fetch(`/api/hotels/${hotel.id}`, {
        method: "DELETE",
      });
      const data = (await response.json().catch(() => null)) as
        | { error?: string }
        | null;

      if (!response.ok) {
        showNotice(data?.error ?? "Could not delete this hotel.", "error");
        return;
      }

      setHotels((current) =>
        current.filter((candidate) => candidate.id !== hotel.id),
      );
      showNotice("Hotel deleted.", "success");
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
            <span className="brand-sub">Hotel dashboard</span>
          </span>
        </Link>

        <div className="plan-heading">
          <span className="eyebrow">
            <span className="eyebrow__dot" />
            Operations · Hotel master
          </span>
          <div className="plan-heading__row">
            <h1>Hotels</h1>
          </div>
        </div>

        <div className="plan-actions">
          <Link href="/vehicles" className="btn btn--ghost">
            Vehicles
          </Link>
          <Link href="/plan" className="btn btn--ghost">
            Plan canvas
          </Link>
          <button type="button" className="btn btn--primary" onClick={openCreate}>
            <Plus size={14} />
            Add hotel
          </button>
        </div>
      </header>

      <main className="hotels-main">
        <div className="hotels-summary">
          <div className="hotels-summary__card">
            <span>Total hotels</span>
            <b>{totals.total}</b>
          </div>
          <div className="hotels-summary__card hotels-summary__card--daily">
            <span>Daily</span>
            <b>{totals.daily}</b>
          </div>
          <div className="hotels-summary__card hotels-summary__card--day1">
            <span>Day 1</span>
            <b>{totals.day1}</b>
          </div>
          <div className="hotels-summary__card hotels-summary__card--day2">
            <span>Day 2</span>
            <b>{totals.day2}</b>
          </div>
          <div className="hotels-summary__card">
            <span>Total bags</span>
            <b>{totals.bags}</b>
          </div>
          <div className="hotels-summary__card">
            <span>Total rooms</span>
            <b>{totals.rooms}</b>
          </div>
        </div>

        <section className="hotels-panel" aria-label="Hotel master list">
          <div className="hotels-toolbar">
            <label className="hotels-search">
              <Search size={14} />
              <input
                type="search"
                value={query}
                placeholder="Search name, id or address"
                onChange={(event) => setQuery(event.target.value)}
                aria-label="Search hotels"
              />
            </label>

            <select
              className="hotels-filter"
              value={dayFilter}
              onChange={(event) =>
                setDayFilter(event.target.value as DayFilter)
              }
              aria-label="Filter by day"
            >
              <option value="all">All days</option>
              {DAY_OPTIONS.map((day) => (
                <option key={day} value={day}>
                  {DAY_LABELS[day]}
                </option>
              ))}
            </select>

            <select
              className="hotels-filter"
              value={regionFilter}
              onChange={(event) => setRegionFilter(event.target.value)}
              aria-label="Filter by region"
            >
              <option value="all">All regions</option>
              {regionNames.map((region) => (
                <option key={region} value={region}>
                  {region}
                </option>
              ))}
            </select>

            <span className="hotels-count">
              {filteredHotels.length} of {hotels.length}
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
                  <th>Hotel</th>
                  <th>Region</th>
                  <th>Address</th>
                  <th>Day</th>
                  <th className="is-number">Stop</th>
                  <th className="is-number" title="Daily / alternate-day bags">
                    Bags (D / A)
                  </th>
                  <th className="is-number">Rooms</th>
                  <th>Coordinates</th>
                  <th aria-label="Actions" />
                </tr>
              </thead>
              <tbody>
                {filteredHotels.map((hotel) => (
                  <tr key={hotel.id}>
                    <td>
                      <div className="hotels-name">
                        <Hotel size={14} />
                        <span>
                          <b>{hotel.name}</b>
                          <small>{hotel.id}</small>
                        </span>
                      </div>
                    </td>
                    <td>
                      <span className="hotels-region">{hotel.regionName}</span>
                    </td>
                    <td>
                      {hotel.address ? (
                        <span className="hotels-address" title={hotel.address}>
                          {hotel.address}
                        </span>
                      ) : (
                        <span className="hotels-muted">—</span>
                      )}
                    </td>
                    <td>
                      <span
                        className={`hotels-day hotels-day--${hotel.dayPlan}`}
                      >
                        {DAY_LABELS[hotel.dayPlan]}
                      </span>
                    </td>
                    <td className="is-number">{hotel.stopMins}</td>
                    <td className="is-number">
                      {hotel.loadBags} / {hotel.alternateLoadBags}
                    </td>
                    <td className="is-number">{hotel.rooms}</td>
                    <td>
                      <span className="hotels-coords">
                        <MapPin size={11} />
                        {hotel.latitude.toFixed(4)},{" "}
                        {hotel.longitude.toFixed(4)}
                      </span>
                    </td>
                    <td>
                      <div className="hotels-row-actions">
                        <button
                          type="button"
                          className="hotels-icon-btn"
                          onClick={() => openEdit(hotel)}
                          title={`Edit ${hotel.name}`}
                          aria-label={`Edit ${hotel.name}`}
                        >
                          <Pencil size={13} />
                        </button>
                        <button
                          type="button"
                          className="hotels-icon-btn hotels-icon-btn--danger"
                          onClick={() => void removeHotel(hotel)}
                          disabled={deletingId === hotel.id}
                          title={`Delete ${hotel.name}`}
                          aria-label={`Delete ${hotel.name}`}
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

          {filteredHotels.length === 0 && (
            <div className="hotels-empty">
              <Search size={18} />
              <b>No hotels match this filter</b>
              <span>Try a different search, region or day.</span>
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
            aria-labelledby="hotel-dialog-title"
            onSubmit={saveHotel}
          >
            <button
              type="button"
              className="dialog-close"
              onClick={closeEditor}
              aria-label="Close hotel dialog"
            >
              <X size={16} />
            </button>

            <span className="dialog-eyebrow">
              <Hotel size={12} />
              {editingId ? "Edit hotel" : "New hotel"}
            </span>
            <h2 id="hotel-dialog-title">
              {editingId ? "Update hotel details" : "Add a hotel"}
            </h2>
            <p className="dialog-lede">
              This updates the hotel master used by the coverage atlas and
              optimizer. Daily bags apply when the hotel runs every day; alternate-day
              bags apply when it runs on Day 1 only or Day 2 only.
            </p>

            <label className="plan-dialog__field">
              <span>Hotel name</span>
              <input
                type="text"
                value={form.name}
                maxLength={120}
                placeholder="e.g. ARAMA SUITES"
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    name: event.target.value,
                  }))
                }
                autoFocus
              />
            </label>

            <label className="plan-dialog__field">
              <span>Address</span>
              <div className="plan-address-row">
                <input
                  type="text"
                  value={form.address}
                  maxLength={300}
                  placeholder="Street, area, city"
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
                  onClick={() => void lookupCoordinates()}
                  disabled={geocoding || !form.address.trim()}
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
                <span>Region</span>
                <select
                  value={form.regionName}
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      regionName: event.target.value,
                    }))
                  }
                >
                  {regionNames.map((region) => (
                    <option key={region} value={region}>
                      {region}
                    </option>
                  ))}
                </select>
              </label>

              <label className="plan-dialog__field">
                <span>Day plan</span>
                <select
                  value={form.dayPlan}
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      dayPlan: event.target.value as HotelDayPlan,
                    }))
                  }
                >
                  {DAY_OPTIONS.map((day) => (
                    <option key={day} value={day}>
                      {DAY_LABELS[day]}
                    </option>
                  ))}
                </select>
              </label>

              <label className="plan-dialog__field">
                <span>Latitude</span>
                <input
                  type="number"
                  inputMode="decimal"
                  step="any"
                  value={form.latitude}
                  placeholder="12.9716"
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      latitude: event.target.value,
                    }))
                  }
                />
              </label>

              <label className="plan-dialog__field">
                <span>Longitude</span>
                <input
                  type="number"
                  inputMode="decimal"
                  step="any"
                  value={form.longitude}
                  placeholder="77.5946"
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      longitude: event.target.value,
                    }))
                  }
                />
              </label>

              <label className="plan-dialog__field">
                <span>Stop minutes</span>
                <input
                  type="number"
                  inputMode="numeric"
                  min={0}
                  step={1}
                  value={form.stopMins}
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      stopMins: event.target.value,
                    }))
                  }
                />
              </label>

              <label className="plan-dialog__field">
                <span>Daily bags</span>
                <input
                  type="number"
                  inputMode="numeric"
                  min={0}
                  step={1}
                  value={form.loadBags}
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      loadBags: event.target.value,
                    }))
                  }
                />
              </label>

              <label className="plan-dialog__field">
                <span>Alternate-day bags</span>
                <input
                  type="number"
                  inputMode="numeric"
                  min={0}
                  step={1}
                  value={form.alternateLoadBags}
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      alternateLoadBags: event.target.value,
                    }))
                  }
                />
              </label>

              <label className="plan-dialog__field">
                <span>Rooms</span>
                <input
                  type="number"
                  inputMode="numeric"
                  min={0}
                  step={1}
                  value={form.rooms}
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      rooms: event.target.value,
                    }))
                  }
                />
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
                {saving ? "Saving…" : editingId ? "Save changes" : "Add hotel"}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
