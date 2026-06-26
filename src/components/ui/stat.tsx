import * as React from "react";
import { cn } from "@/lib/utils";

/*
 * Stat — display the headline number for a metric in the display serif.
 *
 *   <Stat label="Hours this month" value="12.5" />
 *   <Stat label="Total paid" value="€450" hint="across 3 invoices" />
 *
 * Use within `<MetricStrip>` for dashboards or standalone for hero
 * numbers (e.g. coach hours total).
 */
export function Stat({
  label,
  value,
  hint,
  tone = "neutral",
  align = "left",
  density = "default",
  className,
}: {
  label: React.ReactNode;
  value: React.ReactNode;
  hint?: React.ReactNode;
  tone?: "neutral" | "triaz" | "randwijck" | "joint" | "warning" | "danger";
  align?: "left" | "center";
  density?: "default" | "compact";
  className?: string;
}) {
  const valueColor =
    tone === "triaz"
      ? "text-[var(--triaz-ink)]"
      : tone === "randwijck"
        ? "text-[var(--randwijck-ink)]"
        : tone === "joint"
          ? "text-[var(--joint-ink)]"
          : tone === "warning"
            ? "text-[var(--warning-ink)]"
            : tone === "danger"
              ? "text-[var(--danger-ink)]"
              : "text-[var(--foreground)]";
  return (
    <div
      className={cn(
        "flex flex-col",
        density === "compact" ? "gap-0.5" : "gap-1",
        align === "center" && "items-center text-center",
        className,
      )}
    >
      <div
        className={cn(
          "font-semibold uppercase text-[var(--muted-foreground)]",
          density === "compact"
            ? "text-[10px] tracking-[0.14em]"
            : "text-[11px] tracking-[0.18em]",
        )}
      >
        {label}
      </div>
      <div
        className={cn(
          "tabular font-display font-medium leading-none tracking-tight",
          density === "compact" ? "text-xl sm:text-2xl" : "text-3xl sm:text-4xl",
          valueColor,
        )}
      >
        {value}
      </div>
      {hint && (
        <div
          className={cn(
            "text-[var(--muted-foreground)]",
            density === "compact" ? "text-[10px] leading-snug" : "text-xs",
          )}
        >
          {hint}
        </div>
      )}
    </div>
  );
}

/**
 * MetricStrip — horizontal row of stats, evenly spaced with subtle
 * vertical dividers. Use 2-4 stats; more becomes noisy.
 */
export function MetricStrip({
  children,
  density = "default",
  className,
}: {
  children: React.ReactNode;
  density?: "default" | "compact";
  className?: string;
}) {
  const items = React.Children.toArray(children);
  const compact = density === "compact";
  return (
    <div
      className={cn(
        "glass-ribbon",
        compact ? "px-4 py-2.5 sm:py-3" : "p-5 sm:p-6",
        className,
      )}
    >
      <div
        className={cn(
          "grid grid-cols-2 divide-[var(--glass-border-subtle)] sm:grid-cols-2 lg:grid-cols-4",
          compact
            ? "gap-x-4 gap-y-2 divide-x sm:gap-x-0"
            : "grid-cols-1 gap-6 divide-y sm:divide-y-0 sm:divide-x",
        )}
      >
        {items.map((child, i) => (
          <div
            key={i}
            className={cn(
              compact
                ? "px-3 first:pl-0 last:pr-0 sm:px-4"
                : "px-0 pt-6 first:pt-0 sm:px-6 sm:pt-0",
            )}
          >
            {child}
          </div>
        ))}
      </div>
    </div>
  );
}
