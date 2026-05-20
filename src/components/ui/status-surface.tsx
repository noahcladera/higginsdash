import * as React from "react";
import { cn } from "@/lib/utils";
import type { StatusTone } from "@/lib/ui/status-tone";

const TONE_CLASSES: Record<StatusTone, string> = {
  neutral:
    "border-l-[var(--border-strong)] bg-[var(--surface)]",
  triaz: "border-l-[var(--triaz)] bg-[var(--triaz-soft)]/50",
  randwijck:
    "border-l-[var(--randwijck)] bg-[var(--randwijck-soft)]/50",
  joint: "border-l-[var(--joint)] bg-[var(--joint-soft)]/50",
  success:
    "border-l-[var(--success)] bg-[var(--success-soft)]/60",
  warning:
    "border-l-[var(--warning)] bg-[var(--warning-soft)]/70",
  danger:
    "border-l-[var(--destructive)] bg-[var(--danger-soft)]/60",
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
