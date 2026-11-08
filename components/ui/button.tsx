import Link from "next/link";
import type { ComponentProps, ReactNode } from "react";
import { cn } from "./cn";

type Variant = "primary" | "ghost" | "subtle" | "active" | "danger";
type Size = "md" | "sm";

const base =
  "inline-flex items-center justify-center gap-[6px] rounded-[7px] border font-semibold tracking-[-0.005em] cursor-pointer transition-all duration-[130ms] whitespace-nowrap disabled:opacity-45 disabled:cursor-not-allowed";

const sizes: Record<Size, string> = {
  md: "h-[34px] px-[14px] text-[12.5px]",
  sm: "h-[33px] px-[11px] text-[10px]",
};

const variants: Record<Variant, string> = {
  primary: "bg-ink text-cream border-ink",
  ghost: "bg-transparent text-ink-soft border-line-strong hover:bg-bone",
  subtle: "bg-bone text-ink border-line",
  active: "bg-green text-white border-green",
  danger: "bg-danger text-white border-danger",
};

type ButtonProps = Omit<ComponentProps<"button">, "className"> & {
  variant?: Variant;
  size?: Size;
  className?: string;
  children?: ReactNode;
};

export function Button({ variant = "primary", size = "md", className, children, type = "button", ...props }: ButtonProps) {
  return (
    <button type={type} className={cn(base, sizes[size], variants[variant], className)} {...props}>
      {children}
    </button>
  );
}

type ButtonLinkProps = Omit<ComponentProps<typeof Link>, "className"> & {
  variant?: Variant;
  size?: Size;
  className?: string;
};

export function ButtonLink({ variant = "ghost", size = "sm", className, children, ...props }: ButtonLinkProps) {
  return (
    <Link className={cn(base, sizes[size], variants[variant], className)} {...props}>
      {children}
    </Link>
  );
}