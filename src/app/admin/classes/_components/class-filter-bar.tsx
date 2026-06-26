"use client";

import Link from "next/link";
import { useMemo } from "react";
import { SearchInput } from "@/components/admin/search-input";
import { cn } from "@/lib/utils";
import type { AdminClassesFilters } from "@/lib/admin/classes-filters";
import { adminClassesHrefPatch } from "@/lib/admin/classes-href";
import type { ClassRowData } from "./class-row";

function FilterChip({
  href,
  active,
  children,
}: {
  href: string;
  active: boolean;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      scroll={false}
      className={cn(
        "inline-flex shrink-0 items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium transition-colors",
        active
          ? "control-well border-[var(--border-strong)] text-[var(--foreground)] shadow-[var(--shadow-elevated)]"
          : "border-[var(--border)] text-[var(--muted-foreground)] hover:border-[var(--border-strong)] hover:text-[var(--foreground)]",
      )}
    >
      {children}
    </Link>
  );
}

function audienceCount(
  rows: ClassRowData[],
  audience: AdminClassesFilters["audience"],
): number {
  if (audience === "all") return rows.length;
  if (audience === "youth") {
    return rows.filter(
      (r) =>
        r.programTargetAudience === "kids" ||
        r.programTargetAudience === "mixed",
    ).length;
  }
  return rows.filter(
    (r) =>
      r.programTargetAudience === "adults" ||
      r.programTargetAudience === "mixed",
  ).length;
}

export function ClassFilterBar({
  filters,
  treeRows,
}: {
  filters: AdminClassesFilters;
  treeRows: ClassRowData[];
}) {
  const counts = useMemo(
    () => ({
      all: treeRows.length,
      youth: audienceCount(treeRows, "youth"),
      adults: audienceCount(treeRows, "adults"),
    }),
    [treeRows],
  );

  return (
    <div className="glass-ribbon flex flex-col gap-2.5 p-3 sm:flex-row sm:items-center sm:gap-3">
      <SearchInput
        placeholder="Search classes…"
        className="max-w-none flex-1"
      />

      <div className="flex flex-wrap items-center gap-2">
        <FilterChip
          href={adminClassesHrefPatch(filters, {
            audience: "all",
            programSlug: null,
            seasonId: null,
            seriesId: null,
          })}
          active={filters.audience === "all"}
        >
          All
          <span className="tabular-nums text-[var(--muted-foreground)]">
            {counts.all}
          </span>
        </FilterChip>
        <FilterChip
          href={adminClassesHrefPatch(filters, {
            audience: "youth",
            programSlug: null,
            seasonId: null,
            seriesId: null,
          })}
          active={filters.audience === "youth"}
        >
          Youth
          <span className="tabular-nums text-[var(--muted-foreground)]">
            {counts.youth}
          </span>
        </FilterChip>
        <FilterChip
          href={adminClassesHrefPatch(filters, {
            audience: "adults",
            programSlug: null,
            seasonId: null,
            seriesId: null,
          })}
          active={filters.audience === "adults"}
        >
          Adult
          <span className="tabular-nums text-[var(--muted-foreground)]">
            {counts.adults}
          </span>
        </FilterChip>

        <span className="hidden h-4 w-px bg-[var(--border)] sm:block" />

        <Link
          href={adminClassesHrefPatch(filters, {
            includeAllSeries: !filters.includeAllSeries,
          })}
          scroll={false}
          className="text-xs text-[var(--muted-foreground)] underline-offset-4 hover:text-[var(--foreground)] hover:underline"
        >
          {filters.includeAllSeries ? "Hide past" : "Include past"}
        </Link>
      </div>
    </div>
  );
}
