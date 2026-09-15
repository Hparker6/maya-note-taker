import clsx from "clsx";
import type { ButtonHTMLAttributes, Ref } from "react";

export type ButtonVariant = "primary" | "secondary" | "ghost" | "danger" | "subtle";
export type ButtonSize = "sm" | "md" | "lg" | "icon" | "icon-sm";

const variants: Record<ButtonVariant, string> = {
  primary: "bg-accent text-accent-ink hover:bg-accent-hover shadow-[var(--shadow-sm)]",
  secondary: "bg-card text-ink border border-line hover:bg-hover hover:border-line-strong shadow-[var(--shadow-sm)]",
  ghost: "text-ink-2 hover:bg-hover hover:text-ink",
  subtle: "bg-sunken text-ink-2 hover:bg-hover hover:text-ink",
  danger: "bg-danger text-white hover:opacity-90",
};

const sizes: Record<ButtonSize, string> = {
  sm: "h-8 px-3 text-[13px] gap-1.5 rounded-lg",
  md: "h-9 px-3.5 text-sm gap-2 rounded-lg",
  lg: "h-11 px-5 text-[15px] gap-2 rounded-xl",
  icon: "h-9 w-9 rounded-lg",
  "icon-sm": "h-7 w-7 rounded-md",
};

export function buttonClass(variant: ButtonVariant = "secondary", size: ButtonSize = "md", className?: string) {
  return clsx(
    "inline-flex shrink-0 items-center justify-center font-medium whitespace-nowrap select-none transition-[background-color,border-color,color,opacity,transform] duration-150 active:scale-[0.98] disabled:pointer-events-none disabled:opacity-50 [&_svg]:size-4 [&_svg]:shrink-0",
    variants[variant],
    sizes[size],
    className,
  );
}

export function Button({
  variant = "secondary",
  size = "md",
  className,
  ref,
  type = "button",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: ButtonVariant; size?: ButtonSize; ref?: Ref<HTMLButtonElement> }) {
  return <button ref={ref} type={type} className={buttonClass(variant, size, className)} {...props} />;
}

export function Spinner({ className }: { className?: string }) {
  return (
    <svg className={clsx("animate-spin", className ?? "size-4")} viewBox="0 0 24 24" fill="none" aria-hidden>
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeOpacity="0.2" strokeWidth="3" />
      <path d="M21 12a9 9 0 0 0-9-9" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
    </svg>
  );
}

export const inputClass =
  "h-10 w-full rounded-lg border border-line bg-card px-3 text-sm text-ink placeholder:text-ink-3 shadow-[var(--shadow-sm)] transition-colors focus:border-accent focus:outline-none focus:ring-3 focus:ring-accent/15";
