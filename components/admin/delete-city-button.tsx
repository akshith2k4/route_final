"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Trash2 } from "lucide-react";

export default function DeleteCityButton({
  cityId,
  cityName,
}: {
  cityId: string;
  cityName: string;
}) {
  const router = useRouter();
  const [deleting, setDeleting] = useState(false);

  async function handleDelete() {
    const confirmed = window.confirm(
      `Delete the draft city "${cityName}" and its regions? This cannot be undone.`,
    );
    if (!confirmed) return;

    setDeleting(true);
    try {
      const response = await fetch(`/api/admin/cities/${cityId}`, {
        method: "DELETE",
      });
      if (!response.ok) {
        const data = await response.json().catch(() => null);
        window.alert(data?.error ?? "Could not delete the draft city.");
        return;
      }
      router.refresh();
    } finally {
      setDeleting(false);
    }
  }

  return (
    <button
      type="button"
      onClick={handleDelete}
      disabled={deleting}
      className="flex items-center gap-1.5 rounded-lg border border-line px-3 py-1.5 text-[11px] font-semibold text-danger transition-colors hover:bg-bone disabled:opacity-40"
    >
      <Trash2 size={12} />
      {deleting ? "Deleting…" : "Delete"}
    </button>
  );
}
