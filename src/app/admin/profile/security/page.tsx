import { requireAdmin } from "@/lib/auth/require-admin";
import { prisma } from "@/lib/prisma";
import { PageHeader } from "@/components/ui/page-header";
import { SecurityForm } from "@/components/account/security-form";
import { updateMyPassword } from "@/lib/account/security-actions";

export default async function AdminProfileSecurityPage() {
  const { person } = await requireAdmin();

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
        title="Security"
        description="Sign-in email and password."
      />
      <SecurityForm
        primaryEmail={primaryEmail}
        action={updateMyPassword}
        submitTone="joint"
      />
    </div>
  );
}
