import { cloneElement, isValidElement, type ReactElement, type ReactNode } from "react";
import { cn } from "./cn";

type FieldProps = {
  label: ReactNode;
  required?: boolean;
  full?: boolean;
  as?: "label" | "div";
  className?: string;
  children: ReactNode;
};

const control =
  "h-[33px] px-[8px] py-0 [border:1px_solid_var(--line-strong)] rounded-[8px] bg-paper-strong text-ink text-[10px] [outline:none] focus:border-green";

export function Field({ label, required, full, as: Tag = "label", className, children }: FieldProps) {
  let field = children;
  if (isValidElement(children)) {
    const el = children as ReactElement<{ className?: string }>;
    if (el.type === "input" || el.type === "select") {
      field = cloneElement(el, {
        className: cn(control, el.type === "select" && "cursor-pointer pr-[26px]", el.props.className),
      });
    }
  }
  return (
    <Tag className={cn("mb-[9px] flex flex-col gap-[5px]", full && "col-[1_/_-1]", className)}>
      <span className="text-muted text-[9.5px] font-medium">
        {label} {required && <b>*</b>}
      </span>
      {field}
    </Tag>
  );
}