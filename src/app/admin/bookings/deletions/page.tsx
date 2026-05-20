import Link from "next/link";
import { requireAdmin } from "@/lib/auth/require-admin";
import { PageHeader } from "@/components/ui/page-header";
import { Breadcrumbs } from "@/components/admin/breadcrumbs";
import { getPendingCancellationRequests } from "@/lib/booking/queries";
import { DeletionRequestCard } from "./deletion-request-card";

/**
 * Admin queue of pending coach-initiated deletion requests on coaching
 * bookings. The slot stays blocked until the admin decides; this page is
 * the funnel where the call is made.
 */
export default async function DeletionsQueuePage() {
  await requireAdmin();
  const requests = await getPendingCancellationRequests();

  return (
    <div className="space-y-6">
      <Breadcrumbs
        items={[
          { label: "Bookings", href: "/admin/bookings" },
          { label: "Deletions" },
        ]}
      />
      <PageHeader
        kicker="Admin · Bookings"
        title="Pending deletion requests"
        description="Coach-initiated deletions of coaching bookings, awaiting decision."
      />

      {requests.length === 0 ? (
        <div className="rounded-md border border-[var(--border)] bg-[var(--card)] p-6 text-center text-sm text-[var(--muted-foreground)]">
          Nothing pending. <Link href="/admin/bookings" className="underline">
            Back to calendar
          </Link>
        </div>
      ) : (
        <div className="space-y-3">
          {requests.map((r) => (
            <DeletionRequestCard
              key={r.id}
              booking={{
                id: r.id,
                startsAt: r.startsAt.toISOString(),
                endsAt: r.endsAt.toISOString(),
                courtName: r.court.name,
                clubName: r.club.name,
                coachName:
                  `${r.bookedByPerson.firstName} ${r.bookedByPerson.lastName}`.trim(),
                cancellationReason: r.cancellationReason ?? "",
                cancellationRequestedAt:
                  r.cancellationRequestedAt?.toISOString() ?? null,
              }}
            />
          ))}
        </div>
      )}
    </div>
  );
}
