import { notFound } from "next/navigation";

import { requireAdmin } from "@/lib/auth/require-admin";
import { prisma } from "@/lib/prisma";
import { listAllVisibleSeries } from "@/lib/portal/catalog-queries";
import {
  ageBracketFromAge,
  computeEnrollmentPricing,
} from "@/lib/portal/enrollment-pricing";
import { getActiveMembershipCoverage } from "@/lib/memberships/coverage";
import { getHouseholdCreditBalanceCents } from "@/lib/credits";

import { PageHeader } from "@/components/ui/page-header";
import { Section } from "@/components/ui/section";
import { Badge } from "@/components/ui/badge";
import { Breadcrumbs } from "@/components/admin/breadcrumbs";

import { DecisionPanel } from "./_decision-panel";

/**
 * Admin transfer-decision page. Shows the source enrollment, the
 * parent's notes, and a class picker preloaded with prorated prices
 * so the office can see the financial delta before they commit.
 */
export default async function AdminTransferDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  await requireAdmin();

  const row = await prisma.classTransferRequest.findUnique({
    where: { id },
    include: {
      fromEnrollment: {
        include: {
          classSeries: {
            include: {
              program: { select: { name: true } },
              venue: { select: { club: { select: { slug: true } } } },
            },
          },
          student: {
            include: {
              person: {
                select: {
                  id: true,
                  firstName: true,
                  lastName: true,
                  dateOfBirth: true,
                  householdMember: { select: { householdId: true } },
                },
              },
            },
          },
        },
      },
      requestedBy: { select: { firstName: true, lastName: true } },
      requestedTargetClassSeries: { select: { id: true, name: true } },
      decidedBy: { select: { firstName: true, lastName: true } },
      resultEnrollment: {
        include: {
          classSeries: { select: { id: true, name: true } },
        },
      },
    },
  });
  if (!row) notFound();

  const studentName = `${row.fromEnrollment.student.person.firstName} ${row.fromEnrollment.student.person.lastName}`.trim();
  const householdId =
    row.fromEnrollment.student.person.householdMember?.householdId ?? null;
  const studentPersonId = row.fromEnrollment.student.person.id;

  const allCandidates = await listAllVisibleSeries();
  const candidates = allCandidates.filter(
    (s) => s.id !== row.fromEnrollment.classSeriesId,
  );

  // Pre-compute the prorated price for every candidate so the picker
  // can show the delta immediately. We only price candidates the same
  // way the parent flow would, including the membership add-on.
  const dob = row.fromEnrollment.student.person.dateOfBirth;
  const ageBracket = ageBracketFromAge(
    dob ? ageFromDob(dob) : null,
  );
  const coverage = await getActiveMembershipCoverage({
    householdId,
    candidatePersonIds: [studentPersonId],
  });
  const candidateIds = candidates.map((c) => c.id);
  const candidateSeries =
    candidateIds.length > 0
      ? await prisma.classSeries.findMany({
          where: { id: { in: candidateIds } },
          select: {
            id: true,
            pricePerSeries: true,
            sessions: {
              where: { status: { not: "cancelled" } },
              select: { startsAt: true },
            },
            venue: {
              select: { club: { select: { slug: true } } },
            },
            groups: {
              where: { archivedAt: null },
              select: { id: true, name: true },
            },
          },
        })
      : [];
  const seriesById = new Map(candidateSeries.map((s) => [s.id, s]));

  const now = new Date();
  const candidatePrices = candidates.map((c) => {
    const s = seriesById.get(c.id);
    const slugRaw = s?.venue?.club?.slug.toLowerCase() ?? null;
    const clubSlug =
      slugRaw === "triaz" || slugRaw === "randwijck" ? slugRaw : null;
    const hasMembership =
      clubSlug != null && coverage.has(studentPersonId, clubSlug);
    const breakdown = computeEnrollmentPricing({
      pricePerSeries:
        s?.pricePerSeries != null ? Number(s.pricePerSeries) : null,
      sessions: s?.sessions ?? [],
      now,
      venueClubSlug: clubSlug,
      hasActiveMembership: hasMembership,
      candidateAgeBracket: ageBracket,
    });
    return {
      id: c.id,
      label: `${c.programName} · ${c.name} · ${c.venueName}`,
      newLessonEur: breakdown.payableLesson ?? 0,
      isFull: c.isFull,
      groups: s?.groups ?? [],
    };
  });

  const originalPaidEur =
    row.fromEnrollment.pricePaid != null
      ? Number(row.fromEnrollment.pricePaid)
      : 0;
  const householdCreditCents = householdId
    ? await getHouseholdCreditBalanceCents(householdId)
    : 0;

  const isPending = row.status === "pending";

  return (
    <div className="space-y-6">
      <Breadcrumbs
        items={[
          { label: "Transfer requests", href: "/admin/transfers" },
          { label: studentName },
        ]}
      />
      <PageHeader
        kicker="Admin · Class transfer"
        title={`${studentName} · ${row.fromEnrollment.classSeries.name}`}
        description={`Requested by ${row.requestedBy.firstName} ${row.requestedBy.lastName} · ${row.fromEnrollment.classSeries.program.name}`}
      />

      <Section title="Status">
        <div className="flex flex-wrap items-center gap-3 rounded-[var(--radius-lg)] bg-[var(--surface)] p-5 shadow-[var(--shadow-sm)]">
          <Badge
            tone={
              row.status === "approved"
                ? "success"
                : row.status === "pending"
                  ? "warning"
                  : "neutral"
            }
            className="capitalize"
          >
            {row.status}
          </Badge>
          {row.resolution && (
            <Badge tone="neutral" className="capitalize">
              {row.resolution.replace("_", " ")}
            </Badge>
          )}
          {row.deltaCents != null && (
            <span className="text-sm text-[var(--muted-foreground)]">
              Delta: €{(row.deltaCents / 100).toFixed(2)}
            </span>
          )}
          {row.decidedAt && (
            <span className="text-xs text-[var(--muted-foreground)]">
              Decided {row.decidedAt.toLocaleString("en-NL")}{" "}
              {row.decidedBy
                ? `by ${row.decidedBy.firstName} ${row.decidedBy.lastName}`
                : ""}
            </span>
          )}
        </div>
        {row.adminNote && (
          <p className="mt-2 text-xs text-[var(--muted-foreground)]">
            Admin note: {row.adminNote}
          </p>
        )}
        {row.resultEnrollment && (
          <p className="mt-2 text-xs text-[var(--muted-foreground)]">
            New enrollment:{" "}
            <span className="text-[var(--foreground)]">
              {row.resultEnrollment.classSeries.name}
            </span>
          </p>
        )}
      </Section>

      <Section title="Parent's request">
        <div className="space-y-2 rounded-[var(--radius-lg)] bg-[var(--surface)] p-5 shadow-[var(--shadow-sm)]">
          <p className="text-sm">
            Source class:{" "}
            <span className="font-medium">
              {row.fromEnrollment.classSeries.name}
            </span>{" "}
            · paid €{originalPaidEur.toFixed(2)}
          </p>
          <p className="text-sm">
            Requested target:{" "}
            <span className="font-medium">
              {row.requestedTargetClassSeries?.name ?? "no preference"}
            </span>
          </p>
          {row.requestedNote && (
            <p className="text-sm text-[var(--muted-foreground)]">
              Note: “{row.requestedNote}”
            </p>
          )}
          <p className="text-xs text-[var(--muted-foreground)]">
            Household credit on file: €
            {(householdCreditCents / 100).toFixed(2)}
          </p>
        </div>
      </Section>

      {isPending ? (
        <DecisionPanel
          transferRequestId={row.id}
          originalPaidEur={originalPaidEur}
          requestedTargetId={row.requestedTargetClassSeries?.id ?? null}
          candidates={candidatePrices}
        />
      ) : (
        <Section title="No further action">
          <p className="text-sm text-[var(--muted-foreground)]">
            This request has already been resolved.
          </p>
        </Section>
      )}
    </div>
  );
}

function ageFromDob(dob: Date): number {
  const now = new Date();
  let age = now.getFullYear() - dob.getFullYear();
  const m = now.getMonth() - dob.getMonth();
  if (m < 0 || (m === 0 && now.getDate() < dob.getDate())) age--;
  return age;
}
