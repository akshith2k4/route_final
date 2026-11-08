"use client";

import { AlertTriangle, MoveRight, Undo2, X } from "lucide-react";
import { toast as toastClass, toastClose, toastError } from "../ui/plan-styles";
import type { Toast } from "./plan-types";

type PlanToastProps = {
  toast: Toast;
  canUndo: boolean;
  onUndo: () => void;
  onDismiss: () => void;
};

export function PlanToast({
  toast,
  canUndo,
  onUndo,
  onDismiss,
}: PlanToastProps) {
  return (
    <div
      className={toast.tone === "error" ? toastError : toastClass}
      role={toast.tone === "error" ? "alert" : "status"}
    >
      {toast.tone === "error" ? (
        <AlertTriangle size={14} />
      ) : (
        <MoveRight size={14} />
      )}
      <span>{toast.message}</span>
      {toast.tone === "info" && canUndo && (
        <button type="button" onClick={onUndo}>
          <Undo2 size={12} />
          Undo
        </button>
      )}
      <button
        type="button"
        className={toastClose}
        onClick={onDismiss}
        aria-label="Dismiss"
      >
        <X size={13} />
      </button>
    </div>
  );
}
