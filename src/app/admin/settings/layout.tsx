import Link from "next/link";

import { requireAdmin } from "@/lib/auth/require-admin";
import { getCurrentOrg, getPreset } from "@/lib/tenant";

/**
 * Settings hub shell.
 *
 * Renders a horizontal sub-nav across the top with one tab per page in
 * the settings area. The active tab is determined client-side by the
 * pathname; we keep this server-only by emitting plain links and letting
 * the underlying app shell handle the highlight via CSS selectors that
 * the shell already wires up for the main sidebar.
 */
const TABS: ReadonlyArray<{ href: string; label: string; description: string }> = [
  {
    href: "/admin/settings",
    label: "Overview",
    description: "Where things stand.",
  },
  {
    href: "/admin/settings/general",
    label: "General",
    description: "Name, country, locale, currency.",
  },
  {
    href: "/admin/settings/presets",
    label: "Presets",
    description: "Pick an industry template.",
  },
  {
    href: "/admin/settings/features",
    label: "Features",
    description: "Toggle every surface on or off.",
  },
  {
    href: "/admin/settings/terminology",
    label: "Terminology",
    description: "Rename Coach → Teacher, Court → Studio, etc.",
  },
  {
    href: "/admin/settings/branding",
    label: "Branding",
    description: "Logo + display name.",
  },
  {
    href: "/admin/settings/photos",
    label: "Photos",
    description: "Club tiles, promo strips, membership accents.",
  },
  {
    href: "/admin/settings/levels",
    label: "Level descriptions",
    description: "Curriculum copy.",
  },
] as const;

export default async function AdminSettingsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  await requireAdmin();
  const org = await getCurrentOrg();
  const preset = getPreset(org.presetSlug);

  return (
    <div className="space-y-8">
      <header className="flex flex-col gap-2 border-b border-[var(--border)] pb-4">
        <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--triaz-ink)]">
          Settings · {org.brand.shortName}
        </div>
        <div className="flex items-baseline justify-between gap-3">
          <h1 className="font-display text-3xl font-medium leading-tight">
            Configure {org.brand.shortName}
          </h1>
          <div className="text-xs text-[var(--muted-foreground)]">
            Active preset: <span className="font-medium">{preset.label}</span>
          </div>
        </div>
        <nav className="flex flex-wrap gap-1 pt-2">
          {TABS.map((tab) => (
            <Link
              key={tab.href}
              href={tab.href}
              className="rounded-md px-3 py-1.5 text-sm text-[var(--muted-foreground)] hover:bg-[var(--surface)] hover:text-[var(--foreground)]"
            >
              {tab.label}
            </Link>
          ))}
        </nav>
      </header>
      {children}
    </div>
  );
}
