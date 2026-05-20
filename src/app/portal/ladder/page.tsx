import Link from "next/link";

import { requireMember } from "@/lib/auth/require-member";
import { prisma } from "@/lib/prisma";
import { getLadderEligibility } from "@/lib/ladder/eligibility";
import {
  getActiveSeason,
  getLeaderboard,
  getMyEntry,
  getRecentMatches,
} from "@/lib/ladder/queries";
import {
  computeAwardsForMonth,
  persistAwardsIfPastMonth,
  type LadderAwardRow,
} from "@/lib/ladder/awards";

import { PageHeader } from "@/components/ui/page-header";
import { Section } from "@/components/ui/section";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import {
  TrophyIcon,
  MedalIcon,
  FlameIcon,
  StarIcon,
  PlusIcon,
} from "@/components/icons";
import { formatLocalDate } from "@/lib/booking/time";
import { cn } from "@/lib/utils";

import { LadderGate } from "./ladder-gate";
import { JoinLadderButton } from "./join-ladder-button";

export const dynamic = "force-dynamic";

export default async function PortalLadderPage() {
  const { person, householdId } = await requireMember();

  const eligibility = await getLadderEligibility({
    personId: person.id,
    householdId,
  });

  if (!eligibility.eligible) {
    const allClubs = await prisma.club.findMany({
      where: { isActive: true },
      orderBy: [{ displayOrder: "asc" }, { name: "asc" }],
      select: { id: true, name: true, slug: true },
    });
    return <LadderGate reason={eligibility.reason} allClubs={allClubs} />;
  }

  const season = await getActiveSeason();

  if (!season) {
    return (
      <div className="space-y-8">
        <PageHeader
          kicker="Ladder"
          title="Adult ladder"
          description="No season is open right now — check back soon."
        />
        <EmptyState
          icon={<TrophyIcon size={20} />}
          title="The ladder is between seasons"
          description="We start a new season every few months. You'll get an email when the next one opens."
        />
      </div>
    );
  }

  const [leaderboard, recent, myEntry] = await Promise.all([
    getLeaderboard(season.id),
    getRecentMatches({
      seasonId: season.id,
      status: ["played"],
      limit: 8,
    }),
    getMyEntry({ seasonId: season.id, personId: person.id }),
  ]);

  // Awards for the current month (live) + the previous month (frozen).
  const now = new Date();
  const prevMonth = new Date(now);
  prevMonth.setUTCMonth(prevMonth.getUTCMonth() - 1);
  const [thisMonthAwards, lastMonthAwards] = await Promise.all([
    computeAwardsForMonth({ seasonId: season.id, month: now }),
    computeAwardsForMonth({ seasonId: season.id, month: prevMonth }),
  ]);
  // Snapshot last month's awards so they freeze.
  await persistAwardsIfPastMonth({
    seasonId: season.id,
    month: prevMonth,
    rows: lastMonthAwards,
  });

  const podium = leaderboard.filter((r) => r.status === "active").slice(0, 3);
  const restOfBoard = leaderboard.slice(3);
  const myPosition = myEntry?.position ?? null;
  const isOnLadder = !!myEntry && myEntry.status === "active";
  const feeText =
    season.entryFeeCents > 0
      ? `€${(season.entryFeeCents / 100).toFixed(0)} entry`
      : "Free entry";

  return (
    <div className="space-y-12">
      <PageHeader
        kicker={`Ladder · ${season.name}`}
        title="Climb the rungs"
        description={
          isOnLadder
            ? `You're #${myPosition} on the ladder. Challenge anyone within ±${season.challengeRange} positions, or wait to be challenged.`
            : `Join the ${season.name} ladder. Adult Triaz members can play. ${feeText}.`
        }
        actions={
          isOnLadder ? (
            <>
              <Button asChild tone="triaz">
                <Link href="/portal/ladder/challenge">
                  <PlusIcon /> Challenge a player
                </Link>
              </Button>
              <Button asChild variant="outline" tone="neutral">
                <Link href="/portal/ladder/availability">My availability</Link>
              </Button>
            </>
          ) : (
            <JoinLadderButton
              feeCents={season.entryFeeCents}
              seasonName={season.name}
            />
          )
        }
      />

      {podium.length > 0 && <Podium rows={podium} myEntryId={myEntry?.id ?? null} />}

      <Section
        title="Leaderboard"
        description={
          leaderboard.length === 0
            ? "Be the first to join."
            : `${leaderboard.filter((r) => r.status === "active").length} active player${
                leaderboard.filter((r) => r.status === "active").length === 1 ? "" : "s"
              }${restOfBoard.length === 0 ? "" : ", scroll for the chasing pack"}`
        }
      >
        {leaderboard.length === 0 ? (
          <EmptyState
            icon={<TrophyIcon size={20} />}
            title="No one's on the ladder yet"
            description="Want to be #1 by default? Join now and lock in the top spot until someone challenges you."
            action={
              <JoinLadderButton
                feeCents={season.entryFeeCents}
                seasonName={season.name}
                small
              />
            }
          />
        ) : (
          <LeaderboardTable
            rows={restOfBoard.length === 0 ? leaderboard : restOfBoard}
            startPosition={restOfBoard.length === 0 ? 1 : 4}
            myEntryId={myEntry?.id ?? null}
          />
        )}
      </Section>

      <Section
        title="Awards this month"
        description={monthLabel(now)}
      >
        <AwardsRow rows={thisMonthAwards} kicker="In progress" />
      </Section>

      {lastMonthAwards.length > 0 && (
        <Section title="Awards last month" description={monthLabel(prevMonth)}>
          <AwardsRow rows={lastMonthAwards} kicker="Frozen" />
        </Section>
      )}

      <Section
        title="Recent matches"
        description={
          recent.length === 0
            ? "No matches played yet — go pick a fight."
            : "The latest results that closed out across the ladder."
        }
      >
        {recent.length === 0 ? (
          <p className="text-sm text-[var(--muted-foreground)]">
            Nothing to show yet.
          </p>
        ) : (
          <ul className="space-y-2">
            {recent.map((m) => (
              <li
                key={m.id}
                className="flex flex-wrap items-center justify-between gap-4 rounded-[var(--radius-md)] bg-[var(--surface)] px-4 py-3"
              >
                <div className="flex flex-1 flex-wrap items-baseline gap-x-3 gap-y-1">
                  <PositionChip position={m.challenger.position} />
                  <span
                    className={cn(
                      "font-medium",
                      m.winnerSide === "challenger" && "text-[var(--success)]",
                    )}
                  >
                    {m.challenger.firstName} {m.challenger.lastName}
                  </span>
                  <span className="text-[var(--muted-foreground)]">vs</span>
                  <span
                    className={cn(
                      "font-medium",
                      m.winnerSide === "opponent" && "text-[var(--success)]",
                    )}
                  >
                    {m.opponent.firstName} {m.opponent.lastName}
                  </span>
                  <PositionChip position={m.opponent.position} />
                </div>
                <div className="flex items-center gap-3 text-sm text-[var(--muted-foreground)]">
                  {m.scoreText && (
                    <span className="tabular text-[var(--foreground)]">
                      {m.scoreText}
                    </span>
                  )}
                  {m.swapped && (
                    <span className="rounded-full bg-[var(--triaz-soft)] px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-[var(--triaz-ink)]">
                      Upset · swap
                    </span>
                  )}
                  {m.scheduledAt && (
                    <span className="text-xs">
                      {formatLocalDate(m.scheduledAt)}
                    </span>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </Section>

      <Section title="How it works" description="Quick rules of the road.">
        <div className="grid gap-3 sm:grid-cols-2">
          <RuleCard
            title="Challenge close, climb fast"
            body={`You can challenge anyone within ±${season.challengeRange} positions of you. Beat someone above you and you swap spots.`}
          />
          <RuleCard
            title="Availability first"
            body="Set the windows you can usually play. We auto-suggest opponents and dates that match both calendars."
          />
          <RuleCard
            title="Auto-booked courts"
            body="Once the opponent accepts a slot we book the court for you both. Cancel via the normal booking flow if needed."
          />
          <RuleCard
            title="Confirm or dispute"
            body="The reporter enters the score; the other side confirms (or flags it). Disputes go to the office."
          />
        </div>
      </Section>
    </div>
  );
}

function Podium({
  rows,
  myEntryId,
}: {
  rows: Awaited<ReturnType<typeof getLeaderboard>>;
  myEntryId: string | null;
}) {
  // Render order: 2nd · 1st · 3rd so the tallest column sits in the middle.
  const ordered = [rows[1], rows[0], rows[2]].filter(Boolean) as typeof rows;
  return (
    <Section title="Top of the ladder" description="The current podium.">
      <div className="grid grid-cols-3 items-end gap-3 sm:gap-4">
        {ordered.map((r) => (
          <PodiumColumn
            key={r.entryId}
            row={r}
            isMine={r.entryId === myEntryId}
          />
        ))}
      </div>
    </Section>
  );
}

function PodiumColumn({
  row,
  isMine,
}: {
  row: Awaited<ReturnType<typeof getLeaderboard>>[number];
  isMine: boolean;
}) {
  const heights = { 1: "h-44 sm:h-56", 2: "h-32 sm:h-40", 3: "h-24 sm:h-32" } as const;
  const tone = row.position === 1
    ? { bg: "bg-[var(--triaz)]", text: "text-white", chip: "bg-white/20" }
    : row.position === 2
      ? { bg: "bg-[var(--randwijck)]", text: "text-white", chip: "bg-white/20" }
      : { bg: "bg-[var(--joint)]", text: "text-white", chip: "bg-white/20" };

  return (
    <div className="flex flex-col items-center gap-2">
      <div
        className={cn(
          "flex h-9 w-9 items-center justify-center rounded-full text-[var(--foreground)]",
          row.position === 1
            ? "bg-[var(--triaz-soft)]"
            : row.position === 2
              ? "bg-[var(--randwijck-soft)]"
              : "bg-[var(--joint-soft)]",
        )}
        aria-hidden
      >
        {row.position === 1 ? (
          <TrophyIcon size={18} />
        ) : (
          <MedalIcon size={18} />
        )}
      </div>
      <div className="text-center">
        <div className="font-display text-lg font-medium leading-tight">
          {row.person.firstName} {row.person.lastName}
        </div>
        <div className="text-xs text-[var(--muted-foreground)]">
          {row.wins}W · {row.losses}L
          {isMine && (
            <span className="ml-1 inline-flex items-center rounded-full bg-[var(--triaz-soft)] px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-[var(--triaz-ink)]">
              You
            </span>
          )}
        </div>
      </div>
      <div
        className={cn(
          "flex w-full items-end justify-center rounded-t-[var(--radius-lg)] shadow-[var(--shadow-sm)]",
          tone.bg,
          tone.text,
          heights[row.position as 1 | 2 | 3],
        )}
      >
        <div className="pb-3 text-center">
          <div className="font-display text-3xl font-medium leading-none sm:text-4xl">
            #{row.position}
          </div>
          <div
            className={cn(
              "mt-1 inline-block rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider",
              tone.chip,
            )}
          >
            {row.peakPosition < row.position
              ? `peak #${row.peakPosition}`
              : row.startPosition === row.position
                ? "Holding"
                : `↑ ${row.startPosition - row.position}`}
          </div>
        </div>
      </div>
    </div>
  );
}

function LeaderboardTable({
  rows,
  startPosition,
  myEntryId,
}: {
  rows: Awaited<ReturnType<typeof getLeaderboard>>;
  startPosition: number;
  myEntryId: string | null;
}) {
  return (
    <div className="overflow-hidden rounded-[var(--radius-lg)] bg-[var(--surface)] shadow-[var(--shadow-sm)]">
      <table className="w-full text-sm">
        <thead className="bg-[var(--surface-strong)] text-[10px] font-semibold uppercase tracking-[0.16em] text-[var(--muted-foreground)]">
          <tr>
            <th className="w-12 px-4 py-2 text-left">#</th>
            <th className="px-4 py-2 text-left">Player</th>
            <th className="hidden px-4 py-2 text-right sm:table-cell">W–L</th>
            <th className="hidden px-4 py-2 text-right sm:table-cell">
              Played
            </th>
            <th className="hidden px-4 py-2 text-right sm:table-cell">Trend</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => {
            const isMine = r.entryId === myEntryId;
            const showPos = startPosition === 1 ? r.position : startPosition + i;
            void showPos; // r.position is the source of truth — keep the var for clarity.
            return (
              <tr
                key={r.entryId}
                className={cn(
                  "border-t border-[var(--border)]",
                  isMine && "bg-[var(--triaz-soft)]/40",
                  r.status === "withdrawn" && "opacity-50",
                )}
              >
                <td className="px-4 py-2 font-medium tabular">{r.position}</td>
                <td className="px-4 py-2">
                  <div className="flex items-center gap-2">
                    <span>
                      {r.person.firstName} {r.person.lastName}
                    </span>
                    {isMine && (
                      <span className="inline-flex items-center rounded-full bg-[var(--triaz-soft)] px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-[var(--triaz-ink)]">
                        You
                      </span>
                    )}
                    {r.status === "withdrawn" && (
                      <span className="inline-flex items-center rounded-full bg-[var(--surface-strong)] px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-[var(--muted-foreground)]">
                        Withdrawn
                      </span>
                    )}
                  </div>
                </td>
                <td className="hidden px-4 py-2 text-right tabular sm:table-cell">
                  {r.wins}–{r.losses}
                </td>
                <td className="hidden px-4 py-2 text-right tabular sm:table-cell">
                  {r.matchesPlayed}
                </td>
                <td className="hidden px-4 py-2 text-right text-xs sm:table-cell">
                  {trendLabel(r.startPosition, r.position)}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function trendLabel(start: number, current: number): React.ReactNode {
  if (current < start)
    return (
      <span className="text-[var(--success)]">↑ {start - current}</span>
    );
  if (current > start)
    return (
      <span className="text-[var(--destructive)]">↓ {current - start}</span>
    );
  return <span className="text-[var(--muted-foreground)]">—</span>;
}

function PositionChip({ position }: { position: number }) {
  return (
    <span className="inline-flex h-5 min-w-[1.5rem] items-center justify-center rounded-full bg-[var(--surface-strong)] px-1.5 text-[10px] font-semibold tabular text-[var(--muted-foreground)]">
      #{position}
    </span>
  );
}

function AwardsRow({
  rows,
  kicker,
}: {
  rows: LadderAwardRow[];
  kicker: string;
}) {
  if (rows.length === 0) {
    return (
      <p className="text-sm text-[var(--muted-foreground)]">
        Awards appear once a few matches close out this month.
      </p>
    );
  }
  const meta: Record<
    LadderAwardRow["kind"],
    { title: string; icon: React.ReactNode; tone: string }
  > = {
    mvp: {
      title: "MVP",
      icon: <TrophyIcon size={18} />,
      tone: "bg-[var(--triaz-soft)] text-[var(--triaz-ink)]",
    },
    most_improved: {
      title: "Most improved",
      icon: <StarIcon size={18} />,
      tone: "bg-[var(--randwijck-soft)] text-[var(--randwijck-ink)]",
    },
    iron_man: {
      title: "Iron man",
      icon: <FlameIcon size={18} />,
      tone: "bg-[var(--joint-soft)] text-[var(--joint-ink)]",
    },
  };
  return (
    <div className="grid gap-3 sm:grid-cols-3">
      {rows.map((r) => {
        const m = meta[r.kind];
        return (
          <div
            key={r.kind}
            className="rounded-[var(--radius-lg)] bg-[var(--card)] p-4 shadow-[var(--shadow-sm)]"
          >
            <div className="flex items-center justify-between gap-2">
              <span
                className={cn(
                  "inline-flex h-8 w-8 items-center justify-center rounded-full",
                  m.tone,
                )}
                aria-hidden
              >
                {m.icon}
              </span>
              <span className="text-[10px] font-semibold uppercase tracking-[0.16em] text-[var(--muted-foreground)]">
                {kicker}
              </span>
            </div>
            <div className="mt-3 text-[10px] font-semibold uppercase tracking-[0.16em] text-[var(--muted-foreground)]">
              {m.title}
            </div>
            <div className="font-display text-xl font-medium leading-tight tracking-tight">
              {r.firstName} {r.lastName}
            </div>
            <div className="mt-1 text-sm text-[var(--muted-foreground)] tabular">
              {r.metricValue} {r.metricLabel}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function RuleCard({ title, body }: { title: string; body: string }) {
  return (
    <div className="rounded-[var(--radius-lg)] bg-[var(--surface)] p-4">
      <div className="font-display text-base font-medium tracking-tight">
        {title}
      </div>
      <p className="mt-1 text-sm text-[var(--muted-foreground)]">{body}</p>
    </div>
  );
}

function monthLabel(d: Date): string {
  return new Intl.DateTimeFormat("en-NL", {
    timeZone: "Europe/Amsterdam",
    month: "long",
    year: "numeric",
  }).format(d);
}
