import Link from "next/link";
import { notFound } from "next/navigation";

import { requireMember } from "@/lib/auth/require-member";
import { prisma } from "@/lib/prisma";
import { getLeaderboard, getRecentMatches } from "@/lib/ladder/queries";
import { PageHeader } from "@/components/ui/page-header";
import { Section } from "@/components/ui/section";
import { Button } from "@/components/ui/button";
import { TrophyIcon } from "@/components/icons";
import { formatLocalDate } from "@/lib/booking/time";

export const dynamic = "force-dynamic";

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function PortalLadderSeasonPage({ params }: PageProps) {
  await requireMember();
  const { id } = await params;

  const season = await prisma.ladderSeason.findUnique({ where: { id } });
  if (!season) notFound();

  const [leaderboard, lastMatches, awards] = await Promise.all([
    getLeaderboard(season.id),
    getRecentMatches({
      seasonId: season.id,
      status: ["played"],
      limit: 25,
    }),
    prisma.ladderAward.findMany({
      where: { seasonId: season.id },
      orderBy: [{ month: "desc" }, { kind: "asc" }],
      include: { person: { select: { firstName: true, lastName: true } } },
    }),
  ]);

  const champion = leaderboard.find((r) => r.position === 1);

  return (
    <div className="space-y-10">
      <PageHeader
        kicker={`Ladder · ${season.isActive ? "current season" : "past season"}`}
        title={season.name}
        description={`${formatLocalDate(season.startsOn)} → ${formatLocalDate(season.endsOn)}.`}
        actions={
          <Button asChild variant="outline" tone="neutral" size="sm">
            <Link href="/portal/ladder">Back to ladder</Link>
          </Button>
        }
      />

      {champion && (
        <Section title="Final standings">
          <div className="rounded-[var(--radius-lg)] bg-[var(--triaz-soft)] p-5 text-[var(--triaz-ink)]">
            <div className="flex items-center gap-3">
              <TrophyIcon size={24} />
              <div>
                <div className="text-[10px] font-semibold uppercase tracking-[0.16em]">
                  Season champion
                </div>
                <div className="font-display text-2xl font-medium tracking-tight">
                  {champion.person.firstName} {champion.person.lastName}
                </div>
                <div className="text-xs">
                  {champion.wins}W · {champion.losses}L · peak #
                  {champion.peakPosition}
                </div>
              </div>
            </div>
          </div>
        </Section>
      )}

      <Section title="Leaderboard" description={`${leaderboard.length} players`}>
        <div className="overflow-hidden rounded-[var(--radius-lg)] bg-[var(--surface)] shadow-[var(--shadow-sm)]">
          <table className="w-full text-sm">
            <thead className="bg-[var(--surface-strong)] text-[10px] font-semibold uppercase tracking-[0.16em] text-[var(--muted-foreground)]">
              <tr>
                <th className="w-12 px-4 py-2 text-left">#</th>
                <th className="px-4 py-2 text-left">Player</th>
                <th className="px-4 py-2 text-right">W–L</th>
                <th className="hidden px-4 py-2 text-right sm:table-cell">
                  Played
                </th>
                <th className="hidden px-4 py-2 text-right sm:table-cell">
                  Peak
                </th>
              </tr>
            </thead>
            <tbody>
              {leaderboard.map((r) => (
                <tr key={r.entryId} className="border-t border-[var(--border)]">
                  <td className="px-4 py-2 font-medium tabular">
                    {r.position}
                  </td>
                  <td className="px-4 py-2">
                    {r.person.firstName} {r.person.lastName}
                    {r.status === "withdrawn" && (
                      <span className="ml-2 inline-flex items-center rounded-full bg-[var(--surface-strong)] px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-[var(--muted-foreground)]">
                        Withdrawn
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-2 text-right tabular">
                    {r.wins}–{r.losses}
                  </td>
                  <td className="hidden px-4 py-2 text-right tabular sm:table-cell">
                    {r.matchesPlayed}
                  </td>
                  <td className="hidden px-4 py-2 text-right tabular sm:table-cell">
                    #{r.peakPosition}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Section>

      {awards.length > 0 && (
        <Section title="Monthly awards" description="Frozen at month-end.">
          <ul className="space-y-2">
            {awards.map((a) => (
              <li
                key={a.id}
                className="flex flex-wrap items-center justify-between gap-3 rounded-[var(--radius-md)] bg-[var(--surface)] px-4 py-3 text-sm"
              >
                <div className="flex items-center gap-2">
                  <span className="text-[10px] font-semibold uppercase tracking-[0.16em] text-[var(--muted-foreground)]">
                    {monthLabel(a.month)} · {humanKind(a.kind)}
                  </span>
                </div>
                <div className="text-right">
                  <div className="font-medium">
                    {a.person.firstName} {a.person.lastName}
                  </div>
                  <div className="text-xs text-[var(--muted-foreground)] tabular">
                    {a.metricValue}
                  </div>
                </div>
              </li>
            ))}
          </ul>
        </Section>
      )}

      <Section title="Match history">
        {lastMatches.length === 0 ? (
          <p className="text-sm text-[var(--muted-foreground)]">
            No matches were played this season.
          </p>
        ) : (
          <ul className="space-y-2">
            {lastMatches.map((m) => (
              <li
                key={m.id}
                className="flex flex-wrap items-center justify-between gap-3 rounded-[var(--radius-md)] bg-[var(--surface)] px-4 py-3 text-sm"
              >
                <div className="flex flex-1 flex-wrap items-baseline gap-x-3 gap-y-1">
                  <span>
                    #{m.challenger.position} {m.challenger.firstName}{" "}
                    {m.challenger.lastName}
                  </span>
                  <span className="text-[var(--muted-foreground)]">vs</span>
                  <span>
                    #{m.opponent.position} {m.opponent.firstName}{" "}
                    {m.opponent.lastName}
                  </span>
                </div>
                <div className="flex items-center gap-3 text-xs text-[var(--muted-foreground)]">
                  {m.scoreText && (
                    <span className="tabular text-[var(--foreground)]">
                      {m.scoreText}
                    </span>
                  )}
                  {m.scheduledAt && (
                    <span>{formatLocalDate(m.scheduledAt)}</span>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </Section>
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

function humanKind(kind: string): string {
  switch (kind) {
    case "mvp":
      return "MVP";
    case "most_improved":
      return "Most improved";
    case "iron_man":
      return "Iron man";
    default:
      return kind;
  }
}
