"use client";

import { useMemo, useState } from "react";
import {
  capColumns,
  laneGeometry,
  layoutTimedEvents,
  maxColumnsForSpan,
} from "@/lib/calendar/timed-event-layout";
import type { AdminClassesFilters } from "@/lib/admin/classes-filters";
import type { AdminCalendarSession } from "@/lib/admin/classes-queries";
import {
  CALENDAR_AXIS_END_HOUR,
  CALENDAR_AXIS_START_HOUR,
} from "@/lib/booking/time";
import {
  AdminSessionGridBlock,
  AdminSessionOverflowChip,
  AdminSessionRow,
} from "./session-block";

const AXIS_START_HOUR = CALENDAR_AXIS_START_HOUR;
const AXIS_END_HOUR = CALENDAR_AXIS_END_HOUR;
const PX_PER_MIN = 1;
const GRID_HEIGHT_PX = (AXIS_END_HOUR - AXIS_START_HOUR) * 60 * PX_PER_MIN;

function amsterdamDayKey(d: Date): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Amsterdam",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(d);
}

function amsterdamDayNumber(d: Date): string {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/Amsterdam",
    day: "2-digit",
  }).format(d);
}

function amsterdamWeekdayShort(d: Date): string {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/Amsterdam",
    weekday: "short",
  }).format(d);
}

function blockStartForSession(
  s: AdminCalendarSession,
  blockAnchor: "class" | "full",
): Date {
  if (blockAnchor === "class") return s.classStartAt;
  return s.leaveAt ?? s.classStartAt;
}

function localMinutesSinceAxisStart(d: Date): number {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/Amsterdam",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(d);
  const hh = Number(parts.find((p) => p.type === "hour")!.value);
  const mm = Number(parts.find((p) => p.type === "minute")!.value);
  return hh * 60 + mm - AXIS_START_HOUR * 60;
}

function blockGeometry(start: Date, end: Date) {
  const topMin = localMinutesSinceAxisStart(start);
  const endMin = localMinutesSinceAxisStart(end);
  const top = Math.max(0, topMin * PX_PER_MIN);
  const bottom = Math.min(GRID_HEIGHT_PX, endMin * PX_PER_MIN);
  const height = Math.max(24, bottom - top);
  return { top, height };
}

function hours(): number[] {
  return Array.from(
    { length: AXIS_END_HOUR - AXIS_START_HOUR + 1 },
    (_, i) => AXIS_START_HOUR + i,
  );
}

function buildGridTemplateColumns(
  days: Date[],
  todayKey: string,
  expandedColIdx: number | null,
  expandToday: boolean,
): string {
  const dayCols = days.map((d, i) => {
    const isToday = amsterdamDayKey(d) === todayKey;
    const isWide = expandedColIdx === i || (expandToday && isToday);
    return isWide ? "minmax(220px, 2fr)" : "minmax(100px, 1fr)";
  });
  return ["60px", ...dayCols].join(" ");
}

export function SessionsGrid({
  days,
  sessions,
  filters,
  colorMode = "venue",
  blockAnchor = "class",
  expandToday = false,
  overflowMode = "link",
  clubOutlines = false,
}: {
  days: Date[];
  sessions: AdminCalendarSession[];
  filters: AdminClassesFilters;
  colorMode?: "venue" | "schedule";
  blockAnchor?: "class" | "full";
  expandToday?: boolean;
  overflowMode?: "link" | "preview";
  clubOutlines?: boolean;
}) {
  const [expandedColIdx, setExpandedColIdx] = useState<number | null>(null);
  const now = new Date();
  const todayKey = amsterdamDayKey(now);
  const n = days.length;
  const todayInRange = days.some((d) => amsterdamDayKey(d) === todayKey);
  const nowMin = localMinutesSinceAxisStart(now);
  const showNowLine =
    todayInRange && nowMin >= 0 && nowMin <= GRID_HEIGHT_PX;
  const maxCols = maxColumnsForSpan(filters.span);

  const gridTemplateColumns = buildGridTemplateColumns(
    days,
    todayKey,
    expandedColIdx,
    expandToday,
  );

  const byDay: AdminCalendarSession[][] = useMemo(() => {
    const buckets: AdminCalendarSession[][] = Array.from({ length: n }, () => []);
    for (const s of sessions) {
      const blockStart = blockStartForSession(s, blockAnchor);
      const dayKey = amsterdamDayKey(blockStart);
      const idx = days.findIndex((d) => amsterdamDayKey(d) === dayKey);
      if (idx >= 0) buckets[idx]!.push(s);
    }
    for (const bucket of buckets) {
      bucket.sort(
        (a, b) =>
          blockStartForSession(a, blockAnchor).getTime() -
          blockStartForSession(b, blockAnchor).getTime(),
      );
    }
    return buckets;
  }, [sessions, days, n, blockAnchor]);

  const layoutsByDay = useMemo(() => {
    return byDay.map((daySessions, colIdx) => {
      const isTodayCol = amsterdamDayKey(days[colIdx]!) === todayKey;
      const isExpanded = expandedColIdx === colIdx;
      const maxColsForDay =
        (expandToday && isTodayCol) || isExpanded
          ? Number.POSITIVE_INFINITY
          : maxCols;

      const laidOut = layoutTimedEvents(
        daySessions.map((s) => {
          const blockStart = blockStartForSession(s, blockAnchor);
          return {
            session: s,
            id: s.sessionId,
            startMs: blockStart.getTime(),
            endMs: s.classEndAt.getTime(),
          };
        }),
      );

      const { visible, overflow } = capColumns(laidOut, maxColsForDay);

      const blocks = visible.map((item) => {
        const blockStart = blockStartForSession(item.session, blockAnchor);
        const { top, height } = blockGeometry(blockStart, item.session.classEndAt);
        const { leftPct, widthPct } = laneGeometry(
          item.displayColumn,
          item.laneCount,
        );
        return {
          kind: "session" as const,
          session: item.session,
          top,
          height,
          leftPct,
          widthPct,
          laneCount: item.laneCount,
        };
      });

      const chips = overflow.map((chip) => {
        const { top, height } = blockGeometry(
          new Date(chip.startMs),
          new Date(chip.endMs),
        );
        const { leftPct, widthPct } = laneGeometry(
          chip.displayColumn,
          chip.laneCount,
        );
        const hiddenSessions =
          chip.hiddenEvents?.map((e) => e.session) ?? [];
        return {
          kind: "overflow" as const,
          count: chip.count,
          top,
          height,
          leftPct,
          widthPct,
          hiddenSessions,
        };
      });

      return [...blocks, ...chips];
    });
  }, [
    byDay,
    days,
    blockAnchor,
    expandToday,
    expandedColIdx,
    maxCols,
    todayKey,
  ]);

  return (
    <div className="space-y-4">
      <div className="hidden overflow-x-auto rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--card)] lg:block">
        <div
          className="grid min-w-max border-b border-[var(--border)] bg-[var(--surface)]"
          style={{ gridTemplateColumns }}
        >
          <div />
          {days.map((d, i) => {
            const isToday = amsterdamDayKey(d) === todayKey;
            const isWide =
              expandedColIdx === i || (expandToday && isToday);
            return (
              <div
                key={i}
                className={cnDayHeader(i, n, isToday, isWide)}
              >
                <div
                  className={`text-[10px] font-semibold uppercase tracking-[0.16em] ${isToday ? "text-[var(--danger)]" : "text-[var(--muted-foreground)]"}`}
                >
                  {amsterdamWeekdayShort(d)}
                </div>
                <div
                  className={`tabular text-base font-medium ${isToday ? "text-[var(--danger-ink)]" : ""}`}
                >
                  {amsterdamDayNumber(d)}
                </div>
                {isToday && (
                  <div className="text-[9px] font-semibold uppercase tracking-wide text-[var(--danger)]">
                    today
                  </div>
                )}
              </div>
            );
          })}
        </div>

        <div
          className="relative grid min-w-max"
          style={{ gridTemplateColumns, height: GRID_HEIGHT_PX }}
        >
          <div className="relative border-r border-[var(--border)]">
            {hours().map((h) => (
              <div
                key={h}
                className="absolute left-0 right-0 -translate-y-1/2 pr-2 text-right text-[10px] font-medium uppercase tracking-[0.08em] text-[var(--muted-foreground)]"
                style={{ top: (h - AXIS_START_HOUR) * 60 * PX_PER_MIN }}
              >
                {String(h).padStart(2, "0")}:00
              </div>
            ))}
          </div>

          {layoutsByDay.map((dayLayouts, colIdx) => {
            const isTodayCol = amsterdamDayKey(days[colIdx]!) === todayKey;
            const dayISO = amsterdamDayKey(days[colIdx]!);
            const isWideCol =
              expandedColIdx === colIdx || (expandToday && isTodayCol);
            return (
              <div
                key={colIdx}
                className={`relative ${colIdx < n - 1 ? "border-r border-[var(--border)]" : ""} ${isTodayCol ? "bg-[var(--danger-soft)]/60" : ""}`}
              >
                {hours().map((h) => (
                  <div
                    key={h}
                    className="pointer-events-none absolute left-0 right-0 border-t border-[var(--border)] opacity-40"
                    style={{ top: (h - AXIS_START_HOUR) * 60 * PX_PER_MIN }}
                  />
                ))}
                {dayLayouts.map((item) =>
                  item.kind === "session" ? (
                    <AdminSessionGridBlock
                      key={item.session.sessionId}
                      session={item.session}
                      top={item.top}
                      height={item.height}
                      leftPct={item.leftPct}
                      widthPct={item.widthPct}
                      laneCount={item.laneCount}
                      colorMode={colorMode}
                      preferFullLabels={isWideCol}
                      clubOutlines={clubOutlines}
                    />
                  ) : (
                    <AdminSessionOverflowChip
                      key={`overflow-${colIdx}-${item.top}-${item.count}`}
                      filters={filters}
                      dayISO={dayISO}
                      count={item.count}
                      top={item.top}
                      height={item.height}
                      leftPct={item.leftPct}
                      widthPct={item.widthPct}
                      overflowMode={overflowMode}
                      hiddenSessions={item.hiddenSessions}
                      colorMode={colorMode}
                      clubOutlines={clubOutlines}
                      onExpandDay={() => setExpandedColIdx(colIdx)}
                    />
                  ),
                )}
                {isTodayCol && showNowLine && (
                  <div
                    className="pointer-events-none absolute left-0 right-0 z-10 h-0.5 bg-[var(--danger)]"
                    style={{ top: nowMin * PX_PER_MIN }}
                  />
                )}
              </div>
            );
          })}
        </div>
      </div>

      <div className="space-y-4 lg:hidden">
        {days.map((d, colIdx) => {
          const list = byDay[colIdx] ?? [];
          const label = `${amsterdamWeekdayShort(d)} ${amsterdamDayNumber(d)}`;
          const isToday = amsterdamDayKey(d) === todayKey;
          return (
            <div
              key={amsterdamDayKey(d)}
              className={`rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--card)] p-3 shadow-[var(--shadow-sm)] ${isToday ? "border-l-2 border-l-[var(--danger)]" : ""}`}
            >
              <div
                className={`mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.14em] ${isToday ? "text-[var(--danger)]" : "text-[var(--muted-foreground)]"}`}
              >
                <span>{label}</span>
                {isToday && (
                  <span className="text-[9px] font-semibold uppercase tracking-wide text-[var(--danger)]">
                    today
                  </span>
                )}
              </div>
              {list.length === 0 ? (
                <p className="text-sm text-[var(--muted-foreground)]/70">
                  Nothing scheduled.
                </p>
              ) : (
                <ul className="space-y-2">
                  {list.map((s) => (
                    <li key={s.sessionId}>
                      <AdminSessionRow
                        session={s}
                        colorMode={colorMode}
                        clubOutlines={clubOutlines}
                      />
                    </li>
                  ))}
                </ul>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function cnDayHeader(
  i: number,
  n: number,
  isToday: boolean,
  isWide: boolean,
): string {
  const parts = [
    "flex flex-col items-center justify-center px-2 py-2 text-center",
    i < n - 1 ? "border-r border-[var(--border)]" : "",
    isToday ? "border-b-2 border-b-[var(--danger)] bg-[var(--danger-soft)]" : "",
    isWide ? "min-w-[220px]" : "",
  ];
  return parts.filter(Boolean).join(" ");
}
