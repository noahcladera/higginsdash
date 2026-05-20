import Link from "next/link";
import { requireCoach } from "@/lib/auth/require-coach";
import { PageHeader } from "@/components/ui/page-header";
import { Section, SectionDivider } from "@/components/ui/section";
import { Stat, MetricStrip } from "@/components/ui/stat";
import { EmptyState } from "@/components/ui/empty-state";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ClockIcon } from "@/components/icons";
import { formatLocalDate } from "@/lib/booking/time";
import {
  COACH_COURT_RATE_PER_HOUR,
  formatEur,
} from "@/lib/invoicing/private-lesson-rates";
import { getCoachPrivateLessonHoursReport } from "@/lib/invoicing/coach-private-lesson-hours";
import { getCoachWorkHoursReport } from "@/lib/classes/coach-hours";
import { cn } from "@/lib/utils";
import { CoachHoursDateRangeFilterForm } from "./date-range-filter-form";
import { getCurrentBrand, getTerms } from "@/lib/tenant";

interface PageProps {
  searchParams: Promise<{ from?: string; to?: string }>;
}

export default async function CoachHoursPage({ searchParams }: PageProps) {
  const { person, kind } = await requireCoach();
  const [brand, terms] = await Promise.all([getCurrentBrand(), getTerms()]);
  const isZzpOnly = kind === "zzp";
  const sp = await searchParams;
  const lessonNoun = terms.privateLesson.singular.toLowerCase();
  const lessonNounPlural = terms.privateLesson.plural.toLowerCase();
  const courtNoun = terms.court.singular.toLowerCase();
  const classNounPlural = terms.class.plural.toLowerCase();
  const clubNoun = terms.club.singular.toLowerCase();

  const today = new Date();
  const defaultFrom = new Date(today.getFullYear(), today.getMonth(), 1);
  const defaultTo = new Date(today.getFullYear(), today.getMonth() + 1, 1);

  const from = sp.from ?? formatLocalDate(defaultFrom);
  const to = sp.to ?? formatLocalDate(defaultTo);

  const [work, privateLessons] = await Promise.all([
    isZzpOnly
      ? Promise.resolve(null)
      : getCoachWorkHoursReport({
          coachPersonId: person.id,
          startDate: from,
          endDate: to,
        }),
    getCoachPrivateLessonHoursReport({
      coachPersonId: person.id,
      startDate: from,
      endDate: to,
    }),
  ]);

  const presets = buildPresets(today);
  const activePreset = presets.find((p) => p.from === from && p.to === to);

  const maxWorkHours = work
    ? Math.max(1, ...work.rows.map((r) => r.hours))
    : 1;
  const maxPrivateHours = Math.max(
    1,
    ...privateLessons.rows.map((r) => r.hours),
  );

  const peakWorkWeek = work
    ? work.rows.reduce(
        (best, r) => (r.hours > (best?.hours ?? -1) ? r : best),
        work.rows[0],
      )
    : null;
  const peakPrivateWeek = privateLessons.rows.reduce(
    (best, r) => (r.hours > (best?.hours ?? -1) ? r : best),
    privateLessons.rows[0],
  );

  const showNetSummary =
    !!work &&
    work.totalPayEstimate > 0 &&
    privateLessons.estimatedCourtRentalEur > 0;
  const netEur = work
    ? Math.round(
        (work.totalPayEstimate - privateLessons.estimatedCourtRentalEur) * 100,
      ) / 100
    : 0;

  const workSessions = work
    ? work.rows.reduce((s, r) => s + r.sessionCount, 0)
    : 0;

  const description = isZzpOnly
    ? `From ${prettyDate(from)} through ${prettyDate(stepBack(to))}. ${capitalise(courtNoun)} time you booked for your own ${lessonNounPlural} — ${brand.shortName} invoices you monthly. Invoices are the source of truth for money.`
    : `From ${prettyDate(from)} through ${prettyDate(stepBack(to))}. Work hours are ${classNounPlural} you’re assigned to; ${lessonNounPlural} are ${courtNoun} time billed back to the ${clubNoun}. Invoices are the source of truth for money.`;

  return (
    <div className="space-y-10">
      <PageHeader
        kicker="Hours"
        title="Your hours"
        description={description}
      />

      <div className="flex flex-wrap items-center gap-2">
        {presets.map((p) => (
          <Link
            key={p.label}
            href={`/coach/hours?from=${p.from}&to=${p.to}`}
            className={cn(
              "rounded-full px-3.5 py-1.5 text-sm transition-colors",
              activePreset?.label === p.label
                ? "bg-[var(--card)] text-[var(--foreground)] shadow-[var(--shadow-sm)] font-medium"
                : "bg-[var(--surface)] text-[var(--muted-foreground)] hover:text-[var(--foreground)]",
            )}
          >
            {p.label}
          </Link>
        ))}

        <CoachHoursDateRangeFilterForm from={from} to={to} />
      </div>

      {work?.hasMissingRates && (
        <div className="fade-in rounded-[var(--radius-md)] bg-[var(--warning-soft)] px-4 py-3 text-sm text-[oklch(0.30_0.10_75)]">
          Some class sessions don’t have a pay rate on file yet — estimated pay
          may be low until an admin sets your default or per-series rate.
        </div>
      )}

      {work && (
      <Section
        title="Work hours"
        description={`Time on ${classNounPlural.replace(/es$/, "")} sessions you’re assigned to — this is what you invoice ${brand.shortName} for (estimated from your pay rate).`}
        surface="card"
      >
        <div className="mb-6 flex flex-wrap items-center gap-2">
          <Badge tone="triaz" variant="soft">
            Invoice {brand.shortName}
          </Badge>
        </div>

        <MetricStrip>
          <Stat
            label="Total"
            value={`${work.totalHours.toFixed(1)}h`}
            hint={`${workSessions} session${workSessions === 1 ? "" : "s"}`}
            tone="triaz"
          />
          <Stat
            label="Delivered"
            value={`${work.deliveredHours.toFixed(1)}h`}
            hint="completed sessions"
          />
          <Stat
            label="Upcoming"
            value={`${work.upcomingHours.toFixed(1)}h`}
            hint="scheduled / in progress"
            tone="joint"
          />
          <Stat
            label="Est. pay"
            value={
              work.totalPayEstimate > 0
                ? formatEur(work.totalPayEstimate)
                : "—"
            }
            hint="at your assigned rate"
          />
          <Stat
            label="Peak week"
            value={peakWorkWeek ? `${peakWorkWeek.hours.toFixed(1)}h` : "—"}
            hint={
              peakWorkWeek
                ? `week of ${prettyDate(peakWorkWeek.weekStart)}`
                : "no data"
            }
          />
        </MetricStrip>

        <div className="mt-8">
          <h3 className="mb-3 text-sm font-medium text-[var(--foreground)]">
            By the week
          </h3>
          {work.rows.length === 0 ? (
            <EmptyState
              icon={<ClockIcon size={20} />}
              title="No teaching hours"
              description="Nothing in this range. When you’re on a class lineup, sessions show up here."
            />
          ) : (
            <ul className="rounded-[var(--radius-lg)] bg-[var(--surface-strong)] p-2 shadow-[var(--shadow-sm)] sm:p-3">
              {work.rows.map((r) => {
                const widthPct = Math.max(4, (r.hours / maxWorkHours) * 100);
                return (
                  <li
                    key={r.weekStart}
                    className="flex items-center gap-4 rounded-[var(--radius-md)] px-3 py-2.5 transition-colors hover:bg-[var(--card)]"
                  >
                    <div className="w-36 shrink-0 text-xs">
                      <div className="font-medium">
                        {prettyDate(r.weekStart)}
                      </div>
                      <div className="tabular text-[var(--muted-foreground)]">
                        {r.sessionCount} session
                        {r.sessionCount === 1 ? "" : "s"}
                        {r.unrated && (
                          <span className="ml-1 text-[oklch(0.35_0.12_75)]">
                            · rate?
                          </span>
                        )}
                      </div>
                    </div>
                    <div
                      className="relative h-2.5 flex-1 overflow-hidden rounded-full bg-[var(--card)]"
                      aria-hidden
                    >
                      <div
                        className="absolute inset-y-0 left-0 rounded-full bg-[var(--triaz)] opacity-90"
                        style={{ width: `${widthPct}%` }}
                      />
                    </div>
                    <div className="w-24 shrink-0 text-right">
                      <div className="tabular font-display text-base font-medium tracking-tight">
                        {r.hours.toFixed(1)}h
                      </div>
                      {r.payEstimate > 0 && (
                        <div className="text-[11px] text-[var(--muted-foreground)]">
                          ~{formatEur(r.payEstimate)}
                        </div>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </Section>
      )}

      {!isZzpOnly && (
        <SectionDivider label={capitalise(lessonNounPlural)} />
      )}

      <Section
        title={`${capitalise(lessonNoun)} ${courtNoun} time`}
        description={`${capitalise(courtNoun)} bookings and recurring slots for your own ${lessonNounPlural} — ${brand.shortName} invoices you monthly for this ${courtNoun} usage (estimate below).`}
        surface="card"
      >
        <div className="mb-6 flex flex-wrap items-center gap-2">
          <Badge tone="joint" variant="soft">
            {brand.shortName} invoices you
          </Badge>
        </div>

        <MetricStrip>
          <Stat
            label="Total"
            value={`${privateLessons.totalHours.toFixed(1)}h`}
            hint={`${privateLessons.totalSessions} session${privateLessons.totalSessions === 1 ? "" : "s"}`}
            tone="joint"
          />
          <Stat
            label="Est. court rental"
            value={
              privateLessons.totalSessions > 0
                ? formatEur(privateLessons.estimatedCourtRentalEur)
                : "—"
            }
            hint="estimated from duration × your rate"
          />
          <Stat
            label="Your court rate"
            value={`€${privateLessons.ratePerHour.toFixed(0)}/h`}
            hint={
              privateLessons.isRateOverride
                ? "custom rate"
                : `default €${COACH_COURT_RATE_PER_HOUR}/h`
            }
          />
          <Stat
            label="Peak week"
            value={
              peakPrivateWeek
                ? `${peakPrivateWeek.hours.toFixed(1)}h`
                : "—"
            }
            hint={
              peakPrivateWeek
                ? `week of ${prettyDate(peakPrivateWeek.weekStart)}`
                : "no data"
            }
          />
        </MetricStrip>

        <p className="mt-4 text-xs text-[var(--muted-foreground)]">
          Official invoices are created by admin from Finance → Private lessons.
          Totals here can differ slightly if some slots were already invoiced.
        </p>

        <div className="mt-8">
          <h3 className="mb-3 text-sm font-medium text-[var(--foreground)]">
            By the week
          </h3>
          {privateLessons.rows.length === 0 ? (
            <EmptyState
              icon={<ClockIcon size={20} />}
              title="No private lesson court time"
              description="Nothing in this range. Book coaching slots or set up a recurring private-lesson block to see them here."
            />
          ) : (
            <ul className="rounded-[var(--radius-lg)] bg-[var(--surface-strong)] p-2 shadow-[var(--shadow-sm)] sm:p-3">
              {privateLessons.rows.map((r) => {
                const widthPct = Math.max(
                  4,
                  (r.hours / maxPrivateHours) * 100,
                );
                return (
                  <li
                    key={r.weekStart}
                    className="flex items-center gap-4 rounded-[var(--radius-md)] px-3 py-2.5 transition-colors hover:bg-[var(--card)]"
                  >
                    <div className="w-32 shrink-0 text-xs">
                      <div className="font-medium">
                        {prettyDate(r.weekStart)}
                      </div>
                      <div className="tabular text-[var(--muted-foreground)]">
                        {r.bookingCount} slot
                        {r.bookingCount === 1 ? "" : "s"}
                      </div>
                    </div>
                    <div
                      className="relative h-2.5 flex-1 overflow-hidden rounded-full bg-[var(--card)]"
                      aria-hidden
                    >
                      <div
                        className="absolute inset-y-0 left-0 rounded-full bg-[var(--joint)] opacity-90"
                        style={{ width: `${widthPct}%` }}
                      />
                    </div>
                    <div className="w-16 shrink-0 text-right font-display text-base font-medium tracking-tight tabular-nums">
                      {r.hours.toFixed(1)}h
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </Section>

      {showNetSummary && work && (
        <div className="rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--surface)] px-5 py-4 shadow-[var(--shadow-sm)]">
          <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[var(--muted-foreground)]">
            Net this period (estimates)
          </div>
          <p className="mt-1 font-display text-2xl font-medium tracking-tight tabular-nums">
            {formatEur(work.totalPayEstimate)}
            <span className="mx-2 text-[var(--muted-foreground)]">−</span>
            {formatEur(privateLessons.estimatedCourtRentalEur)}
            <span className="mx-2 text-[var(--muted-foreground)]">=</span>
            <span
              className={cn(
                netEur >= 0
                  ? "text-[var(--triaz-ink)]"
                  : "text-[var(--destructive)]",
              )}
            >
              {formatEur(netEur)}
            </span>
          </p>
          <p className="mt-2 text-xs text-[var(--muted-foreground)]">
            Estimated class pay minus estimated court rental. Not a formal
            payslip — use your invoices and payroll records for accounting.
          </p>
        </div>
      )}
    </div>
  );
}

function buildPresets(today: Date) {
  const ymd = (d: Date) => formatLocalDate(d);
  const startOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);
  const startOfNextMonth = new Date(
    today.getFullYear(),
    today.getMonth() + 1,
    1,
  );
  const startOfPrevMonth = new Date(
    today.getFullYear(),
    today.getMonth() - 1,
    1,
  );
  const startOfYear = new Date(today.getFullYear(), 0, 1);
  const startOfNextYear = new Date(today.getFullYear() + 1, 0, 1);
  const last30Start = new Date(today);
  last30Start.setDate(today.getDate() - 30);
  const tomorrow = new Date(today);
  tomorrow.setDate(today.getDate() + 1);

  return [
    { label: "This month", from: ymd(startOfMonth), to: ymd(startOfNextMonth) },
    {
      label: "Last month",
      from: ymd(startOfPrevMonth),
      to: ymd(startOfMonth),
    },
    {
      label: "Last 30 days",
      from: ymd(last30Start),
      to: ymd(tomorrow),
    },
    { label: "This year", from: ymd(startOfYear), to: ymd(startOfNextYear) },
  ];
}

function prettyDate(yyyyMmDd: string): string {
  const [y, m, d] = yyyyMmDd.split("-").map((s) => Number(s));
  if (!y || !m || !d) return yyyyMmDd;
  const dt = new Date(Date.UTC(y, m - 1, d));
  return new Intl.DateTimeFormat("en-NL", {
    timeZone: "UTC",
    day: "numeric",
    month: "short",
    year: dt.getUTCFullYear() === new Date().getFullYear()
      ? undefined
      : "numeric",
  }).format(dt);
}

function capitalise(s: string): string {
  return s.length === 0 ? s : s[0].toUpperCase() + s.slice(1);
}

function stepBack(yyyyMmDd: string): string {
  const [y, m, d] = yyyyMmDd.split("-").map((s) => Number(s));
  if (!y || !m || !d) return yyyyMmDd;
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() - 1);
  const yy = dt.getUTCFullYear();
  const mm = String(dt.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(dt.getUTCDate()).padStart(2, "0");
  return `${yy}-${mm}-${dd}`;
}
