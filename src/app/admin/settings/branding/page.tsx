import { requireAdmin } from "@/lib/auth/require-admin";
import { prisma } from "@/lib/prisma";
import { getCurrentOrg, splitBrandForWordmark } from "@/lib/tenant";
import { PageHeader } from "@/components/ui/page-header";

import { BrandingEditor } from "./branding-editor";

/**
 * Admin branding page.
 *
 * Three stacked sections:
 *   - Logo upload (ImageUpload with kind="logo").
 *   - Display name: brand title + optional subline used by the wordmark.
 *   - Live preview of <Wordmark> with whatever the admin has staged.
 *
 * Branding fields live on the `organizations` row, alongside features +
 * terminology. The tenant resolver merges this row into `getCurrentOrg()`
 * so admin edits take effect on the very next request.
 */
export default async function AdminBrandingPage() {
  await requireAdmin();
  const org = await getCurrentOrg();
  const wordmark = splitBrandForWordmark(org.brand);
  const row = await prisma.organization.findUnique({
    where: { slug: org.slug },
    select: { logoUrl: true, brandTitle: true, brandSubline: true },
  });

  return (
    <div className="space-y-8">
      <PageHeader
        kicker="Settings"
        title="Branding"
        description="Upload your logo and set the display name that appears in the sidebar, on the login page, and in the tab title. Changes take effect right away for every signed-in user in your organization."
      />

      <BrandingEditor
        orgSlug={org.slug}
        defaultLogoUrl={row?.logoUrl ?? org.brand.logoUrl ?? ""}
        defaultBrandTitle={row?.brandTitle ?? wordmark.title}
        defaultBrandSubline={row?.brandSubline ?? wordmark.subline ?? ""}
        fallbackDisplayName={org.brand.displayName}
      />
    </div>
  );
}
