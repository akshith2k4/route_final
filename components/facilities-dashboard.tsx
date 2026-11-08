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
  X,
} from "lucide-react";
import type { FacilityAdminItem, FacilityInput } from "../lib/facilities";
import { Button, ButtonLink } from "./ui/button";
import { DayBadge } from "./ui/badge";
import { SummaryCard } from "./ui/summary-card";
import { Field } from "./ui/field";
import { Notice } from "./ui/notice";
import { cn } from "./ui/cn";
import {
  addressRow,
  addressRowButton,
  dialog,
  dialogActions,
  dialogBackdrop,
  dialogClose,
  dialogFull,
  dialogGrid,
  dialogMedium,
  eyebrow,
  eyebrowDot,
  field,
  fieldLabel,
  formError as formErrorClass,
} from "./ui/plan-styles";

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
    <div className={`plan-app [display:flex] [flex-direction:column] [width:100%] [height:100svh] [min-height:0] [overflow:hidden] [background:var(--bone)] hotels-app`}>
      <header className={`topbar [position:relative] [z-index:40] [display:grid] [flex:0_0_auto] [grid-template-columns:1fr_auto_1fr] [align-items:center] [gap:18px] [height:66px] [padding:0_22px] [border-bottom:1px_solid_var(--line)] [background:rgba(247,_243,_235,_0.94)] [backdrop-filter:blur(14px)] max-[900px]:[grid-template-columns:1fr_auto] max-[760px]:[position:sticky] max-[760px]:[top:0] max-[760px]:[grid-template-columns:1fr_auto] max-[760px]:[gap:10px] max-[760px]:[height:60px] max-[760px]:[padding:0_16px] max-[560px]:[height:58px] max-[560px]:[padding:0_12px] plan-topbar [grid-template-columns:auto_minmax(0,_1fr)_auto] [height:64px] [gap:20px]`}>
        <Link className={`brand [display:inline-flex] [align-items:center] [justify-self:start] [gap:10px] [min-width:0] [border-radius:10px] [text-align:left] max-[560px]:[gap:8px]`} href="/" aria-label="Back to the coverage atlas">
          <span className={`brand-mark [display:grid] [flex:0_0_auto] [width:35px] [height:35px] [place-items:center] [border-radius:10px] [background:var(--ink)] [color:var(--cream)] [box-shadow:inset_0_0_0_1px_rgba(255,_255,_255,_0.07)] [transition:background_160ms_ease,_transform_160ms_ease] [.brand:hover_&]:[background:#25382d] [.brand:hover_&]:[transform:translateY(-1px)] [&_svg]:[width:21px] [&_svg]:[height:21px] max-[560px]:[width:32px] max-[560px]:[height:32px]`} aria-hidden="true">
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
          <span className={`brand-copy [display:flex] [flex-direction:column] [gap:1px] [line-height:1.1]`}>
            <span className={`brand-name [font-size:15px] [font-weight:600] [letter-spacing:-0.025em] max-[560px]:[font-size:14px]`}>LinenGrass</span>
            <span className={`brand-sub [color:var(--faint)] [font-size:8.5px] [font-weight:600] [letter-spacing:0.14em] [text-transform:uppercase] max-[760px]:[display:none]`}>Facility master</span>
          </span>
        </Link>

        <div className={`plan-heading [display:flex] [flex-direction:column] [align-items:center] [justify-self:center] [gap:2px] [min-width:0] [text-align:center] [&_h1]:[font-family:var(--font-instrument-serif),_Georgia,_"Times_New_Roman",_serif] [&_h1]:[font-size:23px] [&_h1]:[font-weight:400] [&_h1]:[line-height:1] [&_h1]:[letter-spacing:-0.01em]`}>
          <span className={`eyebrow [display:flex] [align-items:center] [gap:8px] [color:var(--muted)] [font-size:9px] [font-weight:700] [letter-spacing:0.145em] [text-transform:uppercase]`}>
            <span className={`eyebrow__dot [width:5px] [height:5px] [border-radius:50%] [background:#3c7a55] [box-shadow:0_0_0_3px_rgba(60,_122,_85,_0.1)]`} />
            Operations · Logistics master
          </span>
          <div className={`plan-heading__row [display:flex] [align-items:center] [gap:11px]`}>
            <h1>Facilities</h1>
          </div>
        </div>

        <div className={`plan-actions [display:flex] [align-items:center] [justify-self:end] [gap:9px] [min-width:0]`}>
          <ButtonLink href="/hotels" variant="ghost">
            Hotels
          </ButtonLink>
          <ButtonLink href="/vehicles" variant="ghost">
            Vehicles
          </ButtonLink>
          <ButtonLink href="/plan" variant="ghost">
            Plan canvas
          </ButtonLink>
          <Button variant="primary" onClick={openCreate}>
            <Plus size={14} />
            Add facility
          </Button>
        </div>
      </header>

      <main className={`hotels-main flex-1 min-h-0 overflow-auto pt-[22px] pr-[22px] pb-[22px] pl-[22px] bg-bone max-[760px]:pt-[12px] max-[760px]:pr-[12px] max-[760px]:pb-[12px] max-[760px]:pl-[12px]`}>
        <div className={`hotels-summary grid grid-cols-[repeat(6,_minmax(0,_1fr))] gap-[10px] mb-[16px] max-[1180px]:grid-cols-[repeat(3,_minmax(0,_1fr))] max-[760px]:grid-cols-[repeat(2,_minmax(0,_1fr))]`}>
          <SummaryCard label="Total facilities" value={totals.total} />
          <SummaryCard label="Active" value={totals.active} tone="daily" />
          <SummaryCard label="Warehouses" value={totals.warehouses} tone="day1" />
          <SummaryCard label="Laundries" value={totals.laundries} tone="day2" />
          <SummaryCard label="Dual Role (Both)" value={totals.both} />
        </div>

        <section className={`hotels-panel overflow-hidden [border:1px_solid_var(--line)] rounded-[12px] bg-paper`} aria-label="Facility master list">
          <div className={`hotels-toolbar flex items-center gap-[8px] flex-wrap pt-[12px] pr-[12px] pb-[12px] pl-[12px] [border-bottom:1px_solid_var(--line)] max-[760px]:items-stretch`}>
            <label className={`hotels-search flex flex-[1_1_260px] items-center gap-[6px] h-[32px] pt-0 pr-[9px] pb-0 pl-[9px] [border:1px_solid_var(--line)] rounded-[7px] bg-paper text-muted focus-within:border-line-strong focus-within:text-ink [&_input]:flex-1 [&_input]:min-w-0 [&_input]:[border:0] [&_input]:[outline:0] [&_input]:bg-transparent [&_input]:text-ink [&_input]:text-[10px] [&_input::placeholder]:text-faint max-[760px]:basis-full`}>
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
              className={`hotels-filter h-[32px] max-w-[230px] pt-0 pr-[8px] pb-0 pl-[8px] [border:1px_solid_var(--line)] rounded-[7px] [outline:none] bg-paper text-ink-soft text-[9.5px] focus:border-line-strong max-[760px]:flex-1 max-[760px]:max-w-[none]`}
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
              className={`hotels-filter h-[32px] max-w-[230px] pt-0 pr-[8px] pb-0 pl-[8px] [border:1px_solid_var(--line)] rounded-[7px] [outline:none] bg-paper text-ink-soft text-[9.5px] focus:border-line-strong max-[760px]:flex-1 max-[760px]:max-w-[none]`}
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

            <span className={`hotels-count text-[12px] font-semibold text-ink-soft ml-auto text-faint text-[9px] font-semibold tabular-nums whitespace-nowrap max-[760px]:w-full max-[760px]:ml-0`}>
              {filtered.length} of {facilities.length} facilities
            </span>
          </div>

          <div className={`hotels-table-wrap w-full overflow-auto`}>
            <table className={`hotels-table w-full min-w-[1060px] border-collapse [&_th]:sticky [&_th]:top-0 [&_th]:z-[1] [&_th]:pt-[9px] [&_th]:pr-[12px] [&_th]:pb-[9px] [&_th]:pl-[12px] [&_th]:[border-bottom:1px_solid_var(--line)] [&_th]:bg-paper-strong [&_th]:text-faint [&_th]:text-[7.5px] [&_th]:font-extrabold [&_th]:tracking-[0.09em] [&_th]:text-left [&_th]:uppercase [&_th]:whitespace-nowrap [&_td]:pt-[10px] [&_td]:pr-[12px] [&_td]:pb-[10px] [&_td]:pl-[12px] [&_td]:[border-bottom:1px_solid_var(--line)] [&_td]:text-ink-soft [&_td]:text-[9.5px] [&_td]:align-middle [&_tbody_tr:last-child_td]:[border-bottom:0] [&_tbody_tr:hover]:bg-bone facilities-table min-w-[900px]`}>
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

                  const roleVariant =
                    item.isWarehouse && item.isLaundry
                      ? "daily"
                      : item.isWarehouse
                        ? "day1"
                        : "day2";

                  return (
                    <tr
                      key={item.id}
                      className={item.isActive ? "" : `is-inactive [.hotels-table_tbody_&]:opacity-55`}
                    >
                      <td>
                        <div className={`hotels-name flex items-center gap-[7px] min-w-[180px] [&>svg]:flex-none [&>svg]:text-muted [&>span]:flex [&>span]:flex-col [&>span]:gap-[1px] [&>span]:min-w-0 [&_b]:overflow-hidden [&_b]:text-ink [&_b]:text-[10px] [&_b]:font-[650] [&_b]:tracking-[-0.005em] [&_b]:text-ellipsis [&_b]:whitespace-nowrap [&_small]:overflow-hidden [&_small]:text-faint [&_small]:font-mono [&_small]:text-[7.5px] [&_small]:text-ellipsis [&_small]:whitespace-nowrap`}>
                          <span>
                            <b>{item.name}</b>
                            <small>{item.id}</small>
                          </span>
                        </div>
                      </td>
                      <td>
                        <DayBadge variant={roleVariant}>{roleLabel}</DayBadge>
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
                      <td className={`hotels-address block max-w-[210px] overflow-hidden text-muted text-ellipsis whitespace-nowrap`}>
                        {item.address || "—"}
                      </td>
                      <td>
                        {item.isLaundry
                          ? `${item.serviceMins} min`
                          : "—"}
                      </td>
                      <td className={`hotels-coords inline-flex items-center gap-[4px] text-faint text-[8px] tabular-nums whitespace-nowrap`}>
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
                        <DayBadge variant={item.isActive ? "daily" : "day2"}>
                          {item.isActive ? "Active" : "Inactive"}
                        </DayBadge>
                      </td>
                      <td>
                        <div className={`hotels-row-actions flex justify-end gap-[3px]`}>
                          <button
                            type="button"
                            className={`hotels-icon-btn grid w-[26px] h-[26px] place-items-center [border:1px_solid_transparent] rounded-[6px] text-muted [transition:background_120ms_ease,_border-color_120ms_ease,_color_120ms_ease] [&:hover:not(:disabled)]:border-line [&:hover:not(:disabled)]:bg-bone [&:hover:not(:disabled)]:text-ink disabled:opacity-35`}
                            title="Edit facility"
                            onClick={() => openEdit(item)}
                            aria-label={`Edit ${item.name}`}
                          >
                            <Pencil size={14} />
                          </button>
                          <button
                            type="button"
                            className={`hotels-icon-btn grid w-[26px] h-[26px] place-items-center [border:1px_solid_transparent] rounded-[6px] text-muted [transition:background_120ms_ease,_border-color_120ms_ease,_color_120ms_ease] [&:hover:not(:disabled)]:border-line [&:hover:not(:disabled)]:bg-bone [&:hover:not(:disabled)]:text-ink disabled:opacity-35`}
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
                            className={`hotels-icon-btn grid w-[26px] h-[26px] place-items-center [border:1px_solid_transparent] rounded-[6px] text-muted [transition:background_120ms_ease,_border-color_120ms_ease,_color_120ms_ease] [&:hover:not(:disabled)]:border-line [&:hover:not(:disabled)]:bg-bone [&:hover:not(:disabled)]:text-ink disabled:opacity-35 hotels-icon-btn--danger [&:hover:not(:disabled)]:border-[#f2d2cc] [&:hover:not(:disabled)]:bg-[#fbeae6] [&:hover:not(:disabled)]:text-danger`}
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
          className={dialogBackdrop}
          onClick={closeEditor}
          role="presentation"
        >
          <div
            className={cn(dialog, dialogMedium)}
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
              style={{ padding: "24px 24px 0", flexShrink: 0 }}
            >
              <div>
                <span className={eyebrow}>
                  <span className={eyebrowDot} />
                  {editingId ? "Edit facility" : "New facility"}
                </span>
                <h2 id="facility-dialog-title">
                  {editingId ? "Update facility" : "Add facility"}
                </h2>
              </div>
              <button
                type="button"
                className={dialogClose}
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
                <div className={formErrorClass} role="alert">
                  {formError}
                </div>
              )}

              <div className={dialogGrid}>
                <Field label="Facility Name" required full>
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
                </Field>

                <Field label="Short Name / Badge" required>
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
                </Field>

                <div className={field}>
                  <span className={fieldLabel}>
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

                <label className={cn(field, dialogFull)}>
                  <span className={fieldLabel}>Full Address</span>
                  <div className={addressRow}>
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
                      className={addressRowButton}
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
                    className={cn(formErrorClass, dialogFull)}
                    role="alert"
                  >
                    {geocodeError}
                  </div>
                )}

                <label className={field}>
                  <span className={fieldLabel}>
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

                <label className={field}>
                  <span className={fieldLabel}>
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
                  <label className={field}>
                    <span className={fieldLabel}>
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

                <div className={field}>
                  <span className={fieldLabel}>Status</span>
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
                className={dialogActions}
                style={{ padding: "16px 24px", flexShrink: 0 }}
              >
                <Button variant="ghost" onClick={closeEditor} disabled={saving}>
                  Cancel
                </Button>
                <Button type="submit" variant="primary" disabled={saving}>
                  {saving
                    ? "Saving..."
                    : editingId
                      ? "Save changes"
                      : "Create facility"}
                </Button>
              </footer>
            </form>
          </div>
        </div>
      )}

      {notice && (
        <Notice kind={notice.kind}>
          {notice.kind === "success" ? <Check size={14} /> : <X size={14} />}
          <span>{notice.message}</span>
        </Notice>
      )}
    </div>
  );
}

