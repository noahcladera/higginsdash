import Link from "next/link";
import { notFound } from "next/navigation";
import { requireAdmin } from "@/lib/auth/require-admin";
import { prisma } from "@/lib/prisma";
import { PageHeader } from "@/components/ui/page-header";
import { Breadcrumbs } from "@/components/admin/breadcrumbs";
import { Button } from "@/components/ui/button";
import { Section } from "@/components/ui/section";
import { CourtFormFields } from "../court-form-fields";
import { updateCourt, archiveCourt } from "../actions";

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function CourtEditPage({ params }: PageProps) {
  await requireAdmin();
  const { id } = await params;

  const court = await prisma.court.findUnique({
    where: { id },
    include: { club: { select: { name: true } } },
  });
  if (!court) notFound();

  return (
    <div className="space-y-6">
      <Breadcrumbs
        items={[
          { label: "Courts", href: "/admin/courts" },
          { label: court.club.name },
        ]}
      />
      <PageHeader
        kicker="Admin · Courts"
        title={court.name}
        description={`${court.surface} · ${court.qualityTier}${court.isActive ? "" : " · archived"}`}
      />

      <CourtFormFields
        action={updateCourt}
        returnTo="/admin/courts"
        court={{
          id: court.id,
          name: court.name,
          displayOrder: court.displayOrder,
          surface: court.surface,
          qualityTier: court.qualityTier,
          isBookable: court.isBookable,
          notes: court.notes,
        }}
      />

      <Section
        title="Archive"
        description={`Hide this court from new scheduling while keeping historical bookings and classes intact.`}
      >
        <form action={archiveCourt} className="max-w-md rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--surface)] p-4">
          <input type="hidden" name="courtId" value={court.id} />
          <input
            type="hidden"
            name="archive"
            value={court.isActive ? "archive" : "unarchive"}
          />
          <p className="text-xs text-[var(--muted-foreground)]">
            This will {court.isActive ? "archive" : "restore"} the court. Existing
            history stays untouched.
          </p>
          <div className="mt-3 flex items-center gap-2">
            <Button
              type="submit"
              variant={court.isActive ? "destructive" : "outline"}
              size="sm"
            >
              {court.isActive ? "Archive court" : "Unarchive court"}
            </Button>
          </div>
        </form>
      </Section>
    </div>
  );
}
