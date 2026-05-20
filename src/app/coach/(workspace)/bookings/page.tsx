import Link from "next/link";
import { requireCoach } from "@/lib/auth/require-coach";
import { courtBookingClubFilter } from "@/lib/coach/club-scope";
import { prisma } from "@/lib/prisma";
import { PageHeader } from "@/components/ui/page-header";
import { Section } from "@/components/ui/section";
import { EmptyState } from "@/components/ui/empty-state";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { CalendarIcon, PlusIcon } from "@/components/icons";
import { BookingList, BookingRow } from "@/components/booking/booking-row";
import { getTerms } from "@/lib/tenant";

/**
 * Coach's own booking history. Splits into upcoming + past, with deletion-
 * status badges so coaches can see at a glance which deletions admin has
 * approved/denied.
 */
export default async function CoachBookingsPage() {
  const { person, allowedClubIds } = await requireCoach();
  const terms = await getTerms();
  const bookingClub = courtBookingClubFilter(allowedClubIds);

  const now = new Date();
  const [upcoming, past, recurringRequests] = await Promise.all([
    prisma.courtBooking.findMany({
      where: {
        bookedByPersonId: person.id,
        startsAt: { gte: now },
        ...bookingClub,
      },
      orderBy: { startsAt: "asc" },
      include: { court: true, club: true },
    }),
    prisma.courtBooking.findMany({
      where: {
        bookedByPersonId: person.id,
        startsAt: { lt: now },
        ...bookingClub,
      },
      orderBy: { startsAt: "desc" },
      take: 20,
      include: { court: true, club: true },
    }),
    // Pending + denied recurring lesson requests so the coach can see what's
    // waiting on admin and read the admin's note when something gets denied.
    // We hide approved/active rows here because they're already visible on
    // the calendar as a normal recurring block.
    prisma.recurringBlock.findMany({
      where: {
        requesterPersonId: person.id,
        status: { in: ["pending", "denied"] },
      },
      orderBy: { requestedAt: "desc" },
      take: 20,
      include: { court: true, club: true },
    }),
  ]);

  const pendingCount = upcoming.filter(
    (b) => b.status === "cancellation_requested",
  ).length;

  return (
    <div className="space-y-10">
      <PageHeader
        kicker={terms.coach.role}
        title="Your bookings"
        description={`${terms.privateLesson.singular} bookings need an admin to approve cancellations.`}
        actions={
          <Button asChild tone="triaz">
            <Link href="/coach/book">
              <PlusIcon /> New booking
            </Link>
          </Button>
        }
      />

      {pendingCount > 0 && (
        <div className="fade-in rounded-[var(--radius-md)] bg-[var(--warning-soft)] px-5 py-3 text-sm text-[oklch(0.30_0.10_75)]">
          {pendingCount} deletion request{pendingCount === 1 ? "" : "s"} waiting
          on admin review.
        </div>
      )}

      {recurringRequests.length > 0 && (
        <Section
          title="Recurring lesson requests"
          description="Pending or denied. Approved series show up as recurring blocks on the calendar."
        >
          <div className="space-y-2">
            {recurringRequests.map((r) => (
              <RecurringRequestRow key={r.id} request={r} />
            ))}
          </div>
        </Section>
      )}

      <Section
        title="Upcoming"
        description={
          upcoming.length === 0
            ? "Nothing on the books."
            : `${upcoming.length} booking${upcoming.length === 1 ? "" : "s"}`
        }
      >
        {upcoming.length === 0 ? (
          <EmptyState
            icon={<CalendarIcon size={20} />}
            title="No upcoming bookings"
            description="Add one when you're ready."
            action={
              <Button asChild tone="triaz" size="sm">
                <Link href="/coach/book">{`${terms.bookVerb} a ${terms.court.singular.toLowerCase()}`}</Link>
              </Button>
            }
          />
        ) : (
          <BookingList>
            {upcoming.map((b) => (
              <div key={b.id}>
                <BookingRow
                  startsAt={b.startsAt}
                  endsAt={b.endsAt}
                  club={b.club.name}
                  court={b.court.name}
                  status={b.status}
                  bookedBy={{ name: "you", isYou: true }}
                  purpose={{
                    label: b.purpose,
                    tone: b.purpose === "coaching" ? "joint" : "triaz",
                  }}
                />
                {(b.cancellationReason || b.cancellationDenialReason) && (
                  <div className="space-y-0.5 px-4 pb-3 text-[11px] text-[var(--muted-foreground)]">
                    {b.status === "cancellation_requested" &&
                      b.cancellationReason && (
                        <div>Reason: {b.cancellationReason}</div>
                      )}
                    {b.cancellationDenialReason && (
                      <div className="text-[var(--destructive)]">
                        Denied: {b.cancellationDenialReason}
                      </div>
                    )}
                  </div>
                )}
              </div>
            ))}
          </BookingList>
        )}
      </Section>

      <Section
        title="Past"
        description={
          past.length === 0
            ? "Nothing yet."
            : `${past.length} most recent`
        }
      >
        {past.length === 0 ? (
          <EmptyState
            icon={<CalendarIcon size={20} />}
            title="No past bookings"
            description="Anything you book will show up here once it happens."
          />
        ) : (
          <BookingList>
            {past.map((b) => (
              <BookingRow
                key={b.id}
                startsAt={b.startsAt}
                endsAt={b.endsAt}
                club={b.club.name}
                court={b.court.name}
                status={b.status}
                bookedBy={{ name: "you", isYou: true }}
                purpose={{
                  label: b.purpose,
                  tone: b.purpose === "coaching" ? "joint" : "triaz",
                }}
              />
            ))}
          </BookingList>
        )}
      </Section>
    </div>
  );
}

const DAY_LABEL_FULL: Record<string, string> = {
  mon: "Mon",
  tue: "Tue",
  wed: "Wed",
  thu: "Thu",
  fri: "Fri",
  sat: "Sat",
  sun: "Sun",
};

interface RecurringRequestRowProps {
  request: {
    id: string;
    purposeDescription: string;
    status: string;
    dayOfWeek: string | null;
    startTime: Date;
    endTime: Date;
    startsOn: Date;
    endsOn: Date;
    deniedReason: string | null;
    requestedAt: Date;
    excludedDates: Date[];
    court: { name: string };
    club: { name: string };
  };
}

function RecurringRequestRow({ request: r }: RecurringRequestRowProps) {
  const startTime = `${pad(r.startTime.getUTCHours())}:${pad(r.startTime.getUTCMinutes())}`;
  const endTime = `${pad(r.endTime.getUTCHours())}:${pad(r.endTime.getUTCMinutes())}`;
  const startsOn = isoFromDate(r.startsOn);
  const endsOn = isoFromDate(r.endsOn);
  const isPending = r.status === "pending";

  return (
    <div className="rounded-md border border-[var(--border)] bg-[var(--surface)] p-3">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <div>
          <div className="text-sm font-medium">
            {r.purposeDescription}
            <Badge
              tone={isPending ? "warning" : "danger"}
              variant="soft"
              className="ml-2"
            >
              {r.status}
            </Badge>
          </div>
          <div className="text-xs text-[var(--muted-foreground)]">
            {r.club.name} · {r.court.name} · every{" "}
            {r.dayOfWeek ? DAY_LABEL_FULL[r.dayOfWeek] : "day"} ·{" "}
            <span className="font-mono">
              {startTime}–{endTime}
            </span>
          </div>
        </div>
        <div className="font-mono text-[11px] text-[var(--muted-foreground)]">
          {startsOn} → {endsOn}
        </div>
      </div>
      {r.excludedDates.length > 0 && (
        <div className="mt-1 text-[11px] text-[var(--muted-foreground)]">
          Skipping {r.excludedDates.length} date(s) you marked as conflicts.
        </div>
      )}
      {r.status === "denied" && r.deniedReason && (
        <div className="mt-2 rounded-md bg-[var(--danger-soft)] px-3 py-2 text-xs text-[var(--destructive)]">
          <span className="font-semibold">Admin note:</span> {r.deniedReason}
        </div>
      )}
      {isPending && (
        <div className="mt-1 text-[11px] text-[var(--muted-foreground)]">
          Submitted {formatRequestedAt(r.requestedAt)}; admin will review.
        </div>
      )}
    </div>
  );
}

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

function isoFromDate(d: Date): string {
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
}

function formatRequestedAt(d: Date): string {
  return new Intl.DateTimeFormat("en-NL", {
    timeZone: "Europe/Amsterdam",
    weekday: "short",
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  }).format(d);
}
