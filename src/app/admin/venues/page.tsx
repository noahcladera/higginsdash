import Link from "next/link";
import { requireAdmin } from "@/lib/auth/require-admin";
import { prisma } from "@/lib/prisma";
import { PageHeader } from "@/components/ui/page-header";
import { EmptyState } from "@/components/ui/empty-state";
import { Button } from "@/components/ui/button";
import { PlusIcon, MapPinIcon } from "@/components/icons";
import { getTerms } from "@/lib/tenant";
import { VenueDirectory } from "./_components/venue-directory";

export default async function AdminVenuesPage() {
  await requireAdmin();
  const t = await getTerms();

  const venues = await prisma.venue.findMany({
    orderBy: [{ isActive: "desc" }, { name: "asc" }],
    include: {
      club: { select: { name: true, slug: true } },
      _count: { select: { classSeries: true } },
    },
  });

  return (
    <div className="space-y-8">
      <PageHeader
        kicker="Admin"
        title={t.venue.plural}
        description={`Every place a ${t.class.singular.toLowerCase()} can happen — club courts, school sites, and rented locations. Pickup and ${t.coach.singular.toLowerCase()}-arrive timing lives on Schools, not here.`}
        actions={
          <Button asChild tone="triaz">
            <Link href="/admin/venues/new">
              <PlusIcon /> New {t.venue.singular.toLowerCase()}
            </Link>
          </Button>
        }
      />

      {venues.length === 0 ? (
        <EmptyState
          icon={<MapPinIcon size={20} />}
          title={`No ${t.venue.plural.toLowerCase()} yet`}
          description={`Create the physical sites so ${t.class.plural.toLowerCase()} can point at them.`}
          action={
            <Button asChild tone="triaz" size="sm">
              <Link href="/admin/venues/new">New venue</Link>
            </Button>
          }
        />
      ) : (
        <VenueDirectory
          venues={venues}
          classLabel={t.class.plural}
          classSingular={t.class.singular}
        />
      )}
    </div>
  );
}
