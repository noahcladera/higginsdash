import { notFound } from "next/navigation";
import Link from "next/link";
import { requireAdmin } from "@/lib/auth/require-admin";
import { prisma } from "@/lib/prisma";
import { PageHeader } from "@/components/ui/page-header";
import { Section } from "@/components/ui/section";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { updateVenue, archiveVenue } from "../actions";
import { VenueForm } from "../venue-form";

export default async function EditVenuePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requireAdmin();
  const { id } = await params;
  const venue = await prisma.venue.findUnique({
    where: { id },
    include: { _count: { select: { classSeries: true } } },
  });
  if (!venue) notFound();

  return (
    <div className="space-y-8">
      <PageHeader
        kicker="Admin · Venues"
        title={venue.name}
        description={venue.isActive ? "Editing details." : "Archived venue."}
        actions={
          <Button asChild variant="ghost" size="sm">
            <Link href="/admin/venues">← Back to venues</Link>
          </Button>
        }
      />

      {!venue.isActive && (
        <div className="rounded-[var(--radius-md)] bg-[var(--warning-soft)] px-5 py-3 text-sm text-[oklch(0.30_0.10_75)]">
          This venue is archived. New classes can't be created here until it's
          unarchived.
        </div>
      )}

      <VenueForm
        action={updateVenue}
        submitLabel="Save changes"
        venue={{
          id: venue.id,
          slug: venue.slug,
          name: venue.name,
          kind: venue.kind,
          addressLine1: venue.addressLine1,
          addressLine2: venue.addressLine2,
          postalCode: venue.postalCode,
          city: venue.city,
          country: venue.country,
          clubId: venue.clubId,
          notes: venue.notes,
        }}
      />

      <Section
        title="Danger zone"
        description={
          venue._count.classSeries > 0
            ? `Used by ${venue._count.classSeries} class series. Archive to hide from new class creation; existing series keep working.`
            : "Archive to hide from new class creation."
        }
      >
        <form action={archiveVenue}>
          <input type="hidden" name="venueId" value={venue.id} />
          <input
            type="hidden"
            name="archive"
            value={venue.isActive ? "archive" : "unarchive"}
          />
          <div className="flex items-center justify-between gap-4 rounded-[var(--radius-md)] bg-[var(--surface)] px-5 py-4">
            <div className="space-y-1">
              <div className="text-sm font-medium">
                {venue.isActive ? "Archive venue" : "Unarchive venue"}
              </div>
              <div className="text-xs text-[var(--muted-foreground)]">
                {venue.isActive
                  ? "Hide from new class creation. Existing references stay intact."
                  : "Make available for new class series again."}
              </div>
            </div>
            <div className="flex items-center gap-3">
              {!venue.isActive && (
                <Badge tone="neutral" variant="soft">
                  archived
                </Badge>
              )}
              <Button
                type="submit"
                variant={venue.isActive ? "destructive" : "outline"}
                size="sm"
              >
                {venue.isActive ? "Archive" : "Unarchive"}
              </Button>
            </div>
          </div>
        </form>
      </Section>
    </div>
  );
}
