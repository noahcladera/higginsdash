import Link from "next/link";
import { requireMember } from "@/lib/auth/require-member";
import { prisma } from "@/lib/prisma";
import { PageHeader } from "@/components/ui/page-header";
import { Section } from "@/components/ui/section";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { BookingList, BookingRow } from "@/components/booking/booking-row";
import { CalendarIcon, PlusIcon } from "@/components/icons";
import { getTerms } from "@/lib/tenant";

/**
 * Member's own booking list. Includes household-level bookings if the
 * member belongs to a household — so a parent sees both their own and
 * their kids' bookings.
 */
export default async function PortalBookingsPage() {
  const { person, householdId } = await requireMember();
  const t = await getTerms();
  const now = new Date();

  const baseWhere = {
    OR: [
      { bookedByPersonId: person.id },
      ...(householdId ? [{ bookedByHouseholdId: householdId }] : []),
    ],
  };

  const [upcoming, past] = await Promise.all([
    prisma.courtBooking.findMany({
      where: { ...baseWhere, startsAt: { gte: now } },
      orderBy: { startsAt: "asc" },
      include: {
        court: true,
        club: true,
        bookedByPerson: { select: { firstName: true, lastName: true, id: true } },
      },
    }),
    prisma.courtBooking.findMany({
      where: { ...baseWhere, startsAt: { lt: now } },
      orderBy: { startsAt: "desc" },
      take: 10,
      include: {
        court: true,
        club: true,
        bookedByPerson: { select: { firstName: true, lastName: true, id: true } },
      },
    }),
  ]);

  function cancellationNoteFor(booking: { status: string; cancellationReason: string | null; bookedByPerson: { firstName: string; lastName: string; id: string } }) {
    if (booking.status !== "cancellation_requested") return undefined;
    return {
      requestedByName:
        booking.bookedByPerson.id === person.id
          ? "You"
          : `${booking.bookedByPerson.firstName} ${booking.bookedByPerson.lastName}`.trim(),
      reason: booking.cancellationReason,
    };
  }

  return (
    <div className="space-y-10">
      <PageHeader
        kicker="Bookings"
        title={`Your ${t.court.singular.toLowerCase()} time`}
        description={`Everything you and your ${t.household.singular.toLowerCase()} have on the books.`}
        actions={
          <Button asChild tone="triaz">
            <Link href="/portal/book">
              <PlusIcon /> New booking
            </Link>
          </Button>
        }
      />

      <Section
        title="Upcoming"
        description={
          upcoming.length === 0
            ? "Nothing booked yet."
            : `${upcoming.length} booking${upcoming.length === 1 ? "" : "s"}`
        }
      >
        {upcoming.length === 0 ? (
          <EmptyState
            icon={<CalendarIcon size={20} />}
            title="No upcoming bookings"
            description={`${t.bookVerb} a ${t.court.singular.toLowerCase()} when you're ready to play.`}
            action={
              <Button asChild tone="triaz" size="sm">
                <Link href="/portal/book">Book a court</Link>
              </Button>
            }
          />
        ) : (
          <BookingList>
            {upcoming.map((b) => (
              <BookingRow
                key={b.id}
                startsAt={b.startsAt}
                endsAt={b.endsAt}
                club={b.club.name}
                court={b.court.name}
                bookedBy={{
                  name: `${b.bookedByPerson.firstName} ${b.bookedByPerson.lastName}`.trim(),
                  isYou: b.bookedByPerson.id === person.id,
                }}
                status={b.status}
                cancellationNote={cancellationNoteFor(b)}
              />
            ))}
          </BookingList>
        )}
      </Section>

      <Section title="Past" description="Your last 10 bookings.">
        {past.length === 0 ? (
          <p className="text-sm text-[var(--muted-foreground)]">
            No past bookings yet.
          </p>
        ) : (
          <BookingList>
            {past.map((b) => (
              <BookingRow
                key={b.id}
                startsAt={b.startsAt}
                endsAt={b.endsAt}
                club={b.club.name}
                court={b.court.name}
                bookedBy={{
                  name: `${b.bookedByPerson.firstName} ${b.bookedByPerson.lastName}`.trim(),
                  isYou: b.bookedByPerson.id === person.id,
                }}
                status={b.status}
                cancellationNote={cancellationNoteFor(b)}
              />
            ))}
          </BookingList>
        )}
      </Section>
    </div>
  );
}
