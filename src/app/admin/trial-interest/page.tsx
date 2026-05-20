import Link from "next/link";
import { requireAdmin } from "@/lib/auth/require-admin";
import { prisma } from "@/lib/prisma";
import { PageHeader } from "@/components/ui/page-header";
import { Section } from "@/components/ui/section";
import { Badge } from "@/components/ui/badge";
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
import type {
  TrialInterestAudience,
  TrialInterestClub,
  TrialInterestStatus,
} from "@prisma/client";
import { updateTrialInterest } from "./actions";
import { ContactButton } from "@/components/contacts/contact-button";
import type { PersonContactGroup } from "@/lib/contacts/queries";
import { getCurrentBrand, getTerms } from "@/lib/tenant";
import { TRIAL_INTEREST_STATUS_TONE } from "@/lib/ui/status-tone";

const STATUS_LABEL: Record<TrialInterestStatus, string> = {
  new: "New",
  in_progress: "Working",
  scheduled: "Scheduled",
  converted: "Converted",
  closed: "Closed",
};

const AUDIENCE_LABEL: Record<TrialInterestAudience, string> = {
  kids: "Kids",
  adults: "Adults",
};

const CLUB_LABEL: Record<TrialInterestClub, string> = {
  triaz: "Triaz",
  randwijck: "Randwijck",
  no_preference: "No preference",
};

interface PageProps {
  searchParams: Promise<{ show?: string }>;
}

export default async function TrialInterestQueuePage({
  searchParams,
}: PageProps) {
  await requireAdmin();
  const sp = await searchParams;
  const showAll = sp.show === "all";
  const [brand, terms] = await Promise.all([getCurrentBrand(), getTerms()]);

  const rows = await prisma.trialInterest.findMany({
    where: showAll
      ? undefined
      : { status: { in: ["new", "in_progress", "scheduled"] } },
    orderBy: [{ status: "asc" }, { createdAt: "desc" }],
    take: 200,
    include: {
      person: {
        select: { firstName: true, lastName: true },
      },
      classSeries: {
        select: {
          name: true,
          program: { select: { name: true } },
        },
      },
    },
  });

  const openCount = rows.filter(
    (r) => r.status !== "closed" && r.status !== "converted",
  ).length;

  return (
    <div className="space-y-6">
      <PageHeader
        kicker="Admin · Leads"
        title="Trial requests"
        description={
          showAll
            ? `${rows.length} request${rows.length === 1 ? "" : "s"} (all statuses).`
            : `${openCount} open request${openCount === 1 ? "" : "s"} from the public form.`
        }
        actions={
          <Button asChild variant="outline" size="sm">
            <Link href={showAll ? "/admin/trial-interest" : "/admin/trial-interest?show=all"}>
              {showAll ? "Open only" : "Show all"}
            </Link>
          </Button>
        }
      />

      <Section
        title="Queue"
        description="Reach out within a couple of days. Move the row through Working → Scheduled → Converted/Closed as you go."
        surface="card"
      >
        {rows.length === 0 ? (
          <EmptyState
            title="Nothing in the queue"
            description="When someone submits the trial form on the public site it lands here."
          />
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-28">Status</TableHead>
                <TableHead>Contact</TableHead>
                <TableHead>Player</TableHead>
                <TableHead>Audience / club</TableHead>
                <TableHead>Class</TableHead>
                <TableHead>Notes</TableHead>
                <TableHead className="w-20 text-right">Age</TableHead>
                <TableHead className="w-32">Received</TableHead>
                <TableHead className="w-[260px]">Update</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((r) => (
                <TableRow key={r.id} className="align-top">
                  <TableCell>
                    <Badge tone={TRIAL_INTEREST_STATUS_TONE[r.status]} variant="soft">
                      {STATUS_LABEL[r.status]}
                    </Badge>
                    {r.isRepeat && (
                      <div className="mt-1">
                        <Badge tone="warning" variant="outline">
                          Repeat request #{r.priorTrialCount + 1}
                        </Badge>
                      </div>
                    )}
                  </TableCell>
                  <TableCell className="text-sm">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <div className="font-medium text-[var(--foreground)]">
                          {r.contactName}
                        </div>
                        <div className="text-xs text-[var(--muted-foreground)] break-all">
                          {r.email}
                        </div>
                        {r.phone && (
                          <div className="text-xs text-[var(--muted-foreground)]">
                            {r.phone}
                          </div>
                        )}
                        {r.person && (
                          <div className="text-xs text-[var(--muted-foreground)]">
                            Linked person:{" "}
                            {`${r.person.firstName} ${r.person.lastName}`.trim()}
                          </div>
                        )}
                      </div>
                      <ContactButton
                        group={
                          {
                            personId: r.id,
                            personLabel: r.contactName,
                            subjectName: r.playerName ?? r.contactName,
                            targets: [
                              {
                                key: `lead:${r.id}`,
                                label: r.contactName,
                                description: "Trial enquiry",
                                phone: r.phone ?? null,
                                email: r.email,
                                origin: "self",
                              },
                            ],
                          } satisfies PersonContactGroup
                        }
                        subjectName={r.playerName ?? r.contactName}
                        brandName={brand.shortName}
                        emailSubject={`${brand.shortName} · trial ${terms.privateLesson.singular.toLowerCase()} follow-up`}
                        size="xs"
                      />
                    </div>
                  </TableCell>
                  <TableCell className="text-sm">
                    {r.playerName ?? <span className="text-[var(--muted-foreground)]">—</span>}
                  </TableCell>
                  <TableCell className="text-sm">
                    <div>{AUDIENCE_LABEL[r.audience]}</div>
                    {r.preferredClub && (
                      <div className="text-xs text-[var(--muted-foreground)]">
                        {CLUB_LABEL[r.preferredClub]}
                      </div>
                    )}
                  </TableCell>
                  <TableCell className="text-sm">
                    {r.classSeries ? (
                      <div>
                        <div className="font-medium">{r.classSeries.name}</div>
                        <div className="text-xs text-[var(--muted-foreground)]">
                          {r.classSeries.program.name}
                        </div>
                      </div>
                    ) : (
                      <span className="text-[var(--muted-foreground)]">—</span>
                    )}
                  </TableCell>
                  <TableCell className="text-xs text-[var(--muted-foreground)] whitespace-pre-wrap break-words max-w-[260px]">
                    {r.notes ?? <span className="opacity-60">—</span>}
                    {r.adminNotes && (
                      <div className="mt-1 rounded border border-dashed border-[var(--border)] p-1.5 text-[var(--foreground)]">
                        <span className="font-medium">Internal: </span>
                        {r.adminNotes}
                      </div>
                    )}
                  </TableCell>
                  <TableCell className="text-right text-sm tabular-nums">
                    {r.playerAge ?? "—"}
                  </TableCell>
                  <TableCell className="text-xs text-[var(--muted-foreground)]">
                    {r.createdAt.toLocaleDateString("en-NL", {
                      day: "2-digit",
                      month: "short",
                    })}
                  </TableCell>
                  <TableCell>
                    <form action={updateTrialInterest} className="space-y-2">
                      <input type="hidden" name="id" value={r.id} />
                      <select
                        name="status"
                        defaultValue={r.status}
                        className="h-8 w-full rounded-md border border-[var(--border)] bg-[var(--background)] px-2 text-xs"
                      >
                        <option value="new">New</option>
                        <option value="in_progress">Working</option>
                        <option value="scheduled">Scheduled</option>
                        <option value="converted">Converted</option>
                        <option value="closed">Closed</option>
                      </select>
                      <textarea
                        name="adminNotes"
                        defaultValue={r.adminNotes ?? ""}
                        rows={2}
                        placeholder="Internal note…"
                        className="w-full rounded-md border border-[var(--border)] bg-[var(--background)] p-2 text-xs"
                      />
                      <Button type="submit" size="sm" className="w-full">
                        Save
                      </Button>
                    </form>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </Section>
    </div>
  );
}
