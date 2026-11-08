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
import { Button, ButtonLink } from "./ui/button";
import { DayBadge } from "./ui/badge";
import { SummaryCard } from "./ui/summary-card";
import { Notice } from "./ui/notice";
import { cn } from "./ui/cn";
import {
  addressHint,
  addressRow,
  addressRowButton,
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
            <span className={`brand-sub [color:var(--faint)] [font-size:8.5px] [font-weight:600] [letter-spacing:0.14em] [text-transform:uppercase] max-[760px]:[display:none]`}>Hotel dashboard</span>
          </span>
        </Link>

        <div className={`plan-heading [display:flex] [flex-direction:column] [align-items:center] [justify-self:center] [gap:2px] [min-width:0] [text-align:center] [&_h1]:[font-family:var(--font-instrument-serif),_Georgia,_"Times_New_Roman",_serif] [&_h1]:[font-size:23px] [&_h1]:[font-weight:400] [&_h1]:[line-height:1] [&_h1]:[letter-spacing:-0.01em]`}>
          <span className={`eyebrow [display:flex] [align-items:center] [gap:8px] [color:var(--muted)] [font-size:9px] [font-weight:700] [letter-spacing:0.145em] [text-transform:uppercase]`}>
            <span className={`eyebrow__dot [width:5px] [height:5px] [border-radius:50%] [background:#3c7a55] [box-shadow:0_0_0_3px_rgba(60,_122,_85,_0.1)]`} />
            Operations · Hotel master
          </span>
          <div className={`plan-heading__row [display:flex] [align-items:center] [gap:11px]`}>
            <h1>Hotels</h1>
          </div>
        </div>

        <div className={`plan-actions [display:flex] [align-items:center] [justify-self:end] [gap:9px] [min-width:0]`}>
          <ButtonLink href="/facilities" variant="ghost">
            Facilities
          </ButtonLink>
          <ButtonLink href="/vehicles" variant="ghost">
            Vehicles
          </ButtonLink>
          <ButtonLink href="/plan" variant="ghost">
            Plan canvas
          </ButtonLink>
          <Button variant="primary" onClick={openCreate}>
            <Plus size={14} />
            Add hotel
          </Button>
        </div>
      </header>

      <main className={`hotels-main flex-1 min-h-0 overflow-auto pt-[22px] pr-[22px] pb-[22px] pl-[22px] bg-bone max-[760px]:pt-[12px] max-[760px]:pr-[12px] max-[760px]:pb-[12px] max-[760px]:pl-[12px]`}>
        <div className={`hotels-summary grid grid-cols-[repeat(6,_minmax(0,_1fr))] gap-[10px] mb-[16px] max-[1180px]:grid-cols-[repeat(3,_minmax(0,_1fr))] max-[760px]:grid-cols-[repeat(2,_minmax(0,_1fr))]`}>
          <SummaryCard label="Total hotels" value={totals.total} />
          <SummaryCard label="Daily" value={totals.daily} tone="daily" />
          <SummaryCard label="Day 1" value={totals.day1} tone="day1" />
          <SummaryCard label="Day 2" value={totals.day2} tone="day2" />
          <SummaryCard label="Total bags" value={totals.bags} />
          <SummaryCard label="Total rooms" value={totals.rooms} />
        </div>

        <section className={`hotels-panel overflow-hidden [border:1px_solid_var(--line)] rounded-[12px] bg-paper`} aria-label="Hotel master list">
          <div className={`hotels-toolbar flex items-center gap-[8px] flex-wrap pt-[12px] pr-[12px] pb-[12px] pl-[12px] [border-bottom:1px_solid_var(--line)] max-[760px]:items-stretch`}>
            <label className={`hotels-search flex flex-[1_1_260px] items-center gap-[6px] h-[32px] pt-0 pr-[9px] pb-0 pl-[9px] [border:1px_solid_var(--line)] rounded-[7px] bg-paper text-muted focus-within:border-line-strong focus-within:text-ink [&_input]:flex-1 [&_input]:min-w-0 [&_input]:[border:0] [&_input]:[outline:0] [&_input]:bg-transparent [&_input]:text-ink [&_input]:text-[10px] [&_input::placeholder]:text-faint max-[760px]:basis-full`}>
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
              className={`hotels-filter h-[32px] max-w-[230px] pt-0 pr-[8px] pb-0 pl-[8px] [border:1px_solid_var(--line)] rounded-[7px] [outline:none] bg-paper text-ink-soft text-[9.5px] focus:border-line-strong max-[760px]:flex-1 max-[760px]:max-w-[none]`}
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
              className={`hotels-filter h-[32px] max-w-[230px] pt-0 pr-[8px] pb-0 pl-[8px] [border:1px_solid_var(--line)] rounded-[7px] [outline:none] bg-paper text-ink-soft text-[9.5px] focus:border-line-strong max-[760px]:flex-1 max-[760px]:max-w-[none]`}
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

            <span className={`hotels-count text-[12px] font-semibold text-ink-soft ml-auto text-faint text-[9px] font-semibold tabular-nums whitespace-nowrap max-[760px]:w-full max-[760px]:ml-0`}>
              {filteredHotels.length} of {hotels.length}
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
                  <th>Hotel</th>
                  <th>Region</th>
                  <th>Address</th>
                  <th>Day</th>
                  <th className={`is-number [.hotels-table_&]:text-right [.hotels-table_&]:tabular-nums`}>Stop</th>
                  <th className={`is-number [.hotels-table_&]:text-right [.hotels-table_&]:tabular-nums`} title="Daily / alternate-day bags">
                    Bags (D / A)
                  </th>
                  <th className={`is-number [.hotels-table_&]:text-right [.hotels-table_&]:tabular-nums`}>Rooms</th>
                  <th>Coordinates</th>
                  <th aria-label="Actions" />
                </tr>
              </thead>
              <tbody>
                {filteredHotels.map((hotel) => (
                  <tr key={hotel.id}>
                    <td>
                      <div className={`hotels-name flex items-center gap-[7px] min-w-[180px] [&>svg]:flex-none [&>svg]:text-muted [&>span]:flex [&>span]:flex-col [&>span]:gap-[1px] [&>span]:min-w-0 [&_b]:overflow-hidden [&_b]:text-ink [&_b]:text-[10px] [&_b]:font-[650] [&_b]:tracking-[-0.005em] [&_b]:text-ellipsis [&_b]:whitespace-nowrap [&_small]:overflow-hidden [&_small]:text-faint [&_small]:font-mono [&_small]:text-[7.5px] [&_small]:text-ellipsis [&_small]:whitespace-nowrap`}>
                        <Hotel size={14} />
                        <span>
                          <b>{hotel.name}</b>
                          <small>{hotel.id}</small>
                        </span>
                      </div>
                    </td>
                    <td>
                      <span className={`hotels-region block max-w-[190px] overflow-hidden text-ink-soft text-ellipsis whitespace-nowrap`}>{hotel.regionName}</span>
                    </td>
                    <td>
                      {hotel.address ? (
                        <span className={`hotels-address block max-w-[210px] overflow-hidden text-muted text-ellipsis whitespace-nowrap`} title={hotel.address}>
                          {hotel.address}
                        </span>
                      ) : (
                        <span className={`hotels-muted text-faint`}>—</span>
                      )}
                    </td>
                    <td>
                      <DayBadge variant={hotel.dayPlan}>
                        {DAY_LABELS[hotel.dayPlan]}
                      </DayBadge>
                    </td>
                    <td className={`is-number [.hotels-table_&]:text-right [.hotels-table_&]:tabular-nums`}>{hotel.stopMins}</td>
                    <td className={`is-number [.hotels-table_&]:text-right [.hotels-table_&]:tabular-nums`}>
                      {hotel.loadBags} / {hotel.alternateLoadBags}
                    </td>
                    <td className={`is-number [.hotels-table_&]:text-right [.hotels-table_&]:tabular-nums`}>{hotel.rooms}</td>
                    <td>
                      <span className={`hotels-coords inline-flex items-center gap-[4px] text-faint text-[8px] tabular-nums whitespace-nowrap`}>
                        <MapPin size={11} />
                        {hotel.latitude.toFixed(4)},{" "}
                        {hotel.longitude.toFixed(4)}
                      </span>
                    </td>
                    <td>
                      <div className={`hotels-row-actions flex justify-end gap-[3px]`}>
                        <button
                          type="button"
                          className={`hotels-icon-btn grid w-[26px] h-[26px] place-items-center [border:1px_solid_transparent] rounded-[6px] text-muted [transition:background_120ms_ease,_border-color_120ms_ease,_color_120ms_ease] [&:hover:not(:disabled)]:border-line [&:hover:not(:disabled)]:bg-bone [&:hover:not(:disabled)]:text-ink disabled:opacity-35`}
                          onClick={() => openEdit(hotel)}
                          title={`Edit ${hotel.name}`}
                          aria-label={`Edit ${hotel.name}`}
                        >
                          <Pencil size={13} />
                        </button>
                        <button
                          type="button"
                          className={`hotels-icon-btn grid w-[26px] h-[26px] place-items-center [border:1px_solid_transparent] rounded-[6px] text-muted [transition:background_120ms_ease,_border-color_120ms_ease,_color_120ms_ease] [&:hover:not(:disabled)]:border-line [&:hover:not(:disabled)]:bg-bone [&:hover:not(:disabled)]:text-ink disabled:opacity-35 hotels-icon-btn--danger [&:hover:not(:disabled)]:border-[#f2d2cc] [&:hover:not(:disabled)]:bg-[#fbeae6] [&:hover:not(:disabled)]:text-danger`}
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
            <div className={`hotels-empty flex flex-col items-center gap-[7px] pt-[42px] pr-[20px] pb-[42px] pl-[20px] text-faint text-center [&_p]:text-muted [&_p]:text-[11px] [&_button]:mt-[3px] [&_button]:text-green [&_button]:text-[9.5px] [&_button]:font-bold [&_button]:underline [&_button]:underline-offset-2 flex flex-col items-center gap-[4px] pt-[48px] pr-[16px] pb-[48px] pl-[16px] text-faint text-center [&_b]:text-ink-soft [&_b]:text-[11px] [&_span]:text-[9px]`}>
              <Search size={18} />
              <b>No hotels match this filter</b>
              <span>Try a different search, region or day.</span>
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
            aria-labelledby="hotel-dialog-title"
            onSubmit={saveHotel}
          >
            <button
              type="button"
              className={dialogClose}
              onClick={closeEditor}
              aria-label="Close hotel dialog"
            >
              <X size={16} />
            </button>

            <span className={dialogEyebrow}>
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

            <label className={dialogField}>
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

            <label className={dialogField}>
              <span>Address</span>
              <div className={addressRow}>
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
                  className={addressRowButton}
                  onClick={() => void lookupCoordinates()}
                  disabled={geocoding || !form.address.trim()}
                >
                  <MapPin size={13} />
                  {geocoding ? "Finding…" : "Find coordinates"}
                </button>
              </div>
              <small className={addressHint}>
                Enter the full address and let Google fill the coordinates.
              </small>
            </label>

            {geocodeError && (
              <div className={formErrorClass}>
                <MapPin size={13} />
                {geocodeError}
              </div>
            )}

            <div className={dialogGrid}>
              <label className={dialogField}>
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

              <label className={dialogField}>
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

              <label className={dialogField}>
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

              <label className={dialogField}>
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

              <label className={dialogField}>
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

              <label className={dialogField}>
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

              <label className={dialogField}>
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

              <label className={dialogField}>
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
                {saving ? "Saving…" : editingId ? "Save changes" : "Add hotel"}
              </Button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
