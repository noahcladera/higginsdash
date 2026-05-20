import { notFound } from "next/navigation";
import Link from "next/link";
import { requireAdmin } from "@/lib/auth/require-admin";
import { prisma } from "@/lib/prisma";
import { PageHeader } from "@/components/ui/page-header";
import { Section } from "@/components/ui/section";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { updateSchool, archiveSchool } from "../actions";
import { SchoolForm } from "../school-form";

export default async function EditSchoolPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requireAdmin();
  const { id } = await params;
  const school = await prisma.school.findUnique({
    where: { id },
    include: { _count: { select: { classSeries: true } } },
  });
  if (!school) notFound();

  return (
    <div className="space-y-8">
      <PageHeader
        kicker="Admin · Schools"
        title={school.name}
        description={school.isActive ? "Editing details." : "Archived school."}
        actions={
          <Button asChild variant="ghost" size="sm">
            <Link href="/admin/schools">← Back to schools</Link>
          </Button>
        }
      />

      {!school.isActive && (
        <div className="rounded-[var(--radius-md)] bg-[var(--warning-soft)] px-5 py-3 text-sm text-[oklch(0.30_0.10_75)]">
          This school is archived. New pickup classes can't be created here
          until it's unarchived.
        </div>
      )}

      <SchoolForm
        action={updateSchool}
        submitLabel="Save changes"
        school={{
          id: school.id,
          slug: school.slug,
          name: school.name,
          coachArriveAtHubMinutes: school.coachArriveAtHubMinutes,
          notes: school.notes,
        }}
      />

      <Section
        title="Danger zone"
        description={
          school._count.classSeries > 0
            ? `Used by ${school._count.classSeries} class series. Archive to hide from new class creation; existing series keep working.`
            : "Archive to hide from new class creation."
        }
      >
        <form action={archiveSchool}>
          <input type="hidden" name="schoolId" value={school.id} />
          <input
            type="hidden"
            name="archive"
            value={school.isActive ? "archive" : "unarchive"}
          />
          <div className="flex items-center justify-between gap-4 rounded-[var(--radius-md)] bg-[var(--surface)] px-5 py-4">
            <div className="space-y-1">
              <div className="text-sm font-medium">
                {school.isActive ? "Archive school" : "Unarchive school"}
              </div>
              <div className="text-xs text-[var(--muted-foreground)]">
                {school.isActive
                  ? "Hide from new class creation. Existing references stay intact."
                  : "Make available for new class series again."}
              </div>
            </div>
            <div className="flex items-center gap-3">
              {!school.isActive && (
                <Badge tone="neutral" variant="soft">
                  archived
                </Badge>
              )}
              <Button
                type="submit"
                variant={school.isActive ? "destructive" : "outline"}
                size="sm"
              >
                {school.isActive ? "Archive" : "Unarchive"}
              </Button>
            </div>
          </div>
        </form>
      </Section>
    </div>
  );
}
