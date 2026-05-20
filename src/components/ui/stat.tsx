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
  className,
}: {
  label: React.ReactNode;
  value: React.ReactNode;
  hint?: React.ReactNode;
  tone?: "neutral" | "triaz" | "randwijck" | "joint" | "warning" | "danger";
  align?: "left" | "center";
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
            ? "text-[oklch(0.42_0.13_75)]"
            : tone === "danger"
              ? "text-[var(--destructive)]"
              : "text-[var(--foreground)]";
  return (
    <div
      className={cn(
        "flex flex-col gap-1",
        align === "center" && "items-center text-center",
        className,
      )}
    >
      <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--muted-foreground)]">
        {label}
      </div>
      <div
        className={cn(
          "tabular font-display text-3xl font-medium leading-none tracking-tight sm:text-4xl",
          valueColor,
        )}
      >
        {value}
      </div>
      {hint && (
        <div className="text-xs text-[var(--muted-foreground)]">{hint}</div>
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
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  const items = React.Children.toArray(children);
  return (
    <div
      className={cn(
        "rounded-[var(--radius-lg)] bg-[var(--surface)] p-5 sm:p-6 shadow-[var(--shadow-sm)]",
        className,
      )}
    >
      <div className="grid grid-cols-1 gap-6 divide-y divide-[var(--border)] sm:grid-cols-2 sm:divide-y-0 sm:divide-x lg:grid-cols-4">
        {items.map((child, i) => (
          <div key={i} className="px-0 pt-6 first:pt-0 sm:px-6 sm:pt-0">
            {child}
          </div>
        ))}
      </div>
    </div>
  );
}
