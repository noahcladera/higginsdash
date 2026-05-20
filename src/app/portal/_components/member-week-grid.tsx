import { format } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { MemberCalendarEvent } from "@/lib/portal/calendar-queries";

/**
 * Member-portal week grid — one column per day, 08:00→22:00 time axis,
 * 1px per minute for simple positioning math.
 *
 * Sessions are painted from a 4-tone palette keyed by `colorIndex` so
 * each kid in a household gets a distinct look. Court bookings are a
 * neutral single strip — they're household resources, not tied to a
 * particular child.
 *
 * Pickup sessions render as two stacked segments
 * (school pickup → class time) — parents only need to know when their
 * kid leaves school and when the class itself runs; the coach's
 * "leave Triaz" anchor is intentionally omitted (that's coach-only
 * logistics). At-club / onsite classes render as a single strip with
 * just the class hours. Booking blocks are always single strips.
 */
const DAY_LABELS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const AXIS_START_HOUR = 8;
const AXIS_END_HOUR = 22;
const PX_PER_MIN = 1;
const GRID_HEIGHT_PX = (AXIS_END_HOUR - AXIS_START_HOUR) * 60 * PX_PER_MIN;

type PaletteEntry = { bg: string; ink: string; border: string };

const PALETTE: PaletteEntry[] = [
  {
    bg: "var(--triaz-soft)",
    ink: "var(--triaz-ink)",
    border: "color-mix(in oklab, var(--triaz-ink) 40%, transparent)",
  },
  {
    bg: "var(--joint-soft)",
    ink: "var(--joint-ink)",
    border: "color-mix(in oklab, var(--joint-ink) 40%, transparent)",
  },
  {
    bg: "var(--warning-soft)",
    ink: "oklch(0.42 0.13 75)",
    border: "color-mix(in oklab, oklch(0.42 0.13 75) 40%, transparent)",
  },
  {
    bg: "var(--randwijck-soft)",
    ink: "var(--randwijck-ink)",
    border: "color-mix(in oklab, var(--randwijck-ink) 40%, transparent)",
  },
];

function paletteFor(colorIndex: number): PaletteEntry {
  return PALETTE[Math.max(0, Math.min(PALETTE.length - 1, colorIndex))];
}

export interface MemberCalendarLegendEntry {
  personId: string;
  firstName: string;
  colorIndex: number;
}

export function MemberWeekGrid({
  days,
  events,
  legend,
}: {
  days: Date[];
  events: MemberCalendarEvent[];
  /** Per-student color chips shown above the grid when 2+ people are tracked. */
  legend: MemberCalendarLegendEntry[];
}) {
  const todayKey = amsterdamDayKey(new Date());

  const byDay: MemberCalendarEvent[][] = Array.from({ length: 7 }, () => []);
  for (const e of events) {
    const dayKey = amsterdamDayKey(e.blockStart);
    const idx = days.findIndex((d) => amsterdamDayKey(d) === dayKey);
    if (idx >= 0) byDay[idx].push(e);
  }

  return (
    <div className="space-y-3">
      {legend.length >= 2 && (
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <span className="text-[var(--muted-foreground)]">Who:</span>
          {legend.map((l) => {
            const p = paletteFor(l.colorIndex);
            return (
              <span
                key={l.personId}
                className="inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 font-medium"
                style={{
                  background: p.bg,
                  color: p.ink,
                  borderColor: p.border,
                }}
              >
                <span
                  aria-hidden
                  className="h-1.5 w-1.5 rounded-full"
                  style={{ background: p.ink }}
                />
                {l.firstName}
              </span>
            );
          })}
          <span className="inline-flex items-center gap-1.5 rounded-full border border-[var(--border)] bg-[var(--surface)] px-2 py-0.5 font-medium text-[var(--muted-foreground)]">
            <span
              aria-hidden
              className="h-1.5 w-1.5 rounded-full bg-[var(--muted-foreground)]"
            />
            Court booking
          </span>
        </div>
      )}

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
          {byDay.map((dayEvents, colIdx) => (
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
                  className="pointer-events-none absolute left-0 right-0 border-t border-[var(--border)] opacity-40"
                  style={{ top: (h - AXIS_START_HOUR) * 60 * PX_PER_MIN }}
                />
              ))}
              {dayEvents.map((e) =>
                e.kind === "session" ? (
                  <SessionBlock key={`s-${e.id}`} event={e} />
                ) : (
                  <BookingBlock key={`b-${e.id}`} event={e} />
                ),
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

type SessionEvent = Extract<MemberCalendarEvent, { kind: "session" }>;
type BookingEvent = Extract<MemberCalendarEvent, { kind: "booking" }>;

function SessionBlock({ event }: { event: SessionEvent }) {
  const topMin = localMinutesSinceAxisStart(event.blockStart);
  const endMin = localMinutesSinceAxisStart(event.classEndAt);
  const top = Math.max(0, topMin * PX_PER_MIN);
  const bottom = Math.min(GRID_HEIGHT_PX, endMin * PX_PER_MIN);
  const height = Math.max(24, bottom - top);

  const p = paletteFor(event.colorIndex);
  const isPickup = event.deliveryMode === "pickup";

  return (
    <div
      className="absolute inset-x-1 overflow-hidden rounded-md border text-[11px] shadow-[var(--shadow-sm)]"
      style={{
        top,
        height,
        background: p.bg,
        color: p.ink,
        borderColor: p.border,
      }}
      title={sessionTooltip(event)}
    >
      {isPickup && event.pickupAt ? (
        <PickupSegments event={event} height={height} palette={p} />
      ) : (
        <SessionSingleSegment event={event} />
      )}
    </div>
  );
}

function PickupSegments({
  event,
  height,
  palette,
}: {
  event: SessionEvent;
  height: number;
  palette: PaletteEntry;
}) {
  const pickupAt = event.pickupAt!;
  const total = event.classEndAt.getTime() - pickupAt.getTime();
  const seg1 = total > 0
    ? ((event.classStartAt.getTime() - pickupAt.getTime()) / total) * height
    : 0;
  const seg2 = height - seg1;

  const divider = { borderBottomColor: palette.border };

  return (
    <div className="flex h-full flex-col">
      <div
        className="flex items-start gap-1 overflow-hidden border-b px-1.5 py-1"
        style={{ height: seg1, ...divider }}
      >
        <span className="tabular shrink-0 whitespace-nowrap font-semibold">
          {format.time(pickupAt)}
        </span>
        <span className="truncate opacity-80">
          pickup {event.schoolName ?? ""}
        </span>
      </div>
      <div
        className="flex flex-col items-start gap-0 px-1.5 py-1"
        style={{ height: seg2 }}
      >
        <div className="tabular truncate whitespace-nowrap font-semibold">
          {format.time(event.classStartAt)}–{format.time(event.classEndAt)}
        </div>
        <div className="truncate text-[10px] opacity-80">
          {event.ownerFirstName} · {event.seriesName}
        </div>
      </div>
    </div>
  );
}

function SessionSingleSegment({ event }: { event: SessionEvent }) {
  return (
    <div className="flex h-full flex-col gap-0.5 px-1.5 py-1">
      <div className="tabular truncate whitespace-nowrap font-semibold">
        {format.time(event.classStartAt)}–{format.time(event.classEndAt)}
      </div>
      <div className="truncate text-[10px] font-medium">
        {event.ownerFirstName} · {event.seriesName}
      </div>
      <div className="mt-auto truncate text-[10px] opacity-80">
        {event.venueName}
      </div>
    </div>
  );
}

function BookingBlock({ event }: { event: BookingEvent }) {
  const topMin = localMinutesSinceAxisStart(event.startsAt);
  const endMin = localMinutesSinceAxisStart(event.endsAt);
  const top = Math.max(0, topMin * PX_PER_MIN);
  const bottom = Math.min(GRID_HEIGHT_PX, endMin * PX_PER_MIN);
  const height = Math.max(24, bottom - top);

  return (
    <div
      className="absolute inset-x-1 overflow-hidden rounded-md border border-[var(--border)] bg-[var(--surface)] text-[11px] shadow-[var(--shadow-sm)]"
      style={{ top, height }}
      title={`Court booking · ${event.courtName} @ ${event.clubName}\n${format.time(event.startsAt)}–${format.time(event.endsAt)}\nBooked by ${event.ownerFirstName}`}
    >
      <div className="flex h-full flex-col gap-0.5 px-1.5 py-1">
        <div className="text-[9px] font-semibold uppercase tracking-[0.12em] text-[var(--muted-foreground)]">
          Booking
        </div>
        <div className="tabular truncate whitespace-nowrap font-semibold text-[var(--foreground)]">
          {format.time(event.startsAt)}–{format.time(event.endsAt)}
        </div>
        <div className="truncate text-[10px] text-[var(--foreground)]">
          {event.courtName}
        </div>
        <div className="mt-auto truncate text-[10px] text-[var(--muted-foreground)]">
          {event.clubName}
        </div>
      </div>
    </div>
  );
}

function sessionTooltip(e: SessionEvent): string {
  const lines: string[] = [];
  lines.push(`${e.ownerFirstName} · ${e.programName} — ${e.seriesName}`);
  if (e.deliveryMode === "pickup" && e.pickupAt) {
    lines.push(`Pickup ${e.schoolName ?? "school"}: ${format.time(e.pickupAt)}`);
  }
  lines.push(`Class: ${format.time(e.classStartAt)}–${format.time(e.classEndAt)}`);
  lines.push(`Venue: ${e.venueName}`);
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
