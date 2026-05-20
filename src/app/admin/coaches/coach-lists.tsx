"use client";

import Link from "next/link";
import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { DAY_OF_WEEK_LABEL, formatMinuteOfDay } from "@/lib/ladder/rules";
import {
  StaffCommercialsEditor,
  ZzpCommercialsEditor,
  type StaffCommercials,
  type ZzpCommercials,
} from "./_coach-commercials-editor";

export interface CoachAvailabilityWindow {
  dayOfWeek: number;
  startMinute: number;
  endMinute: number;
}

export type CoachRow = {
  id: string;
  name: string;
  primaryEmail: string;
  clubsLabel: string;
  clubsAreAll: boolean;
  isStaff: boolean;
  isZzp: boolean;
  availability: CoachAvailabilityWindow[];
  /** Present when the row originated from the staff `Coach` table. */
  staffCommercials: StaffCommercials | null;
  /** Present when the row originated from the `ZzpCoach` table. */
  zzpCommercials: ZzpCommercials | null;
};

type Props = {
  staff: CoachRow[];
  zzp: CoachRow[];
  /** Tenant short brand name. Used in the staff description copy. */
  brandName: string;
};

/*
 * Side-by-side staff / ZZP coach lists with an "only show staff" /
 * "only show ZZP" filter so you can hide one when the other gets long.
 *
 * Filter state is local component state — intentional. It resets on
 * navigation (admins coming back to the page see both lists by default,
 * which matches the "is anyone missing?" mental model for this screen).
 */
export function CoachLists({ staff, zzp, brandName }: Props) {
  const [view, setView] = useState<"both" | "staff" | "zzp">("both");

  const showStaff = view === "both" || view === "staff";
  const showZzp = view === "both" || view === "zzp";

  return (
    <div className="space-y-8">
      <div
        className="flex flex-wrap items-center gap-2"
        role="group"
        aria-label="Filter coach lists"
      >
        <span className="text-xs font-semibold uppercase tracking-[0.16em] text-[var(--muted-foreground)]">
          Show
        </span>
        <FilterChip
          label={`Both (${staff.length + zzp.length})`}
          active={view === "both"}
          onClick={() => setView("both")}
        />
        <FilterChip
          label={`Staff only (${staff.length})`}
          active={view === "staff"}
          onClick={() => setView("staff")}
        />
        <FilterChip
          label={`ZZP only (${zzp.length})`}
          active={view === "zzp"}
          onClick={() => setView("zzp")}
        />
      </div>

      {showStaff ? (
        <CoachListSection
          title="Staff coaches"
          description={`Employees on the ${brandName} payroll. Default scope is all clubs unless restricted.`}
          rows={staff}
          emptyHint="No staff coaches yet — send a staff_coach invite above."
          roleLabel="Staff coach"
        />
      ) : null}

      {showZzp ? (
        <CoachListSection
          title="ZZP coaches"
          description="External freelancers who rent court time. Always scoped to one or more clubs."
          rows={zzp}
          emptyHint="No ZZP coaches yet — send a zzp_coach invite above."
          roleLabel="ZZP coach"
        />
      ) : null}
    </div>
  );
}

function FilterChip({
  label,
  active,
  onClick,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <Button
      type="button"
      size="sm"
      variant={active ? "secondary" : "outline"}
      onClick={onClick}
      aria-pressed={active}
    >
      {label}
    </Button>
  );
}

function CoachListSection({
  title,
  description,
  rows,
  emptyHint,
  roleLabel,
}: {
  title: string;
  description: string;
  rows: CoachRow[];
  emptyHint: string;
  roleLabel: string;
}) {
  return (
    <section className="fade-in space-y-3">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div className="space-y-1">
          <h3 className="font-display text-[1.15rem] font-medium leading-tight tracking-tight">
            {title}
            <span className="ml-2 text-sm font-normal text-[var(--muted-foreground)]">
              ({rows.length})
            </span>
          </h3>
          <p className="text-sm text-[var(--muted-foreground)]">{description}</p>
        </div>
      </header>

      {rows.length === 0 ? (
        <p className="text-sm text-[var(--muted-foreground)]">{emptyHint}</p>
      ) : (
        <ul className="divide-y divide-[var(--border)] rounded-lg border border-[var(--border)]">
          {rows.map((row) => (
            <li
              key={row.id}
              className="flex flex-col gap-3 px-4 py-4 sm:flex-row sm:flex-wrap sm:items-start sm:justify-between"
            >
              <div className="min-w-0 flex-1">
                <div className="font-medium">{row.name}</div>
                <div className="text-sm text-[var(--muted-foreground)]">
                  {row.primaryEmail}
                </div>
                <div className="mt-2 text-sm">
                  {row.clubsAreAll ? (
                    <span className="text-[var(--muted-foreground)]">
                      All clubs
                    </span>
                  ) : (
                    row.clubsLabel
                  )}
                </div>
                <AvailabilitySummary windows={row.availability} />
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant="secondary">{roleLabel}</Badge>
                {row.isStaff && row.isZzp ? (
                  <Badge variant="outline">Also {roleLabel === "Staff coach" ? "ZZP" : "staff"}</Badge>
                ) : null}
                <Button asChild size="sm" variant="ghost">
                  <Link href={`/admin/private-lessons/${row.id}`}>
                    Invoicing →
                  </Link>
                </Button>
              </div>
              {/* The full row spans both flex children below the
                  primary header so the editor card has room to breathe. */}
              <div className="basis-full">
                {roleLabel === "Staff coach" && row.staffCommercials ? (
                  <StaffCommercialsEditor
                    coachPersonId={row.id}
                    initial={row.staffCommercials}
                  />
                ) : null}
                {roleLabel === "ZZP coach" && row.zzpCommercials ? (
                  <ZzpCommercialsEditor
                    zzpPersonId={row.id}
                    initial={row.zzpCommercials}
                  />
                ) : null}
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function AvailabilitySummary({
  windows,
}: {
  windows: CoachAvailabilityWindow[];
}) {
  if (windows.length === 0) {
    return (
      <div className="mt-2 text-xs text-[var(--muted-foreground)]">
        Availability:{" "}
        <span className="italic">not set (treat as flexible)</span>
      </div>
    );
  }

  const PREVIEW_LIMIT = 3;
  const preview = windows.slice(0, PREVIEW_LIMIT);
  const overflow = windows.length - preview.length;
  const previewText = preview.map(formatWindow).join(" · ");

  return (
    <details className="group mt-2 text-xs text-[var(--muted-foreground)]">
      <summary className="cursor-pointer list-none select-none">
        <span className="inline-flex items-center gap-1.5">
          <span aria-hidden className="transition-transform group-open:rotate-90">
            ›
          </span>
          <span>
            Availability:{" "}
            <span className="text-[var(--foreground)]">{previewText}</span>
            {overflow > 0 ? (
              <span className="ml-1">+ {overflow} more</span>
            ) : null}
          </span>
        </span>
      </summary>
      <ul className="mt-2 grid gap-1 pl-5 sm:grid-cols-2">
        {windows.map((w, i) => (
          <li key={i} className="text-[var(--foreground)]">
            {formatWindow(w)}
          </li>
        ))}
      </ul>
    </details>
  );
}

function formatWindow(w: CoachAvailabilityWindow): string {
  const day = DAY_OF_WEEK_LABEL[w.dayOfWeek] ?? "?";
  return `${day} ${formatMinuteOfDay(w.startMinute)}–${formatMinuteOfDay(w.endMinute)}`;
}
