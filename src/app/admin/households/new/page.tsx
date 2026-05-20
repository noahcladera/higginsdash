import { requireAdmin } from "@/lib/auth/require-admin";
import { PageHeader } from "@/components/ui/page-header";
import { Breadcrumbs } from "@/components/admin/breadcrumbs";
import { HouseholdForm } from "../household-form";
import { createHousehold } from "../actions";

export default async function NewHouseholdPage() {
  await requireAdmin();

  return (
    <div className="max-w-2xl space-y-6">
      <Breadcrumbs
        items={[
          { label: "Households", href: "/admin/households" },
          { label: "New" },
        ]}
      />
      <PageHeader kicker="Admin · Households" title="New household" />
      <HouseholdForm
        submitLabel="Create household"
        action={createHousehold}
        defaults={{
          displayName: "",
          primaryContactPersonId: null,
          primaryContactInitial: null,
          addressLine1: null,
          addressLine2: null,
          postalCode: null,
          city: null,
          country: "NL",
          notes: null,
        }}
      />
    </div>
  );
}
