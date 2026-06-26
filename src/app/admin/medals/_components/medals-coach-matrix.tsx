"use client";

import { useMemo, useState } from "react";
import type { MedalLevel } from "@prisma/client";
import { Badge } from "@/components/ui/badge";
import { ChevronRightIcon } from "@/components/icons";
import { StatusSurface } from "@/components/ui/status-surface";
import { MEDAL_LEVELS } from "@/lib/medal-levels";
import type {
  CoachMedalsReportRow,
  StudentAssignmentGap,
} from "@/lib/medals/coach-medals-report";
import { groupGapsBySeries } from "@/lib/medals/reminder-messages";
import { cn } from "@/lib/utils";
import { CoachAssignmentReminder } from "./coach-assignment-reminder";

const compactBadge =
  "px-1.5 py-px text-[10px] leading-4 font-medium shadow-none";

function MedalCells({
  byMedal,
}: {
  byMedal: Record<MedalLevel, number>;
}) {
  return (
    <>
      {MEDAL_LEVELS.map((level) => {
        const count = byMedal[level.value];
        return (
          <td
            key={level.value}
            className={cn(
              "px-1 py-1.5 text-center tabular-nums",
              count
                ? "text-[var(--foreground)]"
                : "text-[var(--muted-foreground)]/50",
            )}
          >
            {count || "—"}
          </td>
        );
      })}
    </>
  );
}

function CollapsedMedalSummary({
  byMedal,
  assignedCount,
}: {
  byMedal: Record<MedalLevel, number>;
  assignedCount: number;
}) {
  const parts = MEDAL_LEVELS.filter((l) => byMedal[l.value] > 0).map(
    (l) => `${l.shortCode} ${byMedal[l.value]}`,
  );

  if (parts.length === 0 && assignedCount === 0) {
    return (
      <span className="hidden text-[11px] text-[var(--muted-foreground)] lg:inline">
        No medals assigned yet
      </span>
    );
  }

  return (
    <span className="hidden min-w-0 truncate text-[11px] tabular-nums text-[var(--foreground)]/70 lg:inline">
      {parts.join(" · ")}
      {assignedCount > 0 ? ` · ${assignedCount} assigned` : ""}
    </span>
  );
}

function GapListSection({
  title,
  gaps,
}: {
  title: string;
  gaps: StudentAssignmentGap[];
}) {
  const groups = useMemo(() => groupGapsBySeries(gaps), [gaps]);
  if (groups.length === 0) return null;

  return (
    <div className="space-y-2 px-2 pb-2">
      <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-[var(--warning-ink)]">
        {title}
      </p>
      <div className="space-y-2">
        {groups.map((group) => (
          <div key={group.seriesId} className="space-y-1">
            <p className="text-xs font-medium text-[var(--foreground)]">
              {group.seriesName}
            </p>
            <ul className="list-inside list-disc text-xs text-[var(--foreground)]/85">
              {group.students.map((name) => (
                <li key={`${group.seriesId}-${name}`}>{name}</li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </div>
  );
}

function MatrixTable({
  row,
}: {
  row: CoachMedalsReportRow;
}) {
  const tableRows = useMemo(() => {
    type TableRow = {
      key: string;
      sublabel: string;
      byMedal: Record<MedalLevel, number>;
      total: number;
      emphasis?: boolean;
    };

    if (row.bySeries.length === 0) {
      return [
        {
          key: `${row.coachId}-empty`,
          sublabel: "—",
          byMedal: row.byMedal,
          total: row.assignedCount,
        },
      ] satisfies TableRow[];
    }

    const series: TableRow[] = row.bySeries.map((s) => ({
      key: s.seriesId,
      sublabel: s.seriesName,
      byMedal: s.byMedal,
      total: s.total,
    }));

    series.push({
      key: `${row.coachId}-total`,
      sublabel: "Coach total",
      byMedal: row.byMedal,
      total: row.assignedCount,
      emphasis: true,
    });

    return series;
  }, [row]);

  return (
    <div className="overflow-x-auto px-2 pb-2">
      <table className="w-full min-w-[720px] text-xs">
        <thead>
          <tr className="border-b border-[var(--border)] text-[10px] font-semibold uppercase tracking-[0.12em] text-[var(--muted-foreground)]">
            <th className="px-2 py-1.5 text-left font-semibold">Programme</th>
            {MEDAL_LEVELS.map((level) => (
              <th
                key={level.value}
                className="px-1 py-1.5 text-center font-semibold"
                title={level.label}
              >
                {level.shortCode}
              </th>
            ))}
            <th className="px-2 py-1.5 text-right font-semibold">Total</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-[var(--border)]">
          {tableRows.map((tableRow) => (
            <tr
              key={tableRow.key}
              className={cn(
                tableRow.emphasis && "bg-[var(--surface-muted)]/50 font-medium",
              )}
            >
              <td
                className={cn(
                  "max-w-[16rem] truncate px-2 py-1.5",
                  tableRow.emphasis
                    ? "text-[var(--foreground)]"
                    : "text-[var(--foreground)]/80",
                )}
                title={tableRow.sublabel}
              >
                {tableRow.sublabel}
              </td>
              <MedalCells byMedal={tableRow.byMedal} />
              <td className="px-2 py-1.5 text-right tabular-nums">
                {tableRow.total}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function CoachSection({
  row,
  whatsappMedalsUrl,
  whatsappLevelsUrl,
  defaultOpen,
}: {
  row: CoachMedalsReportRow;
  whatsappMedalsUrl: string | null;
  whatsappLevelsUrl: string | null;
  defaultOpen: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const hasMedalGaps = row.missingMedals.length > 0;
  const hasLevelGaps = row.missingLevels.length > 0;
  const tone = hasMedalGaps || hasLevelGaps ? "warning" : "neutral";

  return (
    <StatusSurface tone={tone} className="elev-card overflow-hidden p-0">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex w-full flex-col gap-1.5 px-3 py-2 text-left transition-colors hover:bg-[var(--surface-muted)]/40 sm:flex-row sm:items-center sm:gap-3"
      >
        <div className="flex min-w-0 flex-1 items-center gap-2">
          <ChevronRightIcon
            size={14}
            className={cn(
              "shrink-0 text-[var(--muted-foreground)] transition-transform",
              open && "rotate-90",
            )}
          />
          <div className="min-w-0 flex-1 space-y-1">
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
              <span className="truncate text-sm font-medium text-[var(--foreground)]">
                {row.coachName}
              </span>
              <span className="text-[11px] text-[var(--muted-foreground)]">
                {row.seriesCount} series
              </span>
              {hasMedalGaps && (
                <Badge tone="warning" variant="soft" className={compactBadge}>
                  {row.missingMedals.length} no medal
                </Badge>
              )}
              {hasLevelGaps && (
                <Badge tone="warning" variant="soft" className={compactBadge}>
                  {row.missingLevels.length} no level
                </Badge>
              )}
            </div>
            <CollapsedMedalSummary
              byMedal={row.byMedal}
              assignedCount={row.assignedCount}
            />
          </div>
        </div>

        <div className="flex shrink-0 items-end gap-4 pl-6 sm:pl-0">
          <div className="text-right">
            <div className="font-display text-base font-medium tabular-nums leading-none">
              {row.assignedCount}
            </div>
            <div className="mt-0.5 text-[9px] font-semibold uppercase tracking-[0.12em] text-[var(--muted-foreground)]">
              assigned
            </div>
          </div>
          <div className="text-right">
            <div className="text-sm font-medium tabular-nums leading-none text-[var(--foreground)]/80">
              {row.enrolledCount}
            </div>
            <div className="mt-0.5 text-[9px] font-semibold uppercase tracking-[0.12em] text-[var(--muted-foreground)]">
              enrolled
            </div>
          </div>
        </div>
      </button>

      {open && (
        <div className="border-t border-[var(--glass-border-subtle)]">
          <MatrixTable row={row} />
          <GapListSection
            title="Missing medals"
            gaps={row.missingMedals}
          />
          <GapListSection
            title="Missing skill levels"
            gaps={row.missingLevels}
          />
          <CoachAssignmentReminder
            coachPersonId={row.coachId}
            coachPhone={row.coachPhone}
            whatsappMedalsUrl={whatsappMedalsUrl}
            whatsappLevelsUrl={whatsappLevelsUrl}
            hasMedalGaps={hasMedalGaps}
            hasLevelGaps={hasLevelGaps}
          />
        </div>
      )}
    </StatusSurface>
  );
}

export type CoachMedalsMatrixRow = CoachMedalsReportRow & {
  whatsappMedalsUrl: string | null;
  whatsappLevelsUrl: string | null;
};

export function MedalsCoachMatrix({
  rows,
  initialCoachId,
}: {
  rows: CoachMedalsMatrixRow[];
  initialCoachId?: string;
}) {
  if (rows.length === 0) {
    return (
      <p className="text-sm text-[var(--muted-foreground)]">
        No lead-coach assignments in published series for these filters.
      </p>
    );
  }

  return (
    <div className="space-y-1">
      {rows.map((row) => (
        <CoachSection
          key={row.coachId}
          row={row}
          whatsappMedalsUrl={row.whatsappMedalsUrl}
          whatsappLevelsUrl={row.whatsappLevelsUrl}
          defaultOpen={
            initialCoachId === row.coachId || rows.length === 1
          }
        />
      ))}
    </div>
  );
}
