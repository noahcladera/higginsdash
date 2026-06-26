import Link from "next/link";
import { headers } from "next/headers";
import { requireMember } from "@/lib/auth/require-member";
import { prisma } from "@/lib/prisma";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/ui/page-header";
import { Section } from "@/components/ui/section";
import { Stat, MetricStrip } from "@/components/ui/stat";
import { EmptyState } from "@/components/ui/empty-state";
import { Avatar } from "@/components/portal/avatar";
import {
  CalendarIcon,
  ArrowRightIcon,
  FamilyIcon,
} from "@/components/icons";
import {
  getUpcomingBookingsForPerson,
  getUpcomingSessionsForStudents,
  getMembershipsForHousehold,
  getHouseholdMembers,
  type MembershipDetail,
  type HouseholdMemberSummary,
} from "@/lib/portal/queries";
import { getRecommendationsForViewer } from "@/lib/portal/recommend-queries";
import { RecommendedPrograms } from "./_components/recommended-programs";
import { NonMemberHome } from "./_components/non-member-home";
import { ProfileIncompleteBanner } from "./_components/profile-incomplete-banner";
import { checkProfileCompleteness } from "@/lib/account/profile-completeness";
import { getHouseholdCreditBalanceCents } from "@/lib/credits/balance";
import { CreditStrip } from "@/components/credits/credit-strip";
import {
  getMemberCalendarEvents,
  type MemberCalendarStudent,
} from "@/lib/portal/calendar-queries";
import {
  daysOfWeek,
  formatWeekRange,
  mondayOfWeekUtc,
  resolveWeekStart,
  shiftWeeks,
  weekParamOf,
} from "@/lib/calendar/week";
import {
  MemberWeekGrid,
  type MemberCalendarLegendEntry,
} from "./_components/member-week-grid";
import { CalendarPagerTransition } from "./_components/calendar-pager-transition";
import { AddToCalendarDialog, type CalendarTokenSummary } from "@/components/calendar/add-to-calendar-dialog";
import { cn } from "@/lib/utils";
import { clubTheme } from "@/lib/club-theme";
import { getCurrentOrg } from "@/lib/tenant";
import { householdHasLiveEnrollment } from "@/lib/portal/trial-eligibility";
import { getMarketingImages } from "@/lib/uploads/marketing-images";

/**
 * Member portal landing — adapts to who you are.
 *
 * The page splits into two top-level renders:
 *
 *   - Non-member households (no active memberships) → {@link NonMemberHome},
 *     a high-conversion sales surface with hero, pricing anchors, club
 *     tiles, lesson teasers and an FAQ. Empty calendar grids are
 *     deliberately suppressed — they would only say "you have nothing".
 *   - Member households → the original calendar-driven layout extracted
 *     into {@link MemberHome} below: editorial hero, week nav, metric
 *     strip, week grid, household ribbon, active memberships.
 *
 * `?week=YYYY-MM-DD` snaps the calendar to that week's Monday (Europe/
 * Amsterdam). Upcoming-bookings & upcoming-sessions counts in the metric
 * strip stay "all time" so the header numbers don't whiplash as you page
 * through weeks.
 */
export default async function PortalHomePage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { person, householdId } = await requireMember();
  const org = await getCurrentOrg();
  const brand = org.brand;
  const sp = (await searchParams) ?? {};
  const hasLiveEnrollment = await householdHasLiveEnrollment({
    personId: person.id,
    householdId,
  });

  // Adults-only completeness check. Children inherit address from
  // their household and don't carry their own emergency contact, so
  // gating their parents' household-role rows on those fields would
  // produce noise rather than action.
  const personContact = await prisma.person.findUnique({
    where: { id: person.id },
    select: {
      firstName: true,
      lastName: true,
      phone: true,
      dateOfBirth: true,
      addressLine1: true,
      postalCode: true,
      city: true,
      country: true,
      emergencyContactName: true,
      emergencyContactPhone: true,
      emergencyContactRelationship: true,
      householdMember: { select: { roleInHousehold: true } },
    },
  });
  const isChild = personContact?.householdMember?.roleInHousehold === "child";
  const completeness =
    isChild || !personContact
      ? { complete: true, missing: [] as string[] }
      : checkProfileCompleteness(personContact);
  const rawWeek = typeof sp.week === "string" ? sp.week : undefined;
  const weekStart = resolveWeekStart(rawWeek);

  const householdMembers = await getHouseholdMembers(householdId);
  const childMembers = householdMembers.filter(
    (m) => m.role === "child" && m.isStudent,
  );
  const childPersonIds = childMembers.map((m) => m.personId);
  const isParent = childPersonIds.length > 0;
  const isStudent = !!person.student;

  const memberships = await getMembershipsForHousehold(householdId);
  const activeMemberships = memberships.filter((m) => m.status === "active");
  const hasAnyActive = activeMemberships.length > 0;

  const creditBalanceCents = householdId
    ? await getHouseholdCreditBalanceCents(householdId)
    : 0;

  // -----------------------------------------------------------------
  // Non-member: render the dedicated sales surface and short-circuit.
  // -----------------------------------------------------------------
  if (!hasAnyActive) {
    const [recs, clubs, marketingImages] = await Promise.all([
      getRecommendationsForViewer(person.id, householdId),
      prisma.club.findMany({
        where: { isActive: true },
        orderBy: [{ displayOrder: "asc" }, { name: "asc" }],
        select: { id: true, name: true, slug: true },
      }),
      getMarketingImages(),
    ]);
    const hasAnyChild = householdMembers.some((m) => m.role === "child");
    return (
      <div className="space-y-6">
        {!completeness.complete && (
          <ProfileIncompleteBanner missing={completeness.missing} />
        )}
        <CreditStrip balanceCents={creditBalanceCents} />
        <NonMemberHome
          firstName={person.firstName || null}
          isParent={isParent}
          hasAnyChild={hasAnyChild}
          clubs={clubs}
          recs={{ hero: recs.hero, more: recs.more }}
          brandName={brand.shortName}
          showTrialEntry={org.features.trialInterest && !hasLiveEnrollment}
          marketingImages={marketingImages}
        />
      </div>
    );
  }

  // -----------------------------------------------------------------
  // Member: load the calendar-heavy data used by MemberHome.
  // -----------------------------------------------------------------
  const studentIdsToShow = [
    ...(isStudent ? [person.id] : []),
    ...childPersonIds,
  ];

  const calendarStudents: MemberCalendarStudent[] = [];
  if (isStudent) {
    calendarStudents.push({
      personId: person.id,
      firstName: person.firstName || "You",
      colorIndex: 0,
    });
  }
  for (const c of childMembers) {
    calendarStudents.push({
      personId: c.personId,
      firstName: c.firstName || "Child",
      colorIndex: calendarStudents.length,
    });
  }

  const [upcomingBookings, upcomingSessions, weekEvents, recs, calendarTokens] =
    await Promise.all([
      getUpcomingBookingsForPerson(person.id, 6),
      getUpcomingSessionsForStudents(studentIdsToShow, 6),
      getMemberCalendarEvents(
        person.id,
        householdId,
        weekStart,
        calendarStudents,
      ),
      getRecommendationsForViewer(person.id, householdId),
      prisma.calendarFeedToken.findMany({
        where: { personId: person.id, revokedAt: null },
        select: { id: true, scope: true },
      }),
    ]);

  const h = await headers();
  const proto = h.get("x-forwarded-proto") ?? "https";
  const host = h.get("host") ?? "localhost:3000";
  const origin = `${proto}://${host}`;

  return (
    <div className="space-y-6">
      {!completeness.complete && (
        <ProfileIncompleteBanner missing={completeness.missing} />
      )}
      <CreditStrip balanceCents={creditBalanceCents} />
      <MemberHome
        person={{ id: person.id, firstName: person.firstName }}
        isParent={isParent}
        isStudent={isStudent}
        memberships={memberships}
        activeMemberships={activeMemberships}
        householdMembers={householdMembers}
        calendarStudents={calendarStudents}
        weekEvents={weekEvents}
        weekStart={weekStart}
        upcomingBookings={upcomingBookings}
        upcomingSessions={upcomingSessions}
        recs={recs}
        origin={origin}
        hasHousehold={householdId != null}
        calendarTokens={calendarTokens}
      />
    </div>
  );
}

// ===========================================================================
// MemberHome — the calendar-driven layout for households with coverage.
// ===========================================================================

async function MemberHome({
  person,
  isParent,
  isStudent,
  memberships,
  activeMemberships,
  householdMembers,
  calendarStudents,
  weekEvents,
  weekStart,
  upcomingBookings,
  upcomingSessions,
  recs,
  origin,
  hasHousehold,
  calendarTokens,
}: {
  person: { id: string; firstName: string | null };
  isParent: boolean;
  isStudent: boolean;
  memberships: MembershipDetail[];
  activeMemberships: MembershipDetail[];
  householdMembers: HouseholdMemberSummary[];
  calendarStudents: MemberCalendarStudent[];
  weekEvents: Awaited<ReturnType<typeof getMemberCalendarEvents>>;
  weekStart: Date;
  upcomingBookings: Awaited<ReturnType<typeof getUpcomingBookingsForPerson>>;
  upcomingSessions: Awaited<ReturnType<typeof getUpcomingSessionsForStudents>>;
  recs: Awaited<ReturnType<typeof getRecommendationsForViewer>>;
  origin: string;
  hasHousehold: boolean;
  calendarTokens: CalendarTokenSummary[];
}) {
  const days = daysOfWeek(weekStart);

  // Pull club rows once so the membership card surfaces the active
  // tenant's club name even after they've been renamed in /admin/clubs.
  // Filtered to slugs we actually need to render.
  const neededClubSlugs = Array.from(
    new Set(activeMemberships.flatMap((m) => m.clubSlugs)),
  );
  const clubRows = neededClubSlugs.length
    ? await prisma.club.findMany({
        where: { slug: { in: neededClubSlugs } },
        select: { slug: true, name: true },
      })
    : [];
  const clubsBySlug = new Map(clubRows.map((c) => [c.slug, c]));

  const expiringMembership = memberships.find(
    (m) =>
      m.status === "active" && m.daysUntilExpiry <= 30 && m.daysUntilExpiry >= 0,
  );
  const expiredMembership = memberships.find(
    (m) => m.status === "active" && m.daysUntilExpiry < 0,
  );
  const hasAnyActive = activeMemberships.length > 0;

  const greeting = `${greetingWord()}${person.firstName ? `, ${person.firstName}` : ""}.`;
  const subtitle = isParent
    ? "Here's what's coming up for your family."
    : isStudent
      ? "Here's your week. Court time and lessons in one place."
      : "Welcome back. Pick a court whenever you're ready to play.";

  const bookingsCount = upcomingBookings.length;
  const sessionsCount = upcomingSessions.length;
  const familySize = householdMembers.length;

  const thisWeekMonday = mondayOfWeekUtc(new Date());
  const isThisWeek = weekStart.getTime() === thisWeekMonday.getTime();
  const prevParam = weekParamOf(shiftWeeks(weekStart, -1));
  const nextParam = weekParamOf(shiftWeeks(weekStart, 1));
  const thisWeekParam = weekParamOf(thisWeekMonday);
  const weekParam = weekParamOf(weekStart);

  const ownersThisWeek = new Set(
    weekEvents.flatMap((e) => (e.kind === "session" ? [e.ownerPersonId] : [])),
  );
  const legend: MemberCalendarLegendEntry[] = calendarStudents
    .filter((s) => ownersThisWeek.has(s.personId))
    .map((s) => ({
      personId: s.personId,
      firstName: s.firstName,
      colorIndex: s.colorIndex,
    }));

  const sessionEventsCount = weekEvents.filter(
    (e) => e.kind === "session",
  ).length;
  const bookingEventsCount = weekEvents.filter(
    (e) => e.kind === "booking",
  ).length;

  const hasUpcomingActivity =
    bookingsCount > 0 || sessionsCount > 0 || weekEvents.length > 0;

  const calendarBlock = (
    <>
      <MetricStrip>
        <Stat
          label="Active memberships"
          value={activeMemberships.length || "—"}
          hint={
            hasAnyActive
              ? coverageHint(activeMemberships)
              : "Get one to start playing"
          }
          tone={hasAnyActive ? "triaz" : "neutral"}
        />
        <Stat
          label="Upcoming bookings"
          value={bookingsCount || "—"}
          hint={bookingsCount === 0 ? "Nothing booked yet" : "Court time held"}
        />
        <Stat
          label="Upcoming classes"
          value={sessionsCount || "—"}
          hint={
            !isParent && !isStudent
              ? "Not enrolled"
              : sessionsCount === 0
                ? "Quiet week ahead"
                : "Sessions on the books"
          }
        />
        <Stat
          label="In your household"
          value={familySize || "—"}
          hint={
            familySize === 0
              ? "Just you for now"
              : familySize === 1
                ? "Just you"
                : `You + ${familySize - 1} other${familySize - 1 === 1 ? "" : "s"}`
          }
          tone="joint"
        />
      </MetricStrip>

      {expiredMembership ? (
        <StatusBanner tone="danger">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <span>
              Your membership expired{" "}
              {Math.abs(expiredMembership.daysUntilExpiry)} day
              {Math.abs(expiredMembership.daysUntilExpiry) === 1 ? "" : "s"} ago.
              Renew online in a few clicks.
            </span>
            <Button asChild tone="triaz" size="sm">
              <Link href="/portal/membership#buy">
                Renew now <ArrowRightIcon size={14} />
              </Link>
            </Button>
          </div>
        </StatusBanner>
      ) : expiringMembership ? (
        <StatusBanner tone="warning">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <span>
              Your membership expires in {expiringMembership.daysUntilExpiry}{" "}
              day
              {expiringMembership.daysUntilExpiry === 1 ? "" : "s"}.
            </span>
            <Button asChild tone="triaz" size="sm" variant="outline">
              <Link href="/portal/membership#buy">
                Renew now <ArrowRightIcon size={14} />
              </Link>
            </Button>
          </div>
        </StatusBanner>
      ) : null}

      <Section
        title={formatWeekRange(weekStart)}
        description={
          weekEvents.length === 0
            ? isThisWeek
              ? "Nothing on the books this week."
              : "Nothing scheduled for this week."
            : [
                sessionEventsCount > 0
                  ? `${sessionEventsCount} class${sessionEventsCount === 1 ? "" : "es"}`
                  : null,
                bookingEventsCount > 0
                  ? `${bookingEventsCount} booking${bookingEventsCount === 1 ? "" : "s"}`
                  : null,
              ]
                .filter(Boolean)
                .join(" · ")
        }
        action={
          <div className="flex flex-wrap items-center gap-2">
            {(isParent || isStudent) && (
              <AddToCalendarDialog
                origin={origin}
                hasHousehold={hasHousehold}
                initialTokens={calendarTokens}
              />
            )}
            <Button asChild variant="ghost" tone="neutral" size="sm">
              <Link href="/portal/bookings">All bookings →</Link>
            </Button>
          </div>
        }
      >
        {weekEvents.length === 0 ? (
          <EmptyState
            icon={<CalendarIcon size={20} />}
            title="A wide-open week"
            description={
              isParent || isStudent
                ? "When a class or booking lands in this week, it'll show up here."
                : "Reserve a court whenever you'd like to play."
            }
            action={
              <Button asChild tone="triaz" size="sm">
                <Link href="/portal/book">Book a court</Link>
              </Button>
            }
          />
        ) : (
          <CalendarPagerTransition
            pagerKey={weekParam}
            compareKind="lex"
          >
            <MemberWeekGrid days={days} events={weekEvents} legend={legend} />
          </CalendarPagerTransition>
        )}
      </Section>
    </>
  );

  return (
    <div className="space-y-10">
      <PageHeader
        kicker="Members"
        title={greeting}
        description={subtitle}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex items-center gap-1">
              <Button asChild variant="outline" size="sm">
                <Link href={`/portal?week=${prevParam}`} className="group">
                  <span
                    aria-hidden
                    className="inline-block transition-transform duration-[var(--duration-fast)] ease-[var(--ease-out-soft)] group-hover:-translate-x-0.5"
                  >
                    ←
                  </span>{" "}
                  Prev
                </Link>
              </Button>
              {!isThisWeek && (
                <Button asChild variant="outline" size="sm">
                  <Link href={`/portal?week=${thisWeekParam}`}>This week</Link>
                </Button>
              )}
              <Button asChild variant="outline" size="sm">
                <Link href={`/portal?week=${nextParam}`} className="group">
                  Next{" "}
                  <span
                    aria-hidden
                    className="inline-block transition-transform duration-[var(--duration-fast)] ease-[var(--ease-out-soft)] group-hover:translate-x-0.5"
                  >
                    →
                  </span>
                </Link>
              </Button>
            </div>
            <Button asChild tone="triaz" size="lg">
              <Link href="/portal/book">
                <CalendarIcon /> Book a court
              </Link>
            </Button>
          </div>
        }
      />

      {hasUpcomingActivity ? (
        <>
          {calendarBlock}
          <RecommendedPrograms
            hero={recs.hero}
            more={recs.more}
            isParent={isParent}
          />
        </>
      ) : (
        <>
          <RecommendedPrograms
            hero={recs.hero}
            more={recs.more}
            isParent={isParent}
          />
          {calendarBlock}
        </>
      )}

      <div className="grid gap-8 lg:grid-cols-2">
        <Section title="Household" description="Everyone on your account.">
          {householdMembers.length === 0 ? (
            <p className="text-sm text-[var(--muted-foreground)]">
              Just you for now.
            </p>
          ) : (
            <div className="space-y-3">
              <div className="flex flex-wrap gap-2">
                {householdMembers.slice(0, 8).map((m) => (
                  <div
                    key={m.personId}
                    className="flex items-center gap-2 rounded-full bg-[var(--surface)] py-1.5 pl-1.5 pr-3"
                  >
                    <Avatar
                      name={`${m.firstName} ${m.lastName}`}
                      src={m.avatarUrl}
                      size="xs"
                    />
                    <span className="text-xs font-medium">{m.firstName}</span>
                    {m.role === "child" && (
                      <span className="text-[10px] uppercase tracking-wider text-[var(--muted-foreground)]">
                        kid
                      </span>
                    )}
                  </div>
                ))}
              </div>
              {isParent && (
                <Button asChild variant="ghost" size="sm" tone="neutral">
                  <Link href="/portal/family">
                    <FamilyIcon size={14} /> Manage family
                  </Link>
                </Button>
              )}
            </div>
          )}
        </Section>

        <Section title="Active memberships" description="What you can book.">
          <div className="space-y-2">
            {activeMemberships.slice(0, 4).map((m) => {
              const slug =
                m.clubSlugs.length === 2
                  ? "joint"
                  : (m.clubSlugs[0] ?? "triaz");
              const theme = clubTheme(slug);
              // Prefer the DB-stored club name when this membership covers
              // exactly one club so a tenant rename in /admin/clubs flows
              // straight to the dashboard. Joint coverage (and missing
              // names) fall back to the registry label.
              const clubName =
                m.clubSlugs.length === 1
                  ? clubsBySlug.get(m.clubSlugs[0])?.name ?? theme.label
                  : theme.label;
              return (
                <Link
                  key={m.id}
                  href="/portal/membership"
                  className={cn(
                    "block rounded-[var(--radius-md)] border-l-4 bg-[var(--surface)] px-4 py-3 transition-colors hover:bg-[var(--surface-strong)]",
                    theme.border,
                  )}
                >
                  <div className="flex items-baseline justify-between gap-2">
                    <div className="text-sm font-medium capitalize">
                      {m.coverageTier} · {clubName}
                    </div>
                    <div className="text-xs text-[var(--muted-foreground)]">
                      {m.daysUntilExpiry > 0
                        ? `${m.daysUntilExpiry}d left`
                        : "Expired"}
                    </div>
                  </div>
                </Link>
              );
            })}
            <Button asChild variant="ghost" size="sm" tone="neutral">
              <Link href="/portal/membership">View memberships →</Link>
            </Button>
          </div>
        </Section>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function StatusBanner({
  tone,
  children,
}: {
  tone: "neutral" | "warning" | "danger";
  children: React.ReactNode;
}) {
  return (
    <div
      className={cn(
        "fade-in rounded-[var(--radius-md)] px-5 py-4 text-sm",
        tone === "neutral" &&
          "bg-[var(--surface-strong)] text-[var(--foreground)]",
        tone === "warning" &&
          "bg-[var(--warning-soft)] text-[var(--warning-ink)]",
        tone === "danger" &&
          "bg-[var(--danger-soft)] text-[var(--destructive)]",
      )}
    >
      {children}
    </div>
  );
}

function coverageHint(
  active: Awaited<ReturnType<typeof getMembershipsForHousehold>>,
): string {
  const slugs = new Set<string>();
  for (const m of active) for (const s of m.clubSlugs) slugs.add(s);
  if (slugs.has("triaz") && slugs.has("randwijck")) return "Triaz + Randwijck";
  if (slugs.has("triaz")) return "Triaz only";
  if (slugs.has("randwijck")) return "Randwijck only";
  return "Active";
}

function greetingWord(): string {
  const h = new Date().getHours();
  if (h < 6) return "Up early";
  if (h < 12) return "Good morning";
  if (h < 18) return "Good afternoon";
  return "Good evening";
}
