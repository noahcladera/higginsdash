import * as React from "react";
import { cn } from "@/lib/utils";

/*
 * Avatar — initials in a tinted circle. Color is deterministically
 * derived from the name so the same person always gets the same color
 * across the app (no random swap on rerender).
 */
export function Avatar({
  name,
  size = "md",
  tone,
  className,
}: {
  name: string;
  size?: "xs" | "sm" | "md" | "lg" | "xl";
  tone?: "triaz" | "randwijck" | "joint" | "neutral";
  className?: string;
}) {
  const initials = computeInitials(name);
  const t = tone ?? toneFor(name);

  const sizeCls =
    size === "xs"
      ? "h-6 w-6 text-[10px]"
      : size === "sm"
        ? "h-8 w-8 text-xs"
        : size === "lg"
          ? "h-12 w-12 text-base"
          : size === "xl"
            ? "h-16 w-16 text-xl"
            : "h-10 w-10 text-sm";

  const toneCls =
    t === "triaz"
      ? "bg-[var(--triaz-soft)] text-[var(--triaz-ink)]"
      : t === "randwijck"
        ? "bg-[var(--randwijck-soft)] text-[var(--randwijck-ink)]"
        : t === "joint"
          ? "bg-[var(--joint-soft)] text-[var(--joint-ink)]"
          : "bg-[var(--surface-strong)] text-[var(--foreground)]";

  return (
    <div
      aria-hidden
      className={cn(
        "inline-flex shrink-0 items-center justify-center rounded-full font-medium tracking-tight",
        sizeCls,
        toneCls,
        className,
      )}
    >
      {initials}
    </div>
  );
}

function computeInitials(name: string): string {
  const parts = name
    .trim()
    .split(/\s+/)
    .filter((p) => p.length > 0);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

function toneFor(name: string): "triaz" | "randwijck" | "joint" | "neutral" {
  const tones = ["triaz", "randwijck", "joint", "neutral"] as const;
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) | 0;
  return tones[Math.abs(h) % tones.length];
}
