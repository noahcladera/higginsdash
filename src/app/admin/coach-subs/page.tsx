import Link from "next/link";
import { requireAdmin } from "@/lib/auth/require-admin";
import { prisma } from "@/lib/prisma";
import { PageHeader } from "@/components/ui/page-header";
import { Breadcrumbs } from "@/components/admin/breadcrumbs";
import { StatusBadge } from "@/components/ui/status-badge";
import { EmptyState } from "@/components/ui/empty-state";
import { coachSubOutcomeTone } from "@/lib/ui/status-tone";
import { CoachSubRequestCard } from "./_request-card";

/**
 * Office queue for coach sub requests. Shows every pending row and the
 * 10 most-recently filled / cancelled ones for context. Action lives in
 * the per-row card client component.
 */
export default async function CoachSubsPage() {
  await requireAdmin();

  const [pending, recent, allCoaches] = await Promise.all([
    prisma.coachSubRequest.findMany({
      where: { status: "pending" },
      orderBy: { createdAt: "asc" },
      include: {
        classSession: {
          include: {
            classSeries: {
              select: { id: true, name: true, program: { select: { name: true } } },
            },
            court: { select: { name: true } },
          },
        },
        requesterCoach: { select: { id: true, firstName: true, lastName: true } },
      },
    }),
    prisma.coachSubRequest.findMany({
      where: { status: { in: ["filled", "cancelled", "expired"] } },
      orderBy: { updatedAt: "desc" },
      take: 10,
      include: {
        classSession: {
          include: {
            classSeries: { select: { id: true, name: true } },
          },
        },
        requesterCoach: { select: { firstName: true, lastName: true } },
        filledByCoach: { select: { firstName: true, lastName: true } },
      },
    }),
    prisma.coach.findMany({
      where: { isActive: true, person: { archivedAt: null } },
      include: {
        person: {
          select: { id: true, firstName: true, lastName: true },
        },
      },
      orderBy: [
        { person: { firstName: "asc" } },
        { person: { lastName: "asc" } },
      ],
    }),
  ]);

  const coachOptions = allCoaches.map((c) => ({
    personId: c.person.id,
    label: `${c.person.firstName} ${c.person.lastName}`.trim() || "Unnamed",
  }));

  return (
    <div className="space-y-6">
      <Breadcrumbs items={[{ label: "Sub requests" }]} />
      <PageHeader
        kicker="Admin · Classes"
        title="Coach sub requests"
        description="When a coach can't make a session, assign a substitute here. Approving inserts a class_session_coaches override and notifies both coaches."
      />

      <section className="space-y-3">
        <h2 className="text-sm font-semibold uppercase tracking-[0.12em] text-[var(--muted-foreground)]">
          Pending ({pending.length})
        </h2>
        {pending.length === 0 ? (
          <EmptyState
            title="Nothing waiting"
            description="Coaches with a clear schedule are a beautiful thing."
          />
        ) : (
          <div className="space-y-3">
            {pending.map((r) => (
              <CoachSubRequestCard
                key={r.id}
                request={{
                  id: r.id,
                  reason: r.reason,
                  requestedAtIso: r.createdAt.toISOString(),
                  requesterPersonId: r.requesterCoachPersonId,
                  requesterName:
                    `${r.requesterCoach.firstName} ${r.requesterCoach.lastName}`.trim(),
                  sessionStartIso: r.classSession.startsAt.toISOString(),
                  sessionEndIso: r.classSession.endsAt.toISOString(),
                  seriesName: r.classSession.classSeries.name,
                  seriesId: r.classSession.classSeries.id,
                  programName: r.classSession.classSeries.program.name,
                  courtName: r.classSession.court?.name ?? null,
                }}
                coachOptions={coachOptions}
              />
            ))}
          </div>
        )}
      </section>

      {recent.length > 0 && (
        <section className="space-y-3">
          <h2 className="text-sm font-semibold uppercase tracking-[0.12em] text-[var(--muted-foreground)]">
            Recently resolved
          </h2>
          <div className="overflow-hidden rounded-md border border-[var(--border)]">
            <table className="w-full text-left text-sm">
              <thead className="bg-[var(--muted)]/30 text-xs uppercase tracking-wide">
                <tr>
                  <th className="px-4 py-2">Series</th>
                  <th className="px-4 py-2">Requester</th>
                  <th className="px-4 py-2">Outcome</th>
                  <th className="px-4 py-2">Updated</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--border)]">
                {recent.map((r) => {
                  const outcomeDetail =
                    r.status === "filled"
                      ? `Filled by ${r.filledByCoach?.firstName ?? "—"} ${
                          r.filledByCoach?.lastName ?? ""
                        }`.trim()
                      : r.status === "cancelled"
                        ? "Cancelled"
                        : "Expired";
                  const outcomeLabel =
                    r.status === "filled"
                      ? "Filled"
                      : r.status === "cancelled"
                        ? "Cancelled"
                        : "Expired";
                  return (
                    <tr key={r.id}>
                      <td className="px-4 py-3">
                        <Link
                          href={`/admin/classes/${r.classSession.classSeries.id}`}
                          className="text-[var(--triaz-ink)] underline-offset-4 hover:underline"
                        >
                          {r.classSession.classSeries.name}
                        </Link>
                      </td>
                      <td className="px-4 py-3 text-[var(--muted-foreground)]">
                        {`${r.requesterCoach.firstName} ${r.requesterCoach.lastName}`.trim()}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex flex-col gap-1">
                          <StatusBadge tone={coachSubOutcomeTone(r.status)}>
                            {outcomeLabel}
                          </StatusBadge>
                          {r.status === "filled" && (
                            <span className="text-xs text-[var(--muted-foreground)]">
                              {outcomeDetail}
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-3 tabular text-xs text-[var(--muted-foreground)]">
                        {formatLocal(r.updatedAt)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </div>
  );
}

function formatLocal(d: Date): string {
  return new Intl.DateTimeFormat("en-NL", {
    timeZone: "Europe/Amsterdam",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(d);
}
