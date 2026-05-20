import { requireAdmin } from "@/lib/auth/require-admin";
import { PageHeader } from "@/components/ui/page-header";
import { createVenue } from "../actions";
import { VenueForm } from "../venue-form";

export default async function NewVenuePage() {
  await requireAdmin();
  return (
    <div className="space-y-8">
      <PageHeader
        kicker="Admin · Venues"
        title="New venue"
        description="Add a class location. For schools and rented courts, leave the club link empty."
      />
      <VenueForm action={createVenue} submitLabel="Create venue" />
    </div>
  );
}
