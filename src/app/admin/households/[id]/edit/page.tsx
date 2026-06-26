import { notFound } from "next/navigation";
import { requireAdmin } from "@/lib/auth/require-admin";
import { prisma } from "@/lib/prisma";
import { PageHeader } from "@/components/ui/page-header";
import { Breadcrumbs } from "@/components/admin/breadcrumbs";
import { HouseholdForm } from "../../household-form";
import { updateHousehold } from "../../actions";
import { SYSTEM_HOUSEHOLD_ID } from "@/lib/system-ids";

export default async function EditHouseholdPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requireAdmin();
  const { id } = await params;

  if (id === SYSTEM_HOUSEHOLD_ID) notFound();

  const household = await prisma.household.findUnique({
    where: { id },
    include: {
      primaryContact: {
        include: {
          emails: {
            where: { isPrimary: true, archivedAt: null },
            select: { address: true },
            take: 1,
          },
        },
      },
    },
  });
  if (!household) notFound();

  async function action(formData: FormData) {
    "use server";
    return updateHousehold(id, formData);
  }

  return (
    <div className="max-w-2xl space-y-6">
      <Breadcrumbs
        items={[
          { label: "Households", href: "/admin/households" },
          {
            label: household.displayName,
            href: `/admin/households/${household.id}`,
          },
          { label: "Edit" },
        ]}
      />
      <PageHeader kicker="Admin · Households" title={`Edit ${household.displayName}`} />
      <HouseholdForm
        submitLabel="Save changes"
        action={action}
        returnTo={`/admin/households/${household.id}`}
        householdId={household.id}
        primaryContactRestrictedToMembers
        defaults={{
          displayName: household.displayName,
          primaryContactPersonId: household.primaryContactPersonId,
          primaryContactInitial: {
            id: household.primaryContact.id,
            name:
              [household.primaryContact.firstName, household.primaryContact.lastName]
                .filter(Boolean)
                .join(" ")
                .trim() || "(no name)",
            email: household.primaryContact.emails[0]?.address ?? null,
          },
          addressLine1: household.addressLine1,
          addressLine2: household.addressLine2,
          postalCode: household.postalCode,
          city: household.city,
          country: household.country,
          notes: household.notes,
        }}
      />
    </div>
  );
}
