"use client";

import { AlertTriangle, Check, Clock, Warehouse } from "lucide-react";
import { formatClock, type PlanDepot } from "../../lib/plan";

type DepotTotal = {
  depot: PlanDepot;
  routeCount: number;
  bags: number;
  rooms: number;
};

type PlanStatusBarProps = {
  routeCount: number;
  hotelCount: number;
  bags: number;
  rooms: number;
  distanceKm: number;
  shiftStartMin: number;
  shiftEndMin: number;
  depotTotals: DepotTotal[];
  isSyncing: boolean;
  errorCount: number;
  warningCount: number;
  healthTone: "ok" | "warn" | "error";
  healthLabel: string;
};

export function PlanStatusBar({
  routeCount,
  hotelCount,
  bags,
  rooms,
  distanceKm,
  shiftStartMin,
  shiftEndMin,
  depotTotals,
  isSyncing,
  errorCount,
  warningCount,
  healthTone,
  healthLabel,
}: PlanStatusBarProps) {
  const healthBadgeColors = {
    ok: "bg-[#eaf2ea] text-[#2c6a49] border-[#b7d3bf]",
    warn: "bg-[#fdf7f1] text-[#9a5b26] border-[#e3c9b6]",
    error: "bg-[#fbeae6] text-[#b91c1c] border-[#f5c2b8]",
  }[healthTone];

  return (
    <footer className="relative z-30 flex items-center justify-between gap-4 h-[38px] px-4 border-t border-line bg-paper text-[11px] text-muted shrink-0 select-none max-[760px]:hidden">
      {/* Left Totals */}
      <div className="flex items-center gap-3.5 overflow-hidden">
        <span className="flex items-center gap-1 whitespace-nowrap">
          <b className="font-semibold text-ink">{routeCount}</b> routes
        </span>
        <span className="flex items-center gap-1 whitespace-nowrap">
          <b className="font-semibold text-ink">{hotelCount}</b> stops
        </span>
        <span className="flex items-center gap-1 whitespace-nowrap">
          <b className="font-semibold text-ink">{bags}</b> bags
        </span>
        <span className="flex items-center gap-1 whitespace-nowrap">
          <b className="font-semibold text-ink">{rooms}</b> rooms
        </span>
        <span className="flex items-center gap-1 whitespace-nowrap">
          <b className="font-semibold text-ink">{distanceKm.toFixed(0)}</b> km
        </span>
        <span className="inline-flex items-center gap-1 text-[10px] text-faint whitespace-nowrap">
          <Clock size={11} />
          Shift {formatClock(shiftStartMin)}–{formatClock(shiftEndMin)}
        </span>
        <span className="inline-flex items-center gap-2 max-[1240px]:hidden">
          {depotTotals.map(({ depot, routeCount: rc, bags: b, rooms: r }) => (
            <span
              key={depot.id}
              className="inline-flex items-center gap-1 text-[10.5px] text-muted whitespace-nowrap"
            >
              <Warehouse size={11} className="text-faint" />
              <b className="font-medium text-ink-soft">{depot.name}</b>
              <span className="text-faint">
                {rc}r · {b}b · {r}rm
              </span>
            </span>
          ))}
        </span>
      </div>

      {/* Right Sync & Health */}
      <div className="flex items-center gap-3 shrink-0">
        {isSyncing && (
          <span className="inline-flex items-center gap-1.5 text-[10px] font-medium text-muted">
            <span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-ping" />
            Refreshing road paths
          </span>
        )}
        <span className="text-[10px] text-faint max-[1100px]:hidden">
          OSRM · calibrated to Google baseline
        </span>
        <span
          className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full border text-[10px] font-semibold whitespace-nowrap ${healthBadgeColors}`}
        >
          {errorCount > 0 || warningCount > 0 ? (
            <AlertTriangle size={12} />
          ) : (
            <Check size={12} />
          )}
          {healthLabel}
        </span>
      </div>
    </footer>
  );
}

