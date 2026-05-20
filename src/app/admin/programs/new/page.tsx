import Link from "next/link";

import { requireAdmin } from "@/lib/auth/require-admin";
import { getTerms } from "@/lib/tenant";
import { PageHeader } from "@/components/ui/page-header";

import { NewProgramForm } from "./new-program-form";

export default async function AdminNewProgramPage() {
  await requireAdmin();
  const t = await getTerms();

  return (
    <div className="space-y-8">
      <PageHeader
        kicker="Catalog"
        title={`New ${t.program.singular}`}
        description={`Create an empty ${t.program.singular.toLowerCase()} card for the portal, then attach class series under Classes. You can set the cover image and public blurb on the next screen.`}
        actions={
          <Link
            href="/admin/programs"
            className="text-sm text-[var(--muted-foreground)] underline-offset-4 hover:underline"
          >
            ← All {t.program.plural.toLowerCase()}
          </Link>
        }
      />

      <NewProgramForm programSingular={t.program.singular} />
    </div>
  );
}
