import Link from "next/link";
import { format } from "@/lib/format";
import { cn } from "@/lib/utils";
import type {
  CoachCalendarBooking,
  CoachCalendarEvent,
  CoachCalendarSession,
} from "@/lib/coach/calendar-queries";
import type { Terms } from "@/lib/tenant/terms";

/**
 * Week grid — 7 day columns × a vertical time axis, each session placed
 * absolutely at its block-start time. Pickup blocks render as three
 * stacked segments (leave → pickup → class) so coaches can see where
 * their on-the-clock hours actually start.
 *
 * The grid uses 1px per minute for trivial positioning math. Axis is
 * 08:00 → 22:00 (14h) by default; blocks that land outside get clamped.
 */
const DAY_LABELS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const AXIS_START_HOUR = 8;
const AXIS_END_HOUR = 22;
const PX_PER_MIN = 1;
const GRID_HEIGHT_PX = (AXIS_END_HOUR - AXIS_START_HOUR) * 60 * PX_PER_MIN;

export function WeekGrid({
  days,
  events,
  terms,
}: {
  days: Date[];
  events: CoachCalendarEvent[];
  terms: Terms;
}) {
  const todayKey = amsterdamDayKey(new Date());

  // Bucket events per day column.
  const byDay: CoachCalendarEvent[][] = Array.from({ length: 7 }, () => []);
  for (const e of events) {
    const blockStart = eventBlockStart(e);
    const dayKey = amsterdamDayKey(blockStart);
    const idx = days.findIndex((d) => amsterdamDayKey(d) === dayKey);
    if (idx >= 0) byDay[idx].push(e);
  }

  return (
    <div className="overflow-hidden rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--card)]">
      {/* Day header row */}
      <div className="grid grid-cols-[60px_repeat(7,minmax(0,1fr))] border-b border-[var(--border)] bg-[var(--surface)]">
        <div />
        {days.map((d, i) => {
          const isToday = amsterdamDayKey(d) === todayKey;
          return (
            <div
              key={i}
              className={cn(
                "flex flex-col items-center justify-center px-2 py-2 text-center",
                i < 6 && "border-r border-[var(--border)]",
              )}
            >
              <div
                className={cn(
                  "text-[10px] font-semibold uppercase tracking-[0.16em]",
                  isToday
                    ? "text-[var(--accent)]"
                    : "text-[var(--muted-foreground)]",
                )}
              >
                {DAY_LABELS[i]}
              </div>
              <div
                className={cn(
                  "tabular text-base font-medium",
                  isToday && "text-[var(--accent)]",
                )}
              >
                {amsterdamDayNumber(d)}
              </div>
            </div>
          );
        })}
      </div>

      {/* Grid body */}
      <div
        className="relative grid grid-cols-[60px_repeat(7,minmax(0,1fr))]"
        style={{ height: GRID_HEIGHT_PX }}
      >
        {/* Hour axis */}
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

        {/* Day columns */}
        {byDay.map((daySessions, colIdx) => (
          <div
            key={colIdx}
            className={cn(
              "relative",
              colIdx < 6 && "border-r border-[var(--border)]",
            )}
          >
            {/* Horizontal hour lines */}
            {hours().map((h) => (
              <div
                key={h}
                className="pointer-events-none absolute left-0 right-0 border-t border-[var(--border)] opacity-40"
                style={{ top: (h - AXIS_START_HOUR) * 60 * PX_PER_MIN }}
              />
            ))}
            {/* Event blocks */}
            {daySessions.map((e) =>
              e.kind === "session" ? (
                <SessionBlock key={`s-${e.sessionId}`} session={e} terms={terms} />
              ) : (
                <BookingBlock key={`b-${e.bookingId}`} booking={e} terms={terms} />
              ),
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

function SessionBlock({
  session,
  terms,
}: {
  session: CoachCalendarSession;
  terms: Terms;
}) {
  const blockStart = session.leaveAt ?? session.classStartAt;
  const topMin = localMinutesSinceAxisStart(blockStart);
  const endMin = localMinutesSinceAxisStart(session.classEndAt);
  const top = Math.max(0, topMin * PX_PER_MIN);
  const bottom = Math.min(GRID_HEIGHT_PX, endMin * PX_PER_MIN);
  const height = Math.max(24, bottom - top);

  const isPickup = session.deliveryMode === "pickup";
  const isAssistant = session.role === "assistant";

  const toneBorder = isPickup
    ? "border-[var(--joint-ink)]/40 bg-[var(--joint-soft)]"
    : session.deliveryMode === "onsite"
      ? "border-[var(--warning-soft)] bg-[var(--warning-soft)]"
      : "border-[var(--triaz-ink)]/30 bg-[var(--triaz-soft)]";

  return (
    <Link
      href={`/coach/classes/${session.classSeriesId}/sessions/${session.sessionId}`}
      className={cn(
        "absolute inset-x-1 block overflow-hidden rounded-md border text-[11px] shadow-[var(--shadow-sm)] transition-colors hover:brightness-105 focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]",
        toneBorder,
        isAssistant && "border-dashed",
      )}
      style={{ top, height }}
      title={blockTooltip(session, terms)}
    >
      {isPickup && session.leaveAt && session.pickupAt ? (
        <PickupSegments session={session} height={height} terms={terms} />
      ) : (
        <SingleSegment session={session} />
      )}
    </Link>
  );
}

function PickupSegments({
  session,
  height,
  terms,
}: {
  session: CoachCalendarSession;
  height: number;
  terms: Terms;
}) {
  // Sub-segment heights proportional to duration.
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

function BookingBlock({
  booking,
  terms,
}: {
  booking: CoachCalendarBooking;
  terms: Terms;
}) {
  const topMin = localMinutesSinceAxisStart(booking.startsAt);
  const endMin = localMinutesSinceAxisStart(booking.endsAt);
  const top = Math.max(0, topMin * PX_PER_MIN);
  const bottom = Math.min(GRID_HEIGHT_PX, endMin * PX_PER_MIN);
  const height = Math.max(24, bottom - top);

  return (
    <div
      className="absolute inset-x-1 overflow-hidden rounded-md border border-[var(--border)] bg-[var(--surface)]/60 text-[11px] shadow-[var(--shadow-sm)]"
      style={{ top, height }}
      title={`${terms.court.singular} · ${booking.courtName} @ ${booking.clubName}\n${format.time(booking.startsAt)}–${format.time(booking.endsAt)}`}
    >
      <div className="flex h-full flex-col gap-0.5 px-1.5 py-1">
        <div className="tabular truncate whitespace-nowrap font-semibold text-[var(--foreground)]">
          {format.time(booking.startsAt)}–{format.time(booking.endsAt)}
        </div>
        <div className="truncate text-[10px] text-[var(--muted-foreground)]">
          {booking.courtName}
        </div>
        <div className="truncate text-[10px] text-[var(--muted-foreground)]">
          {booking.clubName}
        </div>
      </div>
    </div>
  );
}

function SingleSegment({ session }: { session: CoachCalendarSession }) {
  return (
    <div className="flex h-full flex-col gap-0.5 px-1.5 py-1">
      <div className="tabular truncate whitespace-nowrap font-semibold text-[var(--foreground)]">
        {format.time(session.classStartAt)}–{format.time(session.classEndAt)}
      </div>
      <div className="truncate text-[10px] text-[var(--muted-foreground)]">
        {session.seriesName}
      </div>
      <div className="mt-auto truncate text-[10px] text-[var(--muted-foreground)]">
        {session.venueName}
      </div>
    </div>
  );
}

function blockTooltip(s: CoachCalendarSession, t: Terms): string {
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
  lines.push(
    `Role: ${s.role === "lead" ? `Lead ${t.coach.singular.toLowerCase()}` : `Assistant ${t.coach.singular.toLowerCase()}`}`,
  );
  return lines.join("\n");
}

function eventBlockStart(e: CoachCalendarEvent): Date {
  if (e.kind === "session") return e.leaveAt ?? e.classStartAt;
  return e.startsAt;
}

function hours(): number[] {
  return Array.from(
    { length: AXIS_END_HOUR - AXIS_START_HOUR + 1 },
    (_, i) => AXIS_START_HOUR + i,
  );
}

/** HH*60 + MM of `d` in Europe/Amsterdam, minus AXIS_START_HOUR*60. */
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

/** `YYYY-MM-DD` local Amsterdam day key for bucketing. */
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
