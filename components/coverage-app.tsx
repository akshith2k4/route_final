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
    <div className="app">
      <header className="topbar">
        <button
          type="button"
          className="brand"
          onClick={resetView}
          aria-label="LinenGrass coverage atlas — reset the view"
        >
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
            <span className="brand-sub">Field atlas</span>
          </span>
        </button>

        <nav className="topnav" aria-label="Primary">
          <button
            type="button"
            className={`topnav__item ${activeWorkspace === "coverage" ? "topnav__item--active" : ""}`}
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
            className={`topnav__item ${activeWorkspace === "manual" ? "topnav__item--active" : ""}`}
            onClick={() => {
              setActiveWorkspace("manual");
              setSelectedRouteIndex(null);
              setSelectedStopNumber(null);
            }}
          >
            Manual routes
            <span className="topnav__live-pill">8 Routes</span>
          </button>
          <Link className="topnav__item" href="/plan">
            Plan canvas
            <ArrowUpRight size={11} />
          </Link>
          {SHOW_DISPATCH_AND_STUDIO && (
            <>
              <button
                type="button"
                className={`topnav__item ${activeWorkspace === "dispatch" ? "topnav__item--active" : ""}`}
                onClick={() => {
                  setActiveWorkspace("dispatch");
                  setSelectedRouteIndex(null);
                  setSelectedStopNumber(null);
                }}
              >
                Dispatch
                <span className="topnav__live-pill">Live plan</span>
              </button>
              <button
                type="button"
                className={`topnav__item ${activeWorkspace === "studio" ? "topnav__item--active" : ""}`}
                onClick={() => {
                  setActiveWorkspace("studio");
                  setSelectedRouteIndex(null);
                  setSelectedStopNumber(null);
                }}
              >
                Studio
                <span className="topnav__studio-pill">Custom plan</span>
              </button>
            </>
          )}
        </nav>

        <div className="topbar__actions">
          <div className="topbar-stat">
            <span className="topbar-stat__dot" />
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
            className="lookup-button"
            onClick={openLookup}
          >
            <Crosshair size={14} />
            <span>Look up a pin</span>
            <kbd>⌘K</kbd>
          </button>
        </div>
      </header>

      <main className="workspace">
        <section className="map-stage" aria-label="Coverage map">
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
          className="panel"
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
          <div className="panel-intro">
            <span className="eyebrow">
              <span className="eyebrow__dot" />
              Bengaluru · Coverage atlas
            </span>
            <h1>Hotel coverage</h1>
            <p>
              Every property, locality and route footprint across the city —
              mapped as one working picture.
            </p>
            <div className="intro-stats">
              <div className="intro-stat">
                <b>{hotels.length}</b>
                <span>Hotels</span>
              </div>
              <div className="intro-stat">
                <b>{regions.length}</b>
                <span>Regions</span>
              </div>
              <div className="intro-stat">
                <b>{localityCount}</b>
                <span>Localities</span>
              </div>
            </div>
          </div>

          <div
            className="panel-tabs"
            role="tablist"
            aria-label="Coverage views"
          >
            <button
              type="button"
              className="panel-tab"
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
              className="panel-tab"
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
              className="panel-body"
              role="tabpanel"
              id="panel-regions"
              aria-labelledby="tab-regions"
            >
              <div className="region-rail-block">
                <div className="regions-head">
                  <span>Operational regions</span>
                  {selectedRegion !== null ? (
                    <button
                      type="button"
                      onClick={() => selectRegion(null, true)}
                    >
                      Show all
                    </button>
                  ) : (
                    <span className="regions-head__hint">
                      Click to explore
                    </span>
                  )}
                </div>

                <div
                  className="region-rail"
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
                        className="region-pill"
                        style={regionStyle(region.color)}
                        data-proposed={region.route_status === "Proposed"}
                        aria-pressed={isActive}
                        aria-label={`${region.code} ${region.short_name}, ${count} hotels, ${region.route_status}`}
                        title={`${region.code} · ${region.short_name} · ${region.route_status}`}
                        onClick={() => selectRegion(region.id, true)}
                        onMouseEnter={() => setHoveredRegion(region.id)}
                        onMouseLeave={() => setHoveredRegion(null)}
                      >
                        <span className="region-pill__top">
                          <span className="region-pill__dot" />
                          <b>{region.code}</b>
                          <span className="region-pill__count">{count}</span>
                        </span>
                        <span className="region-pill__name">
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
                  className="region-detail"
                  style={regionStyle(selectedMeta.color)}
                  aria-live="polite"
                >
                  <div className="region-detail__head">
                    <div className="region-detail__title">
                      <span className="region-detail__kicker">
                        Selected region
                      </span>
                      <h2>{selectedMeta.name}</h2>
                    </div>
                    <span
                      className="status-pill"
                      data-status={
                        selectedMeta.route_status === "Proposed"
                          ? "proposed"
                          : "known"
                      }
                    >
                      {selectedMeta.route_status}
                    </span>
                  </div>

                  <p className="region-detail__route">
                    {selectedMeta.lotr_route}
                  </p>

                  <div className="detail-metrics">
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
                    className="detail-cta"
                    onClick={browseRegionHotels}
                  >
                    <span>
                      Browse {hotelCounts.get(selectedMeta.id) ?? 0} hotels
                      in {selectedMeta.code}
                    </span>
                    <ArrowRight size={14} />
                  </button>

                  <div className="detail-label">
                    <span>Localities covered</span>
                    <span>{selectedMeta.areas_list.length}</span>
                  </div>
                  <div className="area-chips">
                    {selectedMeta.areas_list.map((area) => (
                      <span className="area-chip" key={area}>
                        {area}
                      </span>
                    ))}
                  </div>
                </section>
              ) : (
                <div className="region-empty">
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
              className="panel-body panel-body--hotels"
              role="tabpanel"
              id="panel-hotels"
              aria-labelledby="tab-hotels"
            >
              <div className="hotel-tools">
                <label className="hotel-search">
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
                      className="hotel-search__clear"
                      onClick={() => setQuery("")}
                      aria-label="Clear hotel search"
                    >
                      <X size={12} />
                    </button>
                  )}
                </label>

                <div
                  className="filter-row"
                  role="group"
                  aria-label="Filter hotels by region"
                >
                  <button
                    type="button"
                    className="filter-chip"
                    aria-pressed={regionFilter === "all"}
                    onClick={() => setRegionFilter("all")}
                  >
                    All
                    <span className="filter-count">{hotels.length}</span>
                  </button>
                  {regions.map((region) => (
                    <button
                      type="button"
                      key={region.id}
                      className="filter-chip"
                      style={regionStyle(region.color)}
                      aria-pressed={regionFilter === region.id}
                      onClick={() => setRegionFilter(region.id)}
                    >
                      <span className="filter-dot" />
                      {region.code}
                      <span className="filter-count">
                        {hotelCounts.get(region.id) ?? 0}
                      </span>
                    </button>
                  ))}
                </div>

                <div className="hotel-meta-row">
                  <span>{neighbourhoodLabel}</span>
                  <span>Sorted A–Z</span>
                </div>
              </div>

              <div className="hotel-list">
                {filteredHotels.map((hotel) => {
                  const meta = regionById.get(hotel.region);
                  const isCurrent =
                    activeHotel !== null &&
                    hotelKey(activeHotel) === hotelKey(hotel);

                  return (
                    <button
                      type="button"
                      key={`${hotel.name}-${hotel.lat}-${hotel.lon}`}
                      className="hotel-row"
                      style={regionStyle(meta?.color ?? "#3E4C43")}
                      onClick={() => selectHotel(hotel, true)}
                      aria-label={`Focus ${hotel.name} in ${meta?.code ?? "its region"}`}
                      aria-current={isCurrent ? "true" : undefined}
                    >
                      <span className="hotel-row__dot" />
                      <span className="hotel-row__copy">
                        <span className="hotel-row__name">
                          {hotel.name}
                        </span>
                        <span className="hotel-row__meta">
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
                <div className="hotels-empty">
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

          <footer className="panel-foot">
            <span>
              <span className="panel-foot__dot" />
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
          className="modal-backdrop"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) closeLookup();
          }}
        >
          <div
            className="lookup-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="lookup-title"
          >
            <button
              type="button"
              className="dialog-close"
              onClick={closeLookup}
              aria-label="Close coordinate lookup"
            >
              <X size={16} />
            </button>

            <span className="dialog-eyebrow">
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
                <p className="dialog-lede">
                  {lookupResult.inside
                    ? "This point lands in a mapped H3 cell. Here is the owning region and its closest hotel."
                    : "This point sits outside the mapped H3 cells, so the nearest operational region is shown."}
                </p>

                <div className="lookup-coords">
                  <MapPin size={14} />
                  <span>{coordinateLabel(lookupResult.lat, lookupResult.lon)}</span>
                </div>

                <div
                  className="result-region"
                  style={regionStyle(resultRegion.color)}
                >
                  <span className="result-region__code">
                    {resultRegion.code}
                  </span>
                  <div className="result-region__body">
                    <div className="result-region__name">
                      {resultRegion.short_name}
                    </div>
                    <div className="result-region__route">
                      {resultRegion.lotr_route}
                    </div>
                  </div>
                  <span
                    className="status-pill"
                    data-status={
                      resultRegion.route_status === "Proposed"
                        ? "proposed"
                        : "known"
                    }
                  >
                    {resultRegion.route_status}
                  </span>
                </div>

                <dl className="result-facts">
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
                    <dd className="result-facts__mono">
                      {lookupResult.cell || "—"}
                    </dd>
                  </div>
                </dl>

                <div className="dialog-actions">
                  <button
                    type="button"
                    className="btn btn--ghost"
                    onClick={resetLookup}
                  >
                    Look up another
                  </button>
                  <button
                    type="button"
                    className="btn btn--primary"
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
                <p className="dialog-lede">
                  Paste a latitude and longitude to find its coverage cell,
                  owning region and nearest hotel.
                </p>

                <form onSubmit={handleLookupSubmit}>
                  <label htmlFor="coordinate-input">Latitude, longitude</label>
                  <div className="coord-input">
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
                  <div className="lookup-hint">
                    <span>Decimal degrees · comma separated</span>
                    <button
                      type="button"
                      className="lookup-example"
                      onClick={() => setLookupInput("12.9716, 77.5946")}
                    >
                      Use city centre
                    </button>
                  </div>

                  {lookupError && (
                    <div className="lookup-error" role="alert">
                      {lookupError}
                    </div>
                  )}

                  <div className="dialog-actions">
                    <button
                      type="button"
                      className="btn btn--ghost"
                      onClick={closeLookup}
                    >
                      Cancel
                    </button>
                    <button type="submit" className="btn btn--primary">
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
