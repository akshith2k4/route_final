"use client";

import { useState, type ReactNode } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  ChevronDown,
  ChevronUp,
  Download,
  Eye,
  EyeOff,
  Hotel,
  Layers,
  MapPin,
  Plus,
  RefreshCw,
  Save,
  Sparkles,
  Trash2,
  Truck,
} from "lucide-react";
import RegionMapEditor from "./region-map-editor";
import CenterPickerMap from "./center-picker-map";
import {
  DELHI_BASICS,
  REGION_COLOR_PALETTE,
  TIMEZONE_OPTIONS,
  delhiStarterRegions,
  nextRegionId,
  toCityConfigJson,
  toDraftCityInput,
  type CityBasicsDraft,
  type RegionDraft,
} from "../../lib/city-presets";

const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

function slugify(value: string): string {
  return value
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-{2,}/g, "-")
    .slice(0, 40);
}

const STEP_LABELS = ["Basics", "Regions", "Review & save"];
const FUTURE_STEPS = [
  { label: "Hotels", icon: Hotel },
  { label: "Fleet", icon: Truck },
  { label: "Generate & publish", icon: Sparkles },
];

export default function CityWizard() {
  const [step, setStep] = useState(0);
  const [basics, setBasics] = useState<CityBasicsDraft>({ ...DELHI_BASICS });
  const [regions, setRegions] = useState<RegionDraft[]>(() => delhiStarterRegions());
  const [selectedRegionId, setSelectedRegionId] = useState<string | null>(null);
  const [showTerritories, setShowTerritories] = useState(true);
  const [slugTouched, setSlugTouched] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [savedSlug, setSavedSlug] = useState<string | null>(null);

  const basicsValid =
    basics.name.trim().length >= 2 &&
    SLUG_PATTERN.test(basics.slug) &&
    Number.isFinite(basics.center.lat) &&
    Number.isFinite(basics.center.lon);
  const regionsValid =
    regions.length >= 1 && regions.every((region) => region.name.trim().length > 0);

  function updateBasics(patch: Partial<CityBasicsDraft>) {
    setBasics((current) => {
      const next = { ...current, ...patch };
      if (patch.name !== undefined && !slugTouched) {
        next.slug = slugify(patch.name);
      }
      return next;
    });
  }

  function addRegion(lat?: number, lon?: number) {
    const index = regions.length;
    const offset = 0.015 * (index + 1);
    const region: RegionDraft = {
      id: nextRegionId(),
      name: `Region ${index + 1}`,
      short_name: `Region ${index + 1}`,
      map_label: `Region ${index + 1}`,
      color: REGION_COLOR_PALETTE[index % REGION_COLOR_PALETTE.length],
      center: {
        lat: lat ?? basics.center.lat + offset,
        lon: lon ?? basics.center.lon + offset,
      },
    };
    setRegions((current) => [...current, region]);
    setSelectedRegionId(region.id);
  }

  function updateRegion(id: string, patch: Partial<RegionDraft>) {
    setRegions((current) =>
      current.map((region) => (region.id === id ? { ...region, ...patch } : region)),
    );
  }

  function moveRegion(id: string, lat: number, lon: number) {
    updateRegion(id, { center: { lat, lon } });
  }

  function removeRegion(id: string) {
    setRegions((current) => current.filter((region) => region.id !== id));
    if (selectedRegionId === id) setSelectedRegionId(null);
  }

  function reorderRegion(id: string, direction: -1 | 1) {
    setRegions((current) => {
      const index = current.findIndex((region) => region.id === id);
      const target = index + direction;
      if (index < 0 || target < 0 || target >= current.length) return current;
      const next = [...current];
      const [item] = next.splice(index, 1);
      next.splice(target, 0, item);
      return next;
    });
  }

  function resetStarterRegions() {
    const fresh = delhiStarterRegions();
    setRegions(fresh);
    setSelectedRegionId(fresh[0]?.id ?? null);
  }

  async function saveDraft() {
    setSaving(true);
    setSaveError(null);
    try {
      const response = await fetch("/api/admin/cities", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(toDraftCityInput(basics, regions)),
      });
      const data = await response.json();
      if (!response.ok) {
        setSaveError(data.error ?? "Could not save the draft city.");
        return;
      }
      setSavedSlug(data.city.id);
    } catch {
      setSaveError("Network error — the draft was not saved.");
    } finally {
      setSaving(false);
    }
  }

  function downloadConfig() {
    const config = toCityConfigJson(basics, regions);
    const blob = new Blob([JSON.stringify(config, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `${basics.slug || "city"}.city.config.json`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }

  const canContinue = step === 0 ? basicsValid : step === 1 ? regionsValid : true;

  return (
    <div className="flex min-h-[100svh] flex-col bg-bone">
      {/* Top bar */}
      <header className="sticky top-0 z-40 flex h-[62px] shrink-0 items-center justify-between gap-4 border-b border-line bg-[#f7f3eb]/95 px-5 backdrop-blur-md">
        <Link href="/admin" className="flex min-w-0 items-center gap-2.5">
          <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-ink text-cream">
            <MapPin size={15} />
          </span>
          <span className="flex flex-col leading-tight">
            <span className="text-[15px] font-semibold tracking-tight text-ink">
              LinenGrass
            </span>
            <span className="text-[8.5px] font-semibold uppercase tracking-[0.14em] text-faint">
              Admin · City onboarding
            </span>
          </span>
        </Link>
        <div className="flex items-center gap-3">
          <span className="hidden rounded-full border border-line-strong bg-paper px-2.5 py-1 text-[9px] font-bold uppercase tracking-[0.1em] text-muted sm:inline">
            Prototype · Basics + Regions
          </span>
          <Link
            href="/admin"
            className="rounded-lg border border-line-strong px-3 py-1.5 text-[11px] font-semibold text-ink-soft transition-colors hover:bg-bone"
          >
            All cities
          </Link>
        </div>
      </header>

      {/* Stepper */}
      <div className="mx-auto w-full max-w-[1240px] px-5 pt-5">
        <ol className="flex flex-wrap items-center gap-2">
          {STEP_LABELS.map((label, index) => {
            const isActive = step === index;
            const isDone = step > index;
            return (
              <li key={label} className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => index < step && setStep(index)}
                  disabled={index > step}
                  className={`flex items-center gap-2 rounded-full border px-3 py-1.5 text-[11px] font-semibold transition-colors ${
                    isActive
                      ? "border-ink bg-ink text-cream"
                      : isDone
                        ? "border-line-strong bg-paper text-ink hover:bg-bone"
                        : "border-line bg-paper text-faint"
                  }`}
                >
                  <span
                    className={`grid h-4.5 w-4.5 place-items-center rounded-full text-[9px] font-bold ${
                      isActive ? "bg-cream text-ink" : isDone ? "bg-green text-cream" : "bg-bone text-faint"
                    }`}
                  >
                    {isDone ? <Check size={10} /> : index + 1}
                  </span>
                  {label}
                </button>
                {index < STEP_LABELS.length - 1 && (
                  <span className="h-px w-4 bg-line-strong" aria-hidden="true" />
                )}
              </li>
            );
          })}
          {FUTURE_STEPS.map(({ label, icon: Icon }, index) => (
            <li key={label} className="flex items-center gap-2">
              {index === 0 && <span className="h-px w-4 bg-line-strong" aria-hidden="true" />}
              <span
                className="flex items-center gap-2 rounded-full border border-dashed border-line px-3 py-1.5 text-[11px] font-semibold text-faint"
                title="Arrives in the next phase of the onboarding build"
              >
                <Icon size={12} />
                {label}
                <span className="rounded bg-bone px-1.5 py-0.5 text-[8px] font-bold uppercase tracking-[0.08em] text-faint">
                  Next phase
                </span>
              </span>
              {index < FUTURE_STEPS.length - 1 && (
                <span className="h-px w-4 bg-line-strong" aria-hidden="true" />
              )}
            </li>
          ))}
        </ol>
      </div>

      {/* Step content */}
      <main className="mx-auto w-full max-w-[1240px] flex-1 px-5 py-5">
        {step === 0 && (
          <div className="grid gap-5 lg:grid-cols-[minmax(0,420px)_minmax(0,1fr)]">
            <section className="rounded-2xl border border-line bg-paper p-5">
              <p className="text-[9px] font-bold uppercase tracking-[0.145em] text-muted">
                Step 1 · City basics
              </p>
              <h1 className="mt-1 font-serif text-[28px] leading-none text-ink">
                Name the city
              </h1>
              <p className="mt-2 text-[12px] leading-relaxed text-muted">
                Loaded with the Delhi preset. Rename it, move the centre pin, or
                start typing a different city — everything stays editable.
              </p>

              <div className="mt-4 flex flex-col gap-3.5">
                <Field label="City name">
                  <input
                    className={inputClass}
                    value={basics.name}
                    onChange={(event) => updateBasics({ name: event.target.value })}
                    placeholder="e.g. Delhi"
                  />
                </Field>
                <Field label="Display name (optional)">
                  <input
                    className={inputClass}
                    value={basics.display_name}
                    onChange={(event) => updateBasics({ display_name: event.target.value })}
                    placeholder="e.g. Delhi NCR"
                  />
                </Field>
                <Field label="URL slug">
                  <div className="flex items-center gap-1.5">
                    <span className="text-[12px] font-semibold text-faint">/</span>
                    <input
                      className={inputClass}
                      value={basics.slug}
                      onChange={(event) => {
                        setSlugTouched(true);
                        updateBasics({ slug: slugify(event.target.value) });
                      }}
                      placeholder="delhi"
                    />
                  </div>
                </Field>
                <Field label="Timezone">
                  <select
                    className={inputClass}
                    value={basics.timezone}
                    onChange={(event) => updateBasics({ timezone: event.target.value })}
                  >
                    {TIMEZONE_OPTIONS.map((zone) => (
                      <option key={zone} value={zone}>
                        {zone}
                      </option>
                    ))}
                  </select>
                </Field>

                <div className="grid grid-cols-2 gap-3">
                  <Field label="Centre latitude">
                    <input
                      className={inputClass}
                      type="number"
                      step="0.0001"
                      value={basics.center.lat}
                      onChange={(event) =>
                        updateBasics({
                          center: { ...basics.center, lat: Number(event.target.value) },
                        })
                      }
                    />
                  </Field>
                  <Field label="Centre longitude">
                    <input
                      className={inputClass}
                      type="number"
                      step="0.0001"
                      value={basics.center.lon}
                      onChange={(event) =>
                        updateBasics({
                          center: { ...basics.center, lon: Number(event.target.value) },
                        })
                      }
                    />
                  </Field>
                </div>

                <details className="rounded-xl border border-line bg-bone/60 px-3.5 py-2.5">
                  <summary className="cursor-pointer text-[11px] font-semibold text-ink-soft">
                    Advanced defaults (zoom, H3, road estimates)
                  </summary>
                  <div className="mt-3 grid grid-cols-2 gap-3">
                    <Field label="Default zoom">
                      <input
                        className={inputClass}
                        type="number"
                        value={basics.default_zoom}
                        onChange={(event) => updateBasics({ default_zoom: Number(event.target.value) })}
                      />
                    </Field>
                    <Field label="Min zoom">
                      <input
                        className={inputClass}
                        type="number"
                        value={basics.min_zoom}
                        onChange={(event) => updateBasics({ min_zoom: Number(event.target.value) })}
                      />
                    </Field>
                    <Field label="Max zoom">
                      <input
                        className={inputClass}
                        type="number"
                        value={basics.max_zoom}
                        onChange={(event) => updateBasics({ max_zoom: Number(event.target.value) })}
                      />
                    </Field>
                    <Field label="H3 resolution">
                      <input
                        className={inputClass}
                        type="number"
                        value={basics.h3_resolution}
                        onChange={(event) => updateBasics({ h3_resolution: Number(event.target.value) })}
                      />
                    </Field>
                    <Field label="Fallback speed (km/h)">
                      <input
                        className={inputClass}
                        type="number"
                        value={basics.fallback_speed_kmh}
                        onChange={(event) => updateBasics({ fallback_speed_kmh: Number(event.target.value) })}
                      />
                    </Field>
                    <Field label="Road factor">
                      <input
                        className={inputClass}
                        type="number"
                        step="0.05"
                        value={basics.road_factor}
                        onChange={(event) => updateBasics({ road_factor: Number(event.target.value) })}
                      />
                    </Field>
                  </div>
                </details>
              </div>
            </section>

            <section className="flex min-h-[420px] flex-col gap-2">
              <div className="flex items-center justify-between">
                <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-muted">
                  City centre — click or drag the pin
                </p>
                <p className="font-mono text-[10.5px] text-faint">
                  {basics.center.lat.toFixed(4)}, {basics.center.lon.toFixed(4)}
                </p>
              </div>
              <div className="min-h-[380px] flex-1">
                <CenterPickerMap
                  center={basics.center}
                  zoom={basics.default_zoom}
                  onChange={(lat, lon) => updateBasics({ center: { lat, lon } })}
                />
              </div>
            </section>
          </div>
        )}

        {step === 1 && (
          <div className="grid gap-4 lg:grid-cols-[340px_minmax(0,1fr)]">
            {/* Region sidebar */}
            <section className="flex max-h-[calc(100svh-230px)] min-h-[480px] flex-col rounded-2xl border border-line bg-paper">
              <div className="flex items-center justify-between border-b border-line px-4 py-3">
                <div>
                  <p className="text-[9px] font-bold uppercase tracking-[0.145em] text-muted">
                    Step 2 · Regions
                  </p>
                  <h2 className="font-serif text-[20px] leading-tight text-ink">
                    {regions.length} region{regions.length === 1 ? "" : "s"}
                  </h2>
                </div>
                <button
                  type="button"
                  onClick={() => addRegion()}
                  className="flex items-center gap-1.5 rounded-lg bg-ink px-3 py-2 text-[11px] font-semibold text-cream transition-opacity hover:opacity-90"
                >
                  <Plus size={13} />
                  Add
                </button>
              </div>

              <div className="flex-1 overflow-y-auto px-3 py-3">
                {regions.length === 0 && (
                  <p className="px-2 py-6 text-center text-[12px] text-muted">
                    No regions yet. Click the map to place the first one.
                  </p>
                )}
                <ul className="flex flex-col gap-2">
                  {regions.map((region, index) => {
                    const isSelected = region.id === selectedRegionId;
                    return (
                      <li
                        key={region.id}
                        className={`rounded-xl border transition-colors ${
                          isSelected ? "border-line-strong bg-bone" : "border-line bg-paper"
                        }`}
                      >
                        <button
                          type="button"
                          className="flex w-full items-center gap-2.5 px-3 py-2.5 text-left"
                          onClick={() => setSelectedRegionId(isSelected ? null : region.id)}
                        >
                          <span
                            className="h-3.5 w-3.5 shrink-0 rounded-full border border-black/10"
                            style={{ background: region.color }}
                          />
                          <span className="font-mono text-[10px] font-bold text-faint">
                            R{index}
                          </span>
                          <span className="min-w-0 flex-1 truncate text-[12px] font-semibold text-ink">
                            {region.short_name || region.name}
                          </span>
                          {isSelected ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
                        </button>

                        {isSelected && (
                          <div className="flex flex-col gap-2.5 border-t border-line px-3 py-3">
                            <Field label="Full name">
                              <input
                                className={inputClass}
                                value={region.name}
                                onChange={(event) => updateRegion(region.id, { name: event.target.value })}
                              />
                            </Field>
                            <Field label="Short name">
                              <input
                                className={inputClass}
                                value={region.short_name}
                                onChange={(event) => updateRegion(region.id, { short_name: event.target.value })}
                              />
                            </Field>
                            <Field label="Map label">
                              <input
                                className={inputClass}
                                value={region.map_label}
                                onChange={(event) => updateRegion(region.id, { map_label: event.target.value })}
                              />
                            </Field>
                            <Field label="Colour">
                              <div className="flex flex-wrap items-center gap-1.5">
                                {REGION_COLOR_PALETTE.map((color) => (
                                  <button
                                    key={color}
                                    type="button"
                                    aria-label={`Use colour ${color}`}
                                    onClick={() => updateRegion(region.id, { color })}
                                    className={`h-6 w-6 rounded-full border-2 transition-transform hover:scale-110 ${
                                      region.color === color ? "border-ink" : "border-transparent"
                                    }`}
                                    style={{ background: color }}
                                  />
                                ))}
                                <input
                                  type="color"
                                  value={region.color}
                                  onChange={(event) => updateRegion(region.id, { color: event.target.value })}
                                  className="h-6 w-8 cursor-pointer rounded border border-line bg-paper"
                                  aria-label="Custom colour"
                                />
                              </div>
                            </Field>
                            <p className="font-mono text-[10px] text-faint">
                              Centre: {region.center.lat.toFixed(4)}, {region.center.lon.toFixed(4)} · drag the pin to move
                            </p>
                            <div className="flex items-center justify-between pt-1">
                              <div className="flex gap-1">
                                <button
                                  type="button"
                                  onClick={() => reorderRegion(region.id, -1)}
                                  disabled={index === 0}
                                  className="grid h-7 w-7 place-items-center rounded-md border border-line text-ink-soft transition-colors hover:bg-bone disabled:opacity-30"
                                  aria-label="Move region up"
                                >
                                  <ChevronUp size={13} />
                                </button>
                                <button
                                  type="button"
                                  onClick={() => reorderRegion(region.id, 1)}
                                  disabled={index === regions.length - 1}
                                  className="grid h-7 w-7 place-items-center rounded-md border border-line text-ink-soft transition-colors hover:bg-bone disabled:opacity-30"
                                  aria-label="Move region down"
                                >
                                  <ChevronDown size={13} />
                                </button>
                              </div>
                              <button
                                type="button"
                                onClick={() => removeRegion(region.id)}
                                className="flex items-center gap-1.5 rounded-md border border-line px-2.5 py-1.5 text-[10.5px] font-semibold text-danger transition-colors hover:bg-bone"
                              >
                                <Trash2 size={12} />
                                Delete
                              </button>
                            </div>
                          </div>
                        )}
                      </li>
                    );
                  })}
                </ul>
              </div>

              <div className="border-t border-line px-4 py-2.5">
                <button
                  type="button"
                  onClick={resetStarterRegions}
                  className="flex items-center gap-1.5 text-[10.5px] font-semibold text-muted transition-colors hover:text-ink"
                >
                  <RefreshCw size={11} />
                  Reset to Delhi starter regions
                </button>
              </div>
            </section>

            {/* Map */}
            <section className="flex max-h-[calc(100svh-230px)] min-h-[480px] flex-col gap-2">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-muted">
                  Territory designer
                </p>
                <button
                  type="button"
                  onClick={() => setShowTerritories((current) => !current)}
                  className={`flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-[10.5px] font-semibold transition-colors ${
                    showTerritories
                      ? "border-ink bg-ink text-cream"
                      : "border-line-strong bg-paper text-ink-soft hover:bg-bone"
                  }`}
                >
                  {showTerritories ? <Eye size={12} /> : <EyeOff size={12} />}
                  <Layers size={12} />
                  Territory preview
                </button>
              </div>
              <div className="min-h-[420px] flex-1">
                <RegionMapEditor
                  center={basics.center}
                  zoom={basics.default_zoom}
                  regions={regions}
                  selectedId={selectedRegionId}
                  showTerritories={showTerritories}
                  onAddRegion={(lat, lon) => addRegion(lat, lon)}
                  onMoveRegion={moveRegion}
                  onSelectRegion={setSelectedRegionId}
                />
              </div>
              <p className="text-[10.5px] leading-relaxed text-faint">
                The coloured hexes preview how hotels will auto-assign: every point joins the
                nearest region centre. This is the same rule the coverage atlas and the
                optimizer use.
              </p>
            </section>
          </div>
        )}

        {step === 2 && (
          <div className="flex flex-col gap-4">
            {savedSlug ? (
              <section className="rounded-2xl border border-green/30 bg-green-soft/40 p-6">
                <p className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.145em] text-green">
                  <Check size={13} />
                  Draft saved
                </p>
                <h2 className="mt-1.5 font-serif text-[26px] text-ink">
                  {basics.name} is saved as a draft
                </h2>
                <p className="mt-2 max-w-[560px] text-[12.5px] leading-relaxed text-muted">
                  The city and its {regions.length} regions are in the database, marked
                  inactive — so it stays out of the live switcher until hotels, fleet and
                  datasets are added in the next phases. You can preview its coverage map
                  right now.
                </p>
                <div className="mt-4 flex flex-wrap gap-2.5">
                  <Link
                    href={`/${savedSlug}`}
                    className="rounded-lg bg-ink px-4 py-2 text-[12px] font-semibold text-cream transition-opacity hover:opacity-90"
                  >
                    Open coverage preview
                  </Link>
                  <Link
                    href="/admin"
                    className="rounded-lg border border-line-strong bg-paper px-4 py-2 text-[12px] font-semibold text-ink transition-colors hover:bg-bone"
                  >
                    Back to all cities
                  </Link>
                  <button
                    type="button"
                    onClick={() => setSavedSlug(null)}
                    className="rounded-lg border border-line px-4 py-2 text-[12px] font-semibold text-muted transition-colors hover:bg-bone"
                  >
                    Keep editing
                  </button>
                </div>
              </section>
            ) : (
              <>
                <div className="grid gap-4 lg:grid-cols-2">
                  <section className="rounded-2xl border border-line bg-paper p-5">
                    <p className="text-[9px] font-bold uppercase tracking-[0.145em] text-muted">
                      City
                    </p>
                    <h2 className="mt-1 font-serif text-[24px] text-ink">{basics.name}</h2>
                    <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2 text-[12px]">
                      <SummaryItem label="Slug" value={`/${basics.slug}`} />
                      <SummaryItem label="Display name" value={basics.display_name || "—"} />
                      <SummaryItem label="Timezone" value={basics.timezone} />
                      <SummaryItem
                        label="Centre"
                        value={`${basics.center.lat.toFixed(4)}, ${basics.center.lon.toFixed(4)}`}
                      />
                      <SummaryItem label="Zoom" value={`${basics.min_zoom} / ${basics.default_zoom} / ${basics.max_zoom}`} />
                      <SummaryItem label="H3 resolution" value={String(basics.h3_resolution)} />
                      <SummaryItem label="Fallback speed" value={`${basics.fallback_speed_kmh} km/h`} />
                      <SummaryItem label="Road factor" value={basics.road_factor.toFixed(2)} />
                    </dl>
                  </section>

                  <section className="rounded-2xl border border-line bg-paper p-5">
                    <p className="text-[9px] font-bold uppercase tracking-[0.145em] text-muted">
                      Regions · {regions.length}
                    </p>
                    <ul className="mt-3 flex flex-col gap-2">
                      {regions.map((region, index) => (
                        <li key={region.id} className="flex items-center gap-2.5 text-[12px]">
                          <span
                            className="h-3 w-3 shrink-0 rounded-full border border-black/10"
                            style={{ background: region.color }}
                          />
                          <span className="font-mono text-[10px] font-bold text-faint">R{index}</span>
                          <span className="min-w-0 flex-1 truncate font-semibold text-ink">
                            {region.short_name}
                          </span>
                          <span className="font-mono text-[10px] text-faint">
                            {region.center.lat.toFixed(3)}, {region.center.lon.toFixed(3)}
                          </span>
                        </li>
                      ))}
                    </ul>
                  </section>
                </div>

                <section className="rounded-2xl border border-line bg-paper p-5">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <h3 className="text-[13px] font-bold text-ink">Save this draft</h3>
                      <p className="mt-1 max-w-[520px] text-[11.5px] leading-relaxed text-muted">
                        Persists the city + regions as an inactive draft. Or download the
                        config — it is byte-compatible with{" "}
                        <code className="rounded bg-bone px-1 py-0.5 font-mono text-[10.5px]">
                          scripts/seed-city.ts
                        </code>{" "}
                        for the offline pipeline.
                      </p>
                    </div>
                    <div className="flex gap-2.5">
                      <button
                        type="button"
                        onClick={downloadConfig}
                        className="flex items-center gap-1.5 rounded-lg border border-line-strong bg-paper px-4 py-2 text-[12px] font-semibold text-ink transition-colors hover:bg-bone"
                      >
                        <Download size={13} />
                        Download config
                      </button>
                      <button
                        type="button"
                        onClick={saveDraft}
                        disabled={saving || !basicsValid || !regionsValid}
                        className="flex items-center gap-1.5 rounded-lg bg-ink px-4 py-2 text-[12px] font-semibold text-cream transition-opacity hover:opacity-90 disabled:opacity-40"
                      >
                        <Save size={13} />
                        {saving ? "Saving…" : "Save draft city"}
                      </button>
                    </div>
                  </div>
                  {saveError && (
                    <p className="mt-3 rounded-lg border border-danger/30 bg-danger/10 px-3 py-2 text-[11.5px] font-semibold text-danger">
                      {saveError}
                    </p>
                  )}
                </section>
              </>
            )}
          </div>
        )}
      </main>

      {/* Footer navigation */}
      <footer className="sticky bottom-0 z-30 border-t border-line bg-[#f7f3eb]/95 backdrop-blur-md">
        <div className="mx-auto flex w-full max-w-[1240px] items-center justify-between px-5 py-3">
          <button
            type="button"
            onClick={() => setStep((current) => Math.max(0, current - 1))}
            disabled={step === 0}
            className="flex items-center gap-1.5 rounded-lg border border-line-strong bg-paper px-4 py-2 text-[12px] font-semibold text-ink transition-colors hover:bg-bone disabled:opacity-30"
          >
            <ArrowLeft size={13} />
            Back
          </button>
          <p className="hidden text-[10.5px] text-faint sm:block">
            {step === 0 && "Delhi preset loaded — edit anything."}
            {step === 1 && "Click the map to add regions · drag pins to move them."}
            {step === 2 && "Drafts stay invisible to the live app until published."}
          </p>
          {step < 2 ? (
            <button
              type="button"
              onClick={() => canContinue && setStep((current) => current + 1)}
              disabled={!canContinue}
              className="flex items-center gap-1.5 rounded-lg bg-ink px-4 py-2 text-[12px] font-semibold text-cream transition-opacity hover:opacity-90 disabled:opacity-40"
            >
              {step === 0 ? "Design regions" : "Review"}
              <ArrowRight size={13} />
            </button>
          ) : (
            <span className="w-[88px]" aria-hidden="true" />
          )}
        </div>
      </footer>
    </div>
  );
}

const inputClass =
  "w-full rounded-lg border border-line-strong bg-paper-strong px-3 py-2 text-[12.5px] text-ink outline-none transition-colors focus:border-[var(--focus)] focus:ring-2 focus:ring-[rgba(59,107,80,0.18)]";

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-[9px] font-bold uppercase tracking-[0.12em] text-muted">
        {label}
      </span>
      {children}
    </label>
  );
}

function SummaryItem({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col">
      <dt className="text-[9px] font-bold uppercase tracking-[0.1em] text-faint">{label}</dt>
      <dd className="mt-0.5 font-medium text-ink">{value}</dd>
    </div>
  );
}
