import Link from "next/link";

import { requireAdmin } from "@/lib/auth/require-admin";
import { SYSTEM_NO_COACH_PERSON_ID } from "@/lib/system-ids";
import {
  parseAdminClassesFilters,
} from "@/lib/admin/classes-filters";
import { listSeriesForAdmin } from "@/lib/admin/classes-queries";
import { PageHeader } from "@/components/ui/page-header";
import { Button } from "@/components/ui/button";
import { PlusIcon } from "@/components/icons";
import { Section } from "@/components/ui/section";
import { Badge } from "@/components/ui/badge";
import { Breadcrumbs } from "@/components/admin/breadcrumbs";

/**
 * Admin events list. Same data shape as classes — events live as
 * `ClassSeries` rows with `classType=event` and reuse the entire
 * sessions / coaches / enrollments machinery. The list is plain
 * because events are typically one-off rather than the weekly grid
 * the classes page deals with.
 */
export default async function AdminEventsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await requireAdmin();
  const sp = await searchParams;
  const filters = parseAdminClassesFilters(sp);

  const series = await listSeriesForAdmin(filters, "event");

  return (
    <div className="space-y-6">
      <Breadcrumbs items={[{ label: "Events" }]} />
      <PageHeader
        kicker="Admin · Events"
        title="Events"
        description="One-off events, tournaments and socials. Same plumbing as classes (sessions, enrollments, payments) just under their own surface so they don't clutter the weekly class grid."
        actions={
          <Button asChild tone="triaz">
            <Link href="/admin/events/new">
              <PlusIcon size={14} /> New event
            </Link>
          </Button>
        }
      />

      <Section title={`${series.length} event${series.length === 1 ? "" : "s"}`}>
        {series.length === 0 ? (
          <div className="rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--card)] p-6 text-center text-sm text-[var(--muted-foreground)]">
            Nothing yet. Use “New event” to set the first one up.
          </div>
        ) : (
          <div className="overflow-hidden rounded-[var(--radius-md)] border border-[var(--border)]">
            <table className="w-full text-left text-sm">
              <thead className="bg-[var(--muted)]/30 text-xs uppercase tracking-wide">
                <tr>
                  <th className="px-4 py-2">Name</th>
                  <th className="px-4 py-2">Program</th>
                  <th className="px-4 py-2">Venue</th>
                  <th className="px-4 py-2">Starts</th>
                  <th className="px-4 py-2">Status</th>
                  <th className="px-4 py-2">Enrolled</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--border)]">
                {series.map((s) => {
                  const lead = s.coaches.find(
                    (c) => c.role === "lead" && c.coach.personId !== SYSTEM_NO_COACH_PERSON_ID,
                  );
                  const leadName = lead
                    ? `${lead.coach.person.firstName ?? ""} ${lead.coach.person.lastName ?? ""}`.trim()
                    : null;
                  return (
                    <tr key={s.id}>
                      <td className="px-4 py-3">
                        <Link
                          href={`/admin/classes/${s.id}`}
                          className="text-[var(--triaz-ink)] underline-offset-4 hover:underline"
                        >
                          {s.name}
                        </Link>
                        {leadName && (
                          <div className="text-xs text-[var(--muted-foreground)]">
                            Lead · {leadName}
                          </div>
                        )}
                      </td>
                      <td className="px-4 py-3 text-[var(--muted-foreground)]">
                        {s.program.name}
                      </td>
                      <td className="px-4 py-3 text-[var(--muted-foreground)]">
                        {s.venue.name}
                      </td>
                      <td className="px-4 py-3 tabular text-xs text-[var(--muted-foreground)]">
                        {s.startsOn.toLocaleDateString("en-NL", {
                          month: "short",
                          day: "numeric",
                          year: "numeric",
                        })}
                      </td>
                      <td className="px-4 py-3">
                        <Badge
                          tone={
                            s.status === "published"
                              ? "success"
                              : s.status === "draft"
                                ? "warning"
                                : "neutral"
                          }
                          className="capitalize"
                        >
                          {s.status}
                        </Badge>
                      </td>
                      <td className="px-4 py-3 tabular">
                        {s._count.enrollments} / {s.maxStudents}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Section>
    </div>
  );
}
