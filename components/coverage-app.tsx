"use client";

import Link from "next/link";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type FormEvent,
} from "react";
import {
  ArrowRight,
  ArrowUpRight,
  Compass,
  Crosshair,
  MapPin,
  Search,
  SearchX,
  X,
} from "lucide-react";
import CoverageMap, {
  type CoverageMapHandle,
} from "./coverage-map";
import DispatchPanel from "./dispatch-panel";
import StudioPanel from "./studio-panel";
import {
  DEFAULT_DEPOTS,
  REGION_MAP_LABELS,
  formatDistance,
  hotelKey,
  parseCoordinate,
  resolveCoordinate,
  type CoordinateResult,
  type DispatchRoute,
  type DispatchStop,
  type FleetDepot,
  type HexMap,
  type Hotel,
  type RegionMeta,
  type StudioDepot,
} from "../lib/coverage";
import manualRoutesJson from "../data/manual_routes.json";

type CoverageAppProps = {
  regions: RegionMeta[];
  hotels: Hotel[];
  hexMap: HexMap;
  routes?: DispatchRoute[];
  manualRoutes?: DispatchRoute[];
  depot?: FleetDepot;
  initialWorkspace?: "coverage" | "manual" | "dispatch" | "studio";
};

type Tab = "regions" | "hotels";

const collator = new Intl.Collator("en", {
  numeric: true,
  sensitivity: "base",
});

function regionStyle(color: string): CSSProperties {
  return { "--region": color, "--c": color } as CSSProperties;
}

function coordinateLabel(lat: number, lon: number): string {
  return `${Math.abs(lat).toFixed(5)}° ${lat >= 0 ? "N" : "S"} · ${Math.abs(lon).toFixed(5)}° ${lon >= 0 ? "E" : "W"}`;
}

export default function CoverageApp({
  regions: regionData,
  hotels,
  hexMap,
  routes = [],
  manualRoutes: manualRoutesProp,
  depot,
  initialWorkspace = "coverage",
}: CoverageAppProps) {
  const manualRoutes = useMemo(
    () => manualRoutesProp ?? ((manualRoutesJson as unknown) as DispatchRoute[]),
    [manualRoutesProp],
  );
  const regions = useMemo(
    () => [...regionData].sort((a, b) => a.id - b.id),
    [regionData],
  );

  const regionById = useMemo(
    () => new Map(regions.map((region) => [region.id, region])),
    [regions],
  );

  const hotelCounts = useMemo(() => {
    const counts = new Map<number, number>();
    for (const hotel of hotels) {
      counts.set(hotel.region, (counts.get(hotel.region) ?? 0) + 1);
    }
    return counts;
  }, [hotels]);

  const hexCounts = useMemo(() => {
    const counts = new Map<number, number>();
    for (const regionId of Object.values(hexMap)) {
      counts.set(regionId, (counts.get(regionId) ?? 0) + 1);
    }
    return counts;
  }, [hexMap]);

  const localityCount = useMemo(
    () =>
      regions.reduce(
        (total, region) => total + region.areas_list.length,
        0,
      ),
    [regions],
  );

// Feature flag: set to true to reveal Dispatch and Studio workspaces in UI
const SHOW_DISPATCH_AND_STUDIO = false;

  const [activeWorkspace, setActiveWorkspace] = useState<
    "coverage" | "manual" | "dispatch" | "studio"
  >(initialWorkspace === "manual" ? "manual" : SHOW_DISPATCH_AND_STUDIO ? initialWorkspace : "coverage");
  const [simulatedRoutes, setSimulatedRoutes] = useState<DispatchRoute[]>(routes);
  const [simulatedDepots, setSimulatedDepots] = useState<StudioDepot[]>(DEFAULT_DEPOTS);

  const handleApplySimulatedRoutes = useCallback(
    (newRoutes: DispatchRoute[], newDepots: StudioDepot[]) => {
      setSimulatedRoutes(newRoutes);
      setSimulatedDepots(newDepots);
      setSelectedRouteIndex(null);
      setSelectedStopNumber(null);
    },
    [],
  );

  const [selectedRouteIndex, setSelectedRouteIndex] = useState<number | null>(null);
  const [selectedStopNumber, setSelectedStopNumber] = useState<number | null>(null);
  const [selectedRegionFilter, setSelectedRegionFilter] = useState<number | null>(null);

  const handleSelectRoute = useCallback((index: number | null) => {
    setSelectedRouteIndex(index);
    setSelectedStopNumber(null);
    if (index !== null) {
      mapRef.current?.focusRoute(index);
    }
  }, []);

  const handleSelectStop = useCallback((stop: DispatchStop) => {
    setSelectedStopNumber(stop.stop_number);
    mapRef.current?.focusStop(stop.lat, stop.lon);
  }, []);

  const handleFocusRoute = useCallback((index: number) => {
    mapRef.current?.focusRoute(index);
  }, []);

  const handleFocusStop = useCallback((lat: number, lon: number) => {
    mapRef.current?.focusStop(lat, lon);
  }, []);

  const [activeTab, setActiveTab] = useState<Tab>("regions");
  const [selectedRegion, setSelectedRegion] = useState<number | null>(
    () => regions[0]?.id ?? null,
  );
  const [hoveredRegion, setHoveredRegion] = useState<number | null>(null);
  const [activeHotel, setActiveHotel] = useState<Hotel | null>(null);
  const [hotelsVisible, setHotelsVisible] = useState(true);
  const [pinned, setPinned] = useState<CoordinateResult | null>(null);
  const [query, setQuery] = useState("");
  const [regionFilter, setRegionFilter] = useState<number | "all">("all");
  const [lookupOpen, setLookupOpen] = useState(false);
  const [lookupInput, setLookupInput] = useState("");
  const [lookupError, setLookupError] = useState("");
  const [lookupResult, setLookupResult] =
    useState<CoordinateResult | null>(null);

  const mapRef = useRef<CoverageMapHandle | null>(null);

  const selectedMeta =
    regions.find((region) => region.id === selectedRegion) ?? null;

  const filteredHotels = useMemo(() => {
    const needle = query.trim().toLowerCase();

    return hotels
      .filter((hotel) => {
        if (regionFilter !== "all" && hotel.region !== regionFilter) {
          return false;
        }
        if (needle && !hotel.name.toLowerCase().includes(needle)) {
          return false;
        }
        return true;
      })
      .sort((a, b) => collator.compare(a.name, b.name));
  }, [hotels, query, regionFilter]);

  const resultRegion = lookupResult
    ? (regionById.get(lookupResult.regionId) ?? regions[0])
    : undefined;

  const selectRegion = useCallback(
    (id: number | null, fly = false) => {
      setSelectedRegion(id);
      setActiveHotel(null);
      setHoveredRegion(null);

      if (fly) {
        if (id === null) {
          mapRef.current?.fitAll();
        } else {
          mapRef.current?.focusRegion(id);
        }
      }
    },
    [],
  );

  const selectHotel = useCallback((hotel: Hotel, fly = false) => {
    setSelectedRegion(hotel.region);
    setActiveHotel(hotel);
    setPinned(null);
    setLookupResult(null);
    setHotelsVisible(true);

    if (fly) {
      mapRef.current?.focusHotel(hotel);
    }
  }, []);

  const resetView = useCallback(() => {
    setSelectedRegion(null);
    setHoveredRegion(null);
    setActiveHotel(null);
    setPinned(null);
    setLookupResult(null);
    setLookupOpen(false);
    setLookupError("");
    mapRef.current?.fitAll();
  }, []);

  const toggleHotels = useCallback(() => {
    setHotelsVisible((visible) => {
      if (visible) setActiveHotel(null);
      return !visible;
    });
  }, []);

  const browseRegionHotels = useCallback(() => {
    setActiveTab("hotels");
    setRegionFilter(selectedRegion ?? "all");
    setQuery("");
  }, [selectedRegion]);

  const openLookup = useCallback(() => {
    setLookupOpen(true);
    setLookupError("");
  }, []);

  const closeLookup = useCallback(() => {
    setLookupOpen(false);
  }, []);

  const handleLookupSubmit = useCallback(
    (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();

      const parsed = parseCoordinate(lookupInput);
      if (!parsed.ok) {
        setLookupError(parsed.error);
        return;
      }

      const result = resolveCoordinate(
        parsed.lat,
        parsed.lon,
        hexMap,
        hotels,
        regions,
      );

      setLookupError("");
      setLookupResult(result);
      setPinned(result);
      setSelectedRegion(result.regionId);
      setHoveredRegion(null);
      setActiveHotel(null);
    },
    [lookupInput, hexMap, hotels, regions],
  );

  const resetLookup = useCallback(() => {
    setLookupResult(null);
    setLookupError("");
    setLookupInput("");
  }, []);

  const clearPinned = useCallback(() => {
    setPinned(null);
    setLookupResult(null);
  }, []);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (
        (event.metaKey || event.ctrlKey) &&
        event.key.toLowerCase() === "k"
      ) {
        event.preventDefault();
        setLookupOpen(true);
        setLookupError("");
      }

      if (event.key === "Escape") {
        setLookupOpen(false);
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  useEffect(() => {
    if (!lookupOpen) return;

    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    return () => {
      document.body.style.overflow = previous;
    };
  }, [lookupOpen]);

  const neighbourhoodLabel = query.trim()
    ? `${filteredHotels.length} match${filteredHotels.length === 1 ? "" : "es"}`
    : `${filteredHotels.length} hotels`;

  return (
    <div className={`app [display:flex] [flex-direction:column] [width:100%] [height:100svh] [min-height:0] [overflow:hidden] [background:var(--bone)] max-[760px]:[height:auto] max-[760px]:[min-height:100svh] max-[760px]:[overflow:visible]`}>
      <header className={`topbar [position:relative] [z-index:40] [display:grid] [flex:0_0_auto] [grid-template-columns:1fr_auto_1fr] [align-items:center] [gap:18px] [height:66px] [padding:0_22px] [border-bottom:1px_solid_var(--line)] [background:rgba(247,_243,_235,_0.94)] [backdrop-filter:blur(14px)] max-[900px]:[grid-template-columns:1fr_auto] max-[760px]:[position:sticky] max-[760px]:[top:0] max-[760px]:[grid-template-columns:1fr_auto] max-[760px]:[gap:10px] max-[760px]:[height:60px] max-[760px]:[padding:0_16px] max-[560px]:[height:58px] max-[560px]:[padding:0_12px] [position:relative] [z-index:40] [display:grid] [flex:0_0_auto] [grid-template-columns:1fr_auto_1fr] [align-items:center] [gap:18px] [height:66px] [padding:0_22px] [border-bottom:1px_solid_var(--line)] [background:rgba(247,_243,_235,_0.94)] [backdrop-filter:blur(14px)] max-[900px]:[grid-template-columns:1fr_auto] max-[760px]:[position:sticky] max-[760px]:[top:0] max-[760px]:[grid-template-columns:1fr_auto] max-[760px]:[gap:10px] max-[760px]:[height:60px] max-[760px]:[padding:0_16px] max-[560px]:[height:58px] max-[560px]:[padding:0_12px]`}>
        <button
          type="button"
          className={`brand [display:inline-flex] [align-items:center] [justify-self:start] [gap:10px] [min-width:0] [border-radius:10px] [text-align:left] max-[560px]:[gap:8px] [display:inline-flex] [align-items:center] [justify-self:start] [gap:10px] [min-width:0] [border-radius:10px] [text-align:left] max-[560px]:[gap:8px]`}
          onClick={resetView}
          aria-label="LinenGrass coverage atlas — reset the view"
        >
          <span className={`brand-mark [display:grid] [flex:0_0_auto] [width:35px] [height:35px] [place-items:center] [border-radius:10px] [background:var(--ink)] [color:var(--cream)] [box-shadow:inset_0_0_0_1px_rgba(255,_255,_255,_0.07)] [transition:background_160ms_ease,_transform_160ms_ease] [.brand:hover_&]:[background:#25382d] [.brand:hover_&]:[transform:translateY(-1px)] [&_svg]:[width:21px] [&_svg]:[height:21px] max-[560px]:[width:32px] max-[560px]:[height:32px] [display:grid] [flex:0_0_auto] [width:35px] [height:35px] [place-items:center] [border-radius:10px] [background:var(--ink)] [color:var(--cream)] [box-shadow:inset_0_0_0_1px_rgba(255,_255,_255,_0.07)] [transition:background_160ms_ease,_transform_160ms_ease] [.brand:hover_&]:[background:#25382d] [.brand:hover_&]:[transform:translateY(-1px)] [&_svg]:[width:21px] [&_svg]:[height:21px] max-[560px]:[width:32px] max-[560px]:[height:32px]`} aria-hidden="true">
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
          <span className={`brand-copy [display:flex] [flex-direction:column] [gap:1px] [line-height:1.1] [display:flex] [flex-direction:column] [gap:1px] [line-height:1.1]`}>
            <span className={`brand-name [font-size:15px] [font-weight:600] [letter-spacing:-0.025em] max-[560px]:[font-size:14px] [font-size:15px] [font-weight:600] [letter-spacing:-0.025em] max-[560px]:[font-size:14px]`}>LinenGrass</span>
            <span className={`brand-sub [color:var(--faint)] [font-size:8.5px] [font-weight:600] [letter-spacing:0.14em] [text-transform:uppercase] max-[760px]:[display:none] [color:var(--faint)] [font-size:8.5px] [font-weight:600] [letter-spacing:0.14em] [text-transform:uppercase] max-[760px]:[display:none]`}>Field atlas</span>
          </span>
        </button>

        <nav className={`topnav [display:flex] [align-items:center] [gap:2px] [padding:3px] [border:1px_solid_var(--line)] [border-radius:10px] [background:var(--paper)] max-[900px]:[display:none]`} aria-label="Primary">
          <button
            type="button"
            className={`topnav__item [display:inline-flex] [align-items:center] [gap:6px] [height:28px] [padding:0_11px] [border-radius:7px] [color:var(--muted)] [font-size:11.5px] [font-weight:600] [letter-spacing:-0.005em] [&:hover:not(.topnav__item--active):not(.topnav__item--disabled)]:[background:var(--bone)] [&:hover:not(.topnav__item--active):not(.topnav__item--disabled)]:[color:var(--ink)] ${activeWorkspace === "coverage" ? `topnav__item--active [background:var(--ink)] [color:var(--cream)] [box-shadow:0_1px_2px_rgba(24,_36,_30,_0.18)]` : ""}`}
            onClick={() => {
              setActiveWorkspace("coverage");
              setSelectedRouteIndex(null);
              setSelectedStopNumber(null);
            }}
          >
            Coverage
          </button>
          <button
            type="button"
            className={`topnav__item [display:inline-flex] [align-items:center] [gap:6px] [height:28px] [padding:0_11px] [border-radius:7px] [color:var(--muted)] [font-size:11.5px] [font-weight:600] [letter-spacing:-0.005em] [&:hover:not(.topnav__item--active):not(.topnav__item--disabled)]:[background:var(--bone)] [&:hover:not(.topnav__item--active):not(.topnav__item--disabled)]:[color:var(--ink)] ${activeWorkspace === "manual" ? `topnav__item--active [background:var(--ink)] [color:var(--cream)] [box-shadow:0_1px_2px_rgba(24,_36,_30,_0.18)]` : ""}`}
            onClick={() => {
              setActiveWorkspace("manual");
              setSelectedRouteIndex(null);
              setSelectedStopNumber(null);
            }}
          >
            Manual routes
            <span className={`topnav__live-pill [display:inline-flex] [align-items:center] [gap:4px] [margin-left:6px] [padding:2px_7px] [border:1px_solid_rgba(16,_185,_129,_0.35)] [border-radius:999px] [background:rgba(16,_185,_129,_0.12)] [color:#065f46] [font-size:9px] [font-weight:700] [text-transform:uppercase] [letter-spacing:0.05em] [line-height:1] before:[content:""] before:[display:inline-block] before:[width:5px] before:[height:5px] before:[border-radius:50%] before:[background:#10b981] before:[box-shadow:0_0_6px_rgba(16,_185,_129,_0.8)] before:[animation:pulse-dot_1.8s_cubic-bezier(0.4,_0,_0.6,_1)_infinite]`}>8 Routes</span>
          </button>
          <Link className={`topnav__item [display:inline-flex] [align-items:center] [gap:6px] [height:28px] [padding:0_11px] [border-radius:7px] [color:var(--muted)] [font-size:11.5px] [font-weight:600] [letter-spacing:-0.005em] [&:hover:not(.topnav__item--active):not(.topnav__item--disabled)]:[background:var(--bone)] [&:hover:not(.topnav__item--active):not(.topnav__item--disabled)]:[color:var(--ink)]`} href="/plan">
            Plan canvas
            <ArrowUpRight size={11} />
          </Link>
          <Link className={`topnav__item [display:inline-flex] [align-items:center] [gap:6px] [height:28px] [padding:0_11px] [border-radius:7px] [color:var(--muted)] [font-size:11.5px] [font-weight:600] [letter-spacing:-0.005em] [&:hover:not(.topnav__item--active):not(.topnav__item--disabled)]:[background:var(--bone)] [&:hover:not(.topnav__item--active):not(.topnav__item--disabled)]:[color:var(--ink)]`} href="/facilities">
            Facilities
            <ArrowUpRight size={11} />
          </Link>
          <Link className={`topnav__item [display:inline-flex] [align-items:center] [gap:6px] [height:28px] [padding:0_11px] [border-radius:7px] [color:var(--muted)] [font-size:11.5px] [font-weight:600] [letter-spacing:-0.005em] [&:hover:not(.topnav__item--active):not(.topnav__item--disabled)]:[background:var(--bone)] [&:hover:not(.topnav__item--active):not(.topnav__item--disabled)]:[color:var(--ink)]`} href="/hotels">
            Hotels
            <ArrowUpRight size={11} />
          </Link>
          <Link className={`topnav__item [display:inline-flex] [align-items:center] [gap:6px] [height:28px] [padding:0_11px] [border-radius:7px] [color:var(--muted)] [font-size:11.5px] [font-weight:600] [letter-spacing:-0.005em] [&:hover:not(.topnav__item--active):not(.topnav__item--disabled)]:[background:var(--bone)] [&:hover:not(.topnav__item--active):not(.topnav__item--disabled)]:[color:var(--ink)]`} href="/vehicles">
            Vehicles
            <ArrowUpRight size={11} />
          </Link>
          {SHOW_DISPATCH_AND_STUDIO && (
            <>
              <button
                type="button"
                className={`topnav__item [display:inline-flex] [align-items:center] [gap:6px] [height:28px] [padding:0_11px] [border-radius:7px] [color:var(--muted)] [font-size:11.5px] [font-weight:600] [letter-spacing:-0.005em] [&:hover:not(.topnav__item--active):not(.topnav__item--disabled)]:[background:var(--bone)] [&:hover:not(.topnav__item--active):not(.topnav__item--disabled)]:[color:var(--ink)] ${activeWorkspace === "dispatch" ? `topnav__item--active [background:var(--ink)] [color:var(--cream)] [box-shadow:0_1px_2px_rgba(24,_36,_30,_0.18)]` : ""}`}
                onClick={() => {
                  setActiveWorkspace("dispatch");
                  setSelectedRouteIndex(null);
                  setSelectedStopNumber(null);
                }}
              >
                Dispatch
                <span className={`topnav__live-pill [display:inline-flex] [align-items:center] [gap:4px] [margin-left:6px] [padding:2px_7px] [border:1px_solid_rgba(16,_185,_129,_0.35)] [border-radius:999px] [background:rgba(16,_185,_129,_0.12)] [color:#065f46] [font-size:9px] [font-weight:700] [text-transform:uppercase] [letter-spacing:0.05em] [line-height:1] before:[content:""] before:[display:inline-block] before:[width:5px] before:[height:5px] before:[border-radius:50%] before:[background:#10b981] before:[box-shadow:0_0_6px_rgba(16,_185,_129,_0.8)] before:[animation:pulse-dot_1.8s_cubic-bezier(0.4,_0,_0.6,_1)_infinite]`}>Live plan</span>
              </button>
              <button
                type="button"
                className={`topnav__item [display:inline-flex] [align-items:center] [gap:6px] [height:28px] [padding:0_11px] [border-radius:7px] [color:var(--muted)] [font-size:11.5px] [font-weight:600] [letter-spacing:-0.005em] [&:hover:not(.topnav__item--active):not(.topnav__item--disabled)]:[background:var(--bone)] [&:hover:not(.topnav__item--active):not(.topnav__item--disabled)]:[color:var(--ink)] ${activeWorkspace === "studio" ? `topnav__item--active [background:var(--ink)] [color:var(--cream)] [box-shadow:0_1px_2px_rgba(24,_36,_30,_0.18)]` : ""}`}
                onClick={() => {
                  setActiveWorkspace("studio");
                  setSelectedRouteIndex(null);
                  setSelectedStopNumber(null);
                }}
              >
                Studio
                <span className={`topnav__studio-pill [display:inline-flex] [align-items:center] [gap:4px] [margin-left:6px] [padding:2px_7px] [border:1px_solid_rgba(139,_92,_246,_0.35)] [border-radius:999px] [background:rgba(139,_92,_246,_0.12)] [color:#6d28d9] [font-size:9px] [font-weight:700] [text-transform:uppercase] [letter-spacing:0.05em] [line-height:1] before:[content:""] before:[display:inline-block] before:[width:5px] before:[height:5px] before:[border-radius:50%] before:[background:#8b5cf6] before:[box-shadow:0_0_6px_rgba(139,_92,_246,_0.8)]`}>Custom plan</span>
              </button>
            </>
          )}
        </nav>

        <div className={`topbar__actions [display:flex] [align-items:center] [justify-self:end] [gap:14px] [min-width:0] max-[560px]:[gap:0] [display:flex] [align-items:center] [justify-self:end] [gap:14px] [min-width:0] max-[560px]:[gap:0]`}>
          <div className={`topbar-stat [display:flex] [align-items:center] [gap:7px] [color:var(--muted)] [font-size:10.5px] [white-space:nowrap] [&_b]:[color:var(--ink)] [&_b]:[font-weight:600] [&_b]:[font-variant-numeric:tabular-nums] max-[1180px]:[display:none] [display:flex] [align-items:center] [gap:7px] [color:var(--muted)] [font-size:10.5px] [white-space:nowrap] [&_b]:[color:var(--ink)] [&_b]:[font-weight:600] [&_b]:[font-variant-numeric:tabular-nums] max-[1180px]:[display:none]`}>
            <span className={`topbar-stat__dot [width:5px] [height:5px] [border-radius:50%] [background:#3c7a55] [box-shadow:0_0_0_3px_rgba(60,_122,_85,_0.11)] [width:5px] [height:5px] [border-radius:50%] [background:#3c7a55] [box-shadow:0_0_0_3px_rgba(60,_122,_85,_0.11)]`} />
            <span>
              {activeWorkspace === "manual" ? (
                <>
                  <b>{manualRoutes.length}</b> manual routes ·{" "}
                  <b>{manualRoutes.reduce((acc, r) => acc + r.total_hotels, 0)}</b> stops ·{" "}
                  <b>{Math.round(manualRoutes.reduce((acc, r) => acc + r.total_dist_km, 0))} km</b>
                </>
              ) : SHOW_DISPATCH_AND_STUDIO && activeWorkspace === "studio" ? (
                <>
                  <b>{simulatedRoutes.length}</b> custom routes ·{" "}
                  <b>{simulatedRoutes.reduce((acc, r) => acc + r.total_hotels, 0)}</b> stops
                </>
              ) : SHOW_DISPATCH_AND_STUDIO && activeWorkspace === "dispatch" ? (
                <>
                  <b>{routes.length}</b> vehicles · <b>{hotels.length}</b> stops
                </>
              ) : (
                <>
                  <b>{hotels.length}</b> hotels mapped
                </>
              )}
            </span>
          </div>
          <button
            type="button"
            className={`lookup-button [display:inline-flex] [align-items:center] [gap:8px] [height:35px] [padding:0_11px] [border-radius:9px] [background:var(--ink)] [color:var(--cream)] [font-size:11.5px] [font-weight:600] [white-space:nowrap] [box-shadow:0_1px_2px_rgba(24,_36,_30,_0.16)] [transition:background_160ms_ease,_transform_160ms_ease] hover:[background:#263a2e] hover:[transform:translateY(-1px)] [&_svg]:[color:#b8c6bb] [&_kbd]:[display:inline-flex] [&_kbd]:[align-items:center] [&_kbd]:[height:18px] [&_kbd]:[padding:0_4px] [&_kbd]:[border:1px_solid_rgba(255,_255,_255,_0.13)] [&_kbd]:[border-radius:4px] [&_kbd]:[background:rgba(255,_255,_255,_0.08)] [&_kbd]:[color:rgba(251,_247,_236,_0.66)] [&_kbd]:[font-family:var(--font-mono)] [&_kbd]:[font-size:8.5px] [&_kbd]:[font-weight:500] max-[560px]:[gap:0] max-[560px]:[height:33px] max-[560px]:[padding:0_10px] max-[560px]:[&_span]:[display:none] max-[560px]:[&_kbd]:[display:none]`}
            onClick={openLookup}
          >
            <Crosshair size={14} />
            <span>Look up a pin</span>
            <kbd>⌘K</kbd>
          </button>
        </div>
      </header>

      <main className={`workspace [position:relative] [display:grid] [flex:1] [grid-template-areas:"panel_map"] [grid-template-columns:minmax(360px,_400px)_minmax(0,_1fr)] [min-height:0] max-[1180px]:[grid-template-columns:minmax(330px,_370px)_minmax(0,_1fr)] max-[900px]:[grid-template-columns:minmax(320px,_350px)_minmax(0,_1fr)] max-[760px]:[grid-template-areas:"map"_"panel"] max-[760px]:[grid-template-columns:1fr] max-[760px]:[grid-template-rows:52svh_auto] max-[760px]:[min-height:0]`}>
        <section className={`map-stage [position:relative] [grid-area:map] [min-width:0] [min-height:0] [overflow:hidden] [background:var(--map-bg)] [isolation:isolate] max-[760px]:[min-height:340px]`} aria-label="Coverage map">
          <CoverageMap
            ref={mapRef}
            workspace={activeWorkspace}
            regions={regions}
            hotels={hotels}
            hexMap={hexMap}
            routes={
              activeWorkspace === "manual"
                ? manualRoutes
                : activeWorkspace === "studio"
                  ? simulatedRoutes
                  : routes
            }
            depot={depot}
            depots={activeWorkspace === "studio" ? simulatedDepots : undefined}
            selectedRouteIndex={selectedRouteIndex}
            selectedStopNumber={selectedStopNumber}
            selectedRegion={selectedRegion}
            hoveredRegion={hoveredRegion}
            activeHotel={activeHotel}
            pinned={pinned}
            hotelsVisible={hotelsVisible}
            onSelectRegion={selectRegion}
            onSelectHotel={selectHotel}
            onSelectRoute={handleSelectRoute}
            onSelectStop={handleSelectStop}
            onHoverRegion={setHoveredRegion}
            onToggleHotels={toggleHotels}
            onCloseHotel={() => setActiveHotel(null)}
            onClearPinned={clearPinned}
            onResetView={resetView}
          />
        </section>

        <aside
          className={`panel [position:relative] [z-index:2] [display:flex] [grid-area:panel] [flex-direction:column] [min-width:0] [min-height:0] [border-right:1px_solid_var(--line)] [background:var(--paper)] max-[760px]:[border-top:1px_solid_var(--line)] max-[760px]:[border-right:0]`}
          aria-label={
            activeWorkspace === "manual"
              ? "Manual route mapping"
              : activeWorkspace === "studio"
                ? "Optimizer studio custom solver"
                : activeWorkspace === "dispatch"
                  ? "Fleet dispatch management"
                  : "Coverage explorer"
          }
        >
          {activeWorkspace === "manual" ? (
            <DispatchPanel
              title="Manual route mapping"
              description="8 multi-van manual routes across Bangalore with turn-by-turn road navigation from LinenGrass HQ (Yeshwanthpur Central Laundry)."
              manifestDownloadName="linengrass_manual_routes_manifest.csv"
              routes={manualRoutes}
              depot={
                depot ?? {
                  name: "LinenGrass HQ (Yeshwanthpur Central Laundry)",
                  latitude: 13.017275,
                  longitude: 77.546578,
                }
              }
              regions={regions}
              selectedRouteIndex={selectedRouteIndex}
              onSelectRoute={handleSelectRoute}
              selectedStopNumber={selectedStopNumber}
              onSelectStop={handleSelectStop}
              selectedRegionFilter={selectedRegionFilter}
              onSelectRegionFilter={setSelectedRegionFilter}
              onFocusRoute={handleFocusRoute}
              onFocusStop={handleFocusStop}
            />
          ) : activeWorkspace === "studio" ? (
            <StudioPanel
              hotels={hotels}
              regions={regions}
              routes={simulatedRoutes}
              onApplySimulatedRoutes={handleApplySimulatedRoutes}
              onSelectRoute={handleSelectRoute}
              onSelectStop={handleSelectStop}
              onFocusRoute={handleFocusRoute}
              onFocusStop={handleFocusStop}
              selectedRouteIndex={selectedRouteIndex}
              selectedStopNumber={selectedStopNumber}
            />
          ) : activeWorkspace === "dispatch" ? (
            <DispatchPanel
              routes={routes}
              depot={
                depot ?? {
                  name: "LinenGrass HQ (Yeshwanthpur Central Laundry)",
                  latitude: 13.017275,
                  longitude: 77.546578,
                }
              }
              regions={regions}
              selectedRouteIndex={selectedRouteIndex}
              onSelectRoute={handleSelectRoute}
              selectedStopNumber={selectedStopNumber}
              onSelectStop={handleSelectStop}
              selectedRegionFilter={selectedRegionFilter}
              onSelectRegionFilter={setSelectedRegionFilter}
              onFocusRoute={handleFocusRoute}
              onFocusStop={handleFocusStop}
            />
          ) : (
            <>
          <div className={`panel-intro [flex:0_0_auto] [padding:21px_22px_16px] [&_h1]:[margin:11px_0_7px] [&_h1]:[color:var(--ink)] [&_h1]:[font-family:var(--font-instrument-serif),_Georgia,_"Times_New_Roman",_serif] [&_h1]:[font-size:40px] [&_h1]:[font-weight:400] [&_h1]:[letter-spacing:-0.022em] [&_h1]:[line-height:0.98] [&_p]:[max-width:307px] [&_p]:[color:var(--muted)] [&_p]:[font-size:12px] [&_p]:[line-height:1.58] max-[1180px]:[padding:23px_18px_17px] max-[760px]:[padding:22px_18px_16px] max-[760px]:[&_h1]:[font-size:39px] max-[560px]:[padding:21px_16px_15px] max-[560px]:[&_h1]:[font-size:36px] max-[560px]:[&_p]:[font-size:11.5px]`}>
            <span className={`eyebrow [display:flex] [align-items:center] [gap:8px] [color:var(--muted)] [font-size:9px] [font-weight:700] [letter-spacing:0.145em] [text-transform:uppercase] [display:flex] [align-items:center] [gap:8px] [color:var(--muted)] [font-size:9px] [font-weight:700] [letter-spacing:0.145em] [text-transform:uppercase]`}>
              <span className={`eyebrow__dot [width:5px] [height:5px] [border-radius:50%] [background:#3c7a55] [box-shadow:0_0_0_3px_rgba(60,_122,_85,_0.1)] [width:5px] [height:5px] [border-radius:50%] [background:#3c7a55] [box-shadow:0_0_0_3px_rgba(60,_122,_85,_0.1)]`} />
              Bengaluru · Coverage atlas
            </span>
            <h1>Hotel coverage</h1>
            <p>
              Every property, locality and route footprint across the city —
              mapped as one working picture.
            </p>
            <div className={`intro-stats [display:grid] [grid-template-columns:repeat(3,_1fr)] [margin-top:15px] [padding:10px_0] [border-top:1px_solid_var(--line)] [border-bottom:1px_solid_var(--line)]`}>
              <div className={`intro-stat [padding:0_12px] [border-left:1px_solid_var(--line)] first:[padding-left:0] first:[border-left:0] [&_b]:[display:block] [&_b]:[color:var(--ink)] [&_b]:[font-size:19px] [&_b]:[font-weight:600] [&_b]:[font-variant-numeric:tabular-nums] [&_b]:[letter-spacing:-0.035em] [&_b]:[line-height:1] [&_span]:[display:block] [&_span]:[margin-top:5px] [&_span]:[color:var(--faint)] [&_span]:[font-size:8.5px] [&_span]:[font-weight:600] [&_span]:[letter-spacing:0.1em] [&_span]:[text-transform:uppercase]`}>
                <b>{hotels.length}</b>
                <span>Hotels</span>
              </div>
              <div className={`intro-stat [padding:0_12px] [border-left:1px_solid_var(--line)] first:[padding-left:0] first:[border-left:0] [&_b]:[display:block] [&_b]:[color:var(--ink)] [&_b]:[font-size:19px] [&_b]:[font-weight:600] [&_b]:[font-variant-numeric:tabular-nums] [&_b]:[letter-spacing:-0.035em] [&_b]:[line-height:1] [&_span]:[display:block] [&_span]:[margin-top:5px] [&_span]:[color:var(--faint)] [&_span]:[font-size:8.5px] [&_span]:[font-weight:600] [&_span]:[letter-spacing:0.1em] [&_span]:[text-transform:uppercase]`}>
                <b>{regions.length}</b>
                <span>Regions</span>
              </div>
              <div className={`intro-stat [padding:0_12px] [border-left:1px_solid_var(--line)] first:[padding-left:0] first:[border-left:0] [&_b]:[display:block] [&_b]:[color:var(--ink)] [&_b]:[font-size:19px] [&_b]:[font-weight:600] [&_b]:[font-variant-numeric:tabular-nums] [&_b]:[letter-spacing:-0.035em] [&_b]:[line-height:1] [&_span]:[display:block] [&_span]:[margin-top:5px] [&_span]:[color:var(--faint)] [&_span]:[font-size:8.5px] [&_span]:[font-weight:600] [&_span]:[letter-spacing:0.1em] [&_span]:[text-transform:uppercase]`}>
                <b>{localityCount}</b>
                <span>Localities</span>
              </div>
            </div>
          </div>

          <div
            className={`panel-tabs [display:flex] [flex:0_0_auto] [gap:3px] [margin:0_22px_12px] [padding:4px] [border:1px_solid_var(--line)] [border-radius:10px] [background:var(--bone)] max-[1180px]:[margin:0_18px_13px] max-[760px]:[margin:0_18px_13px] max-[560px]:[margin:0_16px_12px]`}
            role="tablist"
            aria-label="Coverage views"
          >
            <button
              type="button"
              className={`panel-tab [display:flex] [flex:1] [align-items:center] [justify-content:center] [gap:7px] [height:32px] [border-radius:7px] [color:var(--muted)] [font-size:11.5px] [font-weight:600] [transition:background_150ms_ease,_color_150ms_ease,_box-shadow_150ms_ease] [&>span]:[display:inline-flex] [&>span]:[align-items:center] [&>span]:[justify-content:center] [&>span]:[min-width:19px] [&>span]:[height:16px] [&>span]:[padding:0_4px] [&>span]:[border-radius:999px] [&>span]:[background:rgba(24,_36,_30,_0.06)] [&>span]:[color:var(--faint)] [&>span]:[font-size:8.5px] [&>span]:[font-variant-numeric:tabular-nums] [&>span]:[line-height:1] hover:[color:var(--ink-soft)] [background:var(--paper-strong)] [color:var(--ink)] [box-shadow:0_1px_2px_rgba(24,_36,_30,_0.08),_0_0_0_1px_rgba(24,_36,_30,_0.03)] [&_[aria-selected="true"]>_span]:[background:var(--ink)] [&_[aria-selected="true"]>_span]:[color:var(--cream)]`}
              role="tab"
              id="tab-regions"
              aria-selected={activeTab === "regions"}
              aria-controls="panel-regions"
              onClick={() => setActiveTab("regions")}
            >
              Regions
              <span>{regions.length}</span>
            </button>
            <button
              type="button"
              className={`panel-tab [display:flex] [flex:1] [align-items:center] [justify-content:center] [gap:7px] [height:32px] [border-radius:7px] [color:var(--muted)] [font-size:11.5px] [font-weight:600] [transition:background_150ms_ease,_color_150ms_ease,_box-shadow_150ms_ease] [&>span]:[display:inline-flex] [&>span]:[align-items:center] [&>span]:[justify-content:center] [&>span]:[min-width:19px] [&>span]:[height:16px] [&>span]:[padding:0_4px] [&>span]:[border-radius:999px] [&>span]:[background:rgba(24,_36,_30,_0.06)] [&>span]:[color:var(--faint)] [&>span]:[font-size:8.5px] [&>span]:[font-variant-numeric:tabular-nums] [&>span]:[line-height:1] hover:[color:var(--ink-soft)] [background:var(--paper-strong)] [color:var(--ink)] [box-shadow:0_1px_2px_rgba(24,_36,_30,_0.08),_0_0_0_1px_rgba(24,_36,_30,_0.03)] [&_[aria-selected="true"]>_span]:[background:var(--ink)] [&_[aria-selected="true"]>_span]:[color:var(--cream)]`}
              role="tab"
              id="tab-hotels"
              aria-selected={activeTab === "hotels"}
              aria-controls="panel-hotels"
              onClick={() => setActiveTab("hotels")}
            >
              Hotels
              <span>{hotels.length}</span>
            </button>
          </div>

          {activeTab === "regions" ? (
            <div
              className={`panel-body [flex:1] [min-height:0] [padding:0_22px_20px] [overflow-y:auto] [overscroll-behavior:contain] max-[1180px]:[padding:0_18px_18px] max-[760px]:[overflow:visible] max-[760px]:[padding:0_18px_20px] max-[560px]:[padding:0_16px_18px]`}
              role="tabpanel"
              id="panel-regions"
              aria-labelledby="tab-regions"
            >
              <div className={`region-rail-block [position:sticky] [top:0] [z-index:3] [margin:0_-3px] [padding:0_3px_10px] [background:var(--paper)] max-[760px]:[position:static] max-[760px]:[margin:0] max-[760px]:[padding:0_0_12px]`}>
                <div className={`regions-head [display:flex] [align-items:center] [justify-content:space-between] [gap:12px] [padding:0_2px_8px] [color:var(--muted)] [font-size:9px] [font-weight:700] [letter-spacing:0.11em] [text-transform:uppercase] [&_button]:[color:var(--green)] [&_button]:[font-size:9.5px] [&_button]:[font-weight:700] [&_button]:[letter-spacing:0.015em] [&_button]:[text-transform:none] [&_button:hover]:[text-decoration:underline] [&_button:hover]:[text-underline-offset:2px]`}>
                  <span>Operational regions</span>
                  {selectedRegion !== null ? (
                    <button
                      type="button"
                      onClick={() => selectRegion(null, true)}
                    >
                      Show all
                    </button>
                  ) : (
                    <span className={`regions-head__hint [color:var(--faint)] [font-size:8.5px] [font-weight:500] [letter-spacing:0.03em] [text-transform:none]`}>
                      Click to explore
                    </span>
                  )}
                </div>

                <div
                  className={`region-rail [display:grid] [grid-template-columns:repeat(5,_minmax(0,_1fr))] [gap:4px] max-[560px]:[gap:3px]`}
                  role="group"
                  aria-label="Choose an operational region"
                >
                  {regions.map((region) => {
                    const count = hotelCounts.get(region.id) ?? 0;
                    const isActive = selectedRegion === region.id;
                    const railLabel =
                      REGION_MAP_LABELS[region.id] ?? region.short_name;

                    return (
                      <button
                        type="button"
                        key={region.id}
                        className={`region-pill [display:flex] [flex-direction:column] [gap:4px] [align-items:flex-start] [min-width:0] [padding:7px_6px_6px] [border:1px_solid_var(--line)] [border-radius:8px] [background:var(--paper-strong)] [text-align:left] [transition:background_140ms_ease,_border-color_140ms_ease,_box-shadow_140ms_ease] hover:[border-color:var(--line-strong)] hover:[background:var(--bone)] [border-color:color-mix(in_srgb,_var(--region)_30%,_var(--line))] [background:color-mix(in_srgb,_var(--region)_8%,_var(--paper-strong))] [box-shadow:inset_0_2px_0_var(--region)] [&_b]:[color:var(--ink)] [&_b]:[font-family:var(--font-mono)] [&_b]:[font-size:9px] [&_b]:[font-weight:700] [&_b]:[letter-spacing:0.02em] [&_b]:[line-height:1] max-[560px]:[padding:6px_5px_5px]`}
                        style={regionStyle(region.color)}
                        data-proposed={region.route_status === "Proposed"}
                        aria-pressed={isActive}
                        aria-label={`${region.code} ${region.short_name}, ${count} hotels, ${region.route_status}`}
                        title={`${region.code} · ${region.short_name} · ${region.route_status}`}
                        onClick={() => selectRegion(region.id, true)}
                        onMouseEnter={() => setHoveredRegion(region.id)}
                        onMouseLeave={() => setHoveredRegion(null)}
                      >
                        <span className={`region-pill__top [display:flex] [align-items:center] [gap:4px] [width:100%] [min-width:0]`}>
                          <span className={`region-pill__dot [flex:0_0_auto] [width:5px] [height:5px] [border-radius:50%] [background:var(--region)] [.region-pill[data-proposed="true"]_&]:[border:1.25px_solid_var(--region)] [.region-pill[data-proposed="true"]_&]:[background:transparent]`} />
                          <b>{region.code}</b>
                          <span className={`region-pill__count [margin-left:auto] [color:var(--faint)] [font-size:7.5px] [font-variant-numeric:tabular-nums] [line-height:1]`}>{count}</span>
                        </span>
                        <span className={`region-pill__name [overflow:hidden] [width:100%] [color:var(--muted)] [font-size:7.5px] [font-weight:500] [letter-spacing:-0.01em] [line-height:1.2] [text-overflow:ellipsis] [white-space:nowrap] [.region-pill[aria-pressed="true"]_&]:[color:color-mix(in_srgb,_var(--region)_65%,_var(--ink))] [.region-pill[aria-pressed="true"]_&]:[font-weight:600] max-[560px]:[font-size:7px]`}>
                          {railLabel}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {selectedMeta ? (
                <section
                  key={selectedMeta.id}
                  className={`region-detail [margin-top:4px] [padding:14px] [border:1px_solid_var(--line)] [border-top:2px_solid_var(--region)] [border-radius:14px] [background:color-mix(in_srgb,_var(--region)_4.5%,_var(--paper-strong))] [animation:rise-in_220ms_ease_both] [&_h2]:[color:var(--ink)] [&_h2]:[font-size:14px] [&_h2]:[font-weight:600] [&_h2]:[letter-spacing:-0.018em] [&_h2]:[line-height:1.3] max-[560px]:[padding:14px] max-[560px]:[&_h2]:[font-size:13px]`}
                  style={regionStyle(selectedMeta.color)}
                  aria-live="polite"
                >
                  <div className={`region-detail__head [display:flex] [align-items:flex-start] [justify-content:space-between] [gap:10px]`}>
                    <div className={`region-detail__title [min-width:0]`}>
                      <span className={`region-detail__kicker [display:block] [margin-bottom:5px] [color:var(--faint)] [font-size:8px] [font-weight:700] [letter-spacing:0.12em] [text-transform:uppercase]`}>
                        Selected region
                      </span>
                      <h2>{selectedMeta.name}</h2>
                    </div>
                    <span
                      className={`status-pill [display:inline-flex] [flex:0_0_auto] [align-items:center] [padding:2px_6px] [border:1px_solid] [border-radius:999px] [font-size:7.5px] [font-weight:700] [letter-spacing:0.065em] [line-height:1.5] [text-transform:uppercase] [border-color:#d7e5d9] [background:#ecf4ed] [color:#2f6b4c] [border-color:#e9d8b5] [background:#f8f0de] [color:#8a6428] [.result-region_&]:[margin-top:1px] max-[560px]:[.result-region_&]:[display:none]`}
                      data-status={
                        selectedMeta.route_status === "Proposed"
                          ? "proposed"
                          : "known"
                      }
                    >
                      {selectedMeta.route_status}
                    </span>
                  </div>

                  <p className={`region-detail__route [margin-top:7px] [color:var(--muted)] [font-size:10px] [line-height:1.5]`}>
                    {selectedMeta.lotr_route}
                  </p>

                  <div className={`detail-metrics [display:grid] [grid-template-columns:repeat(3,_1fr)] [margin:11px_0] [padding:9px_0] [border-top:1px_solid_var(--line)] [border-bottom:1px_solid_var(--line)] [&>div]:[padding:0_10px] [&>div]:[border-left:1px_solid_var(--line)] [&>div:first-child]:[padding-left:0] [&>div:first-child]:[border-left:0] [&_b]:[display:block] [&_b]:[color:var(--ink)] [&_b]:[font-size:13px] [&_b]:[font-weight:600] [&_b]:[font-variant-numeric:tabular-nums] [&_b]:[letter-spacing:-0.02em] [&_b]:[line-height:1] [&_span]:[display:block] [&_span]:[margin-top:4px] [&_span]:[color:var(--faint)] [&_span]:[font-size:7.5px] [&_span]:[font-weight:600] [&_span]:[letter-spacing:0.085em] [&_span]:[text-transform:uppercase]`}>
                    <div>
                      <b>{hotelCounts.get(selectedMeta.id) ?? 0}</b>
                      <span>Hotels</span>
                    </div>
                    <div>
                      <b>{selectedMeta.areas_list.length}</b>
                      <span>Localities</span>
                    </div>
                    <div>
                      <b>{hexCounts.get(selectedMeta.id) ?? 0}</b>
                      <span>H3 cells</span>
                    </div>
                  </div>

                  <button
                    type="button"
                    className={`detail-cta [display:flex] [align-items:center] [justify-content:space-between] [width:100%] [height:38px] [margin:12px_0_14px] [padding:0_12px] [border-radius:9px] [background:var(--ink)] [color:var(--cream)] [font-size:10.5px] [font-weight:600] [letter-spacing:-0.005em] [transition:background_160ms_ease] hover:[background:#273a2f] [&_svg]:[transition:transform_160ms_ease] [&_:hover_svg]:[transform:translateX(2px)]`}
                    onClick={browseRegionHotels}
                  >
                    <span>
                      Browse {hotelCounts.get(selectedMeta.id) ?? 0} hotels
                      in {selectedMeta.code}
                    </span>
                    <ArrowRight size={14} />
                  </button>

                  <div className={`detail-label [display:flex] [align-items:center] [justify-content:space-between] [gap:12px] [margin-bottom:7px] [color:var(--muted)] [font-size:8px] [font-weight:700] [letter-spacing:0.1em] [text-transform:uppercase] [&>span:last-child]:[color:var(--faint)] [&>span:last-child]:[font-variant-numeric:tabular-nums]`}>
                    <span>Localities covered</span>
                    <span>{selectedMeta.areas_list.length}</span>
                  </div>
                  <div className={`area-chips [display:flex] [flex-wrap:wrap] [gap:5px] [max-height:112px] [padding-right:3px] [overflow-y:auto] [overscroll-behavior:contain] max-[560px]:[max-height:180px]`}>
                    {selectedMeta.areas_list.map((area) => (
                      <span className={`area-chip [display:inline-flex] [align-items:center] [gap:5px] [padding:4px_7px] [border:1px_solid_var(--line)] [border-radius:6px] [background:color-mix(in_srgb,_var(--paper-strong)_82%,_transparent)] [color:var(--ink-soft)] [font-size:9.5px] [line-height:1.32] before:[flex:0_0_auto] before:[width:3px] before:[height:3px] before:[border-radius:50%] before:[background:var(--region)] before:[content:""]`} key={area}>
                        {area}
                      </span>
                    ))}
                  </div>
                </section>
              ) : (
                <div className={`region-empty [display:flex] [align-items:flex-start] [gap:11px] [margin-top:16px] [padding:18px] [border:1px_dashed_var(--line-strong)] [border-radius:14px] [color:var(--faint)] [&_svg]:[flex:0_0_auto] [&_svg]:[margin-top:1px] [&_p]:[color:var(--muted)] [&_p]:[font-size:10.5px] [&_p]:[line-height:1.55] [&_strong]:[color:var(--ink-soft)] [&_strong]:[font-weight:600]`}>
                  <Compass size={18} />
                  <p>
                    <strong>Pick a region</strong> to unpack its localities,
                    hotel count and route status.
                  </p>
                </div>
              )}
            </div>
          ) : (
            <div
              className={`panel-body [flex:1] [min-height:0] [padding:0_22px_20px] [overflow-y:auto] [overscroll-behavior:contain] max-[1180px]:[padding:0_18px_18px] max-[760px]:[overflow:visible] max-[760px]:[padding:0_18px_20px] max-[560px]:[padding:0_16px_18px] panel-body--hotels [padding-top:0]`}
              role="tabpanel"
              id="panel-hotels"
              aria-labelledby="tab-hotels"
            >
              <div className={`hotel-tools [position:sticky] [top:0] [z-index:3] [margin:0_-22px] [padding:2px_22px_10px] [background:var(--paper)] [box-shadow:0_10px_14px_-16px_rgba(24,_36,_30,_0.35)] max-[1180px]:[margin:0_-18px] max-[1180px]:[padding:2px_18px_10px] max-[760px]:[position:static] max-[760px]:[margin:0_-18px] max-[760px]:[padding:0_18px_10px] max-[760px]:[box-shadow:none] max-[560px]:[margin:0_-16px] max-[560px]:[padding:0_16px_9px]`}>
                <label className={`hotel-search [position:relative] [display:flex] [align-items:center] [&>svg]:[position:absolute] [&>svg]:[left:11px] [&>svg]:[color:var(--faint)] [&>svg]:[pointer-events:none] [&_input]:[width:100%] [&_input]:[height:38px] [&_input]:[padding:0_34px_0_33px] [&_input]:[border:1px_solid_var(--line-strong)] [&_input]:[border-radius:9px] [&_input]:[outline:none] [&_input]:[background:var(--paper-strong)] [&_input]:[color:var(--ink)] [&_input]:[font-size:11.5px] [&_input]:[transition:border-color_150ms_ease,_box-shadow_150ms_ease,_background_150ms_ease] [&_input::placeholder]:[color:var(--faint)] [&_input::-webkit-search-cancel-button]:[display:none] [&_input:focus]:[border-color:var(--green)] [&_input:focus]:[background:#fffefb] [&_input:focus]:[box-shadow:0_0_0_3px_rgba(45,_91,_66,_0.09)]`}>
                  <Search size={14} aria-hidden="true" />
                  <input
                    type="search"
                    value={query}
                    onChange={(event) => setQuery(event.target.value)}
                    placeholder={`Search ${hotels.length} hotels by name`}
                    aria-label="Search hotels by name"
                  />
                  {query && (
                    <button
                      type="button"
                      className={`hotel-search__clear [position:absolute] [right:6px] [display:grid] [width:24px] [height:24px] [place-items:center] [border-radius:6px] [color:var(--muted)] hover:[background:var(--bone)] hover:[color:var(--ink)]`}
                      onClick={() => setQuery("")}
                      aria-label="Clear hotel search"
                    >
                      <X size={12} />
                    </button>
                  )}
                </label>

                <div
                  className={`filter-row [display:flex] [flex-wrap:wrap] [gap:4px] [margin-top:9px]`}
                  role="group"
                  aria-label="Filter hotels by region"
                >
                  <button
                    type="button"
                    className={`filter-chip [display:inline-flex] [align-items:center] [gap:5px] [height:25px] [padding:0_7px] [border:1px_solid_var(--line)] [border-radius:6px] [color:var(--muted)] [font-size:9px] [font-weight:600] [transition:background_140ms_ease,_color_140ms_ease,_border-color_140ms_ease] hover:[border-color:var(--line-strong)] hover:[background:var(--paper-strong)] [border-color:var(--ink)] [background:var(--ink)] [color:var(--cream)]`}
                    aria-pressed={regionFilter === "all"}
                    onClick={() => setRegionFilter("all")}
                  >
                    All
                    <span className={`filter-count [color:var(--faint)] [font-size:8px] [font-variant-numeric:tabular-nums] [.filter-chip[aria-pressed="true"]_&]:[color:rgba(251,_247,_236,_0.5)]`}>{hotels.length}</span>
                  </button>
                  {regions.map((region) => (
                    <button
                      type="button"
                      key={region.id}
                      className={`filter-chip [display:inline-flex] [align-items:center] [gap:5px] [height:25px] [padding:0_7px] [border:1px_solid_var(--line)] [border-radius:6px] [color:var(--muted)] [font-size:9px] [font-weight:600] [transition:background_140ms_ease,_color_140ms_ease,_border-color_140ms_ease] hover:[border-color:var(--line-strong)] hover:[background:var(--paper-strong)] [border-color:var(--ink)] [background:var(--ink)] [color:var(--cream)]`}
                      style={regionStyle(region.color)}
                      aria-pressed={regionFilter === region.id}
                      onClick={() => setRegionFilter(region.id)}
                    >
                      <span className={`filter-dot [width:5px] [height:5px] [border-radius:50%] [background:var(--c)] [.filter-chip[aria-pressed="true"]_&]:[box-shadow:0_0_0_1.5px_rgba(255,_255,_255,_0.2)]`} />
                      {region.code}
                      <span className={`filter-count [color:var(--faint)] [font-size:8px] [font-variant-numeric:tabular-nums] [.filter-chip[aria-pressed="true"]_&]:[color:rgba(251,_247,_236,_0.5)]`}>
                        {hotelCounts.get(region.id) ?? 0}
                      </span>
                    </button>
                  ))}
                </div>

                <div className={`hotel-meta-row [display:flex] [align-items:center] [justify-content:space-between] [gap:12px] [margin:11px_0_5px] [color:var(--faint)] [font-size:8px] [font-weight:700] [letter-spacing:0.095em] [text-transform:uppercase]`}>
                  <span>{neighbourhoodLabel}</span>
                  <span>Sorted A–Z</span>
                </div>
              </div>

              <div className={`hotel-list [display:flex] [flex-direction:column] [gap:2px]`}>
                {filteredHotels.map((hotel) => {
                  const meta = regionById.get(hotel.region);
                  const isCurrent =
                    activeHotel !== null &&
                    hotelKey(activeHotel) === hotelKey(hotel);

                  return (
                    <button
                      type="button"
                      key={`${hotel.name}-${hotel.lat}-${hotel.lon}`}
                      className={`hotel-row [display:grid] [grid-template-columns:6px_minmax(0,_1fr)_auto] [gap:9px] [align-items:center] [width:100%] [padding:8px] [border:1px_solid_transparent] [border-radius:8px] [text-align:left] [transition:background_140ms_ease,_border-color_140ms_ease] hover:[border-color:var(--line)] hover:[background:var(--paper-strong)] [border-color:var(--line-strong)] [background:var(--paper-strong)] [&_[aria-current="true"]>_svg]:[opacity:1] [&>svg]:[color:var(--faint)] [&>svg]:[opacity:0.4] [&>svg]:[transition:opacity_140ms_ease,_transform_140ms_ease] [&_:hover>_svg]:[opacity:1] [&_:hover>_svg]:[transform:translate(1px,_-1px)]`}
                      style={regionStyle(meta?.color ?? "#3E4C43")}
                      onClick={() => selectHotel(hotel, true)}
                      aria-label={`Focus ${hotel.name} in ${meta?.code ?? "its region"}`}
                      aria-current={isCurrent ? "true" : undefined}
                    >
                      <span className={`hotel-row__dot [.hotel-row[aria-current="true"]_&]:[box-shadow:0_0_0_3px_color-mix(in_srgb,_var(--c)_16%,_transparent)] [width:5px] [height:5px] [border-radius:50%] [background:var(--c)] [box-shadow:0_0_0_2px_color-mix(in_srgb,_var(--c)_12%,_transparent)]`} />
                      <span className={`hotel-row__copy [display:flex] [flex-direction:column] [gap:2px] [min-width:0]`}>
                        <span className={`hotel-row__name [overflow:hidden] [color:var(--ink)] [font-size:11.5px] [font-weight:600] [letter-spacing:-0.005em] [line-height:1.32] [text-overflow:ellipsis] [white-space:nowrap]`}>
                          {hotel.name}
                        </span>
                        <span className={`hotel-row__meta [overflow:hidden] [color:var(--faint)] [font-size:8.5px] [letter-spacing:0.01em] [text-overflow:ellipsis] [white-space:nowrap]`}>
                          {meta?.code ?? "—"} · {hotel.stop_mins} min stop ·{" "}
                          {hotel.load} bags
                        </span>
                      </span>
                      <ArrowUpRight size={13} />
                    </button>
                  );
                })}
              </div>

              {filteredHotels.length === 0 && (
                <div className={`hotels-empty flex flex-col items-center gap-[7px] pt-[42px] pr-[20px] pb-[42px] pl-[20px] text-faint text-center [&_p]:text-muted [&_p]:text-[11px] [&_button]:mt-[3px] [&_button]:text-green [&_button]:text-[9.5px] [&_button]:font-bold [&_button]:underline [&_button]:underline-offset-2 flex flex-col items-center gap-[4px] pt-[48px] pr-[16px] pb-[48px] pl-[16px] text-faint text-center [&_b]:text-ink-soft [&_b]:text-[11px] [&_span]:text-[9px] flex flex-col items-center gap-[7px] pt-[42px] pr-[20px] pb-[42px] pl-[20px] text-faint text-center [&_p]:text-muted [&_p]:text-[11px] [&_button]:mt-[3px] [&_button]:text-green [&_button]:text-[9.5px] [&_button]:font-bold [&_button]:underline [&_button]:underline-offset-2 flex flex-col items-center gap-[4px] pt-[48px] pr-[16px] pb-[48px] pl-[16px] text-faint text-center [&_b]:text-ink-soft [&_b]:text-[11px] [&_span]:text-[9px] [display:flex] [flex-direction:column] [align-items:center] [gap:7px] [padding:42px_20px] [color:var(--faint)] [text-align:center] [&_p]:[color:var(--muted)] [&_p]:[font-size:11px] [&_button]:[margin-top:3px] [&_button]:[color:var(--green)] [&_button]:[font-size:9.5px] [&_button]:[font-weight:700] [&_button]:[text-decoration:underline] [&_button]:[text-underline-offset:2px]`}>
                  <SearchX size={20} />
                  <p>No hotels match that search.</p>
                  <button
                    type="button"
                    onClick={() => {
                      setQuery("");
                      setRegionFilter("all");
                    }}
                  >
                    Clear filters
                  </button>
                </div>
              )}
            </div>
          )}

          <footer className={`panel-foot [display:flex] [flex:0_0_auto] [align-items:center] [justify-content:space-between] [gap:12px] [padding:9px_22px] [border-top:1px_solid_var(--line)] [background:var(--paper)] [color:var(--faint)] [font-size:7.5px] [font-weight:600] [letter-spacing:0.075em] [text-transform:uppercase] [&>span]:[display:flex] [&>span]:[align-items:center] [&>span]:[gap:6px] max-[1180px]:[padding:9px_18px] max-[760px]:[padding:10px_18px] max-[560px]:[padding:10px_16px] max-[560px]:[font-size:7px] max-[560px]:[&>span:last-child]:[display:none]`}>
            <span>
              <span className={`panel-foot__dot [width:4px] [height:4px] [border-radius:50%] [background:#3c7a55]`} />
              H3 · R7 · {Object.keys(hexMap).length} cells
            </span>
            <span>LinenGrass · Ops</span>
          </footer>
            </>
          )}
        </aside>
      </main>

      {lookupOpen && (
        <div
          className={`modal-backdrop [position:fixed] [inset:0] [z-index:200] [display:grid] [place-items:center] [padding:20px] [background:rgba(17,_27,_22,_0.46)] [animation:fade-in_160ms_ease_both] [backdrop-filter:blur(7px)] [position:fixed] [inset:0] [z-index:200] [display:grid] [place-items:center] [padding:20px] [background:rgba(17,_27,_22,_0.46)] [animation:fade-in_160ms_ease_both] [backdrop-filter:blur(7px)]`}
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) closeLookup();
          }}
        >
          <div
            className={`lookup-dialog [position:relative] [width:min(462px,_100%)] [max-height:calc(100svh_-_40px)] [padding:25px] [overflow-y:auto] [border:1px_solid_rgba(255,_255,_255,_0.38)] [border-radius:16px] [background:var(--paper-strong)] [box-shadow:0_30px_80px_rgba(12,_20,_16,_0.36)] [animation:dialog-in_200ms_ease_both] [&_h2]:[margin:11px_38px_8px_0] [&_h2]:[color:var(--ink)] [&_h2]:[font-family:var(--font-instrument-serif),_Georgia,_"Times_New_Roman",_serif] [&_h2]:[font-size:32px] [&_h2]:[font-weight:400] [&_h2]:[letter-spacing:-0.018em] [&_h2]:[line-height:1.02] [&_label]:[display:block] [&_label]:[margin-bottom:6px] [&_label]:[color:var(--muted)] [&_label]:[font-size:8.5px] [&_label]:[font-weight:700] [&_label]:[letter-spacing:0.09em] [&_label]:[text-transform:uppercase] max-[560px]:[padding:21px_18px] max-[560px]:[border-radius:14px] max-[560px]:[&_h2]:[font-size:28px] max-[560px]:[&_h2]:[margin-top:10px]`}
            role="dialog"
            aria-modal="true"
            aria-labelledby="lookup-title"
          >
            <button
              type="button"
              className={`dialog-close [position:absolute] [top:13px] [right:13px] [display:grid] [width:28px] [height:28px] [place-items:center] [border-radius:7px] [color:var(--muted)] hover:[background:var(--bone)] hover:[color:var(--ink)] [position:absolute] [top:13px] [right:13px] [display:grid] [width:28px] [height:28px] [place-items:center] [border-radius:7px] [color:var(--muted)] hover:[background:var(--bone)] hover:[color:var(--ink)]`}
              onClick={closeLookup}
              aria-label="Close coordinate lookup"
            >
              <X size={16} />
            </button>

            <span className={`dialog-eyebrow [display:flex] [align-items:center] [gap:6px] [color:var(--muted)] [font-size:8.5px] [font-weight:700] [letter-spacing:0.13em] [text-transform:uppercase] [display:flex] [align-items:center] [gap:6px] [color:var(--muted)] [font-size:8.5px] [font-weight:700] [letter-spacing:0.13em] [text-transform:uppercase]`}>
              <Crosshair size={12} />
              Coordinate lookup
            </span>

            {lookupResult && resultRegion ? (
              <>
                <h2 id="lookup-title">
                  {lookupResult.inside
                    ? "Inside the footprint"
                    : "Outside the footprint"}
                </h2>
                <p className={`dialog-lede [max-width:368px] [margin-bottom:18px] [color:var(--muted)] [font-size:11.5px] [line-height:1.55] max-[560px]:[margin-bottom:15px] max-[560px]:[font-size:11px]`}>
                  {lookupResult.inside
                    ? "This point lands in a mapped H3 cell. Here is the owning region and its closest hotel."
                    : "This point sits outside the mapped H3 cells, so the nearest operational region is shown."}
                </p>

                <div className={`lookup-coords [display:flex] [align-items:center] [gap:8px] [padding:10px_11px] [border:1px_solid_var(--line)] [border-radius:9px] [background:var(--paper)] [color:var(--ink-soft)] [font-family:var(--font-mono)] [font-size:10.5px] [&_svg]:[flex:0_0_auto] [&_svg]:[color:var(--faint)]`}>
                  <MapPin size={14} />
                  <span>{coordinateLabel(lookupResult.lat, lookupResult.lon)}</span>
                </div>

                <div
                  className={`result-region [display:flex] [align-items:flex-start] [gap:10px] [margin-top:10px] [padding:12px] [border:1px_solid_color-mix(in_srgb,_var(--region)_20%,_var(--line))] [border-radius:10px] [background:color-mix(in_srgb,_var(--region)_4%,_var(--paper-strong))] max-[560px]:[gap:8px] max-[560px]:[padding:10px]`}
                  style={regionStyle(resultRegion.color)}
                >
                  <span className={`result-region__code [display:grid] [flex:0_0_auto] [width:38px] [height:38px] [place-items:center] [border:1px_solid_color-mix(in_srgb,_var(--region)_22%,_transparent)] [border-radius:9px] [background:color-mix(in_srgb,_var(--region)_10%,_var(--paper-strong))] [color:var(--region)] [font-family:var(--font-mono)] [font-size:10px] [font-weight:700]`}>
                    {resultRegion.code}
                  </span>
                  <div className={`result-region__body [flex:1] [min-width:0]`}>
                    <div className={`result-region__name [color:var(--ink)] [font-size:11.5px] [font-weight:600] [letter-spacing:-0.01em] [line-height:1.3]`}>
                      {resultRegion.short_name}
                    </div>
                    <div className={`result-region__route [margin-top:2px] [color:var(--muted)] [font-size:8.5px] [line-height:1.4]`}>
                      {resultRegion.lotr_route}
                    </div>
                  </div>
                  <span
                    className={`status-pill [display:inline-flex] [flex:0_0_auto] [align-items:center] [padding:2px_6px] [border:1px_solid] [border-radius:999px] [font-size:7.5px] [font-weight:700] [letter-spacing:0.065em] [line-height:1.5] [text-transform:uppercase] [border-color:#d7e5d9] [background:#ecf4ed] [color:#2f6b4c] [border-color:#e9d8b5] [background:#f8f0de] [color:#8a6428] [.result-region_&]:[margin-top:1px] max-[560px]:[.result-region_&]:[display:none]`}
                    data-status={
                      resultRegion.route_status === "Proposed"
                        ? "proposed"
                        : "known"
                    }
                  >
                    {resultRegion.route_status}
                  </span>
                </div>

                <dl className={`result-facts [display:flex] [flex-direction:column] [margin-top:12px] [border-top:1px_solid_var(--line)] [&>div]:[display:flex] [&>div]:[align-items:baseline] [&>div]:[justify-content:space-between] [&>div]:[gap:14px] [&>div]:[padding:8px_0] [&>div]:[border-bottom:1px_solid_var(--line)] [&_dt]:[flex:0_0_auto] [&_dt]:[color:var(--faint)] [&_dt]:[font-size:9.5px] [&_dd]:[color:var(--ink-soft)] [&_dd]:[font-size:10px] [&_dd]:[font-weight:600] [&_dd]:[line-height:1.4] [&_dd]:[text-align:right] max-[560px]:[&>div]:[gap:10px]`}>
                  <div>
                    <dt>Nearest hotel</dt>
                    <dd>{lookupResult.nearestHotel?.name ?? "None on record"}</dd>
                  </div>
                  <div>
                    <dt>Distance to hotel</dt>
                    <dd>{formatDistance(lookupResult.nearestDistanceKm)}</dd>
                  </div>
                  <div>
                    <dt>From city centre</dt>
                    <dd>{formatDistance(lookupResult.centerDistanceKm)}</dd>
                  </div>
                  <div>
                    <dt>Coverage cell</dt>
                    <dd className={`result-facts__mono [font-family:var(--font-mono)] [font-size:9px] [font-weight:500] [word-break:break-all]`}>
                      {lookupResult.cell || "—"}
                    </dd>
                  </div>
                </dl>

                <div className={`dialog-actions [display:flex] [justify-content:flex-end] [gap:8px] [margin-top:20px] max-[560px]:[margin-top:17px]`}>
                  <button
                    type="button"
                    className={`btn [.plan-actions_>_&]:[height:33px] [.plan-actions_>_&]:[padding:0_11px] [.plan-actions_>_&]:[font-size:10px] [.map-error__card_&]:[margin-top:8px] [display:inline-flex] [align-items:center] [justify-content:center] [gap:7px] [height:37px] [padding:0_14px] [border:1px_solid_transparent] [border-radius:9px] [font-size:10.5px] [font-weight:600] [letter-spacing:-0.005em] [transition:background_150ms_ease,_border-color_150ms_ease] max-[560px]:[.dialog-actions_&]:[flex:1] [.plan-actions_>_&]:[height:33px] [.plan-actions_>_&]:[padding:0_11px] [.plan-actions_>_&]:[font-size:10px] btn--ghost [border-color:var(--line-strong)] [color:var(--ink-soft)] [&:hover:not(:disabled)]:[background:var(--bone)] disabled:[opacity:0.45] disabled:[cursor:not-allowed]`}
                    onClick={resetLookup}
                  >
                    Look up another
                  </button>
                  <button
                    type="button"
                    className={`btn [.plan-actions_>_&]:[height:33px] [.plan-actions_>_&]:[padding:0_11px] [.plan-actions_>_&]:[font-size:10px] [.map-error__card_&]:[margin-top:8px] [display:inline-flex] [align-items:center] [justify-content:center] [gap:7px] [height:37px] [padding:0_14px] [border:1px_solid_transparent] [border-radius:9px] [font-size:10.5px] [font-weight:600] [letter-spacing:-0.005em] [transition:background_150ms_ease,_border-color_150ms_ease] max-[560px]:[.dialog-actions_&]:[flex:1] [.plan-actions_>_&]:[height:33px] [.plan-actions_>_&]:[padding:0_11px] [.plan-actions_>_&]:[font-size:10px] btn--primary [background:var(--ink)] [color:var(--cream)] hover:[background:#273a2f]`}
                    onClick={closeLookup}
                  >
                    View on map
                    <ArrowRight size={14} />
                  </button>
                </div>
              </>
            ) : (
              <>
                <h2 id="lookup-title">Trace a coordinate</h2>
                <p className={`dialog-lede [max-width:368px] [margin-bottom:18px] [color:var(--muted)] [font-size:11.5px] [line-height:1.55] max-[560px]:[margin-bottom:15px] max-[560px]:[font-size:11px]`}>
                  Paste a latitude and longitude to find its coverage cell,
                  owning region and nearest hotel.
                </p>

                <form onSubmit={handleLookupSubmit}>
                  <label htmlFor="coordinate-input">Latitude, longitude</label>
                  <div className={`coord-input [display:flex] [align-items:center] [gap:9px] [height:46px] [padding:0_12px] [border:1px_solid_var(--line-strong)] [border-radius:10px] [background:var(--paper)] [transition:border-color_150ms_ease,_box-shadow_150ms_ease,_background_150ms_ease] focus-within:[border-color:var(--green)] focus-within:[background:#fffefb] focus-within:[box-shadow:0_0_0_3px_rgba(45,_91,_66,_0.1)] [&>svg]:[flex:0_0_auto] [&>svg]:[color:var(--faint)] [&_input]:[width:100%] [&_input]:[border:0] [&_input]:[outline:none] [&_input]:[background:none] [&_input]:[color:var(--ink)] [&_input]:[font-family:var(--font-mono)] [&_input]:[font-size:12px] [&_input]:[letter-spacing:0.01em] [&_input::placeholder]:[color:var(--faint)]`}>
                    <MapPin size={15} aria-hidden="true" />
                    <input
                      id="coordinate-input"
                      value={lookupInput}
                      onChange={(event) => {
                        setLookupInput(event.target.value);
                        if (lookupError) setLookupError("");
                      }}
                      placeholder="12.9716, 77.5946"
                      inputMode="decimal"
                      autoComplete="off"
                      spellCheck={false}
                      autoFocus
                    />
                  </div>
                  <div className={`lookup-hint [display:flex] [align-items:center] [justify-content:space-between] [gap:12px] [margin-top:6px] [color:var(--faint)] [font-size:8.5px] max-[560px]:[align-items:flex-start] max-[560px]:[flex-direction:column] max-[560px]:[gap:3px]`}>
                    <span>Decimal degrees · comma separated</span>
                    <button
                      type="button"
                      className={`lookup-example [flex:0_0_auto] [border-bottom:1px_solid_rgba(45,_91,_66,_0.24)] [color:var(--green)] [font-size:8.5px] [font-weight:600] hover:[border-bottom-color:var(--green)]`}
                      onClick={() => setLookupInput("12.9716, 77.5946")}
                    >
                      Use city centre
                    </button>
                  </div>

                  {lookupError && (
                    <div className={`lookup-error [margin-top:10px] [padding:7px_9px] [border:1px_solid_#efd5cf] [border-radius:7px] [background:#faedea] [color:var(--danger)] [font-size:10px] [line-height:1.45]`} role="alert">
                      {lookupError}
                    </div>
                  )}

                  <div className={`dialog-actions [display:flex] [justify-content:flex-end] [gap:8px] [margin-top:20px] max-[560px]:[margin-top:17px]`}>
                    <button
                      type="button"
                      className={`btn [.plan-actions_>_&]:[height:33px] [.plan-actions_>_&]:[padding:0_11px] [.plan-actions_>_&]:[font-size:10px] [.map-error__card_&]:[margin-top:8px] [display:inline-flex] [align-items:center] [justify-content:center] [gap:7px] [height:37px] [padding:0_14px] [border:1px_solid_transparent] [border-radius:9px] [font-size:10.5px] [font-weight:600] [letter-spacing:-0.005em] [transition:background_150ms_ease,_border-color_150ms_ease] max-[560px]:[.dialog-actions_&]:[flex:1] [.plan-actions_>_&]:[height:33px] [.plan-actions_>_&]:[padding:0_11px] [.plan-actions_>_&]:[font-size:10px] btn--ghost [border-color:var(--line-strong)] [color:var(--ink-soft)] [&:hover:not(:disabled)]:[background:var(--bone)] disabled:[opacity:0.45] disabled:[cursor:not-allowed]`}
                      onClick={closeLookup}
                    >
                      Cancel
                    </button>
                    <button type="submit" className={`btn [.plan-actions_>_&]:[height:33px] [.plan-actions_>_&]:[padding:0_11px] [.plan-actions_>_&]:[font-size:10px] [.map-error__card_&]:[margin-top:8px] [display:inline-flex] [align-items:center] [justify-content:center] [gap:7px] [height:37px] [padding:0_14px] [border:1px_solid_transparent] [border-radius:9px] [font-size:10.5px] [font-weight:600] [letter-spacing:-0.005em] [transition:background_150ms_ease,_border-color_150ms_ease] max-[560px]:[.dialog-actions_&]:[flex:1] [.plan-actions_>_&]:[height:33px] [.plan-actions_>_&]:[padding:0_11px] [.plan-actions_>_&]:[font-size:10px] btn--primary [background:var(--ink)] [color:var(--cream)] hover:[background:#273a2f]`}>
                      <Crosshair size={14} />
                      Locate pin
                    </button>
                  </div>
                </form>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
