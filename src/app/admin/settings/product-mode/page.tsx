import { requireAdmin } from "@/lib/auth/require-admin";
import { PageHeader } from "@/components/ui/page-header";
import { Button } from "@/components/ui/button";
import { getCurrentOrg, listRegisteredOrgs } from "@/lib/tenant";

import { setProductMode } from "../actions";

/**
 * Dev escape hatch — flip the per-browser cookie that picks which org
 * the current request resolves to, without actually owning a session
 * for that org. Useful for QA-ing the surface across tenants.
 *
 * The main configuration UX is the rest of the settings hub
 * (`/admin/settings`, /general, /presets, /features, /terminology,
 * /branding); this page is intentionally austere.
 */
export default async function AdminProductModePage() {
  await requireAdmin();
  const [current, orgs] = await Promise.all([
    getCurrentOrg(),
    listRegisteredOrgs(),
  ]);

  return (
    <div className="space-y-8">
      <PageHeader
        kicker="Settings"
        title="Switch active tenant"
        description="Dev-only control for previewing the app as a different organization. Sets a cookie scoped to your browser only — does not affect other users."
      />

      <section className="grid gap-4 md:grid-cols-2">
        {orgs.map((org) => {
          const isCurrent = org.slug === current.slug;
          const enabledFeatures = Object.entries(org.features)
            .filter(([, on]) => on)
            .map(([name]) => name);
          return (
            <form key={org.slug} action={setProductMode}>
              <input type="hidden" name="mode" value={org.productMode} />
              <input type="hidden" name="slug" value={org.slug} />
              <div
                className={`relative space-y-4 rounded-2xl border p-5 ${
                  isCurrent
                    ? "border-[var(--triaz)] bg-[var(--triaz-soft)]/40"
                    : "border-[var(--border)] bg-[var(--card)]"
                }`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--muted-foreground)]">
                      {org.productMode}
                    </div>
                    <h2 className="font-display text-2xl leading-tight">
                      {org.brand.displayName}
                    </h2>
                    <div className="text-sm text-[var(--muted-foreground)]">
                      {org.brand.country} · {org.brand.currency} ·{" "}
                      {org.brand.locale}
                    </div>
                  </div>
                  {isCurrent && (
                    <span className="rounded-full bg-[var(--triaz)] px-2.5 py-0.5 text-[11px] font-semibold uppercase tracking-wider text-white">
                      Active
                    </span>
                  )}
                </div>

                <div className="text-xs text-[var(--muted-foreground)]">
                  {enabledFeatures.length} feature
                  {enabledFeatures.length === 1 ? "" : "s"} enabled ·{" "}
                  Preset: {org.presetSlug}
                </div>

                {!isCurrent && (
                  <Button type="submit" className="w-full">
                    Switch to this org
                  </Button>
                )}
              </div>
            </form>
          );
        })}
      </section>

      <form action={setProductMode}>
        <input type="hidden" name="mode" value="reset" />
        <Button type="submit" variant="outline">
          Reset to default
        </Button>
      </form>
    </div>
  );
}
