import { requireAdmin } from "@/lib/auth/require-admin";
import { PageHeader } from "@/components/ui/page-header";
import { getCurrentOrg, INDUSTRY_PRESETS, resolvePreset } from "@/lib/tenant";

import { PresetsGallery } from "./presets-gallery";

/**
 * Industry-preset gallery.
 *
 * Each preset is a named (features, terms, productMode) bundle. Applying
 * one locks your org to that industry model; feature toggles and glossary
 * then follow the code-defined bundle until platform support clears the lock.
 */
export default async function AdminPresetsPage() {
  await requireAdmin();
  const org = await getCurrentOrg();

  return (
    <div className="space-y-8">
      <PageHeader
        kicker="Settings"
        title="Industry presets"
        description={
          org.profileLocked
            ? "Your business model is locked. The cards below describe your active preset; contact support if you need a different industry bundle."
            : "Choose the industry bundle that matches how you operate. When you commit, we lock your profile so vocabulary and capabilities stay coherent — you grow by contacting support, not by flipping presets."
        }
      />
      <PresetsGallery
        presets={INDUSTRY_PRESETS.map((p) => {
          const resolved = resolvePreset(p.slug);
          return {
            slug: p.slug,
            label: p.label,
            description: p.description,
            productMode: p.productMode,
            enabledFeatureCount: Object.values(resolved.features).filter(Boolean)
              .length,
          };
        })}
        currentSlug={org.presetSlug}
        profileLocked={org.profileLocked}
      />
    </div>
  );
}
