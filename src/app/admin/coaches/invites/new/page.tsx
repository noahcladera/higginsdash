import Link from "next/link";
import { requireAdmin } from "@/lib/auth/require-admin";
import { prisma } from "@/lib/prisma";
import { PageHeader } from "@/components/ui/page-header";
import { Button } from "@/components/ui/button";
import { InviteCoachForm } from "./invite-coach-form";

export default async function NewCoachInvitePage() {
  await requireAdmin();

  const clubs = await prisma.club.findMany({
    where: { isActive: true, archivedAt: null },
    orderBy: [{ displayOrder: "asc" }, { name: "asc" }],
    select: { id: true, name: true, slug: true },
  });

  return (
    <div className="mx-auto max-w-lg space-y-8">
      <PageHeader
        kicker="Coaches"
        title="Invite a coach"
        description="Creates the coach account immediately and gives you a copyable sign-in link (or temporary password). Staff: leave all clubs unchecked to allow every club; ZZP: pick at least one club."
        actions={
          <Button asChild variant="outline" size="sm">
            <Link href="/admin/coaches">Back</Link>
          </Button>
        }
      />

      <InviteCoachForm clubs={clubs} />
    </div>
  );
}
