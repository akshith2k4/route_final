"use client";

import { useEffect, useState, type FormEvent } from "react";
import { Plus, X } from "lucide-react";
import { Button } from "../ui/button";

type PlanSaveAsDialogProps = {
  open: boolean;
  initialName?: string;
  onClose: () => void;
  onSubmit: (name: string) => Promise<void>;
};

export function PlanSaveAsDialog({
  open,
  initialName = "",
  onClose,
  onSubmit,
}: PlanSaveAsDialogProps) {
  const [name, setName] = useState(initialName);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    setName(initialName);
    setError(null);
    setBusy(false);
  }, [open, initialName]);

  if (!open) return null;

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) {
      setError("Please enter a plan name.");
      return;
    }
    setError(null);
    setBusy(true);
    try {
      await onSubmit(trimmed);
      setName("");
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save plan");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-[200] grid place-items-center p-5 bg-[#111b16]/50 backdrop-blur-sm animate-fade-in"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget && !busy) onClose();
      }}
    >
      <form
        className="relative w-full max-w-[420px] rounded-2xl bg-[#fffdf7] border border-white/40 shadow-2xl p-6"
        role="dialog"
        aria-modal="true"
        aria-labelledby="plan-save-as-title"
        onSubmit={handleSubmit}
      >
        <button
          type="button"
          className="absolute top-3.5 right-3.5 grid w-7 h-7 place-items-center rounded-lg text-muted transition-colors hover:bg-bone hover:text-ink disabled:opacity-40"
          onClick={onClose}
          disabled={busy}
          aria-label="Close dialog"
        >
          <X size={16} />
        </button>

        <span className="inline-flex items-center gap-1.5 text-muted text-[8.5px] font-bold tracking-widest uppercase">
          <Plus size={12} />
          Named plan
        </span>
        <h2
          id="plan-save-as-title"
          className="font-serif text-[26px] font-normal tracking-tight text-ink mt-1.5 mb-1"
        >
          Save this plan as
        </h2>
        <p className="text-muted text-[11.5px] leading-relaxed mb-4">
          This creates a new plan in the database under this name. Other users
          can load it from the plan dropdown.
        </p>

        <label className="flex flex-col gap-1 text-[11px] font-semibold text-ink-soft mb-4">
          <span>Plan name</span>
          <input
            type="text"
            value={name}
            maxLength={120}
            placeholder="e.g. Monday morning plan"
            onChange={(e) => setName(e.target.value)}
            className="h-9 px-3 rounded-lg border border-line bg-paper text-ink text-xs focus:outline-none focus:ring-2 focus:ring-focus"
            autoFocus
          />
        </label>

        {error && (
          <div
            className="flex items-start gap-1.5 mb-4 p-2.5 rounded-lg bg-[#fbeae6] text-[#b91c1c] text-[9.5px] font-semibold"
            role="alert"
          >
            <X size={13} className="shrink-0 mt-0.5" />
            {error}
          </div>
        )}

        <div className="flex items-center justify-end gap-2.5 mt-5">
          <Button
            type="button"
            variant="ghost"
            onClick={onClose}
            disabled={busy}
          >
            Cancel
          </Button>
          <Button
            type="submit"
            variant="primary"
            disabled={busy || name.trim().length === 0}
          >
            {busy ? "Saving…" : "Save named plan"}
          </Button>
        </div>
      </form>
    </div>
  );
}

