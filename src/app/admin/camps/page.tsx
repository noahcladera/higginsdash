import Link from "next/link";
import { requireAdmin } from "@/lib/auth/require-admin";
import { parseAdminClassesFilters } from "@/lib/admin/classes-filters";
import { listSeriesForAdmin } from "@/lib/admin/classes-queries";
import { PageHeader } from "@/components/ui/page-header";
import { Button } from "@/components/ui/button";
import { PlusIcon, CalendarIcon } from "@/components/icons";
import { Section } from "@/components/ui/section";
import { EmptyState } from "@/components/ui/empty-state";
import { Badge } from "@/components/ui/badge";
import { Breadcrumbs } from "@/components/admin/breadcrumbs";

export default async function AdminCampsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await requireAdmin();
  const sp = await searchParams;
  const filters = parseAdminClassesFilters(sp);
  const series = await listSeriesForAdmin(filters, "camp");

  return (
    <div className="space-y-6">
      <Breadcrumbs items={[{ label: "Camps" }]} />
      <PageHeader
        kicker="Admin · Camps"
        title="Camps"
        description="Holiday and break camps with flexible enrollment options and member/non-member pricing."
        actions={
          <Button asChild tone="triaz">
            <Link href="/admin/camps/new">
              <PlusIcon size={14} /> New camp
            </Link>
          </Button>
        }
      />
      <Section title={`${series.length} camp${series.length === 1 ? "" : "s"}`}>
        {series.length === 0 ? (
          <EmptyState
            icon={<CalendarIcon size={20} />}
            title="No camps yet"
            description="Use “New camp” to create one."
          />
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
                {series.map((s) => (
                  <tr key={s.id}>
                    <td className="px-4 py-3">
                      <Link
                        href={`/admin/classes/${s.id}`}
                        className="text-[var(--triaz-ink)] underline-offset-4 hover:underline"
                      >
                        {s.name}
                      </Link>
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
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Section>
    </div>
  );
}
