import { requireAdmin } from "@/lib/auth/require-admin";
import { PageHeader } from "@/components/ui/page-header";
import {
  FEATURE_FLAG_GROUPS,
  getCurrentOrg,
  getPreset,
} from "@/lib/tenant";

import { FeaturesEditor } from "./features-editor";

/**
 * Feature toggle screen.
 *
 * One section per feature group with a clear "what does this do" sentence
 * for every flag. Admins flip whatever they need; we save the full set
 * (so disabling one and re-saving doesn't accidentally inherit a stale
 * value from an old preset).
 */
export default async function AdminFeaturesPage() {
  await requireAdmin();
  const org = await getCurrentOrg();

  return (
    <div className="space-y-8">
      <PageHeader
        kicker="Settings"
        title="Features"
        description={
          org.profileLocked
            ? `Capabilities included with your industry preset (${getPreset(org.presetSlug).label}). Support can adjust modules if your business changes.`
            : `Switch surfaces on or off. Disabling a feature hides every page that depends on it from the sidebar and 404s the URL — no risk of half-shipped UI for a tenant that doesn't use it. Default bundle (preset template): ${getPreset(org.presetSlug).label}. After you lock your industry preset, this page becomes read-only.`
        }
      />
      <FeaturesEditor
        groups={FEATURE_FLAG_GROUPS}
        features={org.features}
        readOnly={org.profileLocked}
      />
    </div>
  );
}
