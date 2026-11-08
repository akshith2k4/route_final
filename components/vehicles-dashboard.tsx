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
import { Button, ButtonLink } from "./ui/button";
import { DayBadge } from "./ui/badge";
import { SummaryCard } from "./ui/summary-card";
import { Notice } from "./ui/notice";
import { cn } from "./ui/cn";
import {
  dialog,
  dialogActions,
  dialogBackdrop,
  dialogClose,
  dialogEyebrow,
  dialogField,
  dialogGrid,
  dialogMedium,
  formError as formErrorClass,
} from "./ui/plan-styles";

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
            <span className={`brand-sub [color:var(--faint)] [font-size:8.5px] [font-weight:600] [letter-spacing:0.14em] [text-transform:uppercase] max-[760px]:[display:none]`}>Vehicle dashboard</span>
          </span>
        </Link>

        <div className={`plan-heading [display:flex] [flex-direction:column] [align-items:center] [justify-self:center] [gap:2px] [min-width:0] [text-align:center] [&_h1]:[font-family:var(--font-instrument-serif),_Georgia,_"Times_New_Roman",_serif] [&_h1]:[font-size:23px] [&_h1]:[font-weight:400] [&_h1]:[line-height:1] [&_h1]:[letter-spacing:-0.01em]`}>
          <span className={`eyebrow [display:flex] [align-items:center] [gap:8px] [color:var(--muted)] [font-size:9px] [font-weight:700] [letter-spacing:0.145em] [text-transform:uppercase]`}>
            <span className={`eyebrow__dot [width:5px] [height:5px] [border-radius:50%] [background:#3c7a55] [box-shadow:0_0_0_3px_rgba(60,_122,_85,_0.1)]`} />
            Operations · Fleet master
          </span>
          <div className={`plan-heading__row [display:flex] [align-items:center] [gap:11px]`}>
            <h1>Vehicles</h1>
          </div>
        </div>

        <div className={`plan-actions [display:flex] [align-items:center] [justify-self:end] [gap:9px] [min-width:0]`}>
          <ButtonLink href="/facilities" variant="ghost">
            Facilities
          </ButtonLink>
          <ButtonLink href="/hotels" variant="ghost">
            Hotels
          </ButtonLink>
          <ButtonLink href="/plan" variant="ghost">
            Plan canvas
          </ButtonLink>
          <Button variant="primary" onClick={openCreate}>
            <Plus size={14} />
            Add vehicle
          </Button>
        </div>
      </header>

      <main className={`hotels-main flex-1 min-h-0 overflow-auto pt-[22px] pr-[22px] pb-[22px] pl-[22px] bg-bone max-[760px]:pt-[12px] max-[760px]:pr-[12px] max-[760px]:pb-[12px] max-[760px]:pl-[12px]`}>
        <div className={`hotels-summary grid grid-cols-[repeat(6,_minmax(0,_1fr))] gap-[10px] mb-[16px] max-[1180px]:grid-cols-[repeat(3,_minmax(0,_1fr))] max-[760px]:grid-cols-[repeat(2,_minmax(0,_1fr))]`}>
          <SummaryCard label="Total vehicles" value={totals.total} />
          <SummaryCard label="Active" value={totals.active} tone="daily" />
          <SummaryCard label="Real capacity" value={totals.real} />
          <SummaryCard label="Safe capacity" value={totals.safe} tone="day1" />
          <SummaryCard
            label="Regions"
            tone="day2"
            value={
              new Set(
                vehicles
                  .map((vehicle) => vehicle.regionName)
                  .filter(Boolean),
              ).size
            }
          />
        </div>

        <section className={`hotels-panel overflow-hidden [border:1px_solid_var(--line)] rounded-[12px] bg-paper`} aria-label="Vehicle master list">
          <div className={`hotels-toolbar flex items-center gap-[8px] flex-wrap pt-[12px] pr-[12px] pb-[12px] pl-[12px] [border-bottom:1px_solid_var(--line)] max-[760px]:items-stretch`}>
            <label className={`hotels-search flex flex-[1_1_260px] items-center gap-[6px] h-[32px] pt-0 pr-[9px] pb-0 pl-[9px] [border:1px_solid_var(--line)] rounded-[7px] bg-paper text-muted focus-within:border-line-strong focus-within:text-ink [&_input]:flex-1 [&_input]:min-w-0 [&_input]:[border:0] [&_input]:[outline:0] [&_input]:bg-transparent [&_input]:text-ink [&_input]:text-[10px] [&_input::placeholder]:text-faint max-[760px]:basis-full`}>
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

            <select
              className={`hotels-filter h-[32px] max-w-[230px] pt-0 pr-[8px] pb-0 pl-[8px] [border:1px_solid_var(--line)] rounded-[7px] [outline:none] bg-paper text-ink-soft text-[9.5px] focus:border-line-strong max-[760px]:flex-1 max-[760px]:max-w-[none]`}
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

            <span className={`hotels-count text-[12px] font-semibold text-ink-soft ml-auto text-faint text-[9px] font-semibold tabular-nums whitespace-nowrap max-[760px]:w-full max-[760px]:ml-0`}>
              {filteredVehicles.length} of {vehicles.length}
            </span>
          </div>

          {notice && (
            <Notice kind={notice.tone}>
              {notice.tone === "success" ? (
                <Check size={13} />
              ) : (
                <X size={13} />
              )}
              <span>{notice.message}</span>
            </Notice>
          )}

          <div className={`hotels-table-wrap w-full overflow-auto`}>
            <table className={`hotels-table w-full min-w-[1060px] border-collapse [&_th]:sticky [&_th]:top-0 [&_th]:z-[1] [&_th]:pt-[9px] [&_th]:pr-[12px] [&_th]:pb-[9px] [&_th]:pl-[12px] [&_th]:[border-bottom:1px_solid_var(--line)] [&_th]:bg-paper-strong [&_th]:text-faint [&_th]:text-[7.5px] [&_th]:font-extrabold [&_th]:tracking-[0.09em] [&_th]:text-left [&_th]:uppercase [&_th]:whitespace-nowrap [&_td]:pt-[10px] [&_td]:pr-[12px] [&_td]:pb-[10px] [&_td]:pl-[12px] [&_td]:[border-bottom:1px_solid_var(--line)] [&_td]:text-ink-soft [&_td]:text-[9.5px] [&_td]:align-middle [&_tbody_tr:last-child_td]:[border-bottom:0] [&_tbody_tr:hover]:bg-bone`}>
              <thead>
                <tr>
                  <th>Vehicle</th>
                  <th>Region / sector</th>
                  <th className={`is-number [.hotels-table_&]:text-right [.hotels-table_&]:tabular-nums`}>Real cap</th>
                  <th className={`is-number [.hotels-table_&]:text-right [.hotels-table_&]:tabular-nums`}>Safe cap</th>
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
                      <div className={`hotels-name flex items-center gap-[7px] min-w-[180px] [&>svg]:flex-none [&>svg]:text-muted [&>span]:flex [&>span]:flex-col [&>span]:gap-[1px] [&>span]:min-w-0 [&_b]:overflow-hidden [&_b]:text-ink [&_b]:text-[10px] [&_b]:font-[650] [&_b]:tracking-[-0.005em] [&_b]:text-ellipsis [&_b]:whitespace-nowrap [&_small]:overflow-hidden [&_small]:text-faint [&_small]:font-mono [&_small]:text-[7.5px] [&_small]:text-ellipsis [&_small]:whitespace-nowrap`}>
                        <Truck size={14} />
                        <span>
                          <b>{vehicle.name}</b>
                          <small>{vehicle.id}</small>
                        </span>
                      </div>
                    </td>
                    <td>
                      <span className={`hotels-region block max-w-[190px] overflow-hidden text-ink-soft text-ellipsis whitespace-nowrap`}>
                        {vehicle.regionName ?? "Unassigned"}
                        {vehicle.sector ? ` · ${vehicle.sector}` : ""}
                      </span>
                    </td>
                    <td className={`is-number [.hotels-table_&]:text-right [.hotels-table_&]:tabular-nums`}>{vehicle.realCapacity}</td>
                    <td className={`is-number [.hotels-table_&]:text-right [.hotels-table_&]:tabular-nums`}>{vehicle.safeCapacity}</td>
                    <td>
                      <span className={`hotels-region block max-w-[190px] overflow-hidden text-ink-soft text-ellipsis whitespace-nowrap`}>
                        {allDepots.find((depot) => depot.id === vehicle.depotId)
                          ?.name ?? vehicle.depotId}
                      </span>
                    </td>
                    <td>
                      <span className={`hotels-coords inline-flex items-center gap-[4px] text-faint text-[8px] tabular-nums whitespace-nowrap`}>
                        {vehicle.departureTime}–{vehicle.returnTime}
                      </span>
                    </td>
                    <td>
                      <DayBadge variant={vehicle.isActive ? "daily" : "day2"}>
                        {vehicle.isActive ? "Active" : "Inactive"}
                      </DayBadge>
                    </td>
                    <td>
                      <div className={`hotels-row-actions flex justify-end gap-[3px]`}>
                        <span
                          className={`vehicles-color w-[10px] h-[10px] flex-none self-center rounded-[50%] [box-shadow:0_0_0_2px_var(--paper),_0_0_0_3px_var(--line)]`}
                          style={{ background: vehicle.color }}
                          title={vehicle.color}
                        />
                        <button
                          type="button"
                          className={`hotels-icon-btn grid w-[26px] h-[26px] place-items-center [border:1px_solid_transparent] rounded-[6px] text-muted [transition:background_120ms_ease,_border-color_120ms_ease,_color_120ms_ease] [&:hover:not(:disabled)]:border-line [&:hover:not(:disabled)]:bg-bone [&:hover:not(:disabled)]:text-ink disabled:opacity-35`}
                          onClick={() => openEdit(vehicle)}
                          title={`Edit ${vehicle.name}`}
                          aria-label={`Edit ${vehicle.name}`}
                        >
                          <Pencil size={13} />
                        </button>
                        <button
                          type="button"
                          className={`hotels-icon-btn grid w-[26px] h-[26px] place-items-center [border:1px_solid_transparent] rounded-[6px] text-muted [transition:background_120ms_ease,_border-color_120ms_ease,_color_120ms_ease] [&:hover:not(:disabled)]:border-line [&:hover:not(:disabled)]:bg-bone [&:hover:not(:disabled)]:text-ink disabled:opacity-35 hotels-icon-btn--danger [&:hover:not(:disabled)]:border-[#f2d2cc] [&:hover:not(:disabled)]:bg-[#fbeae6] [&:hover:not(:disabled)]:text-danger`}
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
            <div className={`hotels-empty flex flex-col items-center gap-[7px] pt-[42px] pr-[20px] pb-[42px] pl-[20px] text-faint text-center [&_p]:text-muted [&_p]:text-[11px] [&_button]:mt-[3px] [&_button]:text-green [&_button]:text-[9.5px] [&_button]:font-bold [&_button]:underline [&_button]:underline-offset-2 flex flex-col items-center gap-[4px] pt-[48px] pr-[16px] pb-[48px] pl-[16px] text-faint text-center [&_b]:text-ink-soft [&_b]:text-[11px] [&_span]:text-[9px]`}>
              <Search size={18} />
              <b>No vehicles match this filter</b>
              <span>Try a different search, region or status.</span>
            </div>
          )}
        </section>
      </main>

      {editorOpen && (
        <div
          className={dialogBackdrop}
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) closeEditor();
          }}
        >
          <form
            className={cn(dialog, dialogMedium)}
            role="dialog"
            aria-modal="true"
            aria-labelledby="vehicle-dialog-title"
            onSubmit={saveVehicle}
          >
            <button
              type="button"
              className={dialogClose}
              onClick={closeEditor}
              aria-label="Close vehicle dialog"
            >
              <X size={16} />
            </button>

            <span className={dialogEyebrow}>
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

            <label className={dialogField}>
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

            <div className={dialogGrid}>
              <label className={dialogField}>
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

              <label className={dialogField}>
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

              <label className={dialogField}>
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

              <label className={dialogField}>
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

              <label className={dialogField}>
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

              <label className={dialogField}>
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

              <label className={dialogField}>
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

              <label className={`hotels-check flex items-center gap-[6px] self-end h-[33px] text-ink-soft text-[10px] font-semibold [&_input]:w-[14px] [&_input]:h-[14px] [&_input]:accent-ink`}>
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
              <div className={formErrorClass}>
                <X size={13} />
                {formError}
              </div>
            )}

            <div className={dialogActions}>
              <Button variant="ghost" onClick={closeEditor} disabled={saving}>
                Cancel
              </Button>
              <Button type="submit" variant="primary" disabled={saving}>
                {saving
                  ? "Saving…"
                  : editingId
                    ? "Save changes"
                    : "Add vehicle"}
              </Button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
