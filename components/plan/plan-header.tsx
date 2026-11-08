"use client";

import Link from "next/link";
import {
  AlertTriangle,
  Check,
  Hotel,
  Redo2,
  RefreshCw,
  RotateCcw,
  Route,
  Undo2,
  Warehouse,
} from "lucide-react";
import type { PlanMode, SaveState } from "./plan-types";

type PlanHeaderProps = {
  planName: string;
  mode: PlanMode;
  onChangeMode: (mode: PlanMode) => void;
  onUndo: () => void;
  canUndo: boolean;
  onRedo: () => void;
  canRedo: boolean;
  saveState: SaveState;
  remoteUpdate: boolean;
  onRefresh: () => void;
  canResetPlan: boolean;
  onResetPlan: () => void;
};

export function PlanHeader({
  planName,
  mode,
  onChangeMode,
  onUndo,
  canUndo,
  onRedo,
  canRedo,
  saveState,
  remoteUpdate,
  onRefresh,
  canResetPlan,
  onResetPlan,
}: PlanHeaderProps) {
  return (
    <header className="relative z-40 grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-5 h-16 px-5 border-b border-line bg-[#f7f3eb]/95 backdrop-blur-md shrink-0 max-[780px]:sticky max-[780px]:top-0 max-[780px]:grid-cols-[1fr_auto] max-[780px]:gap-3 max-[780px]:h-[58px] max-[780px]:px-[13px]">
      {/* Brand logo */}
      <Link
        className="inline-flex items-center gap-2.5 justify-self-start min-w-0 rounded-lg text-left group"
        href="/"
        aria-label="Back to home"
      >
        <span
          className="grid flex-none w-[35px] h-[35px] place-items-center rounded-lg bg-ink text-cream shadow-[inset_0_0_0_1px_rgba(255,255,255,0.07)] transition-all duration-150 group-hover:bg-[#25382d] group-hover:-translate-y-px"
          aria-hidden="true"
        >
          <svg viewBox="0 0 24 24" fill="none" className="w-[21px] h-[21px]">
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
        <span className="flex flex-col gap-px leading-tight">
          <span className="text-[15px] font-semibold tracking-tight text-ink">
            LinenGrass
          </span>
          <span className="text-faint text-[8.5px] font-semibold tracking-[0.14em] uppercase max-[760px]:hidden">
            Plan canvas
          </span>
        </span>
      </Link>

      {/* Plan Title & Mode Switcher */}
      <div className="flex flex-col items-center justify-self-center gap-0.5 min-w-0 text-center max-[780px]:hidden">
        <span className="inline-flex items-center gap-2 text-muted text-[9px] font-bold tracking-[0.145em] uppercase">
          <span className="w-1.5 h-1.5 rounded-full bg-[#3c7a55] shadow-[0_0_0_3px_rgba(60,122,85,0.1)]" />
          Draft plan · {planName}
        </span>
        <div className="flex items-center gap-2.5">
          <h1 className="font-serif text-[23px] font-normal leading-none tracking-tight text-ink">
            {mode === "plan" ? "Edit the day" : "Assign warehouses"}
          </h1>

          {/* Mode Switcher */}
          <div
            className="flex flex-none gap-px p-0.5 border border-line rounded-lg bg-paper"
            role="group"
            aria-label="Editing mode"
          >
            <button
              type="button"
              className={`inline-flex items-center gap-1 h-[22px] px-2 rounded-[5px] text-[8.5px] font-bold tracking-wider whitespace-nowrap transition-colors ${
                mode === "plan"
                  ? "bg-ink text-cream shadow-sm"
                  : "text-muted hover:text-ink"
              }`}
              onClick={() => onChangeMode("plan")}
              aria-pressed={mode === "plan"}
              title="Edit stops and routes"
            >
              <Route size={12} />
              Plan
            </button>
            <button
              type="button"
              className={`inline-flex items-center gap-1 h-[22px] px-2 rounded-[5px] text-[8.5px] font-bold tracking-wider whitespace-nowrap transition-colors ${
                mode === "warehouse"
                  ? "bg-ink text-cream shadow-sm"
                  : "text-muted hover:text-ink"
              }`}
              onClick={() => onChangeMode("warehouse")}
              aria-pressed={mode === "warehouse"}
              title="Assign routes to warehouses"
            >
              <Warehouse size={12} />
              Warehouse
            </button>
          </div>
        </div>
      </div>

      {/* Topbar Actions */}
      <div className="flex items-center justify-self-end gap-2.5 min-w-0">
        {/* Undo / Redo */}
        <div className="flex gap-px p-0.5 border border-line rounded-lg bg-paper">
          <button
            type="button"
            className="grid w-7 h-7 place-items-center rounded-md text-ink-soft transition-colors hover:bg-bone hover:text-ink disabled:opacity-30 disabled:pointer-events-none"
            onClick={onUndo}
            disabled={!canUndo}
            title="Undo (⌘Z)"
            aria-label="Undo"
          >
            <Undo2 size={15} />
          </button>
          <button
            type="button"
            className="grid w-7 h-7 place-items-center rounded-md text-ink-soft transition-colors hover:bg-bone hover:text-ink disabled:opacity-30 disabled:pointer-events-none"
            onClick={onRedo}
            disabled={!canRedo}
            title="Redo (⇧⌘Z)"
            aria-label="Redo"
          >
            <Redo2 size={15} />
          </button>
        </div>

        {/* Cloud Save State */}
        <span
          className={`inline-flex items-center gap-1.5 text-[9.5px] font-medium whitespace-nowrap max-[1240px]:hidden ${
            saveState === "error" ? "text-danger" : "text-muted"
          }`}
        >
          {saveState === "saving" ? (
            <RefreshCw size={12} className="animate-spin text-[#3c7a55]" />
          ) : saveState === "error" ? (
            <AlertTriangle size={12} className="text-danger" />
          ) : (
            <Check size={12} className="text-[#3c7a55]" />
          )}
          {saveState === "saving"
            ? "Saving to cloud…"
            : saveState === "error"
              ? "Save failed"
              : remoteUpdate
                ? "New changes available"
                : "Saved to cloud"}
        </span>

        {/* Refresh */}
        <button
          type="button"
          className="grid w-7 h-7 place-items-center rounded-md text-ink-soft transition-colors hover:bg-bone hover:text-ink"
          onClick={onRefresh}
          title="Refresh from cloud"
          aria-label="Refresh from cloud"
        >
          <RefreshCw size={15} />
        </button>

        {/* Links */}
        <Link
          href="/facilities"
          className="inline-flex items-center gap-1.5 h-[33px] px-2.5 rounded-lg border border-line-strong text-[10px] font-semibold text-ink-soft transition-colors hover:bg-bone max-[560px]:hidden"
        >
          <Warehouse size={13} />
          Facilities
        </Link>
        <Link
          href="/hotels"
          className="inline-flex items-center gap-1.5 h-[33px] px-2.5 rounded-lg border border-line-strong text-[10px] font-semibold text-ink-soft transition-colors hover:bg-bone max-[560px]:hidden"
        >
          <Hotel size={13} />
          Hotels
        </Link>

        {/* Reset button */}
        <button
          type="button"
          className="inline-flex items-center gap-1.5 h-[33px] px-2.5 rounded-lg border border-line-strong text-[10px] font-semibold text-ink-soft transition-colors hover:bg-bone disabled:opacity-45 disabled:pointer-events-none max-[560px]:hidden"
          onClick={onResetPlan}
          disabled={!canResetPlan}
          title={
            canResetPlan
              ? "Reset to the published Manual Dispatch Plan"
              : "Reset is only available for the Manual Dispatch Plan"
          }
        >
          <RotateCcw size={13} />
          Reset
        </button>
      </div>
    </header>
  );
}

