import Link from "next/link";
import { requireAdmin } from "@/lib/auth/require-admin";
import { prisma } from "@/lib/prisma";
import { PageHeader } from "@/components/ui/page-header";
import { Section } from "@/components/ui/section";
import { Badge } from "@/components/ui/badge";
import { StatusBadge } from "@/components/ui/status-badge";
import { enrollmentStatusTone } from "@/lib/ui/status-tone";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { resolveEnrollmentReview } from "@/app/admin/classes/actions";
import { getStudentContactsBulk } from "@/lib/contacts/queries";
import { ContactButton } from "@/components/contacts/contact-button";
import { getCurrentBrand } from "@/lib/tenant";

/**
 * Heather feedback v1: when a parent enrolls a child outside the
 * configured age band, the portal sets `Enrollment.requiresReview =
 * true`. The office runs a weekly pass through this queue to confirm
 * the fit (or move the family to a better group) and clears the flag.
 */
export default async function EnrollmentReviewsPage() {
  await requireAdmin();
  const brand = await getCurrentBrand();

  const rows = await prisma.enrollment.findMany({
    where: { requiresReview: true, status: { not: "withdrawn" } },
    orderBy: { enrolledOn: "desc" },
    take: 200,
    include: {
      student: {
        select: {
          person: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              dateOfBirth: true,
              phone: true,
              emails: {
                where: { isPrimary: true, archivedAt: null },
                select: { address: true },
                take: 1,
              },
            },
          },
        },
      },
      classSeries: {
        select: {
          id: true,
          name: true,
          minAge: true,
          maxAge: true,
        },
      },
      group: {
        select: { name: true, minAge: true, maxAge: true },
      },
    },
  });

  const contactGroups = await getStudentContactsBulk(
    rows.map((e) => e.studentPersonId),
  );
  const contactByPerson = new Map(contactGroups.map((g) => [g.personId, g]));

  return (
    <div className="space-y-6">
      <PageHeader
        kicker="Admin · Reviews"
        title="Age-band reviews"
        description={
          rows.length === 0
            ? "Nothing to review right now."
            : `${rows.length} enrollment${rows.length === 1 ? "" : "s"} flagged for office sign-off.`
        }
      />

      <Section
        title="Pending sign-off"
        description="A parent enrolled outside the recommended age band. Confirm with the family, then resolve to clear the flag."
        surface="card"
      >
        {rows.length === 0 ? (
          <EmptyState
            title="All caught up"
            description="When a parent enrolls a child outside the recommended age band, it lands here."
          />
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Student</TableHead>
                <TableHead>Class series</TableHead>
                <TableHead>Group band</TableHead>
                <TableHead>Reason</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="w-32">Enrolled</TableHead>
                <TableHead className="w-[220px]"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((e) => {
                const fullName = [
                  e.student.person.firstName,
                  e.student.person.lastName,
                ]
                  .filter(Boolean)
                  .join(" ");
                const age = ageFromDob(e.student.person.dateOfBirth);
                const groupBand = bandLabel(
                  e.group?.minAge ?? e.classSeries.minAge,
                  e.group?.maxAge ?? e.classSeries.maxAge,
                );
                const seriesHref = `/admin/classes/${e.classSeries.id}`;
                return (
                  <TableRow key={e.id} className="align-top">
                    <TableCell>
                      <div className="font-medium">{fullName}</div>
                      <div className="text-xs text-[var(--muted-foreground)]">
                        {age != null ? `Age ${age}` : "Age unknown"}
                      </div>
                      {e.student.person.emails[0]?.address && (
                        <div className="text-xs text-[var(--muted-foreground)]">
                          <a
                            href={`mailto:${e.student.person.emails[0].address}`}
                            className="underline-offset-2 hover:underline"
                          >
                            {e.student.person.emails[0].address}
                          </a>
                        </div>
                      )}
                      {e.student.person.phone && (
                        <div className="text-xs text-[var(--muted-foreground)]">
                          <a
                            href={`tel:${e.student.person.phone}`}
                            className="underline-offset-2 hover:underline"
                          >
                            {e.student.person.phone}
                          </a>
                        </div>
                      )}
                    </TableCell>
                    <TableCell className="text-sm">
                      <Link
                        href={seriesHref}
                        className="font-medium text-[var(--triaz-ink)] underline-offset-4 hover:underline"
                      >
                        {e.classSeries.name}
                      </Link>
                      {e.group && (
                        <div className="text-xs text-[var(--muted-foreground)]">
                          Group: {e.group.name}
                        </div>
                      )}
                    </TableCell>
                    <TableCell className="text-xs text-[var(--muted-foreground)]">
                      {groupBand}
                    </TableCell>
                    <TableCell className="text-xs text-[var(--muted-foreground)]">
                      {formatReason(e.reviewReason)}
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-col items-start gap-1">
                        <StatusBadge tone="warning">Needs review</StatusBadge>
                        <Badge
                          tone={enrollmentStatusTone(e.status)}
                          variant="soft"
                          className="capitalize"
                        >
                          {e.status.replace("_", " ")}
                        </Badge>
                      </div>
                    </TableCell>
                    <TableCell className="text-xs text-[var(--muted-foreground)]">
                      {e.enrolledOn.toLocaleDateString("en-NL", {
                        day: "2-digit",
                        month: "short",
                        year: "numeric",
                      })}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex flex-wrap items-center justify-end gap-2">
                        {(() => {
                          const group = contactByPerson.get(
                            e.studentPersonId,
                          );
                          if (!group || group.targets.length === 0) return null;
                          return (
                            <ContactButton
                              group={group}
                              subjectName={fullName}
                              brandName={brand.shortName}
                              size="xs"
                            />
                          );
                        })()}
                        <Button asChild variant="ghost" size="sm">
                          <Link href={seriesHref}>Open class</Link>
                        </Button>
                        <form action={resolveEnrollmentReview}>
                          <input
                            type="hidden"
                            name="enrollmentId"
                            value={e.id}
                          />
                          <Button
                            type="submit"
                            size="sm"
                            variant="solid"
                          >
                            Resolve
                          </Button>
                        </form>
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        )}
      </Section>
    </div>
  );
}

function bandLabel(
  min: number | null | undefined,
  max: number | null | undefined,
): string {
  if (min != null && max != null) return `${min}–${max}`;
  if (min != null) return `${min}+`;
  if (max != null) return `≤${max}`;
  return "no band";
}

function formatReason(reason: string | null | undefined): string {
  if (!reason) return "needs review";
  const [kind, ...rest] = reason.split(":");
  if (kind === "age_override" && rest.length >= 2) {
    return `Age ${rest[0]} vs band ${rest[1]}`;
  }
  return kind.replace(/_/g, " ");
}

function ageFromDob(dob: Date | null): number | null {
  if (!dob) return null;
  const now = new Date();
  let age = now.getFullYear() - dob.getFullYear();
  const m = now.getMonth() - dob.getMonth();
  if (m < 0 || (m === 0 && now.getDate() < dob.getDate())) age--;
  return age;
}
