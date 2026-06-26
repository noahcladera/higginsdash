import Link from "next/link";
import {
  CALENDAR_AXIS_END_HOUR,
  CALENDAR_AXIS_START_HOUR,
} from "@/lib/booking/time";
import { format } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { CoachCalendarSession } from "@/lib/coach/calendar-queries";
import { coachSessionBlockClasses } from "@/lib/admin/schedule-slot-colors";

/**
 * Compact 7-day glance grid for the coach home page. Stripped-down
 * cousin of the full {@link WeekGrid} used on /coach/calendar:
 *
 *   - Half the vertical density (0.5 px / minute, axis 09:00 → 22:00).
 *   - Sessions only — personal court bookings live on the calendar page.
 *   - Each block is a single Link to the per-session lesson page.
 *   - Pickup classes still render the leave → pickup → class breakdown
 *     so on-the-clock hours are obvious at a glance — coaches get paid
 *     from the leave-Triaz time and need to see that here too. Text
 *     density is dialled down to fit the half-height grid.
 *
 * Receives sessions already scoped to the current week's Mon→Sun by
 * the parent server component.
 */
const DAY_LABELS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const AXIS_START_HOUR = CALENDAR_AXIS_START_HOUR;
const AXIS_END_HOUR = CALENDAR_AXIS_END_HOUR;
const PX_PER_MIN = 0.5;
const GRID_HEIGHT_PX = (AXIS_END_HOUR - AXIS_START_HOUR) * 60 * PX_PER_MIN;

export function MiniWeekGrid({
  days,
  sessions,
}: {
  days: Date[];
  sessions: CoachCalendarSession[];
}) {
  const todayKey = amsterdamDayKey(new Date());

  const byDay: CoachCalendarSession[][] = Array.from({ length: 7 }, () => []);
  for (const s of sessions) {
    const blockStart = s.leaveAt ?? s.classStartAt;
    const dayKey = amsterdamDayKey(blockStart);
    const idx = days.findIndex((d) => amsterdamDayKey(d) === dayKey);
    if (idx >= 0) byDay[idx].push(s);
  }

  return (
    <div className="overflow-hidden rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--card)]">
      <div className="grid grid-cols-[44px_repeat(7,minmax(0,1fr))] border-b border-[var(--border)] bg-[var(--surface)]">
        <div />
        {days.map((d, i) => {
          const isToday = amsterdamDayKey(d) === todayKey;
          return (
            <div
              key={i}
              className={cn(
                "flex flex-col items-center justify-center px-1 py-1.5 text-center",
                i < 6 && "border-r border-[var(--border)]",
              )}
            >
              <div
                className={cn(
                  "text-[9px] font-semibold uppercase tracking-[0.14em]",
                  isToday
                    ? "text-[var(--accent)]"
                    : "text-[var(--muted-foreground)]",
                )}
              >
                {DAY_LABELS[i]}
              </div>
              <div
                className={cn(
                  "tabular text-sm font-medium",
                  isToday && "text-[var(--accent)]",
                )}
              >
                {amsterdamDayNumber(d)}
              </div>
            </div>
          );
        })}
      </div>

      <div
        className="relative grid grid-cols-[44px_repeat(7,minmax(0,1fr))]"
        style={{ height: GRID_HEIGHT_PX }}
      >
        <div className="relative border-r border-[var(--border)]">
          {hours().map((h) => (
            <div
              key={h}
              className="absolute left-0 right-0 -translate-y-1/2 pr-1.5 text-right text-[9px] font-medium uppercase tracking-[0.06em] text-[var(--muted-foreground)]"
              style={{ top: (h - AXIS_START_HOUR) * 60 * PX_PER_MIN }}
            >
              {String(h).padStart(2, "0")}
            </div>
          ))}
        </div>

        {byDay.map((daySessions, colIdx) => (
          <div
            key={colIdx}
            className={cn(
              "relative",
              colIdx < 6 && "border-r border-[var(--border)]",
            )}
          >
            {hours().map((h) => (
              <div
                key={h}
                className="pointer-events-none absolute left-0 right-0 border-t border-[var(--border)] opacity-30"
                style={{ top: (h - AXIS_START_HOUR) * 60 * PX_PER_MIN }}
              />
            ))}
            {daySessions.map((s) => (
              <MiniSessionBlock key={s.sessionId} session={s} />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

function MiniSessionBlock({ session }: { session: CoachCalendarSession }) {
  const blockStart = session.leaveAt ?? session.classStartAt;
  const topMin = localMinutesSinceAxisStart(blockStart);
  const endMin = localMinutesSinceAxisStart(session.classEndAt);
  const top = Math.max(0, topMin * PX_PER_MIN);
  const bottom = Math.min(GRID_HEIGHT_PX, endMin * PX_PER_MIN);
  const height = Math.max(18, bottom - top);

  const isPickup = session.deliveryMode === "pickup";
  const isAssistant = session.role === "assistant";
  const hasPickupSegments =
    isPickup && session.leaveAt != null && session.pickupAt != null;

  const toneBorder = coachSessionBlockClasses({
    deliveryMode: session.deliveryMode,
    clubSlug: session.clubSlug,
  });

  return (
    <Link
      href={`/coach/classes/${session.classSeriesId}/sessions/${session.sessionId}`}
      className={cn(
        "absolute inset-x-0.5 block overflow-hidden rounded-sm border text-[10px] leading-tight shadow-[var(--shadow-sm)] transition-colors hover:brightness-105 focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]",
        toneBorder,
        isAssistant && "border-dashed",
      )}
      style={{ top, height }}
      title={miniBlockTooltip(session)}
    >
      {hasPickupSegments ? (
        <MiniPickupSegments session={session} height={height} />
      ) : (
        <div className="flex h-full flex-col gap-0 px-1 py-0.5">
          <div className="tabular truncate whitespace-nowrap font-semibold text-[var(--foreground)]">
            {format.time(session.classStartAt)}
          </div>
          <div className="truncate text-[9px] text-[var(--muted-foreground)]">
            {session.seriesName}
          </div>
        </div>
      )}
    </Link>
  );
}

function MiniPickupSegments({
  session,
  height,
}: {
  session: CoachCalendarSession;
  height: number;
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
        className="flex items-start gap-1 overflow-hidden border-b border-[var(--joint-ink)]/20 px-1 py-px text-[var(--joint-ink)]"
        style={{ height: seg1 }}
      >
        <span className="tabular shrink-0 whitespace-nowrap font-semibold">
          {format.time(leaveAt)}
        </span>
        <span className="truncate text-[9px] opacity-80">leave</span>
      </div>
      <div
        className="flex items-start gap-1 overflow-hidden border-b border-[var(--joint-ink)]/20 bg-[var(--joint-soft)]/60 px-1 py-px text-[var(--joint-ink)]"
        style={{ height: seg2 }}
      >
        <span className="tabular shrink-0 whitespace-nowrap font-semibold">
          {format.time(pickupAt)}
        </span>
        <span className="truncate text-[9px] opacity-80">
          pickup{session.schoolName ? ` ${session.schoolName}` : ""}
        </span>
      </div>
      <div
        className="flex flex-col items-start gap-0 px-1 py-px"
        style={{ height: seg3 }}
      >
        <div className="tabular truncate whitespace-nowrap font-semibold text-[var(--foreground)]">
          {format.time(session.classStartAt)}
        </div>
        <div className="truncate text-[9px] text-[var(--muted-foreground)]">
          {session.seriesName}
        </div>
      </div>
    </div>
  );
}

function miniBlockTooltip(s: CoachCalendarSession): string {
  const lines: string[] = [];
  lines.push(`${s.programName} · ${s.seriesName}`);
  if (s.deliveryMode === "pickup" && s.leaveAt && s.pickupAt) {
    lines.push(`Leave Triaz: ${format.time(s.leaveAt)}`);
    lines.push(`Pickup ${s.schoolName ?? "school"}: ${format.time(s.pickupAt)}`);
  }
  lines.push(
    `Class: ${format.time(s.classStartAt)}–${format.time(s.classEndAt)}`,
  );
  lines.push(`Venue: ${s.venueName}`);
  return lines.join("\n");
}

function hours(): number[] {
  return Array.from(
    { length: AXIS_END_HOUR - AXIS_START_HOUR + 1 },
    (_, i) => AXIS_START_HOUR + i,
  );
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
