import { notFound, redirect } from "next/navigation";
import Link from "next/link";

import { requireMember } from "@/lib/auth/require-member";
import { prisma } from "@/lib/prisma";
import { isGuardianOf } from "@/lib/portal/queries";
import { listAllVisibleSeries } from "@/lib/portal/catalog-queries";
import { PageHeader } from "@/components/ui/page-header";
import { Section } from "@/components/ui/section";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

import { TransferRequestForm } from "./_form";

/**
 * Portal page where a parent (or adult student) lines up a transfer
 * request from a paid enrollment to another class. The page hands the
 * client form a pre-filtered candidate list — kept on the server so we
 * never ship the entire catalog to the browser.
 */
export default async function PortalTransferRequestPage({
  params,
}: {
  params: Promise<{ enrollmentId: string }>;
}) {
  const { enrollmentId } = await params;
  const { person } = await requireMember();

  const enrollment = await prisma.enrollment.findUnique({
    where: { id: enrollmentId },
    select: {
      id: true,
      status: true,
      studentPersonId: true,
      classSeriesId: true,
      pricePaid: true,
      classSeries: {
        select: {
          id: true,
          name: true,
          program: { select: { name: true, slug: true } },
          venue: { select: { name: true } },
          club: { select: { name: true } },
        },
      },
      student: {
        select: {
          person: { select: { firstName: true, lastName: true } },
        },
      },
    },
  });
  if (!enrollment) notFound();

  const owns =
    enrollment.studentPersonId === person.id ||
    (await isGuardianOf(person.id, enrollment.studentPersonId));
  if (!owns) redirect("/portal/classes");
  if (
    enrollment.status !== "active" &&
    enrollment.status !== "pending_payment"
  ) {
    redirect("/portal/classes");
  }

  // Existing pending request — surface it instead of letting the
  // parent stack a second request on the same enrollment.
  const existingPending = await prisma.classTransferRequest.findFirst({
    where: { fromEnrollmentId: enrollment.id, status: "pending" },
    select: { id: true, createdAt: true, requestedNote: true },
  });

  const candidates = (await listAllVisibleSeries()).filter(
    (s) => s.id !== enrollment.classSeriesId,
  );

  const studentName = `${enrollment.student.person.firstName} ${enrollment.student.person.lastName}`.trim();

  return (
    <div className="space-y-6">
      <PageHeader
        kicker="Classes"
        title={`Request a transfer for ${studentName}`}
        description="Pick the class you'd like to switch into. The office will review and confirm the financial outcome (credit, refund, or a top-up if the new class costs more)."
      />

      <Section
        title="Current enrollment"
        description="What we'll move out of."
      >
        <div className="flex flex-wrap items-start justify-between gap-3 rounded-[var(--radius-lg)] bg-[var(--surface)] p-5 shadow-[var(--shadow-sm)]">
          <div className="space-y-1">
            <Badge tone="success" variant="soft" className="capitalize">
              {enrollment.status.replace("_", " ")}
            </Badge>
            <h3 className="font-display text-lg font-medium">
              {enrollment.classSeries.name}
            </h3>
            <p className="text-xs text-[var(--muted-foreground)]">
              {enrollment.classSeries.program.name}
              {enrollment.classSeries.venue
                ? ` · ${enrollment.classSeries.venue.name}`
                : enrollment.classSeries.club
                  ? ` · ${enrollment.classSeries.club.name}`
                  : ""}
            </p>
          </div>
          <Button asChild variant="outline" size="sm">
            <Link href="/portal/classes">Cancel</Link>
          </Button>
        </div>
      </Section>

      {existingPending ? (
        <Section title="You already have a pending request">
          <p className="text-sm text-[var(--muted-foreground)]">
            We're reviewing your transfer request from{" "}
            <span className="text-[var(--foreground)]">
              {existingPending.createdAt.toLocaleString("en-NL")}
            </span>
            . You'll get a notification once the office decides.
            {existingPending.requestedNote && (
              <>
                {" "}Your note: <em>{existingPending.requestedNote}</em>
              </>
            )}
          </p>
        </Section>
      ) : (
        <TransferRequestForm
          enrollmentId={enrollment.id}
          studentName={studentName}
          candidates={candidates.map((c) => ({
            id: c.id,
            label: `${c.programName} · ${c.name} · ${c.venueName}`,
            startsOnIso: c.startsOn.toISOString(),
            pricePerSeries: c.pricePerSeries,
            isFull: c.isFull,
          }))}
        />
      )}
    </div>
  );
}
