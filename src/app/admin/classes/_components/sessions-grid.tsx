import type { AdminCalendarSession } from "@/lib/admin/classes-queries";
import { AdminSessionGridBlock, AdminSessionRow } from "./session-block";

const AXIS_START_HOUR = 8;
const AXIS_END_HOUR = 22;
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

function eventBlockStart(s: AdminCalendarSession): Date {
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

function hours(): number[] {
  return Array.from(
    { length: AXIS_END_HOUR - AXIS_START_HOUR + 1 },
    (_, i) => AXIS_START_HOUR + i,
  );
}

export function SessionsGrid({
  days,
  sessions,
}: {
  days: Date[];
  sessions: AdminCalendarSession[];
}) {
  const now = new Date();
  const todayKey = amsterdamDayKey(now);
  const n = days.length;
  const todayInRange = days.some((d) => amsterdamDayKey(d) === todayKey);
  const nowMin = localMinutesSinceAxisStart(now);
  const showNowLine =
    todayInRange && nowMin >= 0 && nowMin <= GRID_HEIGHT_PX;

  const byDay: AdminCalendarSession[][] = Array.from({ length: n }, () => []);
  for (const s of sessions) {
    const blockStart = eventBlockStart(s);
    const dayKey = amsterdamDayKey(blockStart);
    const idx = days.findIndex((d) => amsterdamDayKey(d) === dayKey);
    if (idx >= 0) byDay[idx].push(s);
  }
  for (const bucket of byDay) {
    bucket.sort(
      (a, b) =>
        eventBlockStart(a).getTime() - eventBlockStart(b).getTime(),
    );
  }

  const gridCols =
    n === 1
      ? "grid-cols-[60px_minmax(0,1fr)]"
      : `grid-cols-[60px_repeat(${n},minmax(0,1fr))]`;

  return (
    <div className="space-y-4">
      <div
        className={`hidden overflow-hidden rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--card)] lg:block`}
      >
        <div className={`grid ${gridCols} border-b border-[var(--border)] bg-[var(--surface)]`}>
          <div />
          {days.map((d, i) => {
            const isToday = amsterdamDayKey(d) === todayKey;
            return (
              <div
                key={i}
                className={`flex flex-col items-center justify-center px-2 py-2 text-center ${i < n - 1 ? "border-r border-[var(--border)]" : ""} ${isToday ? "border-b-2 border-b-red-500 bg-red-50" : ""}`}
              >
                <div
                  className={`text-[10px] font-semibold uppercase tracking-[0.16em] ${isToday ? "text-red-600" : "text-[var(--muted-foreground)]"}`}
                >
                  {amsterdamWeekdayShort(d)}
                </div>
                <div
                  className={`tabular text-base font-medium ${isToday ? "text-red-700" : ""}`}
                >
                  {amsterdamDayNumber(d)}
                </div>
                {isToday && (
                  <div className="text-[9px] font-semibold uppercase tracking-wide text-red-600">
                    today
                  </div>
                )}
              </div>
            );
          })}
        </div>

        <div
          className={`relative grid ${gridCols}`}
          style={{ height: GRID_HEIGHT_PX }}
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

          {byDay.map((daySessions, colIdx) => {
            const isTodayCol = amsterdamDayKey(days[colIdx]) === todayKey;
            return (
              <div
                key={colIdx}
                className={`relative ${colIdx < n - 1 ? "border-r border-[var(--border)]" : ""} ${isTodayCol ? "bg-red-50/60" : ""}`}
              >
                {hours().map((h) => (
                  <div
                    key={h}
                    className="pointer-events-none absolute left-0 right-0 border-t border-[var(--border)] opacity-40"
                    style={{ top: (h - AXIS_START_HOUR) * 60 * PX_PER_MIN }}
                  />
                ))}
                {daySessions.map((s) => {
                  const blockStart = eventBlockStart(s);
                  const topMin = localMinutesSinceAxisStart(blockStart);
                  const endMin = localMinutesSinceAxisStart(s.classEndAt);
                  const top = Math.max(0, topMin * PX_PER_MIN);
                  const bottom = Math.min(GRID_HEIGHT_PX, endMin * PX_PER_MIN);
                  const height = Math.max(24, bottom - top);
                  return (
                    <AdminSessionGridBlock
                      key={s.sessionId}
                      session={s}
                      top={top}
                      height={height}
                    />
                  );
                })}
                {isTodayCol && showNowLine && (
                  <div
                    className="pointer-events-none absolute left-0 right-0 z-10 h-0.5 bg-red-500"
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
              className={`rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--card)] p-3 shadow-[var(--shadow-sm)] ${isToday ? "border-l-2 border-l-red-500" : ""}`}
            >
              <div
                className={`mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.14em] ${isToday ? "text-red-600" : "text-[var(--muted-foreground)]"}`}
              >
                <span>{label}</span>
                {isToday && (
                  <span className="text-[9px] font-semibold uppercase tracking-wide text-red-600">
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
                      <AdminSessionRow session={s} />
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
