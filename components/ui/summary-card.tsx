import type { ReactNode } from "react";
import { cn } from "./cn";

type Tone = "daily" | "day1" | "day2";

const tones: Record<Tone, string> = {
  daily: "border-[#b7d3bf] bg-[#f5fbf6]",
  day1: "border-[#bed0ec] bg-[#f4f8fd]",
  day2: "border-[#e3c9b6] bg-[#fdf7f1]",
};

export function SummaryCard({ label, value, tone }: { label: ReactNode; value: ReactNode; tone?: Tone }) {
  return (
    <div className={cn("flex flex-col gap-1 rounded-[10px] border px-3.5 py-3", tone ? tones[tone] : "border-line bg-paper")}>
      <span className="text-faint text-[8px] font-extrabold tracking-[0.08em] uppercase">{label}</span>
      <b className="text-ink font-serif text-[25px] font-normal leading-none tracking-[-0.02em] tabular-nums">{value}</b>
    </div>
  );
}