import Link from "next/link";
import { notFound } from "next/navigation";
import { requireMember } from "@/lib/auth/require-member";
import { prisma } from "@/lib/prisma";
import { PageHeader } from "@/components/ui/page-header";
import { Section } from "@/components/ui/section";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import {
  getProgramBySlug,
  getVisibleSeriesById,
} from "@/lib/portal/catalog-queries";
import {
  ageIncludesYears,
  formatPublicAgeLabel,
  programTargetToAudience,
} from "@/lib/classes/age-band";
import { getActiveMembershipCoverage } from "@/lib/memberships/coverage";
import { isReturningHousehold } from "@/lib/memberships/returning";
import { getHouseholdCreditBalanceCents } from "@/lib/credits";
import { ageBracketFromAge } from "@/lib/portal/enrollment-pricing";
import {
  EnrollPanel,
  type EnrollCandidate,
  type EnrollGroup,
} from "./_enroll-panel";
import { listClassUpdatesForSeries } from "@/lib/class-updates/queries";
import { ClassUpdateList } from "@/components/class-updates/class-update-list";
import { getCurrentOrg } from "@/lib/tenant";
import { householdHasLiveEnrollment } from "@/lib/portal/trial-eligibility";
import { CoverImage } from "@/components/portal/cover-image";
import { Avatar } from "@/components/portal/avatar";
import {
  PickupVenueLocationLink,
  VenueLocationLink,
} from "@/components/venue/venue-location-link";
import { stripStubPrefix } from "@/lib/classes/clean-text";
import {
  enrollmentBlocksNextEventOccurrence,
  formatOccurrenceDateTime,
} from "@/lib/classes/event-occurrence";
import { autoCompleteStaleEventEnrollment } from "@/lib/portal/enrollment-actions";

/**
 * Series detail page — the "info + enroll" stop on the catalog flow.
 *
 * Shows full schedule (every non-cancelled session), price, location,
 * coaches, age band. The right rail is the `<EnrollPanel />` which
 * picks the right student (the viewer themselves or one of their
 * children), shows live slot count, and handles waitlist gracefully.
 *
 * Withdraws + my-enrollments live on `/portal/classes`.
 */
export default async function SeriesDetailPage({
  params,
}: {
  params: Promise<{ programSlug: string; seriesId: string }>;
}) {
  const { person, householdId } = await requireMember();
  const { programSlug, seriesId } = await params;
  const [org, hasLiveEnrollment] = await Promise.all([
    getCurrentOrg(),
    householdHasLiveEnrollment({ personId: person.id, householdId }),
  ]);
  const { brand, terms, features } = org;
  const showTrialCta = features.trialInterest && !hasLiveEnrollment;

  const program = await getProgramBySlug(programSlug);
  if (!program) notFound();

  const series = await getVisibleSeriesById(seriesId);
  if (!series || series.programSlug !== programSlug) notFound();

  const isCamp = series.classType === "camp";
  const isEvent = series.classType === "event";

  // Build the candidate list: the viewer themselves (if they're old
  // enough to be a Student-track user) plus every child in the household.
  const candidates = await getEnrollCandidates(person.id, householdId);
  const enrollCandidates = isCamp
    ? candidates.filter((c) => c.relation === "child")
    : candidates;

  // Map of "this candidate is already enrolled here" so the panel can
  // disable the picker entry / show the existing status.
  const existingEnrollmentsRaw = await prisma.enrollment.findMany({
    where: {
      classSeriesId: seriesId,
      studentPersonId: { in: enrollCandidates.map((c) => c.personId) },
    },
    select: {
      id: true,
      studentPersonId: true,
      status: true,
      eventOccurrenceDate: true,
    },
  });

  const now = new Date();
  const existingEnrollments = isEvent
    ? await Promise.all(
        existingEnrollmentsRaw.map(async (e) => ({
          ...e,
          status: await autoCompleteStaleEventEnrollment(
            e.id,
            e.eventOccurrenceDate,
            e.status,
            now,
          ),
        })),
      )
    : existingEnrollmentsRaw;

  const nextOccurrenceDate = series.nextEventOccurrence?.occurrenceDate ?? null;

  const existingByPersonId = new Map(
    existingEnrollments
      .filter((e) => {
        if (!isEvent || !nextOccurrenceDate) return true;
        return enrollmentBlocksNextEventOccurrence({
          status: e.status,
          eventOccurrenceDate: e.eventOccurrenceDate,
          nextOccurrenceDate,
          now,
        });
      })
      .map((e) => [
        e.studentPersonId,
        { status: e.status, enrollmentId: e.id },
      ]),
  );

  // The WhatsApp group invite is private — only surface it to a viewer
  // whose household actually has someone enrolled in this series. We
  // count active and pending_payment statuses; waitlisted/withdrawn
  // viewers don't get the chat link until they convert.
  const viewerHasEnrolledMember = existingEnrollments.some(
    (e) => e.status === "active" || e.status === "pending_payment",
  );

  // Membership coverage (per candidate × club). The EnrollPanel uses
  // it to decide whether to quote the membership add-on for the
  // chosen student.
  const coverage = await getActiveMembershipCoverage({
    householdId,
    candidatePersonIds: enrollCandidates.map((c) => c.personId),
  });

  const isReturning = await isReturningHousehold(householdId);

  // Coach-authored updates for this series. Only surface them once the
  // viewer has someone enrolled — same gate the WhatsApp section uses.
  const classUpdates = viewerHasEnrolledMember
    ? await listClassUpdatesForSeries(seriesId, { limit: 10 })
    : [];

  // Available household credit (lessons-only). Surfaced in the enroll
  // panel as an opt-in "apply credit" toggle. Members with zero
  // balance get the toggle hidden entirely.
  const householdCreditCents = householdId
    ? await getHouseholdCreditBalanceCents(householdId)
    : 0;

  const pricePerSession =
    !isCamp &&
    !isEvent &&
    series.pricePerSeries != null &&
    series.sessions.length > 0
      ? series.pricePerSeries / series.sessions.length
      : null;

  const composedTitle = isEvent
    ? series.name
    : isCamp
      ? `${formatDateRange(series.startsOn, series.endsOn)} · ${series.venueName}`
      : `${formatDow(series.dayOfWeek)} ${series.startTimeHHMM}–${series.endTimeHHMM} · ${series.venueName}`;

  const memberPrice =
    series.memberPrice ??
    series.pricingTiers?.find((t) => t.forMembers)?.amountEur ??
    null;
  const nonMemberPrice = series.nonMemberPrice ?? series.pricePerSeries;
  const showMemberPair =
    !isEvent &&
    memberPrice != null &&
    nonMemberPrice != null &&
    series.classType !== "camp";

  const description =
    stripStubPrefix(series.publicNotes) ??
    stripStubPrefix(series.programDescription);

  const catalogAudience = programTargetToAudience(series.programTargetAudience);
  const ageLabel = formatPublicAgeLabel({
    minAge: series.minAge,
    maxAge: series.maxAge,
    audience: catalogAudience,
    isEvent: series.classType === "event",
    withAgesPrefix: true,
  });

  return (
    <div className="space-y-8">
      <div className="text-xs">
        <Link
          href={`/portal/programs/${programSlug}`}
          className="text-[var(--muted-foreground)] underline-offset-4 hover:underline"
        >
          ← All {program.name}
        </Link>
      </div>

      {series.coverImageUrl && (
        <CoverImage
          src={series.coverImageUrl}
          alt={series.name}
          focusY={series.coverImageFocusY}
          className="shadow-[var(--shadow-sm)]"
        />
      )}

      <div className="space-y-3">
        <PageHeader
          kicker={program.name}
          title={composedTitle}
          description={description}
        />
        <div className="flex flex-wrap gap-2">
          {series.seasonName && (
            <Badge tone="neutral">{series.seasonName}</Badge>
          )}
          {ageLabel ? <Badge tone="neutral">{ageLabel}</Badge> : null}
          {series.levelLabels.map((label) => (
            <Badge key={label} tone="neutral">{label}</Badge>
          ))}
          {series.schoolName && (
            <Badge tone="joint">School pickup</Badge>
          )}
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-[1fr_360px]">
        {/* Left: details */}
        <div className="space-y-6">
          <Section title="When & where">
            <dl className="grid gap-y-3 text-sm sm:grid-cols-[160px_1fr]">
              {isCamp ? (
                <>
                  <Term>Camp week</Term>
                  <Detail>
                    {formatDateRange(series.startsOn, series.endsOn)}
                    <span className="block text-xs text-[var(--muted-foreground)]">
                      {series.startTimeHHMM}–{series.endTimeHHMM} each camp day
                      · {series.sessions.length} camp day
                      {series.sessions.length === 1 ? "" : "s"}
                    </span>
                  </Detail>
                </>
              ) : (
                <>
                  <Term>Day & time</Term>
                  <Detail>
                    {formatDow(series.dayOfWeek)} · {series.startTimeHHMM}–
                    {series.endTimeHHMM}
                    {series.pickupAtHHMM && (
                      <span className="block text-xs text-[var(--muted-foreground)]">
                        Pickup at {series.pickupAtHHMM} from {series.schoolName}
                      </span>
                    )}
                  </Detail>
                </>
              )}

              <Term>{isCamp ? "Dates" : "Season"}</Term>
              <Detail>
                {series.seasonName ?? "—"}
                <span className="block text-xs text-[var(--muted-foreground)]">
                  {formatDateRange(series.startsOn, series.endsOn)} ·{" "}
                  {series.sessions.length}{" "}
                  {isCamp ? "camp day" : "session"}
                  {series.sessions.length === 1 ? "" : "s"}
                </span>
              </Detail>

              <Term>Location</Term>
              <Detail>
                {series.schoolName ? (
                  <PickupVenueLocationLink
                    schoolName={series.schoolName}
                    venue={{
                      name: series.venueName,
                      mapUrl: series.venueMapUrl,
                      addressLine1: series.venueAddressLine1,
                      postalCode: series.venuePostalCode,
                      city: series.venueCity,
                    }}
                    showAddress
                  />
                ) : (
                  <VenueLocationLink
                    venue={{
                      name: series.venueName,
                      mapUrl: series.venueMapUrl,
                      addressLine1: series.venueAddressLine1,
                      postalCode: series.venuePostalCode,
                      city: series.venueCity,
                    }}
                    showAddress
                  />
                )}
                {series.schoolName && (
                  <Badge tone="joint" className="ml-2">
                    School pickup
                  </Badge>
                )}
              </Detail>

              {ageLabel ? (
                <>
                  <Term>Age</Term>
                  <Detail>{ageLabel.replace(/^Ages /, "")}</Detail>
                </>
              ) : null}

              {series.coaches.length > 0 && (
                <>
                  <Term>
                    Coach{series.coaches.length === 1 ? "" : "es"}
                  </Term>
                  <Detail>
                    <ul className="space-y-2">
                      {series.coaches.map((coach) => (
                        <li
                          key={coach.name}
                          className="flex items-center gap-2"
                        >
                          <Avatar
                            name={coach.name}
                            src={coach.photoUrl}
                            size="sm"
                          />
                          <span>{coach.name}</span>
                        </li>
                      ))}
                    </ul>
                  </Detail>
                </>
              )}
            </dl>
          </Section>

          {series.groups.length > 1 && (
            <Section
              title="Sub-groups"
              description="This class runs as one block on court but has more than one age band — pick the matching sub-group when you enroll."
            >
              <ul className="elev-card divide-y divide-[var(--border)]">
                {series.groups.map((g) => {
                  const slotsLeft = Math.max(g.maxStudents - g.enrolledCount, 0);
                  const ageStr =
                    formatPublicAgeLabel({
                      minAge: g.minAge,
                      maxAge: g.maxAge,
                      audience: catalogAudience,
                      isEvent: series.classType === "event",
                    }) ?? "Any age";
                  return (
                    <li
                      key={g.id}
                      className="flex flex-wrap items-center justify-between gap-2 px-5 py-3 text-sm"
                    >
                      <div className="min-w-0">
                        <div className="font-medium">{g.name}</div>
                        <div className="text-xs text-[var(--muted-foreground)] tabular">
                          ends {g.endTimeHHMM} · {ageStr}
                        </div>
                      </div>
                      <Badge
                        tone={slotsLeft === 0 ? "danger" : "neutral"}
                        variant="soft"
                        className="tabular"
                      >
                        {slotsLeft === 0
                          ? "Full"
                          : `${slotsLeft} of ${g.maxStudents} left`}
                      </Badge>
                    </li>
                  );
                })}
              </ul>
            </Section>
          )}

          {viewerHasEnrolledMember && (
            <Section
              title="Updates from your coach"
              description="Notes and short videos posted by the coach for this series. New updates also land in your inbox."
            >
              <div id="updates" className="scroll-mt-24">
                <ClassUpdateList
                  updates={classUpdates}
                  variant="parent"
                  emptyHint="Your coach hasn't posted an update for this series yet — you'll see them here when they do."
                />
              </div>
            </Section>
          )}

          {viewerHasEnrolledMember && series.whatsappUrl && (
            <Section
              title="WhatsApp group"
              description="Quick chat with the coaches and other parents/players in this series."
            >
              <a
                href={series.whatsappUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 rounded-[var(--radius-md)] bg-[#25D366] px-4 py-2.5 text-sm font-semibold text-white shadow-[var(--shadow-sm)] transition-transform hover:-translate-y-0.5"
              >
                Join the group chat →
              </a>
              <p className="mt-2 text-xs text-[var(--muted-foreground)] break-all">
                {series.whatsappUrl}
              </p>
            </Section>
          )}

          <Section
            title="What it costs"
            description={
              series.classType === "event"
                ? "Price for the next upcoming date. You sign up for one occurrence at a time."
                : series.classType === "camp"
                  ? "Camp option pricing. Pick week/drop-in + member status in the enrollment panel for the exact total."
                : "Sticker price for the full series. We prorate automatically if it's already started — see your total in the panel."
            }
          >
            {series.pricePerSeries == null ? (
              <p className="text-sm text-[var(--muted-foreground)]">
                Contact the office for pricing on this series.
              </p>
            ) : showMemberPair ? (
              <div className="elev-card p-5 sm:p-6">
                <div className="space-y-1">
                  <div className="flex items-baseline gap-2">
                    <span className="font-display text-3xl font-medium tracking-tight tabular sm:text-4xl">
                      €{memberPrice!.toFixed(0)}
                    </span>
                    <span className="text-sm font-medium text-[var(--foreground)]">
                      Member
                    </span>
                    <span className="text-sm text-[var(--muted-foreground)]">
                      / series
                    </span>
                  </div>
                  <p className="tabular text-sm text-[var(--muted-foreground)]">
                    Non-members{" "}
                    <span className="font-medium text-[var(--foreground)]">
                      €{nonMemberPrice!.toFixed(0)}
                    </span>
                    / series
                  </p>
                </div>
                {!isCamp &&
                  series.classType !== "event" &&
                  pricePerSession != null && (
                  <p className="mt-3 text-sm text-[var(--muted-foreground)]">
                    Equivalent to{" "}
                    <span className="text-[var(--foreground)] tabular">
                      €{pricePerSession.toFixed(2)}
                    </span>{" "}
                    / session × {series.sessions.length} session
                    {series.sessions.length === 1 ? "" : "s"}.
                  </p>
                )}
              </div>
            ) : (
              <div className="elev-card p-5 sm:p-6">
                <div className="flex items-baseline gap-2">
                  <span className="font-display text-3xl font-medium tracking-tight tabular sm:text-4xl">
                    €{series.pricePerSeries.toFixed(0)}
                  </span>
                  <span className="text-sm text-[var(--muted-foreground)]">
                    {series.classType === "event" ? "/ event" : "/ series"}
                  </span>
                </div>
                {!isCamp &&
                  series.classType !== "event" &&
                  pricePerSession != null && (
                  <p className="mt-2 text-sm text-[var(--muted-foreground)]">
                    Equivalent to{" "}
                    <span className="text-[var(--foreground)] tabular">
                      €{pricePerSession.toFixed(2)}
                    </span>{" "}
                    / session × {series.sessions.length} session
                    {series.sessions.length === 1 ? "" : "s"}.
                  </p>
                )}
              </div>
            )}
          </Section>

          <Section
            title="Schedule"
            description={
              isEvent
                ? "Next upcoming date you can sign up for."
                : "Every session in this series. Past sessions are crossed out — you'll only be billed for what's still ahead of you."
            }
          >
            {isEvent ? (
              series.nextEventOccurrence ? (
                <div className="elev-card px-5 py-4">
                  <p className="tabular text-sm font-medium">
                    {formatOccurrenceDateTime(series.nextEventOccurrence.startsAt)}
                  </p>
                  <p className="mt-1 text-xs text-[var(--muted-foreground)]">
                    {series.venueName}
                  </p>
                </div>
              ) : (
                <p className="text-sm text-[var(--muted-foreground)]">
                  No upcoming dates — check back later or contact the office.
                </p>
              )
            ) : series.sessions.length === 0 ? (
              <p className="text-sm text-[var(--muted-foreground)]">
                No sessions generated yet — the office is finalising the
                calendar.
              </p>
            ) : (
              <ul className="elev-card divide-y divide-[var(--border)]">
                {series.sessions.map((s, i) => {
                  const isPast = s.startsAt.getTime() <= now.getTime();
                  return (
                    <li
                      key={s.id}
                      className={cn(
                        "flex items-center justify-between gap-3 px-5 py-3",
                        isPast && "opacity-60",
                      )}
                    >
                      <div className="flex items-center gap-2 tabular text-sm font-medium">
                        <span className="text-[var(--muted-foreground)]">
                          #{i + 1}
                        </span>{" "}
                        <span className={cn(isPast && "line-through")}>
                          {formatSessionDate(s.startsAt)}
                        </span>
                        {isPast && (
                          <Badge variant="outline" className="text-[10px]">
                            Past
                          </Badge>
                        )}
                      </div>
                      <div
                        className={cn(
                          "tabular text-xs text-[var(--muted-foreground)]",
                          isPast && "line-through",
                        )}
                      >
                        {formatSessionTime(s.startsAt)}–
                        {formatSessionTime(s.endsAt)}
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </Section>
        </div>

        {/* Right: enrollment — sticks to the top so the parent can scan
            the schedule without losing the price summary. */}
        <aside className="space-y-4 self-start lg:sticky lg:top-24">
          <EnrollPanel
            brandName={brand.shortName}
            privateLessonLabel={terms.privateLesson.singular}
            seriesId={series.id}
            seriesName={series.name}
            slotsLeft={Math.max(series.maxStudents - series.enrolledCount, 0)}
            maxStudents={series.maxStudents}
            isFull={series.isFull}
            waitlistEnabled={series.waitlistEnabled}
            waitlistedCount={series.waitlistedCount}
            enrollmentOpenNow={series.enrollmentOpenNow}
            opensAt={series.enrollmentOpensAt}
            closesAt={series.enrollmentClosesAt}
            pricePerSeries={series.pricePerSeries}
            isEvent={series.classType === "event"}
            isCamp={series.classType === "camp"}
            campOptions={series.campOptions}
            nextEventOccurrenceLabel={
              series.nextEventOccurrence
                ? formatOccurrenceDateTime(series.nextEventOccurrence.startsAt)
                : null
            }
            sessionStartsAtIso={
              series.nextEventOccurrence
                ? [series.nextEventOccurrence.startsAt.toISOString()]
                : series.sessions.map((s) => s.startsAt.toISOString())
            }
            venueClubSlug={series.venueClubSlug}
            isReturningHousehold={isReturning}
            householdCreditCents={householdCreditCents}
            showTrialCta={showTrialCta}
            classLabel={terms.class.singular}
            groups={series.groups.map<EnrollGroup>((g) => ({
              id: g.id,
              name: g.name,
              minAge: g.minAge,
              maxAge: g.maxAge,
              endTimeHHMM: g.endTimeHHMM,
              slotsLeft: Math.max(g.maxStudents - g.enrolledCount, 0),
              isFull: g.enrolledCount >= g.maxStudents,
            }))}
            candidates={enrollCandidates.map<EnrollCandidate>((c) => {
              const ageBracket = ageBracketFromAge(c.age);
              const hasActiveMembership =
                series.venueClubSlug != null &&
                coverage.has(c.personId, series.venueClubSlug);
              return {
                personId: c.personId,
                displayName: c.displayName,
                relation: c.relation,
                age: c.age,
                ageBracket,
                hasActiveMembership,
                existing: existingByPersonId.get(c.personId) ?? null,
                ageOk:
                  c.age == null
                    ? true
                    : ageIncludesYears({
                        minAge: series.minAge,
                        maxAge: series.maxAge,
                        age: c.age,
                      }),
              };
            })}
          />
        </aside>
      </div>
    </div>
  );
}

interface CandidateRow {
  personId: string;
  displayName: string;
  relation: "you" | "child";
  age: number | null;
}

async function getEnrollCandidates(
  viewerPersonId: string,
  householdId: string | null,
): Promise<CandidateRow[]> {
  const viewer = await prisma.person.findUnique({
    where: { id: viewerPersonId },
    select: {
      firstName: true,
      lastName: true,
      dateOfBirth: true,
    },
  });
  const out: CandidateRow[] = [];
  if (viewer) {
    out.push({
      personId: viewerPersonId,
      displayName:
        `${viewer.firstName} ${viewer.lastName}`.trim() || "You",
      relation: "you",
      age: ageFromDob(viewer.dateOfBirth),
    });
  }
  if (householdId) {
    const children = await prisma.householdMember.findMany({
      where: { householdId, roleInHousehold: "child" },
      include: {
        person: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            dateOfBirth: true,
          },
        },
      },
    });
    for (const c of children) {
      out.push({
        personId: c.person.id,
        displayName:
          `${c.person.firstName} ${c.person.lastName}`.trim() ||
          "Your child",
        relation: "child",
        age: ageFromDob(c.person.dateOfBirth),
      });
    }
  }
  return out;
}

function Term({ children }: { children: React.ReactNode }) {
  return (
    <dt className="text-sm font-medium text-[var(--foreground)]/70 sm:pt-1">
      {children}
    </dt>
  );
}
function Detail({ children }: { children: React.ReactNode }) {
  return <dd className="text-sm text-[var(--foreground)]">{children}</dd>;
}

function formatDow(d: string | null): string {
  switch (d) {
    case "mon":
      return "Monday";
    case "tue":
      return "Tuesday";
    case "wed":
      return "Wednesday";
    case "thu":
      return "Thursday";
    case "fri":
      return "Friday";
    case "sat":
      return "Saturday";
    case "sun":
      return "Sunday";
    default:
      return "—";
  }
}

function formatDateRange(a: Date, b: Date): string {
  const fmt = new Intl.DateTimeFormat("en-NL", {
    timeZone: "Europe/Amsterdam",
    month: "short",
    day: "numeric",
  });
  return `${fmt.format(a)} → ${fmt.format(b)}`;
}

function formatSessionDate(d: Date): string {
  return new Intl.DateTimeFormat("en-NL", {
    timeZone: "Europe/Amsterdam",
    weekday: "short",
    month: "short",
    day: "numeric",
  }).format(d);
}
function formatSessionTime(d: Date): string {
  return new Intl.DateTimeFormat("en-NL", {
    timeZone: "Europe/Amsterdam",
    hour: "2-digit",
    minute: "2-digit",
  }).format(d);
}

function ageFromDob(dob: Date | null): number | null {
  if (!dob) return null;
  const now = new Date();
  let age = now.getFullYear() - dob.getFullYear();
  const m = now.getMonth() - dob.getMonth();
  if (m < 0 || (m === 0 && now.getDate() < dob.getDate())) age--;
  return age;
}
