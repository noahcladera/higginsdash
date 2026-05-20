import Link from "next/link";

import { requireAdmin } from "@/lib/auth/require-admin";
import { prisma } from "@/lib/prisma";
import { PageHeader } from "@/components/ui/page-header";
import { Section } from "@/components/ui/section";
import { formatLocalDate } from "@/lib/booking/time";
import { getTerms } from "@/lib/tenant";

import { CreateSeasonForm } from "./create-season-form";
import { SeasonRow } from "./season-row";
import { DisputeRowActions } from "./dispute-row-actions";

function toIsoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export const dynamic = "force-dynamic";

export default async function AdminLadderPage() {
  await requireAdmin();
  const t = await getTerms();

  const [seasons, disputes, activeSeason] = await Promise.all([
    prisma.ladderSeason.findMany({
      orderBy: [{ isActive: "desc" }, { startsOn: "desc" }],
      include: {
        _count: { select: { entries: true, matches: true } },
      },
    }),
    prisma.ladderMatch.findMany({
      where: { status: "disputed" },
      orderBy: { createdAt: "desc" },
      include: {
        challengerEntry: {
          include: {
            person: { select: { firstName: true, lastName: true } },
          },
        },
        opponentEntry: {
          include: {
            person: { select: { firstName: true, lastName: true } },
          },
        },
        season: true,
      },
    }),
    prisma.ladderSeason.findFirst({ where: { isActive: true } }),
  ]);

  return (
    <div className="space-y-12">
      <PageHeader
        kicker="Admin"
        title={t.ladder.singular}
        description={`Open and close ${t.season.plural.toLowerCase()}, and resolve disputes.`}
      />

      <Section
        title="Disputes"
        description={
          disputes.length === 0
            ? "Nothing pending."
            : `${disputes.length} match${disputes.length === 1 ? "" : "es"} waiting on a call.`
        }
      >
        {disputes.length === 0 ? (
          <p className="text-sm text-[var(--muted-foreground)]">
            All clear.
          </p>
        ) : (
          <ul className="space-y-3">
            {disputes.map((d) => (
              <li
                key={d.id}
                className="rounded-[var(--radius-lg)] bg-[var(--surface)] p-4 shadow-[var(--shadow-sm)]"
              >
                <div className="flex flex-wrap items-baseline justify-between gap-3">
                  <div>
                    <div className="font-display text-lg font-medium tracking-tight">
                      #{d.challengerEntry.position}{" "}
                      {d.challengerEntry.person.firstName}{" "}
                      {d.challengerEntry.person.lastName} vs #
                      {d.opponentEntry.position}{" "}
                      {d.opponentEntry.person.firstName}{" "}
                      {d.opponentEntry.person.lastName}
                    </div>
                    <div className="text-xs text-[var(--muted-foreground)]">
                      {d.season.name} · reported{" "}
                      {d.reportedAt ? formatLocalDate(d.reportedAt) : "—"}
                    </div>
                  </div>
                  <Link
                    href={`/portal/ladder/matches/${d.id}`}
                    className="text-xs underline"
                  >
                    View match →
                  </Link>
                </div>
                {d.disputeReason && (
                  <p className="mt-2 rounded-md bg-[var(--card)] p-3 text-sm">
                    {d.disputeReason}
                  </p>
                )}
                <div className="mt-3">
                  <DisputeRowActions
                    matchId={d.id}
                    challengerEntryId={d.challengerEntryId}
                    challengerName={`${d.challengerEntry.person.firstName} ${d.challengerEntry.person.lastName}`.trim()}
                    opponentEntryId={d.opponentEntryId}
                    opponentName={`${d.opponentEntry.person.firstName} ${d.opponentEntry.person.lastName}`.trim()}
                    hasReportedWinner={d.winnerEntryId !== null}
                  />
                </div>
              </li>
            ))}
          </ul>
        )}
      </Section>

      <Section
        title={t.season.plural}
        description={
          activeSeason
            ? `Active: ${activeSeason.name}.`
            : `No active ${t.season.singular.toLowerCase()} — open one below.`
        }
      >
        {seasons.length === 0 ? (
          <p className="text-sm text-[var(--muted-foreground)]">
            No seasons created yet.
          </p>
        ) : (
          <div className="overflow-hidden rounded-[var(--radius-lg)] bg-[var(--surface)] shadow-[var(--shadow-sm)]">
            <table className="w-full text-sm">
              <thead className="bg-[var(--surface-strong)] text-[10px] font-semibold uppercase tracking-[0.16em] text-[var(--muted-foreground)]">
                <tr>
                  <th className="px-4 py-2 text-left">Season</th>
                  <th className="px-4 py-2 text-left">Range</th>
                  <th className="px-4 py-2 text-right">Players</th>
                  <th className="px-4 py-2 text-right">Matches</th>
                  <th className="px-4 py-2 text-right">Fee</th>
                  <th className="px-4 py-2 text-left">Status</th>
                  <th className="px-4 py-2 text-right" />
                </tr>
              </thead>
              <tbody>
                {seasons.map((s) => (
                  <SeasonRow
                    key={s.id}
                    anyActive={!!activeSeason}
                    season={{
                      id: s.id,
                      name: s.name,
                      slug: s.slug,
                      startsOn: toIsoDate(s.startsOn),
                      endsOn: toIsoDate(s.endsOn),
                      joinDeadline: s.joinDeadline
                        ? toIsoDate(s.joinDeadline)
                        : null,
                      entryFeeCents: s.entryFeeCents,
                      challengeRange: s.challengeRange,
                      isActive: s.isActive,
                      notes: s.notes,
                      rangeLabel: `${formatLocalDate(s.startsOn)} → ${formatLocalDate(s.endsOn)}`,
                      feeLabel:
                        s.entryFeeCents > 0
                          ? `€${(s.entryFeeCents / 100).toFixed(0)}`
                          : "Free",
                      entryCount: s._count.entries,
                      matchCount: s._count.matches,
                    }}
                  />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Section>

      <Section
        title={`New ${t.season.singular.toLowerCase()}`}
        description={`Opens ${t.membership.singular.toLowerCase()}-restricted joining for adult ${t.member.plural.toLowerCase()}.`}
        surface="card"
      >
        <CreateSeasonForm />
      </Section>
    </div>
  );
}
