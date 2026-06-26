/**
 * MonthCalendar — admin-facing month grid of a single coach's private
 * lessons. Held lessons render as small green chips, cancelled ones as
 * red chips with a strike-through time. Purely visual: the source of
 * truth for invoicing remains the table below.
 *
 * Layout: 7 columns Mon–Sun, leading blanks for the first week so the
 * 1st of the month lands under the right weekday. Days outside the
 * month aren't rendered at all (clean leading/trailing voids).
 */

import { Section } from "@/components/ui/section";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { CLUB_TZ, formatLocalDate } from "@/lib/booking/time";
import type {
  CoachMonthCancelledLesson,
  CoachMonthHeldLesson,
  CoachMonthLessonGrid,
} from "@/lib/admin/private-lessons-queries";

const DAY_LABELS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

export function MonthCalendar({
  periodIsoMonth,
  grid,
}: {
  /** YYYY-MM. */
  periodIsoMonth: string;
  grid: CoachMonthLessonGrid;
}) {
  const [yearStr, monthStr] = periodIsoMonth.split("-");
  const year = parseInt(yearStr, 10);
  const month = parseInt(monthStr, 10);
  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();

  // Mon=1..Sun=7 for the 1st of the month, in Amsterdam local.
  const firstDow = amsterdamWeekdayMon1(year, month, 1);
  const leadingBlanks = firstDow - 1;

  const todayKey = formatLocalDate(new Date());

  const { totals } = grid;
  const heldHours = Math.floor(totals.heldMinutes / 60);
  const heldMins = totals.heldMinutes % 60;
  const totalLessons = totals.heldCount + totals.cancelledCount;
  const cancellationRate =
    totalLessons === 0 ? 0 : (totals.cancelledCount / totalLessons) * 100;

  return (
    <Section
      title="Lessons this month"
      description={
        totalLessons === 0
          ? "No coaching bookings this month — no held lessons or cancellations to show."
          : `${totals.heldCount} held · ${totals.cancelledCount} cancelled · ${heldHours}h ${heldMins}m of held court time · ${cancellationRate.toFixed(0)}% cancellation rate`
      }
      surface="card"
    >
      <div className="overflow-hidden rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--card)]">
        <div className="grid grid-cols-7 border-b border-[var(--border)] bg-[var(--surface)]">
          {DAY_LABELS.map((label) => (
            <div
              key={label}
              className="px-2 py-1.5 text-xs font-medium uppercase tracking-wide text-[var(--muted-foreground)]"
            >
              {label}
            </div>
          ))}
        </div>
        <div className="grid grid-cols-7">
          {Array.from({ length: leadingBlanks }).map((_, i) => (
            <div
              key={`blank-${i}`}
              className="min-h-[110px] border-b border-r border-[var(--border)] bg-[var(--muted)]/30"
            />
          ))}
          {Array.from({ length: daysInMonth }).map((_, i) => {
            const day = i + 1;
            const dateKey = `${yearStr}-${monthStr}-${String(day).padStart(2, "0")}`;
            const dayData = grid.byDay.get(dateKey);
            const isToday = dateKey === todayKey;
            const dow = amsterdamWeekdayMon1(year, month, day);
            const isWeekend = dow === 6 || dow === 7;
            const isLastCol = (leadingBlanks + i) % 7 === 6;

            return (
              <div
                key={dateKey}
                className={cn(
                  "min-h-[110px] border-b border-[var(--border)] p-1.5 flex flex-col gap-1",
                  !isLastCol && "border-r",
                  isWeekend && "bg-[var(--muted)]/30",
                  isToday && "ring-2 ring-inset ring-[var(--primary)]",
                )}
              >
                <div className="flex items-center justify-between">
                  <span
                    className={cn(
                      "text-xs font-medium tabular-nums",
                      isToday && "text-[var(--primary)]",
                    )}
                  >
                    {day}
                  </span>
                  {dayData && dayData.cancelled.length > 0 && (
                    <span
                      className="text-[10px] font-medium text-[var(--danger-ink)]"
                      title={`${dayData.cancelled.length} cancelled`}
                    >
                      ×{dayData.cancelled.length}
                    </span>
                  )}
                </div>
                <div className="flex flex-col gap-1">
                  {dayData?.held.map((h) => (
                    <HeldChip key={h.refId} lesson={h} />
                  ))}
                  {dayData?.cancelled.map((c) => (
                    <CancelledChip key={c.refId} lesson={c} />
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </Section>
  );
}

function HeldChip({ lesson }: { lesson: CoachMonthHeldLesson }) {
  const time = formatHHMM(lesson.startsAt);
  return (
    <div
      className="rounded px-1.5 py-0.5 text-[10px] leading-tight bg-[var(--success-soft)] text-[var(--success-ink)]"
      title={`${time} · ${lesson.minutes} min · ${lesson.courtName} (${lesson.clubName})${lesson.kind === "recurring_occurrence" ? " · recurring" : ""}`}
    >
      <span className="font-medium tabular-nums">{time}</span>
      <span className="ml-1">· {lesson.minutes}m</span>
      <div className="truncate text-[9px] opacity-80">{lesson.courtName}</div>
    </div>
  );
}

function CancelledChip({ lesson }: { lesson: CoachMonthCancelledLesson }) {
  const time = formatHHMM(lesson.startsAt);
  const tooltipParts: string[] = [
    `${time} · ${lesson.minutes} min · ${lesson.courtName} (${lesson.clubName})`,
    lesson.status === "cancellation_requested"
      ? "Pending cancellation approval"
      : "Cancelled",
  ];
  if (lesson.cancelledAt) {
    tooltipParts.push(`Cancelled: ${formatDateTime(lesson.cancelledAt)}`);
  }
  if (lesson.cancellationReason) {
    tooltipParts.push(`Reason: ${lesson.cancellationReason}`);
  }
  return (
    <div
      className="rounded px-1.5 py-0.5 text-[10px] leading-tight bg-[var(--danger-soft)] text-[var(--danger-ink)]"
      title={tooltipParts.join("\n")}
    >
      <span className="font-medium tabular-nums line-through">{time}</span>
      <span className="ml-1">· {lesson.minutes}m</span>
      <div className="truncate text-[9px] opacity-80 flex items-center gap-1">
        <span>{lesson.courtName}</span>
        {lesson.status === "cancellation_requested" && (
          <Badge variant="outline" className="h-3 px-1 text-[8px]">
            pending
          </Badge>
        )}
      </div>
    </div>
  );
}

function formatHHMM(d: Date): string {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: CLUB_TZ,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(d);
}

function formatDateTime(d: Date): string {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: CLUB_TZ,
    dateStyle: "short",
    timeStyle: "short",
  }).format(d);
}

/** 1=Mon..7=Sun for the given Amsterdam local date. */
function amsterdamWeekdayMon1(year: number, month: number, day: number): number {
  // Use a fixed UTC midday so we land in the same Amsterdam date regardless of DST.
  const probe = new Date(Date.UTC(year, month - 1, day, 12));
  const wkdayName = new Intl.DateTimeFormat("en-US", {
    timeZone: CLUB_TZ,
    weekday: "short",
  }).format(probe);
  const map: Record<string, number> = {
    Mon: 1,
    Tue: 2,
    Wed: 3,
    Thu: 4,
    Fri: 5,
    Sat: 6,
    Sun: 7,
  };
  return map[wkdayName] ?? 1;
}
