"use client";

import { CourtCalendarGrid } from "@/components/booking/court-calendar-grid";
import type { CoachOption } from "@/components/booking/admin-create-booking-dialog";
import type { AdminScheduleWeek } from "@/lib/admin/schedule-queries";
import { formatLocalDate } from "@/lib/booking/time";
import { cn } from "@/lib/utils";

const CLUB_BAND: Record<string, string> = {
  triaz: "bg-[var(--triaz-soft)] border-[var(--triaz-ink)]/25 text-[var(--triaz-ink)]",
  randwijck:
    "bg-[var(--randwijck-soft)] border-[var(--randwijck-ink)]/25 text-[var(--randwijck-ink)]",
};

export function AdminScheduleGrid({
  schedule,
  viewerPersonId,
  coachOptions,
}: {
  schedule: AdminScheduleWeek;
  viewerPersonId: string;
  coachOptions: CoachOption[];
}) {
  if (schedule.sections.length === 0) {
    return (
      <p className="elev-panel px-4 py-8 text-center text-sm text-[var(--muted-foreground)]">
        Select at least one club to show the schedule.
      </p>
    );
  }

  const dayDates = schedule.days.map((d) => d.date);
  const today = formatLocalDate(new Date());
  const scrollToDate = dayDates.includes(today) ? today : undefined;

  return (
    <div className="flex flex-col gap-6">
      {schedule.sections.map((section) => {
        const bookableCount = section.courts.length;
        const hoursLabel =
          section.hours.length > 0
            ? `${section.hours[0]}–${section.hours[section.hours.length - 1]}`
            : "";

        return (
          <div key={section.club.id} className="elev-panel min-w-0 w-full p-1">
            <div
              className={cn(
                "mb-2 flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 rounded-md border px-3 py-2 text-sm font-semibold",
                CLUB_BAND[section.clubSlug] ??
                  "bg-[var(--surface)] border-[var(--border)]",
              )}
            >
              <span>{section.club.name}</span>
              <span className="text-xs font-normal opacity-80">
                {bookableCount} {bookableCount === 1 ? "court" : "courts"}
                {hoursLabel ? ` · ${hoursLabel}` : ""}
                {dayDates.length > 0 ? ` · ${dayDates.length} days` : ""}
              </span>
            </div>
            <CourtCalendarGrid
              data={section}
              dayDates={dayDates}
              view="week"
              viewerRole="admin"
              viewerPersonId={viewerPersonId}
              coachOptions={coachOptions}
              compact
              embedded
              scrollToDate={scrollToDate}
            />
          </div>
        );
      })}
    </div>
  );
}
