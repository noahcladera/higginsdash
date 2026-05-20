"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { SearchInput } from "@/components/admin/search-input";
import { cn } from "@/lib/utils";
import type { AdminClassesFilters } from "@/lib/admin/classes-filters";
import {
  adminClassesHref,
  adminClassesHrefPatch,
  patchAdminClassesFilters,
} from "@/lib/admin/classes-href";
import { useTerms } from "@/components/tenant/terms-provider";

type ClubOpt = { id: string; name: string };
type CoachOpt = { personId: string; name: string };
type SchoolOpt = { slug: string; name: string };

function Pill({
  href,
  active,
  children,
}: {
  href: string;
  active: boolean;
  children: ReactNode;
}) {
  return (
    <Link
      href={href}
      scroll={false}
      className={cn(
        "inline-flex items-center rounded-full border px-3 py-1 text-xs font-medium transition-colors",
        active
          ? "border-[var(--triaz)] bg-[var(--triaz-soft)] text-[var(--triaz-ink)]"
          : "border-[var(--border)] bg-[var(--card)] text-[var(--foreground)] hover:bg-[var(--surface)]",
      )}
    >
      {children}
    </Link>
  );
}

function SelectShell({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <label className="flex flex-col gap-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-[var(--muted-foreground)]">
      {label}
      {children}
    </label>
  );
}

export function AdminClassesFilterBar({
  filters,
  clubs,
  coaches,
  schools,
}: {
  filters: AdminClassesFilters;
  clubs: ClubOpt[];
  coaches: CoachOpt[];
  schools: SchoolOpt[];
}) {
  const router = useRouter();
  const params = useSearchParams();
  const t = useTerms();

  const setParam = (key: string, value: string | null) => {
    const next = new URLSearchParams(params.toString());
    if (value === null || value === "") next.delete(key);
    else next.set(key, value);
    router.replace(`?${next.toString()}`, { scroll: false });
  };

  const youth = filters.audience === "youth";
  const pickup = filters.delivery === "pickup";

  return (
    <div className="sticky top-0 z-20 space-y-3 border-b border-[var(--border)] bg-[var(--background)]/95 pb-4 pt-1 backdrop-blur-sm">
      <div className="flex flex-wrap items-end gap-3">
        <div className="flex min-w-0 flex-1 flex-col gap-2">
          <span className="text-[10px] font-semibold uppercase tracking-[0.12em] text-[var(--muted-foreground)]">
            Audience
          </span>
          <div className="flex flex-wrap gap-2">
            <Pill
              href={adminClassesHrefPatch(filters, {
                audience: "all",
                delivery: null,
                schoolSlug: null,
              })}
              active={filters.audience === "all"}
            >
              All
            </Pill>
            <Pill
              href={adminClassesHrefPatch(filters, {
                audience: "youth",
              })}
              active={filters.audience === "youth"}
            >
              Youth
            </Pill>
            <Pill
              href={adminClassesHrefPatch(filters, {
                audience: "adults",
                delivery: null,
                schoolSlug: null,
              })}
              active={filters.audience === "adults"}
            >
              Adults
            </Pill>
          </div>
        </div>

        <div className="w-full min-w-[12rem] sm:max-w-md">
          <span className="mb-1 block text-[10px] font-semibold uppercase tracking-[0.12em] text-[var(--muted-foreground)]">
            Search
          </span>
          <SearchInput
            placeholder={`${t.class.singular}, ${t.program.singular.toLowerCase()}, ${t.season.singular.toLowerCase()}, ${t.venue.singular.toLowerCase()}, ${t.coach.singular.toLowerCase()}…`}
          />
        </div>
      </div>

      {youth && (
        <div className="space-y-2">
          <span className="text-[10px] font-semibold uppercase tracking-[0.12em] text-[var(--muted-foreground)]">
            Format
          </span>
          <div className="flex flex-wrap gap-2">
            <Pill
              href={adminClassesHrefPatch(filters, {
                delivery: null,
                schoolSlug: null,
              })}
              active={!filters.delivery}
            >
              Any
            </Pill>
            <Pill
              href={adminClassesHrefPatch(filters, {
                delivery: "at_club",
                schoolSlug: null,
              })}
              active={filters.delivery === "at_club"}
            >
              At club
            </Pill>
            <Pill
              href={adminClassesHrefPatch(filters, { delivery: "pickup" })}
              active={filters.delivery === "pickup"}
            >
              School pickup
            </Pill>
            <Pill
              href={adminClassesHrefPatch(filters, {
                delivery: "onsite",
                schoolSlug: null,
              })}
              active={filters.delivery === "onsite"}
            >
              Onsite
            </Pill>
          </div>
        </div>
      )}

      {youth && pickup && (
        <div className="space-y-2">
          <span className="text-[10px] font-semibold uppercase tracking-[0.12em] text-[var(--muted-foreground)]">
            School
          </span>
          <div className="flex max-h-24 flex-wrap gap-2 overflow-y-auto">
            <Pill
              href={adminClassesHrefPatch(filters, { schoolSlug: null })}
              active={!filters.schoolSlug}
            >
              Any school
            </Pill>
            {schools.map((s) => (
              <Pill
                key={s.slug}
                href={adminClassesHrefPatch(filters, {
                  schoolSlug: s.slug,
                })}
                active={filters.schoolSlug === s.slug}
              >
                {s.name}
              </Pill>
            ))}
          </div>
        </div>
      )}

      <div className="flex flex-wrap items-end gap-4">
        <SelectShell label="Club">
          <select
            className="h-9 min-w-[10rem] rounded-md border border-[var(--border)] bg-[var(--card)] px-2 text-sm"
            value={filters.clubId ?? ""}
            onChange={(e) => setParam("club", e.target.value || null)}
          >
            <option value="">All clubs</option>
            {clubs.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </SelectShell>

        <SelectShell label={t.coach.singular}>
          <select
            className="h-9 min-w-[10rem] rounded-md border border-[var(--border)] bg-[var(--card)] px-2 text-sm"
            value={filters.coachPersonId ?? ""}
            onChange={(e) => setParam("coach", e.target.value || null)}
          >
            <option value="">All {t.coach.plural.toLowerCase()}</option>
            {coaches.map((c) => (
              <option key={c.personId} value={c.personId}>
                {c.name}
              </option>
            ))}
          </select>
        </SelectShell>

        <div className="flex flex-col gap-1">
          <span className="text-[10px] font-semibold uppercase tracking-[0.12em] text-[var(--muted-foreground)]">
            Series status
          </span>
          <div className="flex flex-wrap gap-2">
            <Pill
              href={adminClassesHref(
                patchAdminClassesFilters(filters, { seriesStatus: null }),
              )}
              active={filters.seriesStatus == null}
            >
              Default
            </Pill>
            <Pill
              href={adminClassesHref(
                patchAdminClassesFilters(filters, { seriesStatus: "all" }),
              )}
              active={filters.seriesStatus === "all"}
            >
              Any status
            </Pill>
            {(
              [
                "published",
                "in_progress",
                "draft",
                "full",
                "completed",
                "cancelled",
              ] as const
            ).map((st) => (
              <Pill
                key={st}
                href={adminClassesHref(
                  patchAdminClassesFilters(filters, { seriesStatus: st }),
                )}
                active={filters.seriesStatus === st}
              >
                {st.replace("_", " ")}
              </Pill>
            ))}
          </div>
        </div>

        <div className="ml-auto flex flex-col gap-1">
          <span className="text-[10px] font-semibold uppercase tracking-[0.12em] text-[var(--muted-foreground)]">
            Window
          </span>
          <Link
            href={adminClassesHrefPatch(filters, {
              includeAllSeries: !filters.includeAllSeries,
            })}
            scroll={false}
            className="text-xs text-[var(--muted-foreground)] underline-offset-4 hover:text-[var(--foreground)] hover:underline"
          >
            {filters.includeAllSeries
              ? "Only current / upcoming (default time rules)"
              : "Include past & ended series"}
          </Link>
        </div>
      </div>
    </div>
  );
}
