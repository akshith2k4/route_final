import type { ReactNode } from "react";
import { cn } from "./cn";

type DayVariant = "daily" | "day1" | "day2";

const variants: Record<DayVariant, string> = {
  daily: "bg-green-soft text-[#2c6a49]",
  day1: "bg-[#e8f0fb] text-[#2f5c98]",
  day2: "bg-[#fbf0e6] text-[#9a5b26]",
};

export function DayBadge({ variant, children }: { variant: DayVariant; children?: ReactNode }) {
  return (
    <span className={cn("inline-flex items-center rounded-full px-[7px] py-[2px] text-[8px] font-bold whitespace-nowrap", variants[variant])}>
      {children}
    </span>
  );
}