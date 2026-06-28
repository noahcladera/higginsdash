import { requireCoach } from "@/lib/auth/require-coach";
import { prisma } from "@/lib/prisma";
import { ShellPageHeader } from "@/components/portal/shell-page-header";
import { SecurityForm } from "@/components/account/security-form";
import { updateMyPassword } from "@/lib/account/security-actions";

export default async function CoachProfileSecurityPage() {
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
      <ShellPageHeader
        kicker="Account"
        title="Security"
        description="Sign-in email and password."
      />
      <SecurityForm primaryEmail={primaryEmail} action={updateMyPassword} />
    </div>
  );
}
