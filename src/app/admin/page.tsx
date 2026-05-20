import Link from "next/link";
import { requireAdmin } from "@/lib/auth/require-admin";
import { PageHeader } from "@/components/ui/page-header";
import { Section } from "@/components/ui/section";
import { MetricStrip, Stat } from "@/components/ui/stat";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ArrowRightIcon, InboxIcon } from "@/components/icons";
import { getCurrentOrg } from "@/lib/tenant";
import { getAdminDashboardData } from "./_dashboard/queries";
import { formatLongDate } from "./_dashboard/format";
import { NeedsAttentionStrip } from "./_dashboard/needs-attention-strip";
import { TodaysClasses } from "./_dashboard/todays-classes";
import { TodaysBookings } from "./_dashboard/todays-bookings";
import { UnreadInbox } from "./_dashboard/unread-inbox";
import { RecentSignups } from "./_dashboard/recent-signups";

/**
 * Admin home — focused on TODAY.
 *
 * The page is structured as a triage funnel: anything that needs an
 * admin decision lives at the top (needs-attention strip), then the
 * day's operational picture (classes, court bookings), then activity
 * (inbox, signups), and finally the catalog totals as a compact
 * footer for context. Empty queues and quiet days collapse out so the
 * page reflects what's actually happening.
 */
export default async function AdminDashboardPage() {
  const { user, person } = await requireAdmin();
  const org = await getCurrentOrg();
  const t = org.terms;
  const f = org.features;
  const data = await getAdminDashboardData(person.id);

  const lessonsToday = data.todaysBookings.filter(
    (b) => b.purpose === "coaching",
  ).length;
  const playToday = data.todaysBookings.length - lessonsToday;
  const onTodayCount = data.todaysClasses.length + data.todaysBookings.length;

  const subtitleParts = [
    formatLongDate(new Date()),
    onTodayCount === 0
      ? `Quiet day across the ${t.club.singular.toLowerCase()}.`
      : `${onTodayCount} thing${onTodayCount === 1 ? "" : "s"} on the books.`,
  ];

  return (
    <div className="space-y-8">
      <PageHeader
        kicker="Admin"
        title={`${greetingWord()}, ${person.firstName || "team"}.`}
        description={subtitleParts.join(" · ")}
        actions={
          <Button asChild variant="outline" tone="neutral">
            <Link href="/admin/inbox">
              <InboxIcon size={16} /> Inbox
              {data.unreadInboxTotal > 0 && (
                <Badge tone="warning" variant="soft" className="ml-1 px-2 py-0">
                  {data.unreadInboxTotal}
                </Badge>
              )}
            </Link>
          </Button>
        }
      />

      <NeedsAttentionStrip pending={data.pending} />

      <MetricStrip>
        <Stat
          label={`${t.class.plural} today`}
          value={data.todaysClasses.length || "—"}
          hint={
            data.todaysClasses.length === 0
              ? "Nothing scheduled"
              : data.todaysClasses.length === 1
                ? "session on the floor"
                : "sessions on the floor"
          }
          tone="triaz"
        />
        <Stat
          label={`${t.coach.plural} working`}
          value={data.coachesWorkingToday || "—"}
          hint={
            data.coachesWorkingToday === 0
              ? "No one on shift"
              : data.coachesWorkingToday === 1
                ? "person on shift"
                : "people on shift"
          }
          tone="joint"
        />
        <Stat
          label={`${t.court.singular} bookings`}
          value={data.todaysBookings.length || "—"}
          hint={
            data.todaysBookings.length === 0
              ? `Quiet ${t.court.plural.toLowerCase()}`
              : `${lessonsToday} coaching · ${playToday} personal`
          }
        />
        <Stat
          label="Unread inbox"
          value={data.unreadInboxTotal || "—"}
          hint={
            data.unreadInboxTotal === 0
              ? "All caught up"
              : data.unreadInboxTotal === 1
                ? "notification waiting"
                : "notifications waiting"
          }
          tone={data.unreadInboxTotal > 0 ? "warning" : "neutral"}
        />
      </MetricStrip>

      <Section
        title={`Today's ${t.class.plural.toLowerCase()}`}
        description={
          data.todaysClasses.length === 0
            ? "Nothing on the schedule."
            : `${data.todaysClasses.length} session${data.todaysClasses.length === 1 ? "" : "s"} across the ${t.program.singular.toLowerCase()}.`
        }
        action={
          <Button asChild variant="ghost" size="sm" tone="neutral">
            <Link href="/admin/classes">
              All {t.class.plural.toLowerCase()} <ArrowRightIcon size={14} />
            </Link>
          </Button>
        }
      >
        <TodaysClasses classes={data.todaysClasses} />
      </Section>

      <Section
        title={`Today on ${t.court.singular.toLowerCase()}`}
        description={
          data.todaysBookings.length === 0
            ? `No ${t.privateLesson.plural.toLowerCase()} or ${t.member.singular.toLowerCase()} play booked.`
            : `${lessonsToday} ${t.privateLesson.singular.toLowerCase()}${lessonsToday === 1 ? "" : "s"} · ${playToday} ${t.member.singular.toLowerCase()} booking${playToday === 1 ? "" : "s"}.`
        }
        action={
          <Button asChild variant="ghost" size="sm" tone="neutral">
            <Link href={`/admin/bookings?date=${data.todayLocal}`}>
              Booking calendar <ArrowRightIcon size={14} />
            </Link>
          </Button>
        }
      >
        <TodaysBookings
          bookings={data.todaysBookings}
          todayLocal={data.todayLocal}
          terms={t}
        />
      </Section>

      <div className="grid gap-6 lg:grid-cols-2">
        <Section
          title="Unread inbox"
          description={
            data.unreadInboxTotal === 0
              ? "Caught up."
              : `${data.unreadInboxTotal} unread`
          }
          action={
            <Button asChild variant="ghost" size="sm" tone="neutral">
              <Link href="/admin/inbox">
                Open <ArrowRightIcon size={14} />
              </Link>
            </Button>
          }
        >
          <UnreadInbox items={data.unreadInbox} />
        </Section>

        <Section
          title="New this week"
          description={
            data.recentSignups.length === 0
              ? "Nobody new in the last 7 days."
              : `${data.recentSignups.length} new ${data.recentSignups.length === 1 ? "person" : "people"} added.`
          }
          action={
            <Button asChild variant="ghost" size="sm" tone="neutral">
              <Link href="/admin/people">
                People <ArrowRightIcon size={14} />
              </Link>
            </Button>
          }
        >
          <RecentSignups signups={data.recentSignups} />
        </Section>
      </div>

      <Section
        title="Catalog snapshot"
        description={`Signed in as ${user.email}.`}
        surface="card"
      >
        <div className="grid grid-cols-2 gap-x-6 gap-y-5 sm:grid-cols-3 md:grid-cols-5 lg:grid-cols-10">
          <CompactStat label="People" value={data.totals.people} />
          {f.households && (
            <CompactStat label={t.household.plural} value={data.totals.households} />
          )}
          {f.students && (
            <CompactStat label={t.student.plural} value={data.totals.students} />
          )}
          {f.coaches && (
            <CompactStat label={t.coach.plural} value={data.totals.coaches} />
          )}
          <CompactStat label={t.club.plural} value={data.totals.clubs} />
          {f.courts && (
            <CompactStat label={t.court.plural} value={data.totals.courts} />
          )}
          {f.venues && (
            <CompactStat label={t.venue.plural} value={data.totals.venues} />
          )}
          {f.programs && (
            <CompactStat label={t.program.plural} value={data.totals.programs} />
          )}
          {f.classSeries && (
            <CompactStat label="Series" value={data.totals.classSeries} />
          )}
          {f.recurringBlocks && (
            <CompactStat label="Blocks" value={data.totals.blocks} />
          )}
        </div>
      </Section>
    </div>
  );
}

function CompactStat({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex flex-col gap-0.5">
      <div className="text-[10px] font-semibold uppercase tracking-[0.16em] text-[var(--muted-foreground)]">
        {label}
      </div>
      <div className="tabular font-display text-xl font-medium leading-none tracking-tight">
        {value}
      </div>
    </div>
  );
}

function greetingWord(): string {
  const h = new Intl.DateTimeFormat("en-NL", {
    timeZone: "Europe/Amsterdam",
    hour: "2-digit",
    hour12: false,
  }).format(new Date());
  const hour = parseInt(h, 10);
  if (Number.isNaN(hour)) return "Hello";
  if (hour < 6) return "Up early";
  if (hour < 12) return "Good morning";
  if (hour < 18) return "Good afternoon";
  return "Good evening";
}
