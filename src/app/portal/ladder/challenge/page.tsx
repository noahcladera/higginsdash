import Link from "next/link";
import { redirect } from "next/navigation";

import { requireMember } from "@/lib/auth/require-member";
import { prisma } from "@/lib/prisma";
import { getLadderEligibility } from "@/lib/ladder/eligibility";
import { getActiveSeason, getMyEntry } from "@/lib/ladder/queries";
import {
  isWithinChallengeRange,
  findOverlaps,
  nextProposedStarts,
  formatMinuteOfDay,
  DAY_OF_WEEK_LABEL,
  type AvailabilityWindow,
} from "@/lib/ladder/rules";

import { PageHeader } from "@/components/ui/page-header";
import { Section } from "@/components/ui/section";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { TrophyIcon } from "@/components/icons";
import { formatLocalDate, formatLocalHour } from "@/lib/booking/time";

import { ProposeForm } from "./propose-form";

export const dynamic = "force-dynamic";

export default async function PortalLadderChallengePage() {
  const { person, householdId } = await requireMember();
  const eligibility = await getLadderEligibility({
    personId: person.id,
    householdId,
  });
  if (!eligibility.eligible || !householdId) redirect("/portal/ladder");

  const season = await getActiveSeason();
  if (!season) redirect("/portal/ladder");

  const me = await getMyEntry({ seasonId: season.id, personId: person.id });
  if (!me || me.status !== "active") redirect("/portal/ladder");

  if (me.availability.length === 0) {
    return (
      <div className="space-y-8">
        <PageHeader
          kicker="Ladder · challenge"
          title="Set your availability first"
          description="We can't suggest opponents without knowing when you can play."
        />
        <EmptyState
          icon={<TrophyIcon size={20} />}
          title="No availability set"
          description="Tell us when you're usually free and we'll match you with someone close."
          action={
            <Button asChild tone="triaz">
              <Link href="/portal/ladder/availability">
                Set my availability
              </Link>
            </Button>
          }
        />
      </div>
    );
  }

  // Open match check — if they already have one, route them to it.
  const openMatch = await prisma.ladderMatch.findFirst({
    where: {
      seasonId: season.id,
      status: { in: ["awaiting_opponent", "scheduled", "awaiting_confirmation"] },
      OR: [{ challengerEntryId: me.id }, { opponentEntryId: me.id }],
    },
    select: { id: true, status: true },
  });
  if (openMatch) {
    return (
      <div className="space-y-8">
        <PageHeader
          kicker="Ladder · challenge"
          title="You've got an open match"
          description="Finish or cancel your current match before you can challenge someone new."
        />
        <Button asChild tone="triaz">
          <Link href={`/portal/ladder/matches/${openMatch.id}`}>
            Open the match
          </Link>
        </Button>
      </div>
    );
  }

  // Pull all active opponents within range, plus their availability.
  const opponents = await prisma.ladderEntry.findMany({
    where: {
      seasonId: season.id,
      status: "active",
      personId: { not: person.id },
    },
    include: {
      person: { select: { firstName: true, lastName: true } },
      availability: true,
    },
    orderBy: { position: "asc" },
  });

  const myWindows: AvailabilityWindow[] = me.availability.map((a) => ({
    dayOfWeek: a.dayOfWeek,
    startMinute: a.startMinute,
    endMinute: a.endMinute,
    clubId: a.clubId,
  }));

  // Pre-compute overlap + first three concrete slots per opponent in range.
  const candidates = opponents
    .filter((o) =>
      isWithinChallengeRange({
        viewerPosition: me.position,
        targetPosition: o.position,
        range: season.challengeRange,
      }),
    )
    .map((o) => {
      const theirWindows: AvailabilityWindow[] = o.availability.map((a) => ({
        dayOfWeek: a.dayOfWeek,
        startMinute: a.startMinute,
        endMinute: a.endMinute,
        clubId: a.clubId,
      }));
      const overlaps = findOverlaps(myWindows, theirWindows, 60);
      const proposedSlots: Date[] = [];
      for (const ov of overlaps) {
        const next = nextProposedStarts(ov, { weeks: 4, onTheHour: true });
        for (const d of next) {
          if (proposedSlots.length >= 6) break;
          proposedSlots.push(d);
        }
        if (proposedSlots.length >= 6) break;
      }
      proposedSlots.sort((a, b) => a.getTime() - b.getTime());
      return {
        entryId: o.id,
        firstName: o.person.firstName,
        lastName: o.person.lastName,
        position: o.position,
        wins: o.wins,
        losses: o.losses,
        overlaps,
        proposedSlots: proposedSlots.slice(0, 6),
      };
    });

  // Pull bookable courts the challenger can use (any club they have a
  // membership at — same rule as /portal/book). Group by club for the
  // ProposeForm select.
  const courts = await prisma.court.findMany({
    where: {
      isActive: true,
      isBookable: true,
      club: {
        membershipClubs: {
          some: { membership: { householdId, status: "active" } },
        },
      },
    },
    include: { club: { select: { id: true, name: true, slug: true } } },
    orderBy: [{ club: { displayOrder: "asc" } }, { displayOrder: "asc" }],
  });

  return (
    <div className="space-y-10">
      <PageHeader
        kicker={`Ladder · challenge · ${season.name}`}
        title="Pick a fight"
        description={`You're #${me.position}. You can challenge anyone within ±${season.challengeRange} positions whose calendar overlaps with yours.`}
        actions={
          <Button asChild variant="outline" tone="neutral">
            <Link href="/portal/ladder/availability">
              Edit my availability
            </Link>
          </Button>
        }
      />

      {candidates.length === 0 ? (
        <EmptyState
          icon={<TrophyIcon size={20} />}
          title="No opponents in range yet"
          description={`Either no one within ±${season.challengeRange} positions has joined yet or no one's availability overlaps with yours.`}
          action={
            <Button asChild variant="outline" tone="neutral">
              <Link href="/portal/ladder">Back to ladder</Link>
            </Button>
          }
        />
      ) : (
        <Section title="Opponents in range">
          <ul className="space-y-3">
            {candidates.map((c) => {
              const hasOverlap = c.proposedSlots.length > 0;
              return (
                <li
                  key={c.entryId}
                  className="rounded-[var(--radius-lg)] bg-[var(--surface)] p-4 shadow-[var(--shadow-sm)] sm:p-5"
                >
                  <div className="flex flex-wrap items-baseline justify-between gap-3">
                    <div>
                      <div className="font-display text-xl font-medium tracking-tight">
                        #{c.position} · {c.firstName} {c.lastName}
                      </div>
                      <div className="text-xs text-[var(--muted-foreground)] tabular">
                        {c.wins}W · {c.losses}L
                        {c.position < me.position
                          ? ` · ${me.position - c.position} above you`
                          : c.position > me.position
                            ? ` · ${c.position - me.position} below you`
                            : ""}
                      </div>
                    </div>
                    {!hasOverlap && (
                      <span className="rounded-full bg-[var(--surface-strong)] px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-[var(--muted-foreground)]">
                        No matching slots
                      </span>
                    )}
                  </div>

                  {c.overlaps.length > 0 && (
                    <div className="mt-3 flex flex-wrap gap-1.5 text-xs text-[var(--muted-foreground)]">
                      {c.overlaps.slice(0, 4).map((o, i) => (
                        <span
                          key={i}
                          className="rounded-full bg-[var(--card)] px-2 py-0.5"
                        >
                          {DAY_OF_WEEK_LABEL[o.dayOfWeek]}{" "}
                          {formatMinuteOfDay(o.startMinute)}–
                          {formatMinuteOfDay(o.endMinute)}
                        </span>
                      ))}
                    </div>
                  )}

                  {hasOverlap && (
                    <div className="mt-4">
                      <ProposeForm
                        opponentEntryId={c.entryId}
                        opponentName={`${c.firstName} ${c.lastName}`.trim()}
                        slots={c.proposedSlots.map((d) => ({
                          iso: d.toISOString(),
                          label: `${formatLocalDate(d)} · ${formatLocalHour(d)}`,
                        }))}
                        courts={courts.map((c2) => ({
                          id: c2.id,
                          label: `${c2.club.name} — ${c2.name}`,
                        }))}
                      />
                    </div>
                  )}

                  {!hasOverlap && (
                    <p className="mt-3 text-xs text-[var(--muted-foreground)]">
                      Ask them to add weekend windows in their availability,
                      or update yours and check back.
                    </p>
                  )}
                </li>
              );
            })}
          </ul>
        </Section>
      )}
    </div>
  );
}
