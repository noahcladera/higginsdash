import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { CalendarIcon, ArrowRightIcon } from "@/components/icons";
import { formatTime, fullName } from "./format";
import type { DashboardBookingRow } from "./queries";
import type { Terms } from "@/lib/tenant/terms";

/**
 * Two-column today-on-court view: private lessons (`purpose: coaching`)
 * on the left, member play (`purpose: personal`) on the right. Each
 * side caps at 6 visible rows + a "view all" link to the bookings
 * calendar for today's date so the dashboard doesn't grow unbounded
 * on busy days.
 */
export function TodaysBookings({
  bookings,
  todayLocal,
  terms,
}: {
  bookings: DashboardBookingRow[];
  todayLocal: string;
  terms: Terms;
}) {
  const lessons = bookings.filter((b) => b.purpose === "coaching");
  const play = bookings.filter((b) => b.purpose === "personal");

  if (bookings.length === 0) {
    return (
      <EmptyState
        icon={<CalendarIcon size={20} />}
        title={`No ${terms.court.plural.toLowerCase()} booked today`}
        description={`Nobody on ${terms.court.singular.toLowerCase()} yet — quiet day at the ${terms.club.singular.toLowerCase()}.`}
      />
    );
  }

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <BookingColumn
        title={terms.privateLesson.plural}
        emptyHint={`No ${terms.privateLesson.plural.toLowerCase()} today.`}
        rows={lessons}
        tone="joint"
        todayLocal={todayLocal}
      />
      <BookingColumn
        title={`${terms.member.singular} play`}
        emptyHint={`No ${terms.member.singular.toLowerCase()} bookings today.`}
        rows={play}
        tone="triaz"
        todayLocal={todayLocal}
      />
    </div>
  );
}

function BookingColumn({
  title,
  emptyHint,
  rows,
  tone,
  todayLocal,
}: {
  title: string;
  emptyHint: string;
  rows: DashboardBookingRow[];
  tone: "joint" | "triaz";
  todayLocal: string;
}) {
  const visible = rows.slice(0, 6);
  const more = rows.length - visible.length;

  return (
    <div className="elev-card overflow-hidden rounded-[var(--radius-md)]">
      <header className="flex items-center justify-between gap-2 border-b border-[var(--border)] px-4 py-2.5">
        <div className="flex items-center gap-2">
          <Badge tone={tone} variant="soft" className="px-2 py-0">
            {rows.length}
          </Badge>
          <h3 className="text-sm font-semibold">{title}</h3>
        </div>
      </header>
      {rows.length === 0 ? (
        <p className="px-4 py-8 text-center text-sm text-[var(--muted-foreground)]">
          {emptyHint}
        </p>
      ) : (
        <ul className="divide-y divide-[var(--border)]">
          {visible.map((b) => {
            const partnerNames = b.partners.map((p) => p.partnerName);
            return (
              <li
                key={b.id}
                className="flex items-start gap-3 px-4 py-3"
              >
                <div className="w-16 shrink-0">
                  <div className="tabular text-sm font-medium">
                    {formatTime(b.startsAt)}
                  </div>
                  <div className="tabular text-[11px] text-[var(--muted-foreground)]">
                    → {formatTime(b.endsAt)}
                  </div>
                </div>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-medium">
                    {fullName(b.bookedBy.firstName, b.bookedBy.lastName)}
                  </div>
                  <div className="truncate text-xs text-[var(--muted-foreground)]">
                    {b.clubName} · {b.courtName}
                    {partnerNames.length > 0 && (
                      <> · with {partnerNames.join(", ")}</>
                    )}
                  </div>
                  {b.cancellationRequestedAt && (
                    <div className="mt-1 text-[11px] text-[var(--warning-ink)]">
                      Deletion pending
                    </div>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}
      {(more > 0 || rows.length > 0) && (
        <Link
          href={`/admin?panel=schedule&date=${todayLocal}`}
          className="flex items-center justify-between gap-1 border-t border-[var(--border)] px-4 py-2.5 text-xs text-[var(--muted-foreground)] transition-colors hover:bg-[var(--surface-strong)]"
        >
          <span>{more > 0 ? `+${more} more` : "Open booking calendar"}</span>
          <ArrowRightIcon size={14} />
        </Link>
      )}
    </div>
  );
}
