import Link from "next/link";
import { notFound } from "next/navigation";

import { requireAdmin } from "@/lib/auth/require-admin";
import { prisma } from "@/lib/prisma";
import { PageHeader } from "@/components/ui/page-header";
import { getTerms } from "@/lib/tenant";

import { ProgramPresentationForm } from "./program-presentation-form";
import { ProgramDeleteButton } from "./program-delete-button";

/**
 * Edit a program's presentation (cover + public description).
 *
 * Everything structural — audience, class type, visibility, display
 * order — still lives elsewhere. This page is deliberately narrow so
 * parents-facing copy and imagery can be iterated on without worrying
 * about breaking the scheduler.
 */
export default async function AdminProgramEditPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  await requireAdmin();
  const t = await getTerms();
  const { slug } = await params;
  const program = await prisma.program.findUnique({
    where: { slug },
    select: {
      id: true,
      name: true,
      slug: true,
      targetAudience: true,
      descriptionPublic: true,
      coverImageUrl: true,
      _count: { select: { classSeries: true } },
    },
  });
  if (!program) notFound();

  return (
    <div className="space-y-8">
      <PageHeader
        kicker="Programs"
        title={program.name}
        description="Edit what parents see for this program. Saves take effect immediately on the public catalog."
        actions={
          <Link
            href="/admin/programs"
            className="text-sm text-[var(--muted-foreground)] underline-offset-4 hover:underline"
          >
            ← All programs
          </Link>
        }
      />

      <ProgramPresentationForm
        programId={program.id}
        defaultCoverImageUrl={program.coverImageUrl ?? ""}
        defaultDescriptionPublic={program.descriptionPublic ?? ""}
      />

      <ProgramDeleteButton
        programId={program.id}
        programName={program.name}
        programSingular={t.program.singular}
        seriesCount={program._count.classSeries}
      />
    </div>
  );
}
