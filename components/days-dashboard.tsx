"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import {
  CalendarDays,
  Columns3,
  GripVertical,
  MapPin,
  MapPinOff,
} from "lucide-react";
import DayHotelsMap from "./day-hotels-map";
import type { HexMap, RegionMeta } from "../lib/coverage";
import {
  DAY_HQ,
  type DayData,
  type DayHotel,
  type DayKey,
} from "../lib/day-plan";

type DayMode = "full" | "alternatives";

type DaysDashboardProps = {
  days: DayData[];
  hexMap: HexMap;
  regions: RegionMeta[];
};

function hotelsForMode(route: DayData["routes"][number], mode: DayMode | "daily") {
  if (mode === "alternatives") {
    return route.hotels.filter((hotel) => !hotel.daily);
  }
  return route.hotels;
}

function uniqueHotels(hotels: DayHotel[]): number {
  return new Set(hotels.map((hotel) => hotel.key)).size;
}

export default function DaysDashboard({
  days,
  hexMap,
  regions,
}: DaysDashboardProps) {
  const [order, setOrder] = useState<DayKey[]>(days.map((day) => day.key));
  const [activeKey, setActiveKey] = useState<DayKey>("day0");
  const [modes, setModes] = useState<Record<"day1" | "day2", DayMode>>({
    day1: "full",
    day2: "full",
  });
  const [dragKey, setDragKey] = useState<DayKey | null>(null);
  const [dropKey, setDropKey] = useState<DayKey | null>(null);

  const dayByKey = useMemo(
    () => new Map(days.map((day) => [day.key, day])),
    [days],
  );
  const orderedDays = order
    .map((key) => dayByKey.get(key))
    .filter((day): day is DayData => Boolean(day));

  const activeDay = dayByKey.get(activeKey) ?? days[0];
  const activeMode: DayMode | "daily" =
    activeKey === "day0" ? "daily" : modes[activeKey as "day1" | "day2"];
  const activeModeLabel =
    activeKey === "day0"
      ? "Daily only"
      : activeMode === "full"
        ? "With daily"
        : "Only alternatives";
  const activeRoutes = useMemo(
    () =>
      activeDay.routes
        .map((route) => ({
          routeId: route.routeId,
          routeName: route.routeName,
          color: route.color,
          hotels: hotelsForMode(route, activeMode),
        }))
        .filter((route) => route.hotels.length > 0),
    [activeDay, activeMode],
  );
  const activeHotels = useMemo(
    () => activeRoutes.flatMap((route) => route.hotels),
    [activeRoutes],
  );
  const activeUnique = uniqueHotels(activeHotels);
  const activeMapped = new Set(
    activeHotels
      .filter((hotel) => hotel.lat !== null && hotel.lon !== null)
      .map((hotel) => hotel.key),
  ).size;
  const activeMissing = [
    ...new Set(
      activeHotels
        .filter((hotel) => hotel.lat === null || hotel.lon === null)
        .map((hotel) => hotel.name),
    ),
  ];

  function reorder(targetKey: DayKey) {
    if (!dragKey || dragKey === targetKey) return;
    setOrder((current) => {
      const next = current.filter((key) => key !== dragKey);
      const index = next.indexOf(targetKey);
      next.splice(index < 0 ? next.length : index, 0, dragKey);
      return next;
    });
    setDragKey(null);
    setDropKey(null);
  }

  return (
    <div className="days-app">
      <header className="days-topbar">
        <Link href="/" className="days-brand">
          <span className="days-brand__mark">
            <CalendarDays size={17} />
          </span>
          <span className="days-brand__text">
            <b>LinenGrass</b>
            <em>Day board</em>
          </span>
        </Link>

        <div className="days-heading">
          <span className="eyebrow">
            <span className="eyebrow__dot" />
            Multi-day coverage
          </span>
          <h1>Three days, one canvas</h1>
        </div>

        <nav className="days-actions" aria-label="Related views">
          <span className="days-hint">
            <Columns3 size={12} />
            Drag the grip to reorder
          </span>
          <Link href="/plan" className="btn btn--ghost">
            Plan canvas
          </Link>
          <Link href="/" className="btn btn--ghost">
            Coverage atlas
          </Link>
        </nav>
      </header>

      <main className="days-workspace">
        <div className="days-stack">
        {orderedDays.map((day) => {
          const mode: DayMode | "daily" =
            day.key === "day0" ? "daily" : modes[day.key];
          const visibleRoutes = day.routes.map((route) => ({
            route,
            hotels: hotelsForMode(route, mode),
          }));
          const visibleHotels = visibleRoutes.flatMap(({ hotels }) => hotels);
          const visibleUnique = uniqueHotels(visibleHotels);
          const visibleMissing = [
            ...new Set(
              visibleHotels
                .filter((hotel) => hotel.lat === null || hotel.lon === null)
                .map((hotel) => hotel.name),
            ),
          ];
          const isActive = activeKey === day.key;

          return (
            <article
              key={day.key}
              className={`days-panel ${isActive ? "is-active" : ""} ${dragKey === day.key ? "is-dragging" : ""
                } ${dropKey === day.key && dragKey !== day.key ? "is-drop-target" : ""}`}
              onClick={() => setActiveKey(day.key)}
              onDragOver={(event) => {
                event.preventDefault();
                setDropKey(day.key);
              }}
              onDragLeave={() => {
                if (dropKey === day.key) setDropKey(null);
              }}
              onDrop={(event) => {
                event.preventDefault();
                reorder(day.key);
              }}
            >
              <header className="days-panel__head">
                <span
                  className="days-drag"
                  draggable
                  role="button"
                  tabIndex={0}
                  aria-label={`Drag ${day.label} to reorder`}
                  title="Drag to reorder"
                  onDragStart={(event) => {
                    event.dataTransfer.effectAllowed = "move";
                    event.dataTransfer.setData("text/plain", day.key);
                    setDragKey(day.key);
                  }}
                  onDragEnd={() => {
                    setDragKey(null);
                    setDropKey(null);
                  }}
                  onClick={(event) => event.stopPropagation()}
                >
                  <GripVertical size={15} />
                </span>

                <div className="days-panel__title">
                  <span className="days-panel__kicker">{day.caption}</span>
                  <h2>{day.label}</h2>
                  <span className="days-panel__meta">
                    {visibleHotels.length} visits · {visibleUnique} hotels
                    {day.key !== "day0"
                      ? ` · ${day.dailyTotal} daily / ${day.alternativeTotal} alternatives`
                      : ""}
                  </span>
                </div>

                {isActive && (
                  <span className="days-panel__mapbadge">
                    <MapPin size={11} />
                    Map
                  </span>
                )}
              </header>

              {day.key !== "day0" && (
                <div
                  className="days-toggle"
                  role="group"
                  aria-label={`${day.label} view`}
                  onClick={(event) => event.stopPropagation()}
                >
                  <button
                    type="button"
                    className={mode === "full" ? "is-active" : ""}
                    aria-pressed={mode === "full"}
                    onClick={() =>
                      setModes((current) => ({
                        ...current,
                        [day.key]: "full",
                      }))
                    }
                  >
                    With daily
                  </button>
                  <button
                    type="button"
                    className={mode === "alternatives" ? "is-active" : ""}
                    aria-pressed={mode === "alternatives"}
                    onClick={() =>
                      setModes((current) => ({
                        ...current,
                        [day.key]: "alternatives",
                      }))
                    }
                  >
                    Only alternatives
                  </button>
                </div>
              )}

              <div className="days-panel__list">
                {visibleRoutes.map(({ route, hotels }) => (
                  <section className="days-route" key={route.routeId}>
                    <header className="days-route__head">
                      <span
                        className="days-route__dot"
                        style={{ background: route.color }}
                      />
                      <b>{route.routeName}</b>
                      <span>{hotels.length}</span>
                    </header>

                    {hotels.length === 0 ? (
                      <p className="days-route__empty">No hotels this day.</p>
                    ) : (
                      <ul className="days-hotel-list">
                        {hotels.map((hotel) => (
                          <li
                            className="days-hotel"
                            key={`${hotel.name}-${hotel.routeId}`}
                          >
                            <span
                              className="days-hotel__dot"
                              style={{ background: hotel.color }}
                            />
                            <span className="days-hotel__name">{hotel.name}</span>
                            {day.key !== "day0" && (
                              <span
                                className={`days-tag ${hotel.daily ? "is-daily" : "is-alternative"
                                  }`}
                              >
                                {hotel.daily ? "daily" : "alternative"}
                              </span>
                            )}
                            {(hotel.lat === null || hotel.lon === null) && (
                              <span
                                className="days-hotel__missing"
                                title="No coordinates in the master hotel list"
                              >
                                <MapPinOff size={11} />
                              </span>
                            )}
                          </li>
                        ))}
                      </ul>
                    )}
                  </section>
                ))}
              </div>

              <footer className="days-panel__foot">
                <span>{visibleHotels.length} visits</span>
                <span>{visibleUnique} unique</span>
                {visibleMissing.length > 0 && (
                  <span className="days-panel__missing">
                    <MapPinOff size={11} />
                    {visibleMissing.length} unpinned
                  </span>
                )}
              </footer>
            </article>
          );
        })}
        </div>

        <aside className="days-map-panel">
          <header className="days-map-panel__head">
            <span className="eyebrow">
              <MapPin size={12} />
              Coverage map
            </span>
            <h2>
              {activeDay.label}
              <span>{activeModeLabel}</span>
            </h2>
            <p>
              {activeHotels.length} visits · {activeUnique} hotels ·{" "}
              {activeMapped} pinned · HQ circuits · H3 regions
            </p>
          </header>

          <DayHotelsMap
            routes={activeRoutes}
            hq={DAY_HQ}
            hexMap={hexMap}
            regions={regions}
            dayLabel={activeDay.label}
            modeLabel={activeModeLabel}
          />

          <div className="days-map-legend">
            <span className="days-map-legend__item days-map-legend__item--hq">
              <i className="is-hq" />
              <span>{DAY_HQ.name}</span>
            </span>
            {activeRoutes.map((route) => (
              <span className="days-map-legend__item" key={route.routeId}>
                <i style={{ background: route.color }} />
                <span>{route.routeName}</span>
                <b>{route.hotels.length}</b>
              </span>
            ))}
          </div>

          {activeMissing.length > 0 && (
            <p className="days-map-note">
              <MapPinOff size={12} />
              Not mapped: {activeMissing.join(", ")}
            </p>
          )}
        </aside>
      </main>

      <footer className="days-status">
        <span>
          <b>{days[0]?.routes.length ?? 0}</b> routes
        </span>
        {days.map((day) => (
          <span key={day.key}>
            <b>{day.label}</b> {day.total} visits
          </span>
        ))}
        <span className="days-status__note">
          Unpinned hotels stay in the lists but are not shown on the map.
        </span>
      </footer>
    </div>
  );
}
