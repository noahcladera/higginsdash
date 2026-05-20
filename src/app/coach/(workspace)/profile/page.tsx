import { requireCoach } from "@/lib/auth/require-coach";
import { prisma } from "@/lib/prisma";
import { PageHeader } from "@/components/ui/page-header";
import { ProfileForm } from "@/components/account/profile-form";
import { updateMyProfileCoach } from "@/lib/account/profile-actions";

export default async function CoachProfilePage() {
  const { person } = await requireCoach();

  const full = await prisma.person.findUniqueOrThrow({
    where: { id: person.id },
    include: {
      emails: { where: { isPrimary: true }, take: 1 },
    },
  });

  const primaryEmail = full.emails[0]?.address ?? null;

  return (
    <div className="space-y-10">
      <PageHeader
        kicker="Account"
        title="Your details"
        description="Keep your contact info current."
      />

      {primaryEmail && (
        <div className="rounded-[var(--radius-md)] bg-[var(--surface)] px-5 py-4 text-sm">
          <span className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[var(--muted-foreground)]">
            Sign-in email
          </span>
          <div className="mt-1 flex flex-wrap items-center gap-2">
            <span className="font-medium">{primaryEmail}</span>
            <span className="text-xs text-[var(--muted-foreground)]">
              Managed via your sign-in — contact the office to change it.
            </span>
          </div>
        </div>
      )}

      <ProfileForm
        initial={{
          firstName: full.firstName,
          lastName: full.lastName,
          phone: full.phone ?? "",
          dateOfBirthIso: full.dateOfBirth
            ? full.dateOfBirth.toISOString().slice(0, 10)
            : "",
          gender: full.gender ?? "",
          addressLine1: full.addressLine1 ?? "",
          addressLine2: full.addressLine2 ?? "",
          postalCode: full.postalCode ?? "",
          city: full.city ?? "",
          country: full.country,
          emergencyContactName: full.emergencyContactName ?? "",
          emergencyContactPhone: full.emergencyContactPhone ?? "",
          emergencyContactRelationship:
            full.emergencyContactRelationship ?? "",
        }}
        action={updateMyProfileCoach}
      />
    </div>
  );
}
