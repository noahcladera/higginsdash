"use client";

import Link from "next/link";
import { useMemo } from "react";
import { SearchInput } from "@/components/admin/search-input";
import { cn } from "@/lib/utils";
import type { AdminClassesFilters } from "@/lib/admin/classes-filters";
import { adminClassesHrefPatch } from "@/lib/admin/classes-href";
import {
  groupSeriesByProgramSeason,
  type SeriesProgramGroup,
} from "@/lib/admin/series-grouping";
import type { ClassRowData } from "./class-row";

function filterProgramsByQuery(
  programs: SeriesProgramGroup[],
  q: string,
): SeriesProgramGroup[] {
  const needle = q.trim().toLowerCase();
  if (!needle) return programs;

  return programs
    .map((program) => {
      const programMatch = program.programName.toLowerCase().includes(needle);
      if (programMatch) return program;

      const seasons = program.seasons
        .map((season) => {
          const seasonMatch = season.seasonName.toLowerCase().includes(needle);
          if (seasonMatch) return season;
          const rows = season.rows.filter(
            (row) =>
              row.name.toLowerCase().includes(needle) ||
              row.displayTitle.toLowerCase().includes(needle) ||
              row.venueName.toLowerCase().includes(needle),
          );
          return rows.length > 0 ? { ...season, rows } : null;
        })
        .filter((s): s is NonNullable<typeof s> => s !== null);

      if (seasons.length === 0) return null;
      return {
        ...program,
        seasons,
        totalCount: seasons.reduce((n, s) => n + s.rows.length, 0),
      };
    })
    .filter((p): p is SeriesProgramGroup => p !== null);
}

function TreeContent({
  filters,
  programs,
}: {
  filters: AdminClassesFilters;
  programs: SeriesProgramGroup[];
}) {
  const filtered = useMemo(
    () => filterProgramsByQuery(programs, filters.q),
    [programs, filters.q],
  );

  const noneSelected =
    !filters.programSlug && !filters.seasonId && !filters.seriesId;

  return (
    <div className="space-y-3">
      <Link
        href={adminClassesHrefPatch(filters, {
          programSlug: null,
          seasonId: null,
          seriesId: null,
        })}
        scroll={false}
        className={cn(
          "block rounded-md px-2 py-1.5 text-sm font-medium transition-colors",
          noneSelected
            ? "bg-[var(--triaz-soft)] text-[var(--triaz-ink)]"
            : "text-[var(--foreground)] hover:bg-[var(--surface)]",
        )}
      >
        All classes
      </Link>

      {filtered.length === 0 ? (
        <p className="px-2 text-xs text-[var(--muted-foreground)]">
          No classes match your search.
        </p>
      ) : (
        <div className="space-y-1">
          {filtered.map((program) => {
            const programActive =
              filters.programSlug === program.programSlug &&
              !filters.seasonId &&
              !filters.seriesId;

            return (
              <details key={program.programSlug} open className="group/program">
                <summary className="flex cursor-pointer list-none items-center gap-1 rounded-md px-2 py-1 text-sm [&::-webkit-details-marker]:hidden">
                  <Link
                    href={adminClassesHrefPatch(filters, {
                      programSlug: program.programSlug,
                      seasonId: null,
                      seriesId: null,
                    })}
                    scroll={false}
                    onClick={(e) => e.stopPropagation()}
                    className={cn(
                      "min-w-0 flex-1 truncate font-medium transition-colors hover:underline",
                      programActive
                        ? "text-[var(--triaz-ink)]"
                        : "text-[var(--foreground)]",
                    )}
                  >
                    {program.programName}
                  </Link>
                  <span className="shrink-0 text-[10px] text-[var(--muted-foreground)]">
                    {program.totalCount}
                  </span>
                </summary>
                <div className="ml-2 space-y-1 border-l border-[var(--border)] pl-2">
                  {program.seasons.map((season) => {
                    const seasonActive =
                      filters.programSlug === program.programSlug &&
                      filters.seasonId === season.seasonId &&
                      !filters.seriesId;

                    return (
                      <details
                        key={season.seasonId ?? "none"}
                        open
                        className="group/season"
                      >
                        <summary className="flex cursor-pointer list-none items-center gap-1 rounded-md px-2 py-0.5 text-xs [&::-webkit-details-marker]:hidden">
                          <Link
                            href={adminClassesHrefPatch(filters, {
                              programSlug: program.programSlug,
                              seasonId: season.seasonId,
                              seriesId: null,
                            })}
                            scroll={false}
                            onClick={(e) => e.stopPropagation()}
                            className={cn(
                              "min-w-0 flex-1 truncate transition-colors hover:underline",
                              seasonActive
                                ? "font-medium text-[var(--triaz-ink)]"
                                : "text-[var(--muted-foreground)]",
                            )}
                          >
                            {season.seasonName}
                          </Link>
                          <span className="shrink-0 text-[10px] text-[var(--muted-foreground)]">
                            {season.rows.length}
                          </span>
                        </summary>
                        <ul className="ml-2 space-y-0.5 border-l border-[var(--border)] pl-2">
                          {season.rows.map((row) => {
                            const seriesActive = filters.seriesId === row.id;
                            return (
                              <li key={row.id}>
                                <Link
                                  href={adminClassesHrefPatch(filters, {
                                    programSlug: null,
                                    seasonId: null,
                                    seriesId: row.id,
                                  })}
                                  scroll={false}
                                  className={cn(
                                    "block truncate rounded-md px-2 py-1 text-xs transition-colors",
                                    seriesActive
                                      ? "bg-[var(--triaz-soft)] font-medium text-[var(--triaz-ink)]"
                                      : "text-[var(--foreground)] hover:bg-[var(--surface)]",
                                  )}
                                  title={row.displayTitle}
                                >
                                  {row.displayTitle}
                                </Link>
                              </li>
                            );
                          })}
                        </ul>
                      </details>
                    );
                  })}
                </div>
              </details>
            );
          })}
        </div>
      )}

      <div className="border-t border-[var(--border)] pt-2">
        <Link
          href={adminClassesHrefPatch(filters, {
            includeAllSeries: !filters.includeAllSeries,
          })}
          scroll={false}
          className="text-xs text-[var(--muted-foreground)] underline-offset-4 hover:text-[var(--foreground)] hover:underline"
        >
          {filters.includeAllSeries
            ? "Hide past series"
            : "Include past & ended series"}
        </Link>
      </div>
    </div>
  );
}

export function AdminClassHierarchyPanel({
  filters,
  rows,
}: {
  filters: AdminClassesFilters;
  rows: ClassRowData[];
}) {
  const programs = useMemo(() => groupSeriesByProgramSeason(rows), [rows]);

  return (
    <>
      {/* Desktop sidebar */}
      <aside className="hidden w-64 shrink-0 lg:block">
        <div className="sticky top-4 space-y-3 rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--card)] p-3 shadow-[var(--shadow-sm)]">
          <SearchInput placeholder="Search classes…" />
          <div className="max-h-[calc(100vh-12rem)] overflow-y-auto pr-1">
            <TreeContent filters={filters} programs={programs} />
          </div>
        </div>
      </aside>

      {/* Mobile collapsible */}
      <details className="rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--card)] p-3 shadow-[var(--shadow-sm)] lg:hidden">
        <summary className="cursor-pointer text-sm font-medium">
          Browse classes
        </summary>
        <div className="mt-3 space-y-3">
          <SearchInput placeholder="Search classes…" />
          <TreeContent filters={filters} programs={programs} />
        </div>
      </details>
    </>
  );
}
