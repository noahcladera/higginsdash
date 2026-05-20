import { redirect } from "next/navigation";
import Link from "next/link";
import { requireMember } from "@/lib/auth/require-member";
import { prisma } from "@/lib/prisma";
import { Badge } from "@/components/ui/badge";
import { PageHeader } from "@/components/ui/page-header";
import { Section } from "@/components/ui/section";
import { EmptyState } from "@/components/ui/empty-state";
import { Button } from "@/components/ui/button";
import { ClassIcon } from "@/components/icons";
import { formatSkillLevel } from "@/lib/skill-levels";
import { getUpcomingSessionsForStudents } from "@/lib/portal/queries";
import {
  computeClassTiming,
  formatTimingLine,
  deliveryModeLabel,
} from "@/lib/classes/timing";
import { cn } from "@/lib/utils";
import { WithdrawButton } from "./_withdraw-button";
import { SkipSessionButton } from "./_skip-session-button";
import { getCurrentOrg } from "@/lib/tenant";
import { householdHasLiveEnrollment } from "@/lib/portal/trial-eligibility";

/**
 * Member "My classes" page — covers both the adult-student view and
 * the parent-of-children view in a single place.
 *
 *   - Each Student row in the household gets its own card stack:
 *     active enrollments, status badge, Withdraw button.
 *   - Upcoming sessions roll up across the whole household so a parent
 *     sees Mia's Tuesday and their own Wednesday in one list.
 *   - The page renders even for parents who are NOT themselves
 *     students (skill chip is hidden in that case).
 */
/**
 * Loose UUID v1–v5 shape check. Used to defend the post-checkout
 * banner lookups against arbitrary `?series=`/`?payment=` values
 * without paying for a Prisma round-trip on garbage input.
 */
const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function firstString(v: string | string[] | undefined): string | null {
  if (Array.isArray(v)) return v[0] ?? null;
  return v ?? null;
}

export default async function PortalClassesPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const org = await getCurrentOrg();
  const t = org.terms;
  const sp = (await searchParams) ?? {};
  const enrolledFlag = firstString(sp.enrolled);
  const enrolledSeriesId = firstString(sp.series);
  const enrolledStudentRaw = firstString(sp.student);
  const enrolledPaymentId = firstString(sp.payment);
  const waitlistFlag = firstString(sp.waitlist);

  // Only fetch the series name when the URL really claims a fresh
  // enrollment AND the id parses as a uuid. Garbage `?series=foo`
  // falls through to a silent skip (banner just doesn't render).
  let enrollmentBanner: {
    seriesName: string;
    clubName: string | null;
    studentName: string;
    paymentId: string | null;
    waitlist: boolean;
  } | null = null;
  if (
    enrolledFlag === "1" &&
    enrolledSeriesId &&
    UUID_RE.test(enrolledSeriesId)
  ) {
    const series = await prisma.classSeries.findUnique({
      where: { id: enrolledSeriesId },
      select: {
        name: true,
        club: { select: { name: true } },
      },
    });
    if (series) {
      const studentName =
        enrolledStudentRaw && enrolledStudentRaw.trim().length > 0
          ? enrolledStudentRaw.slice(0, 60)
          : "You";
      enrollmentBanner = {
        seriesName: series.name,
        clubName: series.club?.name ?? null,
        studentName,
        paymentId:
          enrolledPaymentId && UUID_RE.test(enrolledPaymentId)
            ? enrolledPaymentId
            : null,
        waitlist: waitlistFlag === "1",
      };
    }
  }

  const { person, householdId } = await requireMember();
  const hasLiveEnrollment = await householdHasLiveEnrollment({
    personId: person.id,
    householdId,
  });
  const showTrialCta = org.features.trialInterest && !hasLiveEnrollment;

  // Build the set of student person IDs the viewer can see: themselves
  // (if a student) + every child in the household. If neither, send
  // them home.
  const enrollableSelf = !!person.student;
  const childMembers = householdId
    ? await prisma.householdMember.findMany({
        where: { householdId, roleInHousehold: "child" },
        include: {
          person: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              student: { select: { personId: true } },
            },
          },
        },
      })
    : [];
  const studentChildren = childMembers.filter((c) => !!c.person.student);

  if (!enrollableSelf && studentChildren.length === 0) {
    redirect("/portal");
  }

  const studentIds: string[] = [];
  if (enrollableSelf) studentIds.push(person.id);
  for (const c of studentChildren) studentIds.push(c.person.id);

  const [enrollments, upcoming, recentPast, viewerStudent] = await Promise.all([
    prisma.enrollment.findMany({
      where: {
        studentPersonId: { in: studentIds },
        status: { in: ["active", "pending_payment", "waitlist"] },
      },
      include: {
        classSeries: {
          include: {
            program: { select: { name: true, slug: true } },
            club: { select: { name: true } },
            venue: { select: { name: true } },
          },
        },
        student: {
          include: {
            person: { select: { firstName: true, lastName: true } },
          },
        },
      },
      orderBy: { enrolledOn: "desc" },
    }),
    getUpcomingSessionsForStudents(studentIds, 12),
    enrollableSelf
      ? prisma.attendance.findMany({
          where: { studentPersonId: person.id },
          include: {
            classSession: {
              include: {
                classSeries: {
                  select: {
                    name: true,
                    program: { select: { name: true } },
                  },
                },
              },
            },
          },
          orderBy: { recordedAt: "desc" },
          take: 6,
        })
      : Promise.resolve([] as []),
    enrollableSelf
      ? prisma.student.findUnique({
          where: { personId: person.id },
          select: { skillLevel: true },
        })
      : Promise.resolve(null),
  ]);

  const enrollmentsByStudent = groupBy(
    enrollments,
    (e) => e.studentPersonId,
  );

  return (
    <div className="space-y-10">
      <PageHeader
        kicker={t.class.plural}
        title={
          enrollableSelf
            ? "Your training"
            : `Your ${t.household.singular.toLowerCase()}'s ${t.class.plural.toLowerCase()}`
        }
        description={
          enrollableSelf
            ? `Your ${t.level.singular.toLowerCase()}, what you're ${t.enrollVerb.toLowerCase()}ed in, and what's coming up.`
            : `What your ${t.household.singular.toLowerCase()} is signed up for, plus a way to withdraw if plans change.`
        }
        actions={
          <Button asChild tone="triaz" variant="outline">
            <Link href="/portal/programs">Find more lessons</Link>
          </Button>
        }
      />

      {enrollmentBanner && <EnrollmentSuccessBanner {...enrollmentBanner} />}

      {enrollableSelf && (
        <div className="flex flex-wrap items-center gap-3 rounded-[var(--radius-lg)] bg-[var(--surface)] px-5 py-4 shadow-[var(--shadow-sm)]">
          <span className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[var(--muted-foreground)]">
            Your level
          </span>
          <Badge tone="triaz" variant="solid" className="text-sm">
            {formatSkillLevel(viewerStudent?.skillLevel)}
          </Badge>
          <span className="text-xs text-[var(--muted-foreground)]">
            Coaches keep this up to date — chat to them if you think it should change.
          </span>
        </div>
      )}

      {/* Per-student enrollment columns */}
      {studentIds.map((sid) => {
        const isViewer = sid === person.id;
        const fallbackName = isViewer
          ? "You"
          : (() => {
              const c = studentChildren.find((sc) => sc.person.id === sid);
              return (
                `${c?.person.firstName ?? ""} ${c?.person.lastName ?? ""}`.trim() ||
                "Your child"
              );
            })();

        const rows = enrollmentsByStudent.get(sid) ?? [];
        return (
          <Section
            key={sid}
            title={
              isViewer
                ? "Your enrollments"
                : `${fallbackName}'s enrollments`
            }
            description={
              rows.length === 0
                ? "Nothing on the list yet."
                : `${rows.length} active series`
            }
          >
            {rows.length === 0 ? (
              <EmptyState
                icon={<ClassIcon size={20} />}
                title="No enrollments yet"
                description={
                  isViewer
                    ? "Browse lessons to find one that fits."
                    : `Browse lessons to sign ${fallbackName} up.`
                }
                action={
                  <div className="flex flex-wrap items-center gap-2">
                    <Button asChild tone="triaz" size="sm">
                      <Link href="/portal/programs">Browse lessons</Link>
                    </Button>
                    {showTrialCta && (
                      <Button asChild size="sm" variant="outline">
                        <Link href="/portal/request-trial">Request a trial</Link>
                      </Button>
                    )}
                  </div>
                }
              />
            ) : (
              <div className="grid gap-3 sm:grid-cols-2">
                {rows.map((e) => (
                  <article
                    key={e.id}
                    className="flex flex-col gap-3 rounded-[var(--radius-lg)] bg-[var(--surface)] p-5 shadow-[var(--shadow-sm)]"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="space-y-1.5">
                        <Badge
                          tone={
                            e.status === "active"
                              ? "success"
                              : e.status === "waitlist"
                                ? "warning"
                                : "neutral"
                          }
                          className="capitalize"
                        >
                          {e.status.replace("_", " ")}
                        </Badge>
                        <h3 className="font-display text-lg font-medium tracking-tight">
                          <Link
                            href={`/portal/programs/${e.classSeries.program.slug}/${e.classSeries.id}`}
                            className="hover:underline underline-offset-4"
                          >
                            {e.classSeries.name}
                          </Link>
                        </h3>
                        <p className="text-xs text-[var(--muted-foreground)]">
                          {e.classSeries.program.name}
                          {e.classSeries.venue
                            ? ` · ${e.classSeries.venue.name}`
                            : e.classSeries.club
                              ? ` · ${e.classSeries.club.name}`
                              : ""}
                        </p>
                      </div>
                    </div>
                    <div className="mt-auto flex items-center justify-end gap-2 pt-2 border-t border-[var(--border)]">
                      {e.status !== "waitlist" && (
                        <Button asChild size="sm" variant="ghost" tone="neutral">
                          <Link href={`/portal/classes/${e.id}/transfer`}>
                            Request transfer
                          </Link>
                        </Button>
                      )}
                      <WithdrawButton
                        enrollmentId={e.id}
                        studentName={fallbackName}
                      />
                    </div>
                  </article>
                ))}
              </div>
            )}
          </Section>
        );
      })}

      <Section
        title="Upcoming sessions"
        description={
          upcoming.length === 0
            ? "Nothing scheduled yet."
            : "Your next sessions, in order."
        }
      >
        {upcoming.length === 0 ? (
          <EmptyState
            icon={<ClassIcon size={20} />}
            title="No sessions scheduled"
            description="They'll appear here once enrollment is confirmed."
          />
        ) : (
          <ul className="rounded-[var(--radius-lg)] bg-[var(--surface)] shadow-[var(--shadow-sm)] divide-y divide-[var(--border)]">
            {upcoming.map((s, i) => {
              const timing = computeClassTiming({
                session: { startsAt: s.startsAt, endsAt: s.endsAt },
                series: {
                  deliveryMode: s.deliveryMode,
                  pickupAt: s.pickupAt,
                },
                school:
                  s.schoolCoachArriveAtHubMinutes != null
                    ? {
                        coachArriveAtHubMinutes:
                          s.schoolCoachArriveAtHubMinutes,
                      }
                    : null,
              });
              const headlineTime =
                s.deliveryMode === "pickup" && timing.pickupAt
                  ? timing.pickupAt
                  : s.startsAt;
              const venueLine =
                s.deliveryMode === "pickup" && s.schoolName
                  ? `${s.schoolName} → ${s.venueName}`
                  : s.venueName;
              const modeTone =
                s.deliveryMode === "pickup"
                  ? "joint"
                  : s.deliveryMode === "onsite"
                    ? "warning"
                    : "triaz";
              return (
                <li
                  key={`${s.id}-${i}`}
                  className="flex items-center gap-4 px-5 py-4"
                >
                  <div className="w-20 shrink-0">
                    <div className="tabular text-xs font-medium uppercase tracking-[0.14em] text-[var(--muted-foreground)]">
                      {formatShort(s.startsAt)}
                    </div>
                    <div className="tabular font-display text-lg font-medium">
                      {formatTime(headlineTime)}
                    </div>
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-medium">
                      {s.studentFirstName ? `${s.studentFirstName} · ` : ""}
                      {s.seriesName}
                    </div>
                    <div className="tabular truncate text-xs text-[var(--muted-foreground)]">
                      {formatTimingLine(timing, s.deliveryMode)}
                    </div>
                    <div className="truncate text-xs text-[var(--muted-foreground)]">
                      {s.programName} · {venueLine}
                      {s.courtName ? ` · ${s.courtName}` : ""}
                    </div>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <Badge tone={modeTone} variant="soft">
                      {deliveryModeLabel(s.deliveryMode)}
                    </Badge>
                    <SkipSessionButton
                      sessionId={s.id}
                      studentPersonId={s.studentPersonId}
                      studentLabel={
                        s.studentPersonId === person.id
                          ? "you"
                          : s.studentFirstName
                      }
                      alreadySkipping={s.isPlannedAbsence}
                    />
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </Section>

      {recentPast.length > 0 && (
        <Section title="Recent attendance" description="Last six sessions.">
          <ul className="rounded-[var(--radius-lg)] bg-[var(--surface)] shadow-[var(--shadow-sm)] divide-y divide-[var(--border)]">
            {recentPast.map((a) => (
              <li
                key={a.id}
                className="flex items-baseline justify-between gap-3 px-5 py-4"
              >
                <div className="min-w-0">
                  <div className="truncate text-sm font-medium">
                    {a.classSession.classSeries.name}
                  </div>
                  <div className="text-xs text-[var(--muted-foreground)]">
                    {formatDateTime(a.classSession.startsAt)}
                  </div>
                </div>
                <AttendanceBadge status={a.status} />
              </li>
            ))}
          </ul>
        </Section>
      )}

      <p className="text-xs text-[var(--muted-foreground)]">
        Need to skip just one session? Tap <em>Can&apos;t make it</em> on
        the row above and we&apos;ll let your coach know. Withdrawing
        cancels the whole series enrollment. (Booked a court you can&apos;t
        make? Cancel that under{" "}
        <Link
          href="/portal/bookings"
          className="underline-offset-4 hover:underline"
        >
          My bookings
        </Link>
        .)
      </p>
    </div>
  );
}

/**
 * Post-checkout celebratory banner. Rendered inline at the top of
 * /portal/classes when the enrollment panel (or the demo Mollie
 * landing) hands us `?enrolled=1&series=...&student=...&payment=...`.
 * Two variants:
 *   - Active enrollment ("See you on court", with a View receipt CTA
 *     when we have a paymentId).
 *   - Waitlist ("You are on the list", no receipt button — nothing has
 *     been billed yet).
 *
 * Styling deliberately matches the rest of the portal (no emojis, no
 * confetti). Calm and friendly.
 */
function EnrollmentSuccessBanner({
  seriesName,
  clubName,
  studentName,
  paymentId,
  waitlist,
}: {
  seriesName: string;
  clubName: string | null;
  studentName: string;
  paymentId: string | null;
  waitlist: boolean;
}) {
  const headline = waitlist ? "You are on the list" : "See you on court";
  const atClub = clubName ? ` at ${clubName}` : "";
  const body = waitlist
    ? `${studentName} is on the waitlist for ${seriesName}${atClub}. We will message you the moment a spot opens up.`
    : `${studentName} is enrolled in ${seriesName}${atClub}. We will email you the schedule reminders and any kit notes — see you there.`;
  return (
    <div className="rounded-[var(--radius-lg)] border border-[var(--triaz)]/40 bg-[var(--triaz-soft)] p-5 shadow-[var(--shadow-sm)]">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0 space-y-1.5">
          <Badge tone={waitlist ? "warning" : "success"} variant="solid">
            {waitlist ? "Waitlisted" : "Enrolled"}
          </Badge>
          <h2 className="font-display text-xl font-medium tracking-tight text-[var(--triaz-ink)]">
            {headline}
          </h2>
          <p className="max-w-prose text-sm text-[var(--foreground)]">
            {body}
          </p>
        </div>
        <div className="flex shrink-0 flex-wrap items-center gap-2">
          {!waitlist && paymentId && (
            <Button asChild tone="triaz" variant="solid" size="sm">
              <Link href={`/portal/payments?highlight=${paymentId}`}>
                View receipt
              </Link>
            </Button>
          )}
          <Button asChild variant="outline" size="sm">
            <Link href="/portal/programs">Browse more classes</Link>
          </Button>
        </div>
      </div>
    </div>
  );
}

function AttendanceBadge({ status }: { status: string }) {
  const tone =
    status === "present"
      ? "success"
      : status === "absent"
        ? "danger"
        : status === "late"
          ? "warning"
          : "neutral";
  return (
    <Badge tone={tone} className={cn("capitalize")}>
      {status}
    </Badge>
  );
}

function groupBy<T, K>(rows: T[], key: (t: T) => K): Map<K, T[]> {
  const out = new Map<K, T[]>();
  for (const r of rows) {
    const k = key(r);
    const arr = out.get(k);
    if (arr) arr.push(r);
    else out.set(k, [r]);
  }
  return out;
}

function formatDateTime(d: Date): string {
  return new Intl.DateTimeFormat("en-NL", {
    timeZone: "Europe/Amsterdam",
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(d);
}

function formatShort(d: Date): string {
  return new Intl.DateTimeFormat("en-NL", {
    timeZone: "Europe/Amsterdam",
    weekday: "short",
    day: "numeric",
  }).format(d);
}

function formatTime(d: Date): string {
  return new Intl.DateTimeFormat("en-NL", {
    timeZone: "Europe/Amsterdam",
    hour: "2-digit",
    minute: "2-digit",
  }).format(d);
}
