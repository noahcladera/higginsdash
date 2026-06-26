"use client";

import Link from "next/link";
import { cn } from "@/lib/utils";
import {
  adminScheduleHrefPatch,
  type AdminScheduleFilters,
} from "@/lib/admin/schedule-filters";

export function DashboardPanelToggle({
  filters,
}: {
  filters: AdminScheduleFilters;
}) {
  return (
    <div
      className="inline-flex rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--surface)] p-1"
      role="tablist"
      aria-label="Dashboard view"
    >
      <Link
        href={adminScheduleHrefPatch(filters, { panel: "overview" })}
        scroll={false}
        role="tab"
        aria-selected={filters.panel === "overview"}
        className={cn(
          "rounded-[var(--radius-sm)] px-4 py-2 text-sm font-medium transition-colors",
          filters.panel === "overview"
            ? "control-well text-[var(--foreground)] font-medium shadow-[var(--shadow-elevated)]"
            : "text-[var(--muted-foreground)] hover:text-[var(--foreground)]",
        )}
      >
        Overview
      </Link>
      <Link
        href={adminScheduleHrefPatch(filters, { panel: "schedule" })}
        scroll={false}
        role="tab"
        aria-selected={filters.panel === "schedule"}
        className={cn(
          "rounded-[var(--radius-sm)] px-4 py-2 text-sm font-medium transition-colors",
          filters.panel === "schedule"
            ? "control-well text-[var(--foreground)] font-medium shadow-[var(--shadow-elevated)]"
            : "text-[var(--muted-foreground)] hover:text-[var(--foreground)]",
        )}
      >
        Schedule
      </Link>
    </div>
  );
}
