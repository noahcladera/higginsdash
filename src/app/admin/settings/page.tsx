import Link from "next/link";

import { requireAdmin } from "@/lib/auth/require-admin";
import { Button } from "@/components/ui/button";
import {
  FEATURE_FLAG_GROUPS,
  getCurrentOrg,
  getPreset,
  INDUSTRY_PRESETS,
} from "@/lib/tenant";

/**
 * Settings overview.
 *
 * Single-page snapshot of how the current org is configured: which preset
 * it derives from, which features are on, what its identity is. Each
 * card links into its own editor screen — keeps the overview focused
 * and avoids shipping a god-page.
 */
export default async function AdminSettingsOverviewPage() {
  await requireAdmin();
  const org = await getCurrentOrg();
  const preset = getPreset(org.presetSlug);
  const enabledCount = Object.values(org.features).filter(Boolean).length;
  const totalCount = Object.values(org.features).length;
  const featureSummaryByGroup = FEATURE_FLAG_GROUPS.map((group) => {
    const on = group.flags.filter((f) => org.features[f.key]).length;
    return { ...group, on, total: group.flags.length };
  });

  return (
    <div className="space-y-8">
      <p className="max-w-prose text-sm text-[var(--muted-foreground)]">
        Everything in this hub is editable. Pick the preset that's closest to
        your business, switch off the features you don't use, rename anything
        that doesn't fit your vocabulary. The whole app — admin, member portal,
        coach workspace, emails — updates immediately.
      </p>

      <section className="grid gap-4 lg:grid-cols-3">
        <Card
          title="Identity"
          subtitle={`${org.brand.country} · ${org.brand.locale} · ${org.brand.currency}`}
          href="/admin/settings/general"
          ctaLabel="Edit general"
        >
          <div className="text-base font-medium">{org.brand.displayName}</div>
          <div className="text-xs text-[var(--muted-foreground)]">
            Short name: {org.brand.shortName}
          </div>
        </Card>

        <Card
          title="Industry preset"
          subtitle={preset.label}
          href="/admin/settings/presets"
          ctaLabel="Browse presets"
        >
          <p className="text-sm text-[var(--muted-foreground)]">
            {preset.description}
          </p>
        </Card>

        <Card
          title="Branding"
          subtitle="Logo + display name"
          href="/admin/settings/branding"
          ctaLabel="Edit branding"
        >
          <div className="flex items-center gap-3">
            {org.brand.logoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={org.brand.logoUrl}
                alt=""
                className="h-10 w-10 rounded-md border border-[var(--border)] bg-white object-contain"
              />
            ) : (
              <div className="flex h-10 w-10 items-center justify-center rounded-md border border-dashed border-[var(--border)] text-xs text-[var(--muted-foreground)]">
                No logo
              </div>
            )}
            <div className="text-xs text-[var(--muted-foreground)]">
              Shown in the sidebar, login page, and emails.
            </div>
          </div>
        </Card>
      </section>

      <section className="space-y-4 rounded-2xl border border-[var(--border)] bg-[var(--card)] p-6">
        <div className="flex items-baseline justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold">Features</h2>
            <p className="text-sm text-[var(--muted-foreground)]">
              {enabledCount} of {totalCount} surfaces enabled. Toggle any of
              them on the Features page.
            </p>
          </div>
          <Button asChild variant="outline">
            <Link href="/admin/settings/features">Edit features</Link>
          </Button>
        </div>

        <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {featureSummaryByGroup.map((group) => (
            <li
              key={group.id}
              className="rounded-md border border-[var(--border)] bg-[var(--surface)] p-3"
            >
              <div className="text-sm font-medium">{group.label}</div>
              <div className="text-xs text-[var(--muted-foreground)]">
                {group.on} / {group.total} on
              </div>
            </li>
          ))}
        </ul>
      </section>

      <section className="space-y-4 rounded-2xl border border-[var(--border)] bg-[var(--card)] p-6">
        <div className="flex items-baseline justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold">Terminology</h2>
            <p className="text-sm text-[var(--muted-foreground)]">
              Replace any domain word with one your members already use.
            </p>
          </div>
          <Button asChild variant="outline">
            <Link href="/admin/settings/terminology">Edit terminology</Link>
          </Button>
        </div>
        <dl className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Term label="Coach" value={org.terms.coach.singular} />
          <Term label="Court" value={org.terms.court.singular} />
          <Term label="Class" value={org.terms.class.singular} />
          <Term label="Club" value={org.terms.club.singular} />
          <Term label="Member" value={org.terms.member.singular} />
          <Term label="Student" value={org.terms.student.singular} />
          <Term label="Season" value={org.terms.season.singular} />
          <Term label="Program" value={org.terms.program.singular} />
        </dl>
      </section>

      <section className="rounded-2xl border border-dashed border-[var(--border)] p-6">
        <div className="flex flex-col gap-2">
          <h3 className="text-sm font-semibold uppercase tracking-wide text-[var(--muted-foreground)]">
            Other tenants
          </h3>
          <p className="text-sm text-[var(--muted-foreground)]">
            For previewing the app as a different org. This sets a cookie on
            your browser only.
          </p>
          <Button asChild variant="outline" className="self-start">
            <Link href="/admin/settings/product-mode">Switch active tenant</Link>
          </Button>
        </div>
      </section>

      <p className="text-xs text-[var(--muted-foreground)]">
        Currently editing: <strong>{org.slug}</strong> · Preset:{" "}
        <strong>{preset.label}</strong>
      </p>

      <ul className="hidden">{INDUSTRY_PRESETS.map((p) => <li key={p.slug}>{p.label}</li>)}</ul>
    </div>
  );
}

function Card({
  title,
  subtitle,
  href,
  ctaLabel,
  children,
}: {
  title: string;
  subtitle: string;
  href: string;
  ctaLabel: string;
  children: React.ReactNode;
}) {
  return (
    <article className="flex flex-col gap-3 rounded-2xl border border-[var(--border)] bg-[var(--card)] p-5">
      <div>
        <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--muted-foreground)]">
          {title}
        </div>
        <div className="text-base font-medium">{subtitle}</div>
      </div>
      <div className="flex-1">{children}</div>
      <Button asChild variant="outline" size="sm" className="self-start">
        <Link href={href}>{ctaLabel}</Link>
      </Button>
    </article>
  );
}

function Term({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-[var(--border)] bg-[var(--surface)] px-3 py-2">
      <dt className="text-[10px] font-semibold uppercase tracking-wide text-[var(--muted-foreground)]">
        {label}
      </dt>
      <dd className="text-sm">{value}</dd>
    </div>
  );
}
