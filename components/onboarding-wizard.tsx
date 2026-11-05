"use client";

import Link from "next/link";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type FormEvent,
} from "react";
import {
  AlertCircle,
  ArrowLeft,
  ArrowRight,
  ArrowUpRight,
  Award,
  Building2,
  Check,
  ChevronDown,
  ChevronRight,
  Compass,
  Crosshair,
  Download,
  Eye,
  FileSpreadsheet,
  FileText,
  Filter,
  HelpCircle,
  Layers,
  MapPin,
  RefreshCw,
  Search,
  Sliders,
  Sparkles,
  TrendingDown,
  TrendingUp,
  Truck,
  Upload,
  Warehouse,
  X,
} from "lucide-react";
import OnboardingMap, {
  type OnboardingMapHandle,
} from "./onboarding-map";
import {
  CITY_PRESETS,
  evaluateMultiK,
  generateH3HexMap,
  haversineKm,
  parseHotelsCsv,
  type CityPreset,
  type ClusterEvaluation,
  type OnboardingHotel,
  type RegionMetaDefinition,
} from "../lib/onboarding";
import hotelsJson from "../data/hotels.json";

type WizardStep = 1 | 2 | 3 | 4;

type OnboardingWizardProps = {
  initialCityId?: string;
};

export default function OnboardingWizard({
  initialCityId = "bengaluru",
}: OnboardingWizardProps) {
  const mapRef = useRef<OnboardingMapHandle | null>(null);

  // STEP 1: City & Hub Setup State
  const [selectedPresetId, setSelectedPresetId] = useState<string>(initialCityId);
  const [cityState, setCityState] = useState<string>("Karnataka");
  const [cityName, setCityName] = useState<string>("Bengaluru");
  const [depotName, setDepotName] = useState<string>("LinenGrass HQ (Yeshwanthpur)");
  const [centerLat, setCenterLat] = useState<number>(12.9716);
  const [centerLon, setCenterLon] = useState<number>(77.5946);
  const [pickCenterMode, setPickCenterMode] = useState<boolean>(false);

  // STEP 2: Hotel Ingestion State
  const [hotels, setHotels] = useState<OnboardingHotel[]>([]);
  const [csvRawText, setCsvRawText] = useState<string>("");
  const [csvFileName, setCsvFileName] = useState<string>("");
  const [ingestErrors, setIngestErrors] = useState<string[]>([]);
  const [ingestWarnings, setIngestWarnings] = useState<string[]>([]);
  const [hotelFilterQuery, setHotelFilterQuery] = useState<string>("");
  const [activeTabIngest, setActiveTabIngest] = useState<"upload" | "paste" | "sample">("upload");

  // STEP 3: Multi-K Evaluation State
  const [evaluations, setEvaluations] = useState<ClusterEvaluation[]>([]);
  const [selectedK, setSelectedK] = useState<number>(5);
  const [isEvaluating, setIsEvaluating] = useState<boolean>(false);
  const [evalMinK, setEvalMinK] = useState<number>(3);
  const [evalMaxK, setEvalMaxK] = useState<number>(9);

  // STEP 4: Hex Map & Visualization State
  const [hexDensity, setHexDensity] = useState<"corridor" | "standard" | "dense">("standard");
  const [showHexagons, setShowHexagons] = useState<boolean>(true);
  const [showHotels, setShowHotels] = useState<boolean>(true);
  const [showOutlines, setShowOutlines] = useState<boolean>(true);
  const [hexOpacity, setHexOpacity] = useState<number>(0.35);
  const [selectedRegionId, setSelectedRegionId] = useState<number | null>(null);
  const [hoveredRegionId, setHoveredRegionId] = useState<number | null>(null);
  const [selectedHotel, setSelectedHotel] = useState<OnboardingHotel | null>(null);
  const [pinnedCoord, setPinnedCoord] = useState<{
    lat: number;
    lon: number;
    cell: string;
    regionId?: number;
  } | null>(null);

  // Current Active Wizard Step
  const [currentStep, setCurrentStep] = useState<WizardStep>(1);

  // Handle City Preset Change
  const handleSelectPreset = useCallback((presetId: string) => {
    setSelectedPresetId(presetId);
    const preset = CITY_PRESETS.find((p) => p.id === presetId);
    if (!preset) return;
    setCityState(preset.state);
    setCityName(preset.name);
    setDepotName(preset.depotName);
    setCenterLat(preset.centerLat);
    setCenterLon(preset.centerLon);
  }, []);

  // Map Pick Center Callback
  const handlePickCenter = useCallback((lat: number, lon: number) => {
    setCenterLat(Math.round(lat * 100000) / 100000);
    setCenterLon(Math.round(lon * 100000) / 100000);
    setPickCenterMode(false);
  }, []);

  // Quick Load Benchmark Sample
  const handleLoadSample = useCallback(() => {
    const rawList = hotelsJson as Array<{
      name: string;
      lat: number;
      lon: number;
      load?: number;
      stop_mins?: number;
    }>;

    const parsed: OnboardingHotel[] = rawList.map((h, i) => ({
      id: `hotel-${i + 1}`,
      name: h.name,
      lat: h.lat,
      lon: h.lon,
      load: h.load ?? 3,
      stop_mins: h.stop_mins ?? 15,
      distToCenterKm:
        Math.round(haversineKm(centerLat, centerLon, h.lat, h.lon) * 10) / 10,
    }));

    setHotels(parsed);
    setCsvFileName("bengaluru_benchmark_101_hotels.csv");
    setIngestErrors([]);
    setIngestWarnings([]);
    setActiveTabIngest("sample");
  }, [centerLat, centerLon]);

  // Load sample on mount if no hotels loaded
  useEffect(() => {
    if (hotels.length === 0) {
      handleLoadSample();
    }
  }, []);

  // Handle CSV File Upload
  const handleFileUpload = useCallback(
    (e: ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;

      setCsvFileName(file.name);
      const reader = new FileReader();
      reader.onload = (event) => {
        const text = (event.target?.result as string) || "";
        setCsvRawText(text);
        const result = parseHotelsCsv(text, centerLat, centerLon);
        if (result.success) {
          setHotels(result.hotels);
          setIngestErrors([]);
          setIngestWarnings(result.warnings);
        } else {
          setIngestErrors(result.errors);
          setIngestWarnings(result.warnings);
        }
      };
      reader.readAsText(file);
    },
    [centerLat, centerLon]
  );

  // Handle CSV Paste Submission
  const handlePasteSubmit = useCallback(() => {
    if (!csvRawText.trim()) return;
    const result = parseHotelsCsv(csvRawText, centerLat, centerLon);
    if (result.success) {
      setHotels(result.hotels);
      setCsvFileName("pasted_dataset.csv");
      setIngestErrors([]);
      setIngestWarnings(result.warnings);
    } else {
      setIngestErrors(result.errors);
      setIngestWarnings(result.warnings);
    }
  }, [csvRawText, centerLat, centerLon]);

  // Run Clustering & Multi-K Evaluation
  const runEvaluation = useCallback(() => {
    if (hotels.length < 4) {
      setIngestErrors(["Please ingest at least 4 hotels before running evaluation."]);
      return;
    }

    setIsEvaluating(true);
    // Allow UI to update
    setTimeout(() => {
      const results = evaluateMultiK(hotels, centerLat, centerLon, evalMinK, evalMaxK);
      setEvaluations(results);

      // Select top scored K by default
      if (results.length > 0) {
        setSelectedK(results[0].k);
      }
      setIsEvaluating(false);
      setCurrentStep(3);
    }, 50);
  }, [hotels, centerLat, centerLon, evalMinK, evalMaxK]);

  // Whenever hotels change or city center changes, auto-run evaluation
  useEffect(() => {
    if (hotels.length >= 4) {
      const results = evaluateMultiK(hotels, centerLat, centerLon, evalMinK, evalMaxK);
      setEvaluations(results);
      if (results.length > 0) {
        // Keep selectedK if still in list, else default to best
        const hasCurrent = results.some((r) => r.k === selectedK);
        if (!hasCurrent) {
          setSelectedK(results[0].k);
        }
      }
    }
  }, [hotels, centerLat, centerLon, evalMinK, evalMaxK]);

  // Current selected partition evaluation
  const activeEval = useMemo(() => {
    return (
      evaluations.find((e) => e.k === selectedK) ??
      evaluations[0] ??
      null
    );
  }, [evaluations, selectedK]);

  // Hotels annotated with region assignment for the active K
  const annotatedHotels = useMemo(() => {
    if (!activeEval) return hotels;
    const regionById = new Map(activeEval.regions.map((r) => [r.id, r]));

    return hotels.map((h, idx) => {
      const regId = activeEval.assignments[idx] ?? 0;
      const meta = regionById.get(regId);
      const centroidDist = meta?.centroid
        ? Math.round(haversineKm(meta.centroid.lat, meta.centroid.lon, h.lat, h.lon) * 10) / 10
        : undefined;

      return {
        ...h,
        regionId: regId,
        regionName: meta?.name,
        distToCentroidKm: centroidDist,
      };
    });
  }, [hotels, activeEval]);

  // Filtered hotels list for table preview
  const filteredHotels = useMemo(() => {
    const q = hotelFilterQuery.trim().toLowerCase();
    if (!q) return annotatedHotels;
    return annotatedHotels.filter(
      (h) =>
        h.name.toLowerCase().includes(q) ||
        (h.regionName && h.regionName.toLowerCase().includes(q))
    );
  }, [annotatedHotels, hotelFilterQuery]);

  // Generate H3 Hexagon Map for current partition
  const hexResult = useMemo(() => {
    if (!activeEval || annotatedHotels.length === 0) {
      return { hexMap: {}, cellsByRegion: {}, allCellsCount: 0 };
    }
    return generateH3HexMap(
      annotatedHotels,
      activeEval.assignments,
      centerLat,
      centerLon,
      hexDensity
    );
  }, [activeEval, annotatedHotels, centerLat, centerLon, hexDensity]);

  // Total summary statistics
  const totalBags = useMemo(
    () => hotels.reduce((acc, h) => acc + h.load, 0),
    [hotels]
  );
  const avgDistToDepot = useMemo(() => {
    if (hotels.length === 0) return 0;
    const sum = hotels.reduce((acc, h) => acc + (h.distToCenterKm ?? 0), 0);
    return Math.round((sum / hotels.length) * 10) / 10;
  }, [hotels]);

  // Export Handlers
  const handleExportJson = useCallback(() => {
    if (!activeEval) return;

    const regionMetadata: Record<string, unknown> = {};
    activeEval.regions.forEach((r) => {
      regionMetadata[r.id] = {
        id: r.id,
        code: r.code,
        name: r.name,
        color: r.color,
        centroid: r.centroid,
        hotel_count: r.hotelCount,
        total_bags: r.totalBags,
        dominant_corridor: r.dominantCorridor,
        avg_radius_km: r.avgRadiusKm,
        max_radius_km: r.maxRadiusKm,
        estimated_vans: r.estimatedVans,
      };
    });

    const exportBundle = {
      city: cityName,
      state: cityState,
      depot: { name: depotName, latitude: centerLat, longitude: centerLon },
      partition_k: activeEval.k,
      evaluation_score: activeEval.score,
      metrics: {
        silhouette: activeEval.silhouette,
        davies_bouldin: activeEval.daviesBouldin,
        calinski_harabasz: activeEval.calinskiHarabasz,
        workload_balance: activeEval.workloadBalance,
        total_vans: activeEval.totalVans,
      },
      regions: regionMetadata,
      hex_map: hexResult.hexMap,
    };

    const blob = new Blob([JSON.stringify(exportBundle, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `linengrass_${cityName.toLowerCase().replace(/\s+/g, "_")}_k${activeEval.k}_setup.json`;
    a.click();
    URL.revokeObjectURL(url);
  }, [activeEval, cityName, cityState, depotName, centerLat, centerLon, hexResult]);

  const handleExportCsv = useCallback(() => {
    if (!activeEval || annotatedHotels.length === 0) return;

    const headers = [
      "hotel_id",
      "hotel_name",
      "latitude",
      "longitude",
      "load_bags",
      "stop_service_mins",
      "assigned_region_id",
      "assigned_region_code",
      "assigned_region_name",
      "distance_to_hub_km",
      "distance_to_centroid_km",
    ];

    const rows = annotatedHotels.map((h) => {
      const reg = activeEval.regions.find((r) => r.id === h.regionId);
      return [
        `"${h.id}"`,
        `"${h.name.replace(/"/g, '""')}"`,
        h.lat,
        h.lon,
        h.load,
        h.stop_mins,
        h.regionId ?? 0,
        `"${reg?.code ?? ""}"`,
        `"${(reg?.name ?? "").replace(/"/g, '""')}"`,
        h.distToCenterKm ?? "",
        h.distToCentroidKm ?? "",
      ].join(",");
    });

    const csvContent = [headers.join(","), ...rows].join("\n");
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `hotels_${cityName.toLowerCase().replace(/\s+/g, "_")}_k${activeEval.k}_assigned.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }, [activeEval, annotatedHotels, cityName]);

  return (
    <div className="onboarding-app">
      {/* Topbar */}
      <header className="topbar onboarding-topbar">
        <div className="topbar-left">
          <Link href="/" className="brand" aria-label="Back to Coverage Atlas">
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
              <span className="brand-sub">Region Architect</span>
            </span>
          </Link>

          <nav className="topnav" aria-label="Application navigation">
            <Link className="topnav__item" href="/">
              Coverage
            </Link>
            <Link className="topnav__item" href="/?workspace=manual">
              Manual routes
            </Link>
            <Link className="topnav__item" href="/plan">
              Plan canvas
              <ArrowUpRight size={11} />
            </Link>
            <span className="topnav__item topnav__item--active">
              Region architect
              <span className="topnav__live-pill">Exp</span>
            </span>
          </nav>
        </div>

        {/* Stepper Tabs */}
        <div className="onboarding-stepper">
          <button
            type="button"
            className={`step-btn ${currentStep === 1 ? "step-btn--active" : ""} ${currentStep > 1 ? "step-btn--done" : ""}`}
            onClick={() => setCurrentStep(1)}
          >
            <span className="step-num">1</span>
            <span className="step-label">Location & Hub</span>
          </button>
          <ChevronRight size={14} className="step-sep" />
          <button
            type="button"
            className={`step-btn ${currentStep === 2 ? "step-btn--active" : ""} ${currentStep > 2 ? "step-btn--done" : ""}`}
            onClick={() => setCurrentStep(2)}
          >
            <span className="step-num">2</span>
            <span className="step-label">Hotels ({hotels.length})</span>
          </button>
          <ChevronRight size={14} className="step-sep" />
          <button
            type="button"
            className={`step-btn ${currentStep === 3 ? "step-btn--active" : ""} ${currentStep > 3 ? "step-btn--done" : ""}`}
            onClick={() => setCurrentStep(3)}
          >
            <span className="step-num">3</span>
            <span className="step-label">
              Evaluation {activeEval ? `(K=${activeEval.k})` : ""}
            </span>
          </button>
          <ChevronRight size={14} className="step-sep" />
          <button
            type="button"
            className={`step-btn ${currentStep === 4 ? "step-btn--active" : ""}`}
            onClick={() => setCurrentStep(4)}
          >
            <span className="step-num">4</span>
            <span className="step-label">Hexagon Map</span>
          </button>
        </div>

        {/* Actions */}
        <div className="topbar__actions">
          <button
            type="button"
            className="btn btn--subtle"
            onClick={handleLoadSample}
            title="Reload Bengaluru sample hotels"
          >
            <RefreshCw size={13} />
            <span>Load Sample (101)</span>
          </button>
          <div className="dropdown-export">
            <button
              type="button"
              className="btn btn--primary"
              onClick={handleExportJson}
              disabled={!activeEval}
            >
              <Download size={13} />
              <span>Export Setup</span>
            </button>
          </div>
        </div>
      </header>

      {/* Main Workspace Layout: Split Panel */}
      <div className="onboarding-layout">
        {/* Left Side: Wizard Control & Analysis Dashboard */}
        <aside className="onboarding-sidebar">
          {/* STEP 1: City & Operating Hub */}
          {currentStep === 1 && (
            <div className="wizard-panel">
              <div className="panel-hero">
                <div className="panel-hero__badge">
                  <Building2 size={13} />
                  <span>Step 1 · Operating Geography</span>
                </div>
                <h2>Target City & Hub Location</h2>
                <p>
                  Configure the primary metro territory and your central laundry
                  facility / fleet depot coordinates.
                </p>
              </div>

              {/* Presets Grid */}
              <div className="form-group">
                <label className="form-label">
                  <span>Operating Metro Presets</span>
                  <span className="hint">10 major logistical hubs available</span>
                </label>
                <div className="city-presets-grid">
                  {CITY_PRESETS.map((preset) => {
                    const isSelected = selectedPresetId === preset.id;
                    return (
                      <button
                        key={preset.id}
                        type="button"
                        className={`preset-card ${isSelected ? "preset-card--selected" : ""}`}
                        onClick={() => handleSelectPreset(preset.id)}
                      >
                        <div className="preset-card__top">
                          <span className="preset-city">{preset.name}</span>
                          <span className="preset-state">{preset.state}</span>
                        </div>
                        <div className="preset-card__sub">{preset.depotName}</div>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Hub Facility Form */}
              <div className="form-card">
                <div className="form-card__title">
                  <Warehouse size={15} />
                  <span>Depot / Laundry Facility Specifications</span>
                </div>

                <div className="form-row">
                  <div className="form-col">
                    <label className="form-label">City Name</label>
                    <input
                      type="text"
                      className="text-input"
                      value={cityName}
                      onChange={(e) => setCityName(e.target.value)}
                    />
                  </div>
                  <div className="form-col">
                    <label className="form-label">State / Province</label>
                    <input
                      type="text"
                      className="text-input"
                      value={cityState}
                      onChange={(e) => setCityState(e.target.value)}
                    />
                  </div>
                </div>

                <div className="form-group">
                  <label className="form-label">Depot Facility Name</label>
                  <input
                    type="text"
                    className="text-input"
                    value={depotName}
                    onChange={(e) => setDepotName(e.target.value)}
                  />
                </div>

                <div className="form-row">
                  <div className="form-col">
                    <label className="form-label">Latitude (°N)</label>
                    <input
                      type="number"
                      step="0.000001"
                      className="text-input font-mono"
                      value={centerLat}
                      onChange={(e) => setCenterLat(parseFloat(e.target.value) || 0)}
                    />
                  </div>
                  <div className="form-col">
                    <label className="form-label">Longitude (°E)</label>
                    <input
                      type="number"
                      step="0.000001"
                      className="text-input font-mono"
                      value={centerLon}
                      onChange={(e) => setCenterLon(parseFloat(e.target.value) || 0)}
                    />
                  </div>
                </div>

                <button
                  type="button"
                  className={`btn ${pickCenterMode ? "btn--active" : "btn--subtle"} btn--wide`}
                  onClick={() => setPickCenterMode(!pickCenterMode)}
                >
                  <Crosshair size={14} />
                  <span>
                    {pickCenterMode
                      ? "Cancel Map Coordinate Picking"
                      : "Pick / Drag Coordinates on Map"}
                  </span>
                </button>
              </div>

              <div className="panel-footer">
                <div className="footer-stat">
                  <span>Current Hub:</span>
                  <b>
                    {cityName} ({centerLat.toFixed(4)}°, {centerLon.toFixed(4)}°)
                  </b>
                </div>
                <button
                  type="button"
                  className="btn btn--primary"
                  onClick={() => setCurrentStep(2)}
                >
                  <span>Continue to Hotels</span>
                  <ArrowRight size={14} />
                </button>
              </div>
            </div>
          )}

          {/* STEP 2: Hotel Ingestion */}
          {currentStep === 2 && (
            <div className="wizard-panel">
              <div className="panel-hero">
                <div className="panel-hero__badge">
                  <FileSpreadsheet size={13} />
                  <span>Step 2 · Hotel Dataset</span>
                </div>
                <h2>Ingest Hotel Demands</h2>
                <p>
                  Upload your hotel portfolio CSV, paste table data, or use our
                  pre-configured benchmark.
                </p>
              </div>

              {/* Ingestion Tabs */}
              <div className="sub-tabs">
                <button
                  type="button"
                  className={`sub-tab ${activeTabIngest === "upload" ? "sub-tab--active" : ""}`}
                  onClick={() => setActiveTabIngest("upload")}
                >
                  <Upload size={13} />
                  <span>Upload CSV</span>
                </button>
                <button
                  type="button"
                  className={`sub-tab ${activeTabIngest === "paste" ? "sub-tab--active" : ""}`}
                  onClick={() => setActiveTabIngest("paste")}
                >
                  <FileText size={13} />
                  <span>Paste CSV</span>
                </button>
                <button
                  type="button"
                  className={`sub-tab ${activeTabIngest === "sample" ? "sub-tab--active" : ""}`}
                  onClick={() => {
                    setActiveTabIngest("sample");
                    handleLoadSample();
                  }}
                >
                  <Sparkles size={13} />
                  <span>Bengaluru Benchmark</span>
                </button>
              </div>

              {/* Tab 1: Upload */}
              {activeTabIngest === "upload" && (
                <div className="dropzone-container">
                  <label className="dropzone-label">
                    <Upload size={28} className="dropzone-icon" />
                    <span className="dropzone-title">
                      {csvFileName || "Click to browse or drop CSV here"}
                    </span>
                    <span className="dropzone-sub">
                      Expected columns: name, lat, lon, load (or bags), stop_mins
                    </span>
                    <input
                      type="file"
                      accept=".csv,text/csv"
                      className="dropzone-input"
                      onChange={handleFileUpload}
                    />
                  </label>
                </div>
              )}

              {/* Tab 2: Paste */}
              {activeTabIngest === "paste" && (
                <div className="paste-container">
                  <textarea
                    className="paste-textarea font-mono"
                    placeholder="name,lat,lon,load,stop_mins&#10;TAJ WEST END,12.9868,77.5855,8,25&#10;THE LEELA PALACE,12.9606,77.6484,12,35..."
                    rows={8}
                    value={csvRawText}
                    onChange={(e) => setCsvRawText(e.target.value)}
                  />
                  <button
                    type="button"
                    className="btn btn--subtle btn--wide"
                    onClick={handlePasteSubmit}
                  >
                    <span>Parse Pasted CSV Data</span>
                  </button>
                </div>
              )}

              {/* Tab 3: Benchmark Info */}
              {activeTabIngest === "sample" && (
                <div className="sample-banner">
                  <Check size={16} className="sample-check" />
                  <div>
                    <strong>Bengaluru Operational Benchmark Active</strong>
                    <p>101 real customer hotels loaded across Karnataka metro footprint.</p>
                  </div>
                </div>
              )}

              {/* Errors & Warnings */}
              {ingestErrors.length > 0 && (
                <div className="alert-card alert-card--error">
                  <AlertCircle size={15} />
                  <div>
                    {ingestErrors.map((err, i) => (
                      <div key={i}>{err}</div>
                    ))}
                  </div>
                </div>
              )}

              {ingestWarnings.length > 0 && (
                <div className="alert-card alert-card--warning">
                  <AlertCircle size={15} />
                  <div>
                    {ingestWarnings.slice(0, 3).map((w, i) => (
                      <div key={i}>{w}</div>
                    ))}
                    {ingestWarnings.length > 3 && (
                      <div>...and {ingestWarnings.length - 3} more warnings.</div>
                    )}
                  </div>
                </div>
              )}

              {/* Dataset Diagnostic Stats */}
              {hotels.length > 0 && (
                <div className="stat-cards-grid">
                  <div className="stat-card">
                    <span className="stat-card__lbl">Hotels</span>
                    <span className="stat-card__val">{hotels.length}</span>
                    <span className="stat-card__sub">Valid stops</span>
                  </div>
                  <div className="stat-card">
                    <span className="stat-card__lbl">Daily Bags</span>
                    <span className="stat-card__val">{totalBags}</span>
                    <span className="stat-card__sub">Total demand</span>
                  </div>
                  <div className="stat-card">
                    <span className="stat-card__lbl">Avg to Hub</span>
                    <span className="stat-card__val">{avgDistToDepot} km</span>
                    <span className="stat-card__sub">Radial distance</span>
                  </div>
                  <div className="stat-card">
                    <span className="stat-card__lbl">Est. Vans</span>
                    <span className="stat-card__val">
                      {Math.ceil(totalBags / 36)}
                    </span>
                    <span className="stat-card__sub">@ 36 bags buffer</span>
                  </div>
                </div>
              )}

              {/* Hotels Search & Preview Table */}
              {hotels.length > 0 && (
                <div className="hotels-preview-box">
                  <div className="hotels-preview-head">
                    <span className="hotels-count">
                      Hotels List ({filteredHotels.length})
                    </span>
                    <div className="search-wrap">
                      <Search size={12} />
                      <input
                        type="text"
                        placeholder="Search hotel name..."
                        value={hotelFilterQuery}
                        onChange={(e) => setHotelFilterQuery(e.target.value)}
                      />
                    </div>
                  </div>

                  <div className="hotels-mini-table-scroll">
                    <table className="hotels-mini-table">
                      <thead>
                        <tr>
                          <th>Hotel Name</th>
                          <th>Bags</th>
                          <th>Stop Mins</th>
                          <th>To Hub</th>
                        </tr>
                      </thead>
                      <tbody>
                        {filteredHotels.slice(0, 15).map((h) => (
                          <tr
                            key={h.id}
                            onClick={() => {
                              setSelectedHotel(h);
                              mapRef.current?.focusHotel(h);
                            }}
                          >
                            <td className="hotel-cell-name">{h.name}</td>
                            <td>{h.load}</td>
                            <td>{h.stop_mins}m</td>
                            <td>{h.distToCenterKm}km</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  {filteredHotels.length > 15 && (
                    <div className="hotels-more-hint">
                      Showing 15 of {filteredHotels.length} hotels
                    </div>
                  )}
                </div>
              )}

              <div className="panel-footer">
                <button
                  type="button"
                  className="btn btn--subtle"
                  onClick={() => setCurrentStep(1)}
                >
                  <ArrowLeft size={14} />
                  <span>Back to Hub</span>
                </button>
                <button
                  type="button"
                  className="btn btn--primary"
                  onClick={runEvaluation}
                  disabled={hotels.length < 4 || isEvaluating}
                >
                  <span>
                    {isEvaluating ? "Computing Sweep..." : "Run Multi-K Evaluation"}
                  </span>
                  <ArrowRight size={14} />
                </button>
              </div>
            </div>
          )}

          {/* STEP 3: Multi-K Evaluation & Comparison Matrix */}
          {currentStep === 3 && activeEval && (
            <div className="wizard-panel">
              <div className="panel-hero">
                <div className="panel-hero__badge">
                  <Award size={13} />
                  <span>Step 3 · Evaluation Engine</span>
                </div>
                <h2>Multi-Count Region Partition Evaluation</h2>
                <p>
                  Mathematical cluster tightness (Silhouette, Davies-Bouldin)
                  cross-referenced with logistics feasibility and driver balance.
                </p>
              </div>

              {/* K Selector Pills Grid */}
              <div className="k-eval-cards-grid">
                {evaluations.map((ev) => {
                  const isSelected = ev.k === selectedK;
                  const isOptimal = ev.verdict === "optimal";

                  return (
                    <button
                      key={ev.k}
                      type="button"
                      className={`k-card ${isSelected ? "k-card--selected" : ""} ${isOptimal ? "k-card--optimal" : ""}`}
                      onClick={() => setSelectedK(ev.k)}
                    >
                      <div className="k-card__top">
                        <span className="k-badge">K = {ev.k} Regions</span>
                        <span className={`verdict-pill verdict-pill--${ev.verdict}`}>
                          {ev.score}/100
                        </span>
                      </div>
                      <div className="k-card__metrics">
                        <div>
                          <span>Sil</span>
                          <b>{ev.silhouette}</b>
                        </div>
                        <div>
                          <span>Balance</span>
                          <b>{Math.round(ev.workloadBalance * 100)}%</b>
                        </div>
                        <div>
                          <span>Vans</span>
                          <b>{ev.totalVans}</b>
                        </div>
                        <div>
                          <span>Max R</span>
                          <b>{ev.maxRadiusKm}km</b>
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>

              {/* Explainable AI "Why This Count Is Better" Report */}
              <div className="evaluation-report-card">
                <div className="report-card__header">
                  <div className="header-left">
                    <span className="report-eyebrow">Diagnostic Evaluation Report</span>
                    <h3>Why K = {activeEval.k} is {activeEval.verdictLabel}</h3>
                  </div>
                  <div className={`score-badge score-badge--${activeEval.verdict}`}>
                    <span className="score-num">{activeEval.score}</span>
                    <span className="score-denom">/100</span>
                  </div>
                </div>

                {/* Comparison Note Banner */}
                <div className="report-comparison-banner">
                  <Compass size={15} />
                  <span>{activeEval.comparisonNote}</span>
                </div>

                {/* Key Strengths (Pros) */}
                {activeEval.whyBetter.length > 0 && (
                  <div className="report-section">
                    <div className="section-title text-green">
                      <TrendingUp size={14} />
                      <span>Logistical Strengths</span>
                    </div>
                    <ul className="bullet-list">
                      {activeEval.whyBetter.map((pro, i) => (
                        <li key={i}>{pro}</li>
                      ))}
                    </ul>
                  </div>
                )}

                {/* Key Drawbacks (Cons) */}
                {activeEval.drawbacks.length > 0 && (
                  <div className="report-section">
                    <div className="section-title text-amber">
                      <TrendingDown size={14} />
                      <span>Operational Trade-offs & Risks</span>
                    </div>
                    <ul className="bullet-list bullet-list--warn">
                      {activeEval.drawbacks.map((con, i) => (
                        <li key={i}>{con}</li>
                      ))}
                    </ul>
                  </div>
                )}

                {/* Deep Metrics Diagnostic Table */}
                <div className="report-metrics-table">
                  <div className="metric-row">
                    <span className="metric-name">Silhouette Score</span>
                    <span className="metric-val">{activeEval.silhouette}</span>
                    <span className="metric-hint">Tightness & separation (&gt;0.35 ideal)</span>
                  </div>
                  <div className="metric-row">
                    <span className="metric-name">Davies-Bouldin Index</span>
                    <span className="metric-val">{activeEval.daviesBouldin}</span>
                    <span className="metric-hint">Cluster scatter ratio (lower is better)</span>
                  </div>
                  <div className="metric-row">
                    <span className="metric-name">Calinski-Harabasz Score</span>
                    <span className="metric-val">{activeEval.calinskiHarabasz}</span>
                    <span className="metric-hint">Variance ratio criterion</span>
                  </div>
                  <div className="metric-row">
                    <span className="metric-name">Workload Balance</span>
                    <span className="metric-val">
                      {Math.round(activeEval.workloadBalance * 100)}% ({activeEval.minHotels} to {activeEval.maxHotels} stops)
                    </span>
                    <span className="metric-hint">Min/Max hotel distribution</span>
                  </div>
                  <div className="metric-row">
                    <span className="metric-name">Spatial Span</span>
                    <span className="metric-val">
                      avg {activeEval.avgRadiusKm} km · max {activeEval.maxRadiusKm} km
                    </span>
                    <span className="metric-hint">Radius from cluster centroid</span>
                  </div>
                </div>
              </div>

              {/* Per-Region Details for this K */}
              <div className="regions-list-section">
                <div className="section-head">
                  <span className="section-title">
                    Generated Regions Breakdown ({activeEval.regions.length})
                  </span>
                  <span className="section-sub">
                    Click any region to inspect territory on the map
                  </span>
                </div>

                <div className="region-cards-list">
                  {activeEval.regions.map((reg) => {
                    const isSelected = selectedRegionId === reg.id;
                    return (
                      <div
                        key={reg.id}
                        className={`onboarding-region-card ${isSelected ? "onboarding-region-card--selected" : ""}`}
                        style={{ borderLeftColor: reg.color }}
                        onClick={() => {
                          const nextId = isSelected ? null : reg.id;
                          setSelectedRegionId(nextId);
                          if (nextId !== null) {
                            mapRef.current?.focusRegion(nextId);
                          } else {
                            mapRef.current?.fitAll();
                          }
                        }}
                      >
                        <div className="region-card-header">
                          <div className="region-code-badge" style={{ backgroundColor: reg.color }}>
                            {reg.code}
                          </div>
                          <div className="region-name-wrap">
                            <span className="region-name">{reg.name}</span>
                            <span className="region-corridor">{reg.dominantCorridor}</span>
                          </div>
                          <div className="region-vans-pill">
                            <Truck size={12} />
                            <span>{reg.estimatedVans} van{reg.estimatedVans > 1 ? "s" : ""}</span>
                          </div>
                        </div>

                        <div className="region-card-stats">
                          <div className="stat-item">
                            <span className="val">{reg.hotelCount}</span>
                            <span className="lbl">Hotels</span>
                          </div>
                          <div className="stat-item">
                            <span className="val">{reg.totalBags}</span>
                            <span className="lbl">Bags</span>
                          </div>
                          <div className="stat-item">
                            <span className="val">{reg.distFromDepotKm} km</span>
                            <span className="lbl">To Hub</span>
                          </div>
                          <div className="stat-item">
                            <span className="val">{reg.avgRadiusKm} km</span>
                            <span className="lbl">Avg Radius</span>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              <div className="panel-footer">
                <button
                  type="button"
                  className="btn btn--subtle"
                  onClick={() => setCurrentStep(2)}
                >
                  <ArrowLeft size={14} />
                  <span>Back to Hotels</span>
                </button>
                <button
                  type="button"
                  className="btn btn--primary"
                  onClick={() => setCurrentStep(4)}
                >
                  <span>Explore Hexagon Footprint</span>
                  <ArrowRight size={14} />
                </button>
              </div>
            </div>
          )}

          {/* STEP 4: Hexagon Map Controls & Inspector */}
          {currentStep === 4 && activeEval && (
            <div className="wizard-panel">
              <div className="panel-hero">
                <div className="panel-hero__badge">
                  <Layers size={13} />
                  <span>Step 4 · H3 Operational Footprint</span>
                </div>
                <h2>Hexagon Corridor Map</h2>
                <p>
                  Active H3 Resolution 7 hexagonal cells connecting hotels to
                  the central hub along active transport ribbons.
                </p>
              </div>

              {/* Map Layer Controls */}
              <div className="controls-card">
                <div className="controls-card__title">
                  <Sliders size={14} />
                  <span>Map Display & Density Controls</span>
                </div>

                <div className="form-group">
                  <label className="form-label">Hexagon Coverage Density</label>
                  <div className="segmented-control">
                    <button
                      type="button"
                      className={`seg-btn ${hexDensity === "corridor" ? "seg-btn--active" : ""}`}
                      onClick={() => setHexDensity("corridor")}
                    >
                      Arterials Only
                    </button>
                    <button
                      type="button"
                      className={`seg-btn ${hexDensity === "standard" ? "seg-btn--active" : ""}`}
                      onClick={() => setHexDensity("standard")}
                    >
                      Active (+1 Ring)
                    </button>
                    <button
                      type="button"
                      className={`seg-btn ${hexDensity === "dense" ? "seg-btn--active" : ""}`}
                      onClick={() => setHexDensity("dense")}
                    >
                      Dense Envelope
                    </button>
                  </div>
                </div>

                <div className="toggle-row">
                  <label className="toggle-label">
                    <input
                      type="checkbox"
                      checked={showHexagons}
                      onChange={(e) => setShowHexagons(e.target.checked)}
                    />
                    <span>Show H3 Hexagons ({hexResult.allCellsCount} cells)</span>
                  </label>
                </div>

                <div className="toggle-row">
                  <label className="toggle-label">
                    <input
                      type="checkbox"
                      checked={showOutlines}
                      onChange={(e) => setShowOutlines(e.target.checked)}
                    />
                    <span>Show Region Outlines</span>
                  </label>
                </div>

                <div className="toggle-row">
                  <label className="toggle-label">
                    <input
                      type="checkbox"
                      checked={showHotels}
                      onChange={(e) => setShowHotels(e.target.checked)}
                    />
                    <span>Show Hotel Pins ({hotels.length} pins)</span>
                  </label>
                </div>

                <div className="form-group">
                  <label className="form-label">
                    <span>Hexagon Opacity</span>
                    <span className="hint">{Math.round(hexOpacity * 100)}%</span>
                  </label>
                  <input
                    type="range"
                    min="0.1"
                    max="0.8"
                    step="0.05"
                    value={hexOpacity}
                    onChange={(e) => setHexOpacity(parseFloat(e.target.value))}
                    className="slider-input"
                  />
                </div>
              </div>

              {/* Active Partition Summary */}
              <div className="active-partition-summary">
                <div className="summary-title">
                  <span>Selected Partition:</span>
                  <b>{cityName} · K = {activeEval.k} Regions</b>
                </div>
                <div className="summary-stats">
                  <div>
                    <span>Hexagons</span>
                    <b>{hexResult.allCellsCount}</b>
                  </div>
                  <div>
                    <span>Hotels</span>
                    <b>{annotatedHotels.length}</b>
                  </div>
                  <div>
                    <span>Bags</span>
                    <b>{totalBags}</b>
                  </div>
                  <div>
                    <span>Fleet Vans</span>
                    <b>{activeEval.totalVans}</b>
                  </div>
                </div>
              </div>

              {/* Selected Hotel Sheet */}
              {selectedHotel && (
                <div className="selected-hotel-sheet">
                  <div className="sheet-header">
                    <div className="sheet-title">
                      <MapPin size={14} />
                      <span>{selectedHotel.name}</span>
                    </div>
                    <button
                      type="button"
                      className="close-pin-btn"
                      onClick={() => setSelectedHotel(null)}
                      aria-label="Close hotel details"
                    >
                      <X size={12} />
                    </button>
                  </div>
                  <div className="sheet-body">
                    <div className="sheet-row">
                      <span className="lbl">Assigned Region</span>
                      <span className="val font-bold">
                        {selectedHotel.regionName ?? "R?"}
                      </span>
                    </div>
                    <div className="sheet-row">
                      <span className="lbl">Linen Bags Load</span>
                      <span className="val">{selectedHotel.load} bags</span>
                    </div>
                    <div className="sheet-row">
                      <span className="lbl">Service Stop Mins</span>
                      <span className="val">{selectedHotel.stop_mins} mins</span>
                    </div>
                    <div className="sheet-row">
                      <span className="lbl">Distance to Hub</span>
                      <span className="val">{selectedHotel.distToCenterKm} km</span>
                    </div>
                    <div className="sheet-row">
                      <span className="lbl">Distance to Centroid</span>
                      <span className="val">
                        {selectedHotel.distToCentroidKm ?? "—"} km
                      </span>
                    </div>
                  </div>
                </div>
              )}

              {/* Export Panel */}
              <div className="export-panel">
                <button
                  type="button"
                  className="btn btn--primary btn--wide"
                  onClick={handleExportJson}
                >
                  <Download size={14} />
                  <span>Download region_metadata.json & hex_map.json</span>
                </button>
                <button
                  type="button"
                  className="btn btn--subtle btn--wide"
                  onClick={handleExportCsv}
                >
                  <FileSpreadsheet size={14} />
                  <span>Download hotels_assigned.csv</span>
                </button>
              </div>

              <div className="panel-footer">
                <button
                  type="button"
                  className="btn btn--subtle"
                  onClick={() => setCurrentStep(3)}
                >
                  <ArrowLeft size={14} />
                  <span>Back to Evaluation</span>
                </button>
                <button
                  type="button"
                  className="btn btn--ghost"
                  onClick={() => mapRef.current?.fitAll()}
                >
                  <Compass size={14} />
                  <span>Reset Map View</span>
                </button>
              </div>
            </div>
          )}
        </aside>

        {/* Right Side: High-Performance Leaflet + H3 Map Canvas */}
        <main className="onboarding-map-wrapper">
          <OnboardingMap
            ref={mapRef}
            center={{ lat: centerLat, lon: centerLon, name: depotName }}
            hotels={annotatedHotels}
            hexMap={hexResult.hexMap}
            regions={activeEval ? activeEval.regions : []}
            selectedRegionId={selectedRegionId}
            hoveredRegionId={hoveredRegionId}
            selectedHotel={selectedHotel}
            pickCenterMode={pickCenterMode}
            onPickCenter={handlePickCenter}
            onSelectRegion={(id) => setSelectedRegionId(id)}
            onHoverRegion={(id) => setHoveredRegionId(id)}
            onSelectHotel={(hotel) => setSelectedHotel(hotel)}
            showHexagons={showHexagons}
            showHotels={showHotels}
            showOutlines={showOutlines}
            hexOpacity={hexOpacity}
            pinnedCoord={pinnedCoord}
            onPinCoord={(c) => setPinnedCoord(c)}
            onClearPinned={() => setPinnedCoord(null)}
          />
        </main>
      </div>
    </div>
  );
}
