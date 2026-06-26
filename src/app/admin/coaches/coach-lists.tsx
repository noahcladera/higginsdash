"use client";

import Link from "next/link";
import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { StatusBadge } from "@/components/ui/status-badge";
import { Button } from "@/components/ui/button";
import { StatusSurface } from "@/components/ui/status-surface";
import { ChevronRightIcon } from "@/components/icons";
import {
  PersonAvatarWell,
  personAvatarFromFullName,
} from "@/components/admin/person-avatar-well";
import { cn } from "@/lib/utils";
import type { StatusTone } from "@/lib/ui/status-tone";
import { DAY_OF_WEEK_LABEL, formatMinuteOfDay } from "@/lib/scheduling/time-labels";
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
  staffCommercials: StaffCommercials | null;
  zzpCommercials: ZzpCommercials | null;
};

type Props = {
  staff: CoachRow[];
  zzp: CoachRow[];
  brandName: string;
};

const compactBadge =
  "px-1.5 py-px text-[10px] leading-4 font-medium shadow-none";

export function CoachLists({ staff, zzp, brandName }: Props) {
  const [view, setView] = useState<"both" | "staff" | "zzp">("both");

  const showStaff = view === "both" || view === "staff";
  const showZzp = view === "both" || view === "zzp";

  return (
    <div className="space-y-4">
      <div
        className="flex flex-wrap items-center gap-1.5"
        role="group"
        aria-label="Filter coach lists"
      >
        <span className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--muted-foreground)]">
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
          tone="neutral"
          badgeTone="neutral"
        />
      ) : null}

      {showZzp ? (
        <CoachListSection
          title="ZZP coaches"
          description="External freelancers who rent court time. Always scoped to one or more clubs."
          rows={zzp}
          emptyHint="No ZZP coaches yet — send a zzp_coach invite above."
          roleLabel="ZZP coach"
          tone="neutral"
          badgeTone="neutral"
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
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        "rounded-full border px-2.5 py-1 text-xs font-medium transition-colors",
        active
          ? "control-well border-[var(--border-strong)] text-[var(--foreground)] shadow-[var(--shadow-elevated)]"
          : "border-[var(--border)] text-[var(--muted-foreground)] hover:text-[var(--foreground)]",
      )}
    >
      {label}
    </button>
  );
}

function CoachListSection({
  title,
  description,
  rows,
  emptyHint,
  roleLabel,
  tone,
  badgeTone = "neutral",
}: {
  title: string;
  description: string;
  rows: CoachRow[];
  emptyHint: string;
  roleLabel: string;
  tone: StatusTone;
  badgeTone?: StatusTone;
}) {
  return (
    <section className="fade-in space-y-2">
      <header>
        <h3 className="text-sm font-semibold tracking-tight text-[var(--foreground)]">
          {title}
          <span className="ml-1.5 text-xs font-normal text-[var(--muted-foreground)]">
            ({rows.length})
          </span>
        </h3>
        <p className="text-xs text-[var(--muted-foreground)]">{description}</p>
      </header>

      {rows.length === 0 ? (
        <p className="text-xs text-[var(--muted-foreground)]">{emptyHint}</p>
      ) : (
        <ul className="space-y-1">
          {rows.map((row) => (
            <CoachMaterialRow
              key={`${roleLabel}-${row.id}`}
              row={row}
              roleLabel={roleLabel}
              tone={tone}
              badgeTone={badgeTone}
            />
          ))}
        </ul>
      )}
    </section>
  );
}

function CoachMaterialRow({
  row,
  roleLabel,
  tone,
  badgeTone = "neutral",
}: {
  row: CoachRow;
  roleLabel: string;
  tone: StatusTone;
  badgeTone?: StatusTone;
}) {
  const { firstName, lastName } = personAvatarFromFullName(row.name);
  const isInactive =
    roleLabel === "Staff coach"
      ? row.staffCommercials?.isActive === false
      : row.zzpCommercials?.isActive === false;

  const rateStat =
    roleLabel === "Staff coach"
      ? formatEuro(row.staffCommercials?.defaultHourlyRate ?? null)
      : formatEuro(row.zzpCommercials?.defaultCourtRentalRate ?? null);
  const rateLabel =
    roleLabel === "Staff coach" ? "hourly" : "court / h";

  return (
    <li>
      <StatusSurface
        tone={tone}
        className="elev-card overflow-hidden p-0"
      >
        <div className="flex flex-col gap-0">
          <div className="flex flex-col gap-2 px-3 py-2.5 sm:flex-row sm:items-start sm:gap-3">
            <PersonAvatarWell
              firstName={firstName}
              lastName={lastName}
              tone="neutral"
              size="sm"
              className="hidden sm:flex"
            />
            <div className="min-w-0 flex-1 space-y-1">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0 space-y-0.5">
                  <div className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5">
                    <Link
                      href={`/admin/people/${row.id}`}
                      className="text-sm font-medium tracking-tight text-[var(--foreground)] hover:underline"
                    >
                      {row.name}
                    </Link>
                    <Badge variant="soft" tone={badgeTone} className={compactBadge}>
                      {roleLabel}
                    </Badge>
                    {isInactive && (
                      <StatusBadge tone="warning" className={compactBadge}>
                        Inactive
                      </StatusBadge>
                    )}
                    {row.isStaff && row.isZzp ? (
                      <Badge variant="outline" className={compactBadge}>
                        Also {roleLabel === "Staff coach" ? "ZZP" : "staff"}
                      </Badge>
                    ) : null}
                  </div>
                  <p className="text-xs text-[var(--foreground)]/70">
                    {row.primaryEmail}
                  </p>
                </div>

                <div className="flex shrink-0 items-center gap-1.5">
                  <div className="hidden text-right sm:block">
                    <div className="font-display text-lg font-medium tabular-nums leading-none tracking-tight">
                      {rateStat}
                    </div>
                    <div className="mt-0.5 text-[9px] font-semibold uppercase tracking-[0.12em] text-[var(--muted-foreground)]">
                      {rateLabel}
                    </div>
                  </div>
                  <Button asChild size="sm" variant="ghost" className="h-7 px-2 text-xs">
                    <Link href={`/admin/private-lessons/${row.id}`}>Invoicing</Link>
                  </Button>
                  <Link
                    href={`/admin/people/${row.id}`}
                    className="flex items-center text-[var(--muted-foreground)] transition-colors hover:text-[var(--foreground)]"
                    aria-label={`View ${row.name}`}
                  >
                    <ChevronRightIcon size={14} />
                  </Link>
                </div>
              </div>

              <p className="text-xs text-[var(--foreground)]/60">
                {row.clubsAreAll ? "All clubs" : row.clubsLabel}
              </p>
              <AvailabilitySummary windows={row.availability} />

              <p className="tabular text-xs font-medium text-[var(--muted-foreground)] sm:hidden">
                {rateStat} · {rateLabel}
              </p>
            </div>
          </div>

          <div className="border-t border-[var(--glass-border-subtle)] px-3 pb-2.5 pt-0">
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
        </div>
      </StatusSurface>
    </li>
  );
}

function AvailabilitySummary({
  windows,
}: {
  windows: CoachAvailabilityWindow[];
}) {
  if (windows.length === 0) {
    return (
      <p className="text-xs text-[var(--muted-foreground)]">
        Availability:{" "}
        <span className="italic">not set (treat as flexible)</span>
      </p>
    );
  }

  const PREVIEW_LIMIT = 3;
  const preview = windows.slice(0, PREVIEW_LIMIT);
  const overflow = windows.length - preview.length;
  const previewText = preview.map(formatWindow).join(" · ");

  return (
    <details className="group text-xs text-[var(--muted-foreground)]">
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

function formatEuro(n: number | null): string {
  return n == null ? "—" : `€${n.toFixed(0)}`;
}
