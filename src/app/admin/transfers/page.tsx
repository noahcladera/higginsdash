import Link from "next/link";

import { requireAdmin } from "@/lib/auth/require-admin";
import { prisma } from "@/lib/prisma";
import { PageHeader } from "@/components/ui/page-header";
import { Section } from "@/components/ui/section";
import { StatusBadge } from "@/components/ui/status-badge";
import { StatusSurface } from "@/components/ui/status-surface";
import { transferStatusTone } from "@/lib/ui/status-tone";
import { Breadcrumbs } from "@/components/admin/breadcrumbs";

/**
 * Class-transfer queue. Pending rows show first; recently-decided
 * rows live underneath for context.
 */
export default async function AdminTransfersPage() {
  await requireAdmin();

  const [pending, recent] = await Promise.all([
    prisma.classTransferRequest.findMany({
      where: { status: "pending" },
      orderBy: { createdAt: "asc" },
      include: {
        fromEnrollment: {
          include: {
            classSeries: { select: { id: true, name: true } },
            student: {
              include: {
                person: {
                  select: { firstName: true, lastName: true },
                },
              },
            },
          },
        },
        requestedBy: { select: { firstName: true, lastName: true } },
        requestedTargetClassSeries: {
          select: { id: true, name: true },
        },
      },
    }),
    prisma.classTransferRequest.findMany({
      where: { status: { in: ["approved", "rejected", "cancelled"] } },
      orderBy: { decidedAt: "desc" },
      take: 12,
      include: {
        fromEnrollment: {
          include: {
            classSeries: { select: { id: true, name: true } },
            student: {
              include: {
                person: {
                  select: { firstName: true, lastName: true },
                },
              },
            },
          },
        },
        requestedTargetClassSeries: { select: { name: true } },
        decidedBy: { select: { firstName: true, lastName: true } },
      },
    }),
  ]);

  return (
    <div className="space-y-6">
      <Breadcrumbs items={[{ label: "Transfer requests" }]} />
      <PageHeader
        kicker="Admin · Classes"
        title="Class transfer requests"
        description="Parents asking to move a paid enrollment into a different class. Approving runs the swap atomically and applies your chosen settlement (credit, refund, or top-up)."
      />

      <Section
        title={`Pending (${pending.length})`}
        description={
          pending.length === 0
            ? "Nothing waiting — clean board."
            : undefined
        }
      >
        {pending.length === 0 ? (
          <div className="rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--card)] p-6 text-center text-sm text-[var(--muted-foreground)]">
            No pending requests.
          </div>
        ) : (
          <ul className="space-y-3">
            {pending.map((r) => {
              const studentName = `${r.fromEnrollment.student.person.firstName} ${r.fromEnrollment.student.person.lastName}`.trim();
              return (
                <StatusSurface
                  key={r.id}
                  as="li"
                  tone="warning"
                  className="rounded-[var(--radius-lg)] p-4 shadow-[var(--shadow-sm)]"
                >
                  <Link
                    href={`/admin/transfers/${r.id}`}
                    className="group flex items-start justify-between gap-3"
                  >
                    <div className="min-w-0 space-y-1">
                      <h3 className="text-sm font-semibold group-hover:underline">
                        {studentName} · {r.fromEnrollment.classSeries.name}
                      </h3>
                      <p className="text-xs text-[var(--muted-foreground)]">
                        Requested by{" "}
                        {`${r.requestedBy.firstName} ${r.requestedBy.lastName}`.trim()}{" "}
                        on {formatLocal(r.createdAt)}
                        {r.requestedTargetClassSeries
                          ? ` · prefers “${r.requestedTargetClassSeries.name}”`
                          : " · no preferred target"}
                      </p>
                      {r.requestedNote && (
                        <p className="text-xs text-[var(--muted-foreground)]">
                          “{r.requestedNote}”
                        </p>
                      )}
                    </div>
                    <StatusBadge tone="warning">Pending</StatusBadge>
                  </Link>
                </StatusSurface>
              );
            })}
          </ul>
        )}
      </Section>

      {recent.length > 0 && (
        <Section title="Recently decided">
          <div className="overflow-hidden rounded-[var(--radius-md)] border border-[var(--border)]">
            <table className="w-full text-left text-sm">
              <thead className="bg-[var(--muted)]/30 text-xs uppercase tracking-wide">
                <tr>
                  <th className="px-4 py-2">Student / source</th>
                  <th className="px-4 py-2">Outcome</th>
                  <th className="px-4 py-2">Decided by</th>
                  <th className="px-4 py-2">When</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--border)]">
                {recent.map((r) => {
                  const studentName = `${r.fromEnrollment.student.person.firstName} ${r.fromEnrollment.student.person.lastName}`.trim();
                  const outcomeLabel =
                    r.status === "approved"
                      ? `Approved · ${r.resolution ?? "—"}${
                          r.deltaCents != null
                            ? ` · €${(r.deltaCents / 100).toFixed(2)}`
                            : ""
                        }`
                      : r.status === "rejected"
                        ? "Rejected"
                        : "Cancelled by parent";
                  return (
                    <tr key={r.id}>
                      <td className="px-4 py-3">
                        <Link
                          href={`/admin/transfers/${r.id}`}
                          className="text-[var(--triaz-ink)] underline-offset-4 hover:underline"
                        >
                          {studentName} · {r.fromEnrollment.classSeries.name}
                        </Link>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex flex-col gap-1">
                          <StatusBadge tone={transferStatusTone(r.status)}>
                            {r.status === "approved"
                              ? "Approved"
                              : r.status === "rejected"
                                ? "Rejected"
                                : "Cancelled"}
                          </StatusBadge>
                          <span className="text-xs text-[var(--muted-foreground)]">
                            {outcomeLabel}
                          </span>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-[var(--muted-foreground)]">
                        {r.decidedBy
                          ? `${r.decidedBy.firstName} ${r.decidedBy.lastName}`.trim()
                          : "—"}
                      </td>
                      <td className="px-4 py-3 tabular text-xs text-[var(--muted-foreground)]">
                        {r.decidedAt ? formatLocal(r.decidedAt) : "—"}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Section>
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
