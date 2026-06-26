"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { TableCell, TableRow } from "@/components/ui/table";
import { ChevronRightIcon } from "@/components/icons";
import { deliveryModeLabel } from "@/lib/classes/timing";
import { ClassRowMenu } from "./class-row-menu";
import { ClassSummaryCard, type ClassSummaryProps } from "./class-summary-card";
import { ScheduleCalendar } from "./schedule-calendar";

export type ClassRowData = {
  id: string;
  name: string;
  programName: string;
  programSlug: string;
  programTargetAudience: "kids" | "adults" | "mixed";
  seasonName: string | null;
  seasonId: string | null;
  displayTitle: string;
  displaySubtitle: string;
  deliveryMode: "at_club" | "onsite" | "pickup";
  venueName: string;
  venueKind: "club" | "school" | "rented_court";
  defaultCourtId: string | null;
  schoolName: string | null;
  dayOfWeek: "mon" | "tue" | "wed" | "thu" | "fri" | "sat" | "sun";
  startTimeHHMM: string;
  endTimeHHMM: string;
  pickupAtHHMM: string | null;
  startsOnISO: string;
  endsOnISO: string;
  excludedDatesISO: string[];
  leadCoachName: string;
  assistantCoachNames: string[];
  allCoachNames: string[];
  enrolled: number;
  maxStudents: number;
  minStudents: number | null;
  sessionsTotal: number;
  status:
    | "draft"
    | "published"
    | "full"
    | "in_progress"
    | "completed"
    | "cancelled";
};

/**
 * One class row in the admin list. Clicking the row body toggles an
 * in-place peek that shows the summary tile + read-only calendar,
 * useful for coaches to quickly answer parent questions about no-
 * lesson dates.
 *
 * The "Edit" button stops click propagation and links to the full
 * locked edit page.
 */
export function ClassRow({
  data,
  compact = false,
}: {
  data: ClassRowData;
  /** Grouped list: venue/season are in section headers. */
  compact?: boolean;
}) {
  const [open, setOpen] = useState(false);

  const modeTone =
    data.deliveryMode === "pickup"
      ? "joint"
      : data.deliveryMode === "onsite"
        ? "warning"
        : "triaz";

  const excludedSet = useMemo(
    () => new Set(data.excludedDatesISO),
    [data.excludedDatesISO],
  );

  const summary: ClassSummaryProps = {
    name: data.name,
    programName: data.programName,
    seasonName: data.seasonName,
    deliveryMode: data.deliveryMode,
    venueName: data.venueName,
    schoolName: data.schoolName,
    dayOfWeek: data.dayOfWeek,
    startTimeHHMM: data.startTimeHHMM,
    endTimeHHMM: data.endTimeHHMM,
    pickupAtHHMM: data.pickupAtHHMM,
    startsOnISO: data.startsOnISO,
    endsOnISO: data.endsOnISO,
    leadCoachName: data.leadCoachName,
    assistantCoachNames: data.assistantCoachNames,
    enrolled: data.enrolled,
    maxStudents: data.maxStudents,
    minStudents: data.minStudents,
    sessionsTotal: data.sessionsTotal,
    sessionsExcluded: data.excludedDatesISO.length,
  };

  return (
    <>
      <TableRow
        onClick={() => setOpen((v) => !v)}
        className="cursor-pointer transition-colors hover:bg-[var(--surface)]/60"
      >
        <TableCell className="max-w-[260px] whitespace-normal align-top sm:max-w-[320px] lg:max-w-[420px]">
          <div className="flex items-start gap-2">
            <ChevronRightIcon
              size={14}
              className={`mt-1 shrink-0 text-[var(--muted-foreground)] transition-transform ${
                open ? "rotate-90" : ""
              }`}
            />
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <span
                  className="font-medium leading-snug break-words"
                  title={data.name}
                >
                  {data.displayTitle}
                </span>
                <Badge tone={modeTone} variant="soft">
                  {deliveryModeLabel(data.deliveryMode)}
                </Badge>
                <Badge
                  tone={
                    data.status === "published"
                      ? "success"
                      : data.status === "draft"
                        ? "warning"
                        : "neutral"
                  }
                  variant="soft"
                  className="capitalize"
                >
                  {data.status === "draft"
                    ? "Draft"
                    : data.status === "published"
                      ? "Published"
                      : data.status.replace("_", " ")}
                </Badge>
                {data.venueKind === "club" && !data.defaultCourtId && (
                  <Badge tone="warning" variant="soft">
                    Missing court
                  </Badge>
                )}
              </div>
              <div
                className="truncate text-xs text-[var(--muted-foreground)]"
                title={data.name}
              >
                {data.displaySubtitle}
              </div>
            </div>
          </div>
        </TableCell>
        {!compact && (
          <TableCell className="text-[var(--muted-foreground)]">
            {data.deliveryMode === "pickup" && data.schoolName
              ? `${data.schoolName} → ${data.venueName}`
              : data.venueName}
          </TableCell>
        )}
        {!compact && (
          <TableCell className="text-[var(--muted-foreground)]">
            {data.seasonName ?? "—"}
          </TableCell>
        )}
        <TableCell className="text-xs text-[var(--muted-foreground)]">
          {data.allCoachNames.length === 0
            ? "—"
            : data.allCoachNames.join(", ")}
        </TableCell>
        <TableCell className="tabular text-right">
          {data.enrolled}/{data.maxStudents}
        </TableCell>
        <TableCell
          className="w-10 text-right"
          onClick={(e) => e.stopPropagation()}
        >
          <ClassRowMenu seriesId={data.id} seriesName={data.name} />
        </TableCell>
      </TableRow>
      {open && (
        <TableRow className="bg-[var(--surface)]/40 hover:bg-transparent">
          <TableCell colSpan={compact ? 4 : 6} className="p-4">
            <div
              className="space-y-4 rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--surface)] p-4"
            >
              <ClassSummaryCard {...summary} />
              <ScheduleCalendar
                mode="read"
                startsOn={data.startsOnISO}
                endsOn={data.endsOnISO}
                dayOfWeek={data.dayOfWeek}
                excluded={excludedSet}
              />
              <div className="flex justify-end">
                <Button asChild tone="triaz" size="sm">
                  <Link href={`/admin/classes/${data.id}`}>
                    Open full edit
                  </Link>
                </Button>
              </div>
            </div>
          </TableCell>
        </TableRow>
      )}
    </>
  );
}
