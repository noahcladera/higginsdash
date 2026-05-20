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
  seasonName: string | null;
  deliveryMode: "at_club" | "onsite" | "pickup";
  venueName: string;
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
export function ClassRow({ data }: { data: ClassRowData }) {
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
        <TableCell className="max-w-[260px] whitespace-normal align-top sm:max-w-[320px] lg:max-w-[380px]">
          <div className="flex items-start gap-2">
            <ChevronRightIcon
              size={14}
              className={`mt-1 shrink-0 text-[var(--muted-foreground)] transition-transform ${
                open ? "rotate-90" : ""
              }`}
            />
            <div className="min-w-0">
              <div
                className="line-clamp-2 font-medium leading-snug break-words whitespace-normal"
                title={data.name}
              >
                {data.name}
              </div>
              <div className="truncate text-xs text-[var(--muted-foreground)]">
                {data.programName}
              </div>
            </div>
          </div>
        </TableCell>
        <TableCell>
          <div className="flex flex-col items-start gap-1">
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
          </div>
        </TableCell>
        <TableCell className="text-[var(--muted-foreground)]">
          {data.deliveryMode === "pickup" && data.schoolName
            ? `${data.schoolName} → ${data.venueName}`
            : data.venueName}
        </TableCell>
        <TableCell className="text-[var(--muted-foreground)]">
          {data.seasonName ?? "—"}
        </TableCell>
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
          <TableCell colSpan={7} className="p-4">
            <div className="space-y-4">
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
