import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { requireMember } from "@/lib/auth/require-member";
import { prisma } from "@/lib/prisma";
import { getLadderEligibility } from "@/lib/ladder/eligibility";
import { PageHeader } from "@/components/ui/page-header";
import { Section } from "@/components/ui/section";
import { Button } from "@/components/ui/button";
import { formatLocalDate, formatLocalHour } from "@/lib/booking/time";
import { cn } from "@/lib/utils";

import { RespondForm } from "./respond-form";
import { ReportScoreForm } from "./report-score-form";
import { ConfirmScoreForm } from "./confirm-score-form";

export const dynamic = "force-dynamic";

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function PortalLadderMatchPage({ params }: PageProps) {
  const { id } = await params;
  const { person, householdId } = await requireMember();
  const eligibility = await getLadderEligibility({
    personId: person.id,
    householdId,
  });
  if (!eligibility.eligible || !householdId) redirect("/portal/ladder");

  const match = await prisma.ladderMatch.findUnique({
    where: { id },
    include: {
      season: true,
      challengerEntry: {
        include: {
          person: { select: { firstName: true, lastName: true, id: true } },
        },
      },
      opponentEntry: {
        include: {
          person: { select: { firstName: true, lastName: true, id: true } },
        },
      },
      courtBooking: {
        include: { club: true, court: true },
      },
    },
  });
  if (!match) notFound();

  const isChallenger = match.challengerEntry.personId === person.id;
  const isOpponent = match.opponentEntry.personId === person.id;
  if (!isChallenger && !isOpponent) {
    // Spectator view — keep it minimal but useful (anyone on the ladder
    // should be able to see other matches).
    return <SpectatorView match={match} />;
  }

  const opponentName = isChallenger
    ? `${match.opponentEntry.person.firstName} ${match.opponentEntry.person.lastName}`.trim()
    : `${match.challengerEntry.person.firstName} ${match.challengerEntry.person.lastName}`.trim();

  const courts =
    match.status === "awaiting_opponent" && isOpponent
      ? await prisma.court.findMany({
          where: {
            isActive: true,
            isBookable: true,
            club: {
              membershipClubs: {
                some: { membership: { householdId, status: "active" } },
              },
            },
          },
          include: { club: { select: { id: true, name: true } } },
          orderBy: [{ club: { displayOrder: "asc" } }, { displayOrder: "asc" }],
        })
      : [];

  const reportedByMe =
    match.reportedByPersonId !== null &&
    match.reportedByPersonId === person.id;

  return (
    <div className="space-y-10">
      <PageHeader
        kicker={`Ladder · ${match.season.name}`}
        title={
          isChallenger
            ? `Your challenge to ${opponentName}`
            : `${opponentName} challenged you`
        }
        description={statusLine(match.status)}
        actions={
          <Button asChild variant="outline" tone="neutral" size="sm">
            <Link href="/portal/ladder">Back to ladder</Link>
          </Button>
        }
      />

      <Section title="The match">
        <div className="grid gap-4 sm:grid-cols-3">
          <PlayerCard
            label="Challenger"
            position={match.challengerEntry.position}
            name={`${match.challengerEntry.person.firstName} ${match.challengerEntry.person.lastName}`.trim()}
            isMine={match.challengerEntry.personId === person.id}
            isWinner={
              match.status === "played" &&
              match.winnerEntryId === match.challengerEntryId
            }
          />
          <div className="rounded-[var(--radius-lg)] bg-[var(--surface)] p-4 text-sm">
            <div className="text-[10px] font-semibold uppercase tracking-[0.16em] text-[var(--muted-foreground)]">
              Status
            </div>
            <div className="font-display text-lg font-medium tracking-tight">
              {humanStatus(match.status)}
            </div>
            {match.scheduledAt && (
              <div className="mt-2 text-sm">
                <span className="text-[var(--muted-foreground)]">
                  Scheduled
                </span>{" "}
                · {formatLocalDate(match.scheduledAt)} at{" "}
                {formatLocalHour(match.scheduledAt)}
              </div>
            )}
            {match.courtBooking && (
              <div className="text-sm">
                <span className="text-[var(--muted-foreground)]">Court</span> ·{" "}
                {match.courtBooking.club.name} — {match.courtBooking.court.name}
              </div>
            )}
            {match.swapped && (
              <div className="mt-2 inline-flex items-center rounded-full bg-[var(--triaz-soft)] px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-[var(--triaz-ink)]">
                Upset · positions swapped
              </div>
            )}
          </div>
          <PlayerCard
            label="Opponent"
            position={match.opponentEntry.position}
            name={`${match.opponentEntry.person.firstName} ${match.opponentEntry.person.lastName}`.trim()}
            isMine={match.opponentEntry.personId === person.id}
            isWinner={
              match.status === "played" &&
              match.winnerEntryId === match.opponentEntryId
            }
          />
        </div>
      </Section>

      {/* === Awaiting opponent (challenger waits / opponent picks slot) === */}
      {match.status === "awaiting_opponent" && (
        <Section
          title={isOpponent ? "Pick a slot to lock it in" : "Proposed slots"}
          description={
            isOpponent
              ? "Choose one of the slots and a court — we'll auto-book and email everyone."
              : "Waiting for the other side to pick a slot."
          }
        >
          {isOpponent ? (
            <RespondForm
              matchId={match.id}
              slots={match.proposedSlots.map((d) => ({
                iso: d.toISOString(),
                label: `${formatLocalDate(d)} · ${formatLocalHour(d)}`,
              }))}
              courts={courts.map((c) => ({
                id: c.id,
                label: `${c.club.name} — ${c.name}`,
              }))}
              opponentName={opponentName}
            />
          ) : (
            <ul className="grid gap-2 sm:grid-cols-2">
              {match.proposedSlots.map((d) => (
                <li
                  key={d.toISOString()}
                  className="rounded-full bg-[var(--surface)] px-3 py-1.5 text-sm tabular"
                >
                  {formatLocalDate(d)} · {formatLocalHour(d)}
                </li>
              ))}
            </ul>
          )}
        </Section>
      )}

      {/* === Scheduled — both sides can report the score === */}
      {match.status === "scheduled" && (
        <Section
          title="Score"
          description="When the match is over, either side can report the score."
        >
          <ReportScoreForm matchId={match.id} side={isChallenger ? "challenger" : "opponent"} />
        </Section>
      )}

      {/* === Awaiting confirmation === */}
      {match.status === "awaiting_confirmation" && (
        <Section
          title={reportedByMe ? "Waiting on confirmation" : "Confirm or dispute"}
          description={
            reportedByMe
              ? `You reported the score. ${opponentName} needs to confirm.`
              : `${opponentName} reported the score below — confirm if it's right or flag a dispute.`
          }
        >
          <ScoreSummary scoreJson={match.scoreJson} />
          {!reportedByMe && (
            <div className="mt-4">
              <ConfirmScoreForm matchId={match.id} />
            </div>
          )}
        </Section>
      )}

      {/* === Played === */}
      {match.status === "played" && (
        <Section title="Final score">
          <ScoreSummary scoreJson={match.scoreJson} />
        </Section>
      )}

      {/* === Cancelled === */}
      {match.status === "cancelled" && (
        <Section title="Match cancelled">
          <p className="text-sm text-[var(--muted-foreground)]">
            {match.cancelledReason ?? "The match was cancelled."}
          </p>
        </Section>
      )}

      {/* === Disputed === */}
      {match.status === "disputed" && (
        <Section title="Disputed">
          <p className="text-sm text-[var(--muted-foreground)]">
            {match.disputeReason ?? "Awaiting office review."}
          </p>
        </Section>
      )}

      <p className="text-xs text-[var(--muted-foreground)]">
        Match #{match.id.slice(0, 8)} · created{" "}
        {formatLocalDate(match.createdAt)}.
      </p>
    </div>
  );
}

function PlayerCard({
  label,
  position,
  name,
  isMine,
  isWinner,
}: {
  label: string;
  position: number;
  name: string;
  isMine: boolean;
  isWinner: boolean;
}) {
  return (
    <div
      className={cn(
        "rounded-[var(--radius-lg)] bg-[var(--surface)] p-4",
        isWinner && "ring-2 ring-[var(--success)]",
      )}
    >
      <div className="text-[10px] font-semibold uppercase tracking-[0.16em] text-[var(--muted-foreground)]">
        {label} · #{position}
      </div>
      <div className="mt-1 font-display text-xl font-medium tracking-tight">
        {name}
      </div>
      <div className="mt-1 flex items-center gap-2">
        {isMine && (
          <span className="rounded-full bg-[var(--triaz-soft)] px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-[var(--triaz-ink)]">
            You
          </span>
        )}
        {isWinner && (
          <span className="rounded-full bg-[var(--success)] px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-white">
            Won
          </span>
        )}
      </div>
    </div>
  );
}

function ScoreSummary({ scoreJson }: { scoreJson: unknown }) {
  if (!Array.isArray(scoreJson)) {
    return (
      <p className="text-sm text-[var(--muted-foreground)]">
        No score reported yet.
      </p>
    );
  }
  const sets = scoreJson as { a?: unknown; b?: unknown }[];
  return (
    <div className="flex flex-wrap items-baseline gap-3 text-base">
      <span className="text-[10px] font-semibold uppercase tracking-[0.16em] text-[var(--muted-foreground)]">
        Sets (challenger – opponent)
      </span>
      <span className="font-display text-2xl font-medium tabular tracking-tight">
        {sets
          .map((s) => `${typeof s.a === "number" ? s.a : "?"}–${typeof s.b === "number" ? s.b : "?"}`)
          .join(", ")}
      </span>
    </div>
  );
}

function statusLine(status: string): string {
  switch (status) {
    case "awaiting_opponent":
      return "Waiting for the opponent to pick a slot.";
    case "scheduled":
      return "Match is scheduled. Court is booked. Have fun.";
    case "awaiting_confirmation":
      return "Score reported — waiting for confirmation.";
    case "played":
      return "Match closed and the ladder is updated.";
    case "cancelled":
      return "Match cancelled.";
    case "disputed":
      return "Score disputed — the office will sort it out.";
    case "proposed":
      return "Proposed.";
    default:
      return status;
  }
}

function humanStatus(status: string): string {
  switch (status) {
    case "awaiting_opponent":
      return "Awaiting opponent";
    case "awaiting_confirmation":
      return "Awaiting confirmation";
    default:
      return status[0].toUpperCase() + status.slice(1);
  }
}

interface SpectatorMatch {
  id: string;
  status: string;
  scoreJson: unknown;
  challengerEntry: { position: number };
  opponentEntry: { position: number };
}

function SpectatorView({ match }: { match: SpectatorMatch }) {
  return (
    <div className="space-y-8">
      <PageHeader
        kicker="Ladder · match"
        title={`#${match.challengerEntry.position} vs #${match.opponentEntry.position}`}
        description={statusLine(match.status)}
        actions={
          <Button asChild variant="outline" tone="neutral" size="sm">
            <Link href="/portal/ladder">Back to ladder</Link>
          </Button>
        }
      />
      <ScoreSummary scoreJson={match.scoreJson} />
    </div>
  );
}
