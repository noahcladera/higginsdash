import { EmptyState } from "@/components/ui/empty-state";
import { Section } from "@/components/ui/section";
import { CalendarIcon } from "@/components/icons";
import { daysInRange } from "@/lib/calendar/week";
import {
  calendarRangeEnd,
  formatAdminCalendarRangeLabel,
  resolveCalendarAnchor,
  type AdminClassesFilters,
} from "@/lib/admin/classes-filters";
import {
  countSessionsInCalendarRange,
  listSessionsForAdmin,
} from "@/lib/admin/classes-queries";
import { AdminCalendarDayNav } from "./day-nav";
import { SessionsGrid } from "./sessions-grid";

export async function AdminCalendarView({
  filters,
}: {
  filters: AdminClassesFilters;
}) {
  const rangeStart = resolveCalendarAnchor(filters.fromISO);
  const rangeEnd = calendarRangeEnd(rangeStart, filters.span);
  const days = daysInRange(rangeStart, filters.span);

  const [sessions, sessionCount] = await Promise.all([
    listSessionsForAdmin(filters, rangeStart, rangeEnd),
    countSessionsInCalendarRange(filters, rangeStart, rangeEnd),
  ]);

  const rangeLabel = formatAdminCalendarRangeLabel(filters.fromISO, filters.span);

  return (
    <div className="space-y-4">
      <AdminCalendarDayNav filters={filters} />

      <Section
        title={rangeLabel}
        description={
          sessionCount === 0
            ? "No sessions in this window."
            : `${sessionCount} session${sessionCount === 1 ? "" : "s"} scheduled`
        }
      >
        {sessions.length === 0 ? (
          <EmptyState
            icon={<CalendarIcon size={20} />}
            title="Nothing in this window"
            description="Try moving to another range, widening to a week, or clearing filters."
          />
        ) : (
          <SessionsGrid days={days} sessions={sessions} />
        )}
      </Section>
    </div>
  );
}
