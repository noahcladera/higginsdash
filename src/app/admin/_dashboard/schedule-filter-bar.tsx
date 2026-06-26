"use client";

import Link from "next/link";
import { cn } from "@/lib/utils";
import {
  adminScheduleHrefPatch,
  type AdminScheduleFilters,
} from "@/lib/admin/schedule-filters";

function FilterCheckbox({
  filters,
  label,
  checked,
  patch,
  toneClass,
}: {
  filters: AdminScheduleFilters;
  label: string;
  checked: boolean;
  patch: Partial<
    Pick<AdminScheduleFilters, "showTriaz" | "showRandwijck">
  >;
  toneClass?: string;
}) {
  return (
    <Link
      href={adminScheduleHrefPatch(filters, patch)}
      scroll={false}
      className={cn(
        "inline-flex items-center gap-2 rounded-md border px-3 py-1.5 text-sm font-medium transition-colors",
        checked
          ? cn(
              "control-well border-[var(--border-strong)] text-[var(--foreground)] shadow-[var(--shadow-elevated)]",
              toneClass,
            )
          : "border-[var(--border)] text-[var(--muted-foreground)] hover:text-[var(--foreground)]",
      )}
    >
      <span
        className={cn(
          "flex h-4 w-4 items-center justify-center rounded border text-[10px]",
          checked
            ? "border-[var(--foreground)] bg-[var(--foreground)] text-[var(--background)]"
            : "border-[var(--border-strong)]",
        )}
        aria-hidden
      >
        {checked ? "✓" : ""}
      </span>
      {label}
    </Link>
  );
}

function ScheduleModeToggle({
  filters,
  classLabel,
}: {
  filters: AdminScheduleFilters;
  classLabel: string;
}) {
  const classesOnly = filters.showClasses && !filters.showBookings;

  return (
    <div
      className="inline-flex rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--surface)] p-1"
      role="tablist"
      aria-label="Schedule view"
    >
      <Link
        href={adminScheduleHrefPatch(filters, {
          showClasses: true,
          showBookings: true,
        })}
        scroll={false}
        role="tab"
        aria-selected={!classesOnly}
        className={cn(
          "rounded-[var(--radius-sm)] px-4 py-2 text-sm font-medium transition-colors",
          !classesOnly
            ? "control-well border-[var(--border-strong)] text-[var(--foreground)] shadow-[var(--shadow-elevated)]"
            : "text-[var(--muted-foreground)] hover:text-[var(--foreground)]",
        )}
      >
        Courts
      </Link>
      <Link
        href={adminScheduleHrefPatch(filters, {
          showClasses: true,
          showBookings: false,
        })}
        scroll={false}
        role="tab"
        aria-selected={classesOnly}
        className={cn(
          "rounded-[var(--radius-sm)] px-4 py-2 text-sm font-medium transition-colors",
          classesOnly
            ? "control-well border-[var(--border-strong)] text-[var(--foreground)] shadow-[var(--shadow-elevated)]"
            : "text-[var(--muted-foreground)] hover:text-[var(--foreground)]",
        )}
      >
        {classLabel}
      </Link>
    </div>
  );
}

export function ScheduleFilterBar({
  filters,
  classLabel,
}: {
  filters: AdminScheduleFilters;
  classLabel: string;
  bookingLabel?: string;
}) {
  return (
    <div className="flex flex-wrap items-center gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs font-semibold uppercase tracking-[0.14em] text-[var(--muted-foreground)]">
          Clubs
        </span>
        <FilterCheckbox
          filters={filters}
          label="S.V. Triaz"
          checked={filters.showTriaz}
          patch={{ showTriaz: filters.showTriaz ? false : true }}
          toneClass="border-[var(--triaz-ink)]/20 bg-[var(--triaz-soft)]"
        />
        <FilterCheckbox
          filters={filters}
          label="Tennispark Randwijck"
          checked={filters.showRandwijck}
          patch={{ showRandwijck: filters.showRandwijck ? false : true }}
          toneClass="border-[var(--randwijck-ink)]/20 bg-[var(--randwijck-soft)]"
        />
      </div>
      <span className="hidden h-4 w-px bg-[var(--border)] sm:inline" />
      <ScheduleModeToggle filters={filters} classLabel={classLabel} />
    </div>
  );
}
