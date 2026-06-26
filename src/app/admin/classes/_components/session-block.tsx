"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { format } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { AdminClassesFilters } from "@/lib/admin/classes-filters";
import type { AdminCalendarSession } from "@/lib/admin/classes-queries";
import { adminClassesHrefPatch } from "@/lib/admin/classes-href";
import { Button } from "@/components/ui/button";
import { useTerms } from "@/components/tenant/terms-provider";
import type { Terms } from "@/lib/tenant/terms";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ClassSummaryCard } from "./class-summary-card";
import {
  adminCalendarBlockClasses,
  classSlotColorClasses,
  clubVenueFillClasses,
  classDeliveryBorderClasses,
} from "@/lib/admin/schedule-slot-colors";

export function calendarBlockClasses(session: AdminCalendarSession): string {
  return adminCalendarBlockClasses({
    clubSlug: session.clubSlug,
    deliveryMode: session.deliveryMode,
    classType: session.classType,
  });
}

export function sessionBlockClasses(
  session: AdminCalendarSession,
  colorMode: "venue" | "schedule" = "venue",
  clubOutlines = false,
): string {
  if (clubOutlines) return calendarBlockClasses(session);
  if (colorMode === "schedule") {
    return classSlotColorClasses({
      deliveryMode: session.deliveryMode,
      classType: session.classType,
    });
  }
  return cn(
    clubVenueFillClasses(session.clubSlug),
    classDeliveryBorderClasses({
      deliveryMode: session.deliveryMode,
      classType: session.classType,
    }),
  );
}

export function audienceBlockClasses(
  session: AdminCalendarSession,
  colorMode: "venue" | "schedule" = "venue",
): string {
  return sessionBlockClasses(session, colorMode, false);
}

function blockTooltip(s: AdminCalendarSession, t: Terms): string {
  const lines: string[] = [];
  lines.push(`${s.programName} · ${s.seriesName}`);
  if (s.deliveryMode === "pickup" && s.leaveAt && s.pickupAt) {
    lines.push(`Leave ${t.club.singular}: ${format.time(s.leaveAt)}`);
    lines.push(
      `Pickup ${s.schoolName ?? t.school.singular.toLowerCase()}: ${format.time(s.pickupAt)}`,
    );
  }
  lines.push(
    `${t.class.singular}: ${format.time(s.classStartAt)}–${format.time(s.classEndAt)}`,
  );
  lines.push(`${t.venue.singular}: ${s.venueName}`);
  if (s.clubName) lines.push(`${t.club.singular}: ${s.clubName}`);
  const groups = s.summary.subGroups ?? [];
  if (groups.length > 1) {
    lines.push("");
    lines.push(`${t.classGroup.plural}:`);
    for (const g of groups) {
      const ageStr =
        g.minAge == null && g.maxAge == null
          ? ""
          : g.minAge != null && g.maxAge != null
            ? ` (${g.minAge}–${g.maxAge}y)`
            : g.minAge != null
              ? ` (${g.minAge}+y)`
              : ` (≤${g.maxAge}y)`;
      lines.push(`  • ${g.name} → ${g.endTimeHHMM}${ageStr}`);
    }
  }
  return lines.join("\n");
}

function PickupSegments({
  session,
  height,
  terms,
}: {
  session: AdminCalendarSession;
  height: number;
  terms: Terms;
}) {
  const leaveAt = session.leaveAt!;
  const pickupAt = session.pickupAt!;
  const total = session.classEndAt.getTime() - leaveAt.getTime();
  const seg1 = ((pickupAt.getTime() - leaveAt.getTime()) / total) * height;
  const seg2 =
    ((session.classStartAt.getTime() - pickupAt.getTime()) / total) * height;
  const seg3 = height - seg1 - seg2;

  return (
    <div className="flex h-full flex-col">
      <div
        className="flex items-start gap-1 overflow-hidden border-b border-[var(--joint-ink)]/20 px-1.5 py-1 text-[var(--joint-ink)]"
        style={{ height: seg1 }}
      >
        <span className="tabular shrink-0 whitespace-nowrap font-semibold">
          {format.time(leaveAt)}
        </span>
        <span className="truncate opacity-80">
          leave {terms.club.singular.toLowerCase()}
        </span>
      </div>
      <div
        className="flex items-start gap-1 overflow-hidden border-b border-[var(--joint-ink)]/20 bg-[var(--joint-soft)]/60 px-1.5 py-1 text-[var(--joint-ink)]"
        style={{ height: seg2 }}
      >
        <span className="tabular shrink-0 whitespace-nowrap font-semibold">
          {format.time(pickupAt)}
        </span>
        <span className="truncate opacity-80">
          pickup {session.schoolName ?? ""}
        </span>
      </div>
      <div
        className="flex flex-col items-start gap-0 px-1.5 py-1"
        style={{ height: seg3 }}
      >
        <div className="tabular truncate whitespace-nowrap font-semibold text-[var(--foreground)]">
          {format.time(session.classStartAt)}–
          {format.time(session.classEndAt)}
        </div>
        <div className="truncate text-[10px] text-[var(--muted-foreground)]">
          {session.seriesName}
        </div>
      </div>
    </div>
  );
}

function SingleSegment({
  session,
  mode,
}: {
  session: AdminCalendarSession;
  mode: "full" | "compact" | "timeOnly";
}) {
  const timeLabel = `${format.time(session.classStartAt)}–${format.time(session.classEndAt)}`;

  if (mode === "timeOnly") {
    return (
      <div className="flex h-full items-center px-1 py-0.5">
        <span className="tabular truncate whitespace-nowrap text-[10px] font-semibold text-[var(--foreground)]">
          {format.time(session.classStartAt)}
        </span>
      </div>
    );
  }

  if (mode === "compact") {
    return (
      <div className="flex h-full flex-col gap-0.5 px-1 py-1">
        <div className="tabular truncate whitespace-nowrap text-[10px] font-semibold leading-tight text-[var(--foreground)]">
          {timeLabel}
        </div>
        <div className="line-clamp-2 text-[10px] leading-snug text-[var(--foreground)]">
          {session.seriesName}
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col gap-0.5 px-1.5 py-1">
      <div className="tabular truncate whitespace-nowrap text-[10px] font-semibold leading-tight text-[var(--foreground)]">
        {timeLabel}
      </div>
      <div className="line-clamp-2 text-[10px] leading-snug text-[var(--foreground)]">
        {session.seriesName}
      </div>
      <div className="mt-auto flex items-center justify-between gap-1">
        <span className="min-w-0 truncate text-[9px] text-[var(--muted-foreground)]">
          {session.venueName}
        </span>
        {session.clubName && (
          <span
            className="shrink-0 rounded px-1 text-[8px] font-semibold uppercase tracking-wide text-[var(--muted-foreground)]"
            title={session.clubName}
          >
            {session.clubName.slice(0, 3)}
          </span>
        )}
      </div>
    </div>
  );
}

export function AdminSessionOverflowChip({
  filters,
  dayISO,
  count,
  top,
  height,
  leftPct,
  widthPct,
  overflowMode = "link",
  hiddenSessions = [],
  onExpandDay,
  colorMode = "venue",
  clubOutlines = false,
}: {
  filters: AdminClassesFilters;
  dayISO: string;
  count: number;
  top: number;
  height: number;
  leftPct: number;
  widthPct: number;
  overflowMode?: "link" | "preview";
  hiddenSessions?: AdminCalendarSession[];
  onExpandDay?: () => void;
  colorMode?: "venue" | "schedule";
  clubOutlines?: boolean;
}) {
  const [hoverOpen, setHoverOpen] = useState(false);
  const hoverTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (hoverTimerRef.current) clearTimeout(hoverTimerRef.current);
    };
  }, []);

  const openPreview = () => {
    if (hoverTimerRef.current) clearTimeout(hoverTimerRef.current);
    hoverTimerRef.current = setTimeout(() => setHoverOpen(true), 150);
  };

  const closePreview = () => {
    if (hoverTimerRef.current) clearTimeout(hoverTimerRef.current);
    hoverTimerRef.current = setTimeout(() => setHoverOpen(false), 120);
  };

  const keepPreviewOpen = () => {
    if (hoverTimerRef.current) clearTimeout(hoverTimerRef.current);
    setHoverOpen(true);
  };

  const chipPositionStyle = {
    top,
    height,
    left: `${leftPct}%`,
    width: `${widthPct}%`,
  };

  const expandDay = () => {
    if (hoverTimerRef.current) clearTimeout(hoverTimerRef.current);
    setHoverOpen(false);
    onExpandDay?.();
  };

  if (overflowMode === "link") {
    return (
      <Link
        href={adminClassesHrefPatch(filters, { span: 1, fromISO: dayISO })}
        scroll={false}
        title={`${count} more session${count === 1 ? "" : "s"} — open day view`}
        className={cn(
          "absolute flex items-center justify-center overflow-hidden rounded-md border border-[var(--border-strong)]",
          "bg-[var(--surface-strong)] text-[10px] font-semibold text-[var(--foreground)]",
          "shadow-[var(--shadow-sm)] transition-colors hover:bg-[var(--surface)]",
        )}
        style={chipPositionStyle}
      >
        +{count} more
      </Link>
    );
  }

  return (
    <div className="absolute z-20" style={chipPositionStyle}>
      <div
        className="relative h-full w-full"
        onMouseEnter={openPreview}
        onMouseLeave={closePreview}
      >
        <button
          type="button"
          className={cn(
            "relative z-40 flex h-full w-full items-center justify-center rounded-md border border-[var(--border-strong)]",
            "bg-[var(--surface-strong)] text-[10px] font-semibold text-[var(--foreground)]",
            "shadow-[var(--shadow-sm)] transition-colors hover:bg-[var(--surface)]",
            "focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]",
          )}
          title={`${count} more session${count === 1 ? "" : "s"} — click to expand`}
          onClick={(e) => {
            e.stopPropagation();
            expandDay();
          }}
        >
          +{count} more
        </button>
        {hoverOpen && hiddenSessions.length > 0 && (
          <>
            <div
              className="absolute left-full top-0 z-30 h-full w-2"
              aria-hidden
              onMouseEnter={keepPreviewOpen}
              onMouseLeave={closePreview}
            />
            <button
              type="button"
              className={cn(
                "absolute left-[calc(100%+0.5rem)] top-0 z-30 w-56 rounded-md border border-[var(--border)] bg-[var(--card)] p-1.5 text-left shadow-[var(--shadow-md)]",
                "cursor-pointer transition-colors hover:bg-[var(--surface)]",
                "focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]",
              )}
              title={`${count} more session${count === 1 ? "" : "s"} — click to expand this day`}
              onMouseEnter={keepPreviewOpen}
              onMouseLeave={closePreview}
              onClick={(e) => {
                e.stopPropagation();
                expandDay();
              }}
            >
              <p className="mb-1 px-1 text-[9px] font-semibold uppercase tracking-wide text-[var(--muted-foreground)]">
                Hidden classes
              </p>
              <ul className="max-h-48 space-y-1 overflow-y-auto">
                {hiddenSessions.map((session) => (
                  <li
                    key={session.sessionId}
                    className={cn(
                      "rounded px-2 py-1.5 text-[10px]",
                      sessionBlockClasses(session, colorMode, clubOutlines),
                    )}
                  >
                    <div className="tabular font-semibold">
                      {format.time(session.classStartAt)}–
                      {format.time(session.classEndAt)}
                    </div>
                    <div className="line-clamp-2 leading-snug">{session.seriesName}</div>
                    {session.clubName && (
                      <div className="mt-0.5 text-[9px] opacity-75">
                        {session.clubName}
                      </div>
                    )}
                  </li>
                ))}
              </ul>
              <p className="mt-1 px-1 text-[9px] text-[var(--muted-foreground)]">
                Click to expand this day
              </p>
            </button>
          </>
        )}
      </div>
    </div>
  );
}

export function AdminSessionGridBlock({
  session,
  top,
  height,
  leftPct = 0,
  widthPct = 100,
  laneCount = 1,
  colorMode = "venue",
  showPickupSegments = false,
  preferFullLabels = false,
  clubOutlines = false,
}: {
  session: AdminCalendarSession;
  top: number;
  height: number;
  leftPct?: number;
  widthPct?: number;
  laneCount?: number;
  colorMode?: "venue" | "schedule";
  showPickupSegments?: boolean;
  preferFullLabels?: boolean;
  clubOutlines?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const terms = useTerms();
  const blockColors = sessionBlockClasses(session, colorMode, clubOutlines);
  const isPickup =
    session.deliveryMode === "pickup" && session.leaveAt && session.pickupAt;

  const segmentMode: "full" | "compact" | "timeOnly" = (() => {
    if (height < 32) return "timeOnly";
    if (preferFullLabels) {
      return widthPct < 14 ? "compact" : "full";
    }
    if (widthPct < 22 || height < 36 || laneCount > 3) return "timeOnly";
    return "full";
  })();

  const compact = segmentMode !== "full";

  return (
    <>
      <button
        type="button"
        title={blockTooltip(session, terms)}
        onClick={() => setOpen(true)}
        className={cn(
          "absolute overflow-hidden rounded-md border text-left text-[11px] shadow-[var(--shadow-sm)] transition-colors hover:brightness-105 focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]",
          blockColors,
        )}
        style={{
          top,
          height,
          left: `${leftPct}%`,
          width: `${widthPct}%`,
        }}
      >
        {showPickupSegments && isPickup && !compact ? (
          <PickupSegments session={session} height={height} terms={terms} />
        ) : (
          <SingleSegment session={session} mode={segmentMode} />
        )}
      </button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="sr-only">{session.seriesName}</DialogTitle>
          </DialogHeader>
          <ClassSummaryCard {...session.summary} />
          <div className="flex justify-end gap-2 pt-2">
            <Button asChild tone="triaz" size="sm">
              <Link href={`/admin/classes/${session.classSeriesId}`}>
                Open full edit
              </Link>
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

/** Compact row for mobile stacked layout. */
export function AdminSessionRow({
  session,
  colorMode = "venue",
  clubOutlines = false,
}: {
  session: AdminCalendarSession;
  colorMode?: "venue" | "schedule";
  clubOutlines?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const rowColors = sessionBlockClasses(session, colorMode, clubOutlines);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={cn(
          "flex w-full flex-col gap-0.5 rounded-md border px-3 py-2 text-left text-sm shadow-[var(--shadow-sm)] transition-colors hover:brightness-105",
          rowColors,
        )}
      >
        <div className="flex items-baseline justify-between gap-2">
          <span className="tabular font-semibold">
            {format.time(session.classStartAt)}–{format.time(session.classEndAt)}
          </span>
          {session.clubName && (
            <span className="shrink-0 text-[10px] font-medium uppercase text-[var(--muted-foreground)]">
              {session.clubName}
            </span>
          )}
        </div>
        <span className="font-medium leading-tight">{session.seriesName}</span>
        <span className="text-xs text-[var(--muted-foreground)]">
          {session.programName} · {session.venueName}
        </span>
      </button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="sr-only">{session.seriesName}</DialogTitle>
          </DialogHeader>
          <ClassSummaryCard {...session.summary} />
          <div className="flex justify-end gap-2 pt-2">
            <Button asChild tone="triaz" size="sm">
              <Link href={`/admin/classes/${session.classSeriesId}`}>
                Open full edit
              </Link>
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
