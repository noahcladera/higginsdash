import * as React from "react";
import { cn } from "@/lib/utils";
import type { StatusTone } from "@/lib/ui/status-tone";

const TONE_CLASSES: Record<StatusTone, string> = {
  neutral:
    "border-l-[var(--border-strong)] bg-[var(--surface)]/80 backdrop-blur-sm",
  triaz:
    "border-l-[var(--triaz)] bg-[var(--triaz-soft)]/60 backdrop-blur-sm shadow-[0_2px_12px_-4px_oklch(0.42_0.13_155_/_0.15)]",
  randwijck:
    "border-l-[var(--randwijck)] bg-[var(--randwijck-soft)]/60 backdrop-blur-sm shadow-[0_2px_12px_-4px_oklch(0.52_0.16_40_/_0.15)]",
  joint:
    "border-l-[var(--joint)] bg-[var(--joint-soft)]/60 backdrop-blur-sm shadow-[0_2px_12px_-4px_oklch(0.40_0.13_260_/_0.15)]",
  success:
    "border-l-[var(--success)] bg-[var(--success-soft)]/70 backdrop-blur-sm",
  warning:
    "border-l-[var(--warning)] bg-[var(--warning-soft)]/75 backdrop-blur-sm",
  danger:
    "border-l-[var(--destructive)] bg-[var(--danger-soft)]/70 backdrop-blur-sm",
};

/**
 * Subtle row/card tint for quick status scanning — left accent + soft fill.
 */
export function StatusSurface({
  tone,
  as: Comp = "div",
  className,
  children,
  ...props
}: {
  tone: StatusTone;
  as?: "li" | "div";
  className?: string;
  children?: React.ReactNode;
} & Omit<React.ComponentProps<"li"> & React.ComponentProps<"div">, "as">) {
  return (
    <Comp
      className={cn(
        "border-l-[3px]",
        TONE_CLASSES[tone],
        className,
      )}
      {...props}
    >
      {children}
    </Comp>
  );
}
