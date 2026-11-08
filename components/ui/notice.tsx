import type { ReactNode } from "react";
import { cn } from "./cn";

type Kind = "success" | "error";

const kinds: Record<Kind, string> = {
  success: "bg-green-soft text-[#2c6a49]",
  error: "bg-[#fbeae6] text-[#b91c1c]",
};

export function Notice({ kind, children }: { kind: Kind; children?: ReactNode }) {
  return (
    <div role="status" className={cn("mx-3 mt-2.5 mb-0 flex items-center gap-1.5 rounded-[7px] px-2.5 py-2 text-[9.5px] font-semibold", kinds[kind])}>
      {children}
    </div>
  );
}