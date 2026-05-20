import Link from "next/link";
import { requireAdmin } from "@/lib/auth/require-admin";
import { prisma } from "@/lib/prisma";
import { PageHeader } from "@/components/ui/page-header";
import { Breadcrumbs } from "@/components/admin/breadcrumbs";
import { MembershipCancellationCard } from "./_decision-card";

export default async function MembershipCancellationsPage() {
  await requireAdmin();

  const pending = await prisma.membership.findMany({
    where: {
      status: "active",
      cancellationRequestedAt: { not: null },
    },
    orderBy: { cancellationRequestedAt: "asc" },
    include: {
      household: { select: { id: true, displayName: true } },
      assignedPerson: {
        select: { id: true, firstName: true, lastName: true },
      },
      cancellationRequester: {
        select: { id: true, firstName: true, lastName: true },
      },
      membershipClubs: {
        include: { club: { select: { id: true, name: true, slug: true } } },
      },
    },
  });

  return (
    <div className="space-y-6">
      <Breadcrumbs items={[{ label: "Memberships", href: "/admin" }, { label: "Cancellations" }]} />
      <PageHeader
        kicker="Admin · Memberships"
        title="Cancellation requests"
        description="Members who've asked to end their membership. Coverage stays active until you decide."
      />

      {pending.length === 0 ? (
        <div className="rounded-md border border-[var(--border)] bg-[var(--card)] p-6 text-center text-sm text-[var(--muted-foreground)]">
          Nobody's trying to leave today.{" "}
          <Link href="/admin" className="underline">
            Back to dashboard
          </Link>
        </div>
      ) : (
        <div className="space-y-3">
          {pending.map((m) => (
            <MembershipCancellationCard
              key={m.id}
              membership={{
                id: m.id,
                householdName:
                  m.household.displayName ||
                  m.assignedPerson
                    ? `${m.assignedPerson?.firstName} ${m.assignedPerson?.lastName}`.trim()
                    : "Household",
                householdId: m.household.id,
                coverageTier: m.coverageTier,
                expiresOnIso: m.expiresOn.toISOString(),
                pricePaid: m.pricePaid != null ? Number(m.pricePaid) : null,
                requestedAtIso:
                  m.cancellationRequestedAt?.toISOString() ?? null,
                requesterName: m.cancellationRequester
                  ? `${m.cancellationRequester.firstName} ${m.cancellationRequester.lastName}`.trim()
                  : null,
                reason: m.cancellationRequestedReason ?? "",
                clubs: m.membershipClubs.map((mc) => mc.club.name),
              }}
            />
          ))}
        </div>
      )}
    </div>
  );
}
