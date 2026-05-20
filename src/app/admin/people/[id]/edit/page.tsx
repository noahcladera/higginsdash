import { notFound } from "next/navigation";
import { requireAdmin } from "@/lib/auth/require-admin";
import { prisma } from "@/lib/prisma";
import { PageHeader } from "@/components/ui/page-header";
import { Breadcrumbs } from "@/components/admin/breadcrumbs";
import { PersonForm } from "../../person-form";
import { updatePerson } from "../../actions";
import { SYSTEM_PERSON_ID } from "@/lib/system-ids";

export default async function EditPersonPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { person: actor } = await requireAdmin();
  const { id } = await params;

  if (id === SYSTEM_PERSON_ID) notFound();

  const person = await prisma.person.findUnique({ where: { id } });
  if (!person) notFound();

  const fullName =
    [person.firstName, person.lastName].filter(Boolean).join(" ").trim() ||
    "(no name)";
  const isSelf = actor.id === person.id;

  async function action(formData: FormData) {
    "use server";
    await updatePerson(id, formData);
  }

  return (
    <div className="max-w-2xl space-y-6">
      <Breadcrumbs
        items={[
          { label: "People", href: "/admin/people" },
          { label: fullName, href: `/admin/people/${person.id}` },
          { label: "Edit" },
        ]}
      />
      <PageHeader kicker="Admin · People" title={`Edit ${fullName}`} />
      <PersonForm
        submitLabel="Save changes"
        action={action}
        lockIsAdmin={isSelf}
        defaults={{
          firstName: person.firstName,
          lastName: person.lastName,
          dateOfBirth: person.dateOfBirth
            ? person.dateOfBirth.toISOString().slice(0, 10)
            : null,
          gender: person.gender,
          phone: person.phone,
          addressLine1: person.addressLine1,
          addressLine2: person.addressLine2,
          postalCode: person.postalCode,
          city: person.city,
          country: person.country,
          emergencyContactName: person.emergencyContactName,
          emergencyContactPhone: person.emergencyContactPhone,
          emergencyContactRelationship: person.emergencyContactRelationship,
          notes: person.notes,
          isAdmin: person.isAdmin,
        }}
      />
    </div>
  );
}
