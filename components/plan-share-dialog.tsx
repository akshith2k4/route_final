"use client";

import { useEffect, useRef, useState } from "react";
import {
  AlertTriangle,
  Download,
  FileJson,
  RotateCcw,
  Share2,
  Upload,
  X,
} from "lucide-react";
import {
  parsePlanDraft,
  summarizePlan,
  type Plan,
  type PlanSummary,
} from "../lib/plan";

type PendingImport = {
  plan: Plan;
  fileName: string;
  exportedAt: string | null;
};

type PlanShareDialogProps = {
  open: boolean;
  plan: Plan;
  hasBackup: boolean;
  onClose: () => void;
  onExport: () => void;
  onImport: (imported: Plan, fileName: string) => boolean;
  onRestoreBackup: () => boolean;
};

function formatWhen(value: string | null): string | null {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleString(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

function Summary({
  label,
  plan,
  tone,
}: {
  label: string;
  plan: Plan;
  tone: "current" | "import";
}) {
  const summary: PlanSummary = summarizePlan(plan);
  return (
    <section className={`plan-share-card plan-share-card--${tone}`}>
      <span className="plan-share-card__label">{label}</span>
      <b className="plan-share-card__name">{plan.name}</b>
      <div className="plan-share-stats">
        <span>
          <b>{summary.routes}</b> routes
        </span>
        <span>
          <b>{summary.stops}</b> stops
        </span>
        <span>
          <b>{summary.bags}</b> bags
        </span>
        <span>
          <b>{summary.rooms}</b> rooms
        </span>
        <span>
          <b>{summary.vehicles}</b> vehicles
        </span>
        <span>
          <b>{summary.customRoutes}</b> custom
        </span>
      </div>
    </section>
  );
}

export default function PlanShareDialog({
  open,
  plan,
  hasBackup,
  onClose,
  onExport,
  onImport,
  onRestoreBackup,
}: PlanShareDialogProps) {
  const [pending, setPending] = useState<PendingImport | null>(null);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (!open) return;
    setPending(null);
    setError(null);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [open, onClose]);

  if (!open) return null;

  const exportedLabel = formatWhen(pending?.exportedAt ?? null);

  async function handleFile(file: File | undefined) {
    if (!file) return;
    setError(null);
    try {
      const text = await file.text();
      const parsed = JSON.parse(text) as unknown;
      const imported = parsePlanDraft(parsed);
      const exportedAtValue =
        parsed && typeof parsed === "object"
          ? (parsed as { exported_at?: unknown }).exported_at
          : null;
      setPending({
        plan: imported,
        fileName: file.name,
        exportedAt:
          typeof exportedAtValue === "string" ? exportedAtValue : null,
      });
    } catch (caught) {
      setPending(null);
      setError(
        caught instanceof Error
          ? caught.message
          : "Could not read this shared plan.",
      );
    }
  }

  function replaceDraft() {
    if (!pending) return;
    const imported = onImport(pending.plan, pending.fileName);
    if (!imported) {
      setError("Could not import this plan. Your current draft was not changed.");
    }
  }

  function restoreBackup() {
    const restored = onRestoreBackup();
    if (!restored) {
      setError("Could not restore the previous draft.");
    }
  }

  return (
    <div
      className="modal-backdrop"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        className="plan-dialog plan-share-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="plan-share-title"
      >
        <button
          type="button"
          className="dialog-close"
          onClick={onClose}
          aria-label="Close share dialog"
        >
          <X size={16} />
        </button>

        <span className="dialog-eyebrow">
          <Share2 size={12} />
          Share plan
        </span>
        <h2 id="plan-share-title">
          {pending ? "Replace your draft?" : "Share or upload a plan"}
        </h2>
        <p className="dialog-lede">
          {pending
            ? "Review both plans before replacing your local draft."
            : "Download your plan as a file and send it to your teammate. They can upload it here on their own Plan Canvas."}
        </p>

        {error && (
          <p className="plan-share-error">
            <AlertTriangle size={12} />
            {error}
          </p>
        )}

        {!pending ? (
          <>
            <Summary label="Your current draft" plan={plan} tone="current" />

            <div className="plan-share-actionbox">
              <div>
                <b>Download a plan file</b>
                <span>Send this JSON file to the person who needs the plan.</span>
              </div>
              <button
                type="button"
                className="btn btn--primary"
                onClick={onExport}
              >
                <Download size={14} />
                Download plan
              </button>
            </div>

            <div className="plan-share-actionbox">
              <div>
                <b>Upload a shared plan</b>
                <span>
                  Choose a .json plan exported from another Plan Canvas.
                </span>
              </div>
              <button
                type="button"
                className="btn btn--primary"
                onClick={() => fileInputRef.current?.click()}
              >
                <Upload size={14} />
                Choose file
              </button>
              <input
                ref={fileInputRef}
                type="file"
                accept=".json,application/json"
                className="plan-share-file-input"
                onChange={(event) => {
                  const file = event.target.files?.[0];
                  event.target.value = "";
                  void handleFile(file);
                }}
              />
            </div>

            {hasBackup && (
              <button
                type="button"
                className="plan-share-restore"
                onClick={restoreBackup}
              >
                <RotateCcw size={13} />
                Restore the draft from before the last import
              </button>
            )}

            <p className="plan-share-note">
              Uploading replaces only the local draft on this device. The
              current draft is pushed to Undo and a backup is kept.
            </p>
          </>
        ) : (
          <>
            <div className="plan-share-file">
              <FileJson size={14} />
              <b>{pending.fileName}</b>
              {exportedLabel && <span>Exported {exportedLabel}</span>}
            </div>

            <div className="plan-share-grid">
              <Summary label="Your current draft" plan={plan} tone="current" />
              <Summary
                label="Shared plan"
                plan={pending.plan}
                tone="import"
              />
            </div>

            <p className="plan-share-warning">
              <AlertTriangle size={13} />
              Replacing will overwrite your current local draft. Your existing
              plan is pushed to Undo and kept as a backup; download it now if
              you want a separate file.
            </p>

            <div className="plan-share-actions">
              <button
                type="button"
                className="btn btn--ghost"
                onClick={() => {
                  setPending(null);
                  setError(null);
                }}
              >
                Back
              </button>
              <button
                type="button"
                className="btn btn--ghost"
                onClick={onExport}
              >
                <Download size={14} />
                Download my current plan
              </button>
              <button
                type="button"
                className="btn btn--primary"
                onClick={replaceDraft}
              >
                <Upload size={14} />
                Replace my draft
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
