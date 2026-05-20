import { prisma } from "@/lib/prisma";
import { computeClassTiming } from "@/lib/classes/timing";
import { serializeIcs, type IcsEvent } from "@/lib/calendar/ics";
import { getCurrentBrand } from "@/lib/tenant";

/**
 * GET /api/calendar/[token]
 *
 * Public iCalendar feed. The token IS the secret — Google Calendar
 * and Apple Calendar both subscribe with a plain HTTPS URL and no
 * auth headers, so we deliberately accept anonymous traffic and
 * scope the feed to whatever the token's owner could see.
 *
 * Cache headers keep Google/iCloud's polling reasonable (~15min)
 * without making the cache shared, since each token is private.
 */
export async function GET(
  _req: Request,
  context: { params: Promise<{ token: string }> },
) {
  const { token } = await context.params;
  if (!token || token.length < 10) {
    return new Response("Not found", { status: 404 });
  }

  const feed = await prisma.calendarFeedToken.findUnique({
    where: { token },
    select: {
      id: true,
      personId: true,
      scope: true,
      revokedAt: true,
      person: {
        select: {
          firstName: true,
          lastName: true,
          householdMember: { select: { householdId: true } },
        },
      },
    },
  });

  if (!feed || feed.revokedAt) {
    return new Response("Not found", { status: 404 });
  }

  // Resolve the set of student person IDs whose sessions we should
  // emit. Self-scope is just the token owner; household-scope walks
  // every household member they live with (so a parent gets one feed
  // for the whole family).
  const studentIds: string[] = [feed.personId];
  if (feed.scope === "household" && feed.person.householdMember?.householdId) {
    const members = await prisma.householdMember.findMany({
      where: { householdId: feed.person.householdMember.householdId },
      select: { personId: true },
    });
    for (const m of members) {
      if (!studentIds.includes(m.personId)) studentIds.push(m.personId);
    }
  }

  // 60 days back, 6 months forward — keeps the feed light while
  // covering the past few weeks (for clients that backfill).
  const now = new Date();
  const start = new Date(now.getTime() - 60 * 24 * 60 * 60 * 1000);
  const end = new Date(now.getTime() + 180 * 24 * 60 * 60 * 1000);

  const enrollments = await prisma.enrollment.findMany({
    where: {
      studentPersonId: { in: studentIds },
      status: { in: ["active", "pending_payment"] },
    },
    select: {
      studentPersonId: true,
      classSeriesId: true,
      student: {
        select: { person: { select: { firstName: true } } },
      },
    },
  });

  const seriesToOwners = new Map<
    string,
    { ownerPersonId: string; ownerFirstName: string }[]
  >();
  for (const e of enrollments) {
    const arr = seriesToOwners.get(e.classSeriesId) ?? [];
    if (!arr.some((o) => o.ownerPersonId === e.studentPersonId)) {
      arr.push({
        ownerPersonId: e.studentPersonId,
        ownerFirstName: e.student.person.firstName ?? "Student",
      });
    }
    seriesToOwners.set(e.classSeriesId, arr);
  }

  const seriesIds = Array.from(seriesToOwners.keys());

  const sessions =
    seriesIds.length === 0
      ? []
      : await prisma.classSession.findMany({
          where: {
            classSeriesId: { in: seriesIds },
            startsAt: { gte: start, lt: end },
            cancelledAt: null,
            status: { not: "cancelled" },
          },
          orderBy: { startsAt: "asc" },
          include: {
            classSeries: {
              select: {
                id: true,
                name: true,
                deliveryMode: true,
                pickupAt: true,
                program: { select: { name: true } },
                venue: {
                  select: {
                    name: true,
                    addressLine1: true,
                    city: true,
                  },
                },
                school: {
                  select: {
                    name: true,
                    coachArriveAtHubMinutes: true,
                  },
                },
              },
            },
          },
        });

  const events: IcsEvent[] = [];
  for (const s of sessions) {
    const series = s.classSeries;
    const timing = computeClassTiming({
      session: { startsAt: s.startsAt, endsAt: s.endsAt },
      series: {
        deliveryMode: series.deliveryMode,
        pickupAt: series.pickupAt,
      },
      school: series.school
        ? { coachArriveAtHubMinutes: series.school.coachArriveAtHubMinutes }
        : null,
    });
    const blockStart = timing.pickupAt ?? timing.classStartAt;
    const blockEnd = timing.classEndAt;

    const owners = seriesToOwners.get(series.id) ?? [];
    for (const owner of owners) {
      const summary = `${owner.ownerFirstName} · ${series.name}`;
      const description = [
        series.program.name,
        series.school ? `Pickup at ${series.school.name}` : null,
        timing.pickupAt
          ? `Coach picks up at ${formatHm(timing.pickupAt)}`
          : null,
        `Class ${formatHm(timing.classStartAt)}–${formatHm(timing.classEndAt)}`,
      ]
        .filter(Boolean)
        .join("\n");

      events.push({
        uid: `session-${s.id}-${owner.ownerPersonId}@higgins.tennis`,
        startsAt: blockStart,
        endsAt: blockEnd,
        summary,
        description,
        location: [
          series.venue.name,
          series.venue.addressLine1,
          series.venue.city,
        ]
          .filter(Boolean)
          .join(", "),
        lastModified: s.updatedAt ?? undefined,
      });
    }
  }

  // Update last-fetched stamp for the operator dashboard.
  // Fire-and-forget — failure here must not break the response.
  prisma.calendarFeedToken
    .update({
      where: { id: feed.id },
      data: { lastFetchedAt: new Date() },
    })
    .catch(() => {
      // intentionally swallowed: best-effort metadata update
    });

  // Brand comes from the current-org resolver. In Pass 1 this is always
  // Higgins for production, but a programs-mode tenant gets its own
  // display name in the PRODID and calendar title so feeds don't leak
  // "Higgins" across packagings.
  const brand = await getCurrentBrand();
  const firstName = feed.person.firstName ?? brand.shortName;
  const ics = serializeIcs({
    name: feed.scope === "household"
      ? `${firstName} · Household classes`
      : `${firstName} · My classes`,
    prodId: `-//${brand.displayName}//Calendar Feed 1.0//EN`,
    events,
  });

  const filename = brand.shortName.toLowerCase().replace(/[^a-z0-9]+/g, "-");
  return new Response(ics, {
    status: 200,
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      "Cache-Control": "private, max-age=900",
      "Content-Disposition": `inline; filename=${filename || "calendar"}.ics`,
    },
  });
}

function formatHm(d: Date): string {
  return new Intl.DateTimeFormat("en-NL", {
    timeZone: "Europe/Amsterdam",
    hour: "2-digit",
    minute: "2-digit",
  }).format(d);
}
