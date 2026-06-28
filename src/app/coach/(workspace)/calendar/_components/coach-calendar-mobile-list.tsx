import Link from "next/link";

import { Badge } from "@/components/ui/badge";
import { GroupedSection, GroupedRow } from "@/components/ui/grouped-list";
import { format } from "@/lib/format";
import type { CoachCalendarEvent } from "@/lib/coach/calendar-queries";
import type { Terms } from "@/lib/tenant/terms";

const DAY_LABELS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];

function amsterdamDayKey(d: Date): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Amsterdam",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(d);
}

function eventStart(e: CoachCalendarEvent): Date {
  if (e.kind === "session") return e.leaveAt ?? e.classStartAt;
  return e.startsAt;
}

function eventEnd(e: CoachCalendarEvent): Date {
  if (e.kind === "session") return e.classEndAt;
  return e.endsAt;
}

/**
 * Mobile fallback for coach calendar — grouped rows per day, no horizontal scroll.
 */
export function CoachCalendarMobileList({
  days,
  events,
  terms,
}: {
  days: Date[];
  events: CoachCalendarEvent[];
  terms: Terms;
}) {
  const byDay = days.map((day, i) => {
    const key = amsterdamDayKey(day);
    const dayEvents = events
      .filter((e) => amsterdamDayKey(eventStart(e)) === key)
      .sort((a, b) => eventStart(a).getTime() - eventStart(b).getTime());
    return { day, label: DAY_LABELS[i]!, events: dayEvents };
  });

  return (
    <div className="space-y-6 lg:hidden">
      {byDay.map(({ day, label, events: dayEvents }) => {
        if (dayEvents.length === 0) return null;
        const isToday = amsterdamDayKey(day) === amsterdamDayKey(new Date());
        return (
          <GroupedSection
            key={amsterdamDayKey(day)}
            header={
              <>
                {isToday ? "Today" : label}
                {!isToday && (
                  <span className="ml-1 font-normal text-[var(--muted-foreground)]">
                    {format.date(day)}
                  </span>
                )}
              </>
            }
          >
            {dayEvents.map((e) => {
              if (e.kind === "session") {
                return (
                  <GroupedRow key={e.sessionId} className="p-0">
                    <Link
                      href={`/coach/classes/${e.classSeriesId}/sessions/${e.sessionId}`}
                      className="flex min-h-[3rem] w-full items-center gap-3 px-4 py-2.5 no-underline active:bg-[var(--muted)]/40"
                    >
                      <div className="w-[4.5rem] shrink-0 text-center">
                        <div className="tabular font-display text-lg font-medium leading-tight">
                          {format.time(eventStart(e))}
                        </div>
                        <div className="tabular text-[10px] text-[var(--muted-foreground)]">
                          {format.time(eventEnd(e))}
                        </div>
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-[15px] font-medium">
                          {e.programName}
                        </div>
                        <div className="truncate text-xs text-[var(--muted-foreground)]">
                          {e.venueName}
                          {e.deliveryMode === "pickup" && e.schoolName
                            ? ` · pickup ${e.schoolName}`
                            : ""}
                        </div>
                      </div>
                      <Badge tone="triaz" variant="soft">
                        {terms.class.singular}
                      </Badge>
                    </Link>
                  </GroupedRow>
                );
              }

              return (
                <GroupedRow key={e.bookingId} className="p-0">
                  <Link
                    href="/coach/bookings"
                    className="flex min-h-[3rem] w-full items-center gap-3 px-4 py-2.5 no-underline active:bg-[var(--muted)]/40"
                  >
                    <div className="w-[4.5rem] shrink-0 text-center">
                      <div className="tabular font-display text-lg font-medium leading-tight">
                        {format.time(e.startsAt)}
                      </div>
                      <div className="tabular text-[10px] text-[var(--muted-foreground)]">
                        {format.time(e.endsAt)}
                      </div>
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-[15px] font-medium">
                        {e.clubName} · {e.courtName}
                      </div>
                      <div className="truncate text-xs text-[var(--muted-foreground)]">
                        Court booking
                      </div>
                    </div>
                    <Badge tone="joint" variant="soft">
                      {terms.court.singular}
                    </Badge>
                  </Link>
                </GroupedRow>
              );
            })}
          </GroupedSection>
        );
      })}
    </div>
  );
}
