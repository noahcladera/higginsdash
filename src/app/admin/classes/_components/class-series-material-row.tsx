"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { StatusSurface } from "@/components/ui/status-surface";
import { ChevronRightIcon } from "@/components/icons";
import { deliveryModeLabel } from "@/lib/classes/timing";
import { cn } from "@/lib/utils";
import type { StatusTone } from "@/lib/ui/status-tone";
import { ClassRowMenu } from "./class-row-menu";
import { ClassSummaryCard, type ClassSummaryProps } from "./class-summary-card";
import { ScheduleCalendar } from "./schedule-calendar";
import type { ClassRowData } from "./class-row";

function rowTone(data: ClassRowData): StatusTone {
  if (data.status === "draft" || data.leadCoachName === "NO COACH YET") {
    return "warning";
  }
  if (data.deliveryMode === "pickup") return "joint";
  if (data.deliveryMode === "onsite") return "neutral";
  return "triaz";
}

function modeBadgeTone(
  mode: ClassRowData["deliveryMode"],
): "triaz" | "joint" | "warning" | "neutral" {
  if (mode === "pickup") return "joint";
  if (mode === "onsite") return "warning";
  return "triaz";
}

const compactBadge =
  "px-1.5 py-px text-[10px] leading-4 font-medium shadow-none [&>svg]:size-2.5";

export function ClassSeriesMaterialRow({ data }: { data: ClassRowData }) {
  const [open, setOpen] = useState(false);
  const tone = rowTone(data);

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

  const full = data.enrolled >= data.maxStudents;

  return (
    <li>
      <StatusSurface
        tone={tone}
        className={cn(
          "elev-card overflow-hidden p-0 transition-[transform,box-shadow] duration-[var(--duration-fast)]",
          !open && "hover:-translate-y-px hover:shadow-[var(--shadow-elevated)]",
        )}
      >
        <div
          role="button"
          tabIndex={0}
          onClick={() => setOpen((v) => !v)}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              setOpen((v) => !v);
            }
          }}
          className="flex cursor-pointer items-start gap-2 px-3 py-2.5 sm:gap-3"
        >
          <ChevronRightIcon
            size={14}
            className={cn(
              "mt-0.5 shrink-0 text-[var(--muted-foreground)] transition-transform",
              open && "rotate-90",
            )}
          />

          <div className="min-w-0 flex-1 space-y-1">
            <div className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5">
              <Link
                href={`/admin/classes/${data.id}`}
                onClick={(e) => e.stopPropagation()}
                className="text-sm font-medium leading-snug tracking-tight text-[var(--foreground)] hover:underline"
              >
                {data.displayTitle}
              </Link>
              <Badge
                tone={modeBadgeTone(data.deliveryMode)}
                variant="soft"
                className={compactBadge}
              >
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
                className={cn(compactBadge, "capitalize")}
              >
                {data.status === "draft"
                  ? "Draft"
                  : data.status === "published"
                    ? "Published"
                    : data.status.replace("_", " ")}
              </Badge>
              {data.venueKind === "club" && !data.defaultCourtId && (
                <Badge tone="warning" variant="soft" className={compactBadge}>
                  Missing court
                </Badge>
              )}
            </div>
            <p className="text-sm leading-snug text-[var(--foreground)]/85">
              {data.allCoachNames.length === 0
                ? "No coach assigned"
                : data.allCoachNames.join(", ")}
            </p>
            <p className="text-xs text-[var(--foreground)]/60">
              {data.displaySubtitle}
              {data.seasonName ? ` · ${data.seasonName}` : ""}
            </p>
          </div>

          <div className="flex shrink-0 items-center gap-2 sm:gap-3">
            <div className="text-right">
              <div
                className={cn(
                  "font-display text-lg font-medium tabular-nums leading-none tracking-tight sm:text-xl",
                  full && "text-[var(--warning-ink)]",
                )}
              >
                {data.enrolled}/{data.maxStudents}
              </div>
              <div className="mt-0.5 text-[9px] font-semibold uppercase tracking-[0.14em] text-[var(--muted-foreground)]">
                enrolled
              </div>
            </div>
            <div onClick={(e) => e.stopPropagation()} onKeyDown={(e) => e.stopPropagation()}>
              <ClassRowMenu seriesId={data.id} seriesName={data.name} />
            </div>
          </div>
        </div>

        {open && (
          <div className="border-t border-[var(--glass-border-subtle)] px-3 pb-3 pt-2">
            <div className="elev-panel space-y-3 p-3">
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
                  <Link href={`/admin/classes/${data.id}`}>Open full edit</Link>
                </Button>
              </div>
            </div>
          </div>
        )}
      </StatusSurface>
    </li>
  );
}
