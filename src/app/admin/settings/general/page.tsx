import { requireAdmin } from "@/lib/auth/require-admin";
import { PageHeader } from "@/components/ui/page-header";
import { getCurrentOrg } from "@/lib/tenant";
import { prisma } from "@/lib/prisma";

import { GeneralEditor } from "./general-editor";

/**
 * Org identity editor.
 *
 * Display name, short name, country, locale, currency. These are rarely
 * changed after onboarding but the wrong locale ("en-US" on a Dutch
 * tenant) shows up everywhere — date formats, currency rendering, the
 * default sender on transactional email — so it has to be editable.
 */
export default async function AdminGeneralSettingsPage() {
  await requireAdmin();
  const org = await getCurrentOrg();
  const row = await prisma.organization.findUnique({
    where: { slug: org.slug },
    select: {
      displayName: true,
      shortName: true,
      country: true,
      locale: true,
      currency: true,
      officeEmail: true,
    },
  });

  return (
    <div className="space-y-8">
      <PageHeader
        kicker="Settings"
        title="General"
        description="Your organization's identity. The display name shows up at the top of every page and email; country / locale / currency drive how dates and prices are formatted."
      />
      <GeneralEditor
        defaultDisplayName={row?.displayName ?? org.brand.displayName}
        defaultShortName={row?.shortName ?? org.brand.shortName}
        defaultCountry={row?.country ?? org.brand.country}
        defaultLocale={row?.locale ?? org.brand.locale}
        defaultCurrency={row?.currency ?? org.brand.currency}
        defaultOfficeEmail={row?.officeEmail ?? org.brand.officeEmail ?? ""}
      />
    </div>
  );
}
