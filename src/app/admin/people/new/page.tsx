import { requireAdmin } from "@/lib/auth/require-admin";
import { PageHeader } from "@/components/ui/page-header";
import { Breadcrumbs } from "@/components/admin/breadcrumbs";
import { PersonForm } from "../person-form";
import { createPerson } from "../actions";

export default async function NewPersonPage() {
  await requireAdmin();

  return (
    <div className="max-w-2xl space-y-6">
      <Breadcrumbs
        items={[
          { label: "People", href: "/admin/people" },
          { label: "New" },
        ]}
      />
      <PageHeader kicker="Admin · People" title="New person" />
      <PersonForm
        submitLabel="Create person"
        action={createPerson}
        defaults={{
          firstName: "",
          lastName: "",
          dateOfBirth: null,
          gender: null,
          phone: null,
          addressLine1: null,
          addressLine2: null,
          postalCode: null,
          city: null,
          country: "NL",
          emergencyContactName: null,
          emergencyContactPhone: null,
          emergencyContactRelationship: null,
          notes: null,
          isAdmin: false,
        }}
      />
    </div>
  );
}
