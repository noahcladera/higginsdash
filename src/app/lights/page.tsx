import Link from "next/link";
import { Button } from "@/components/ui/button";
import { requireAuthedPerson } from "@/lib/auth/require-authed-person";
import { getCurrentBrand, getTerms } from "@/lib/tenant";

/**
 * Court-lights how-to page. The Ralph smart-light system is what controls
 * the lights at the courts; every member gets the same shared credentials.
 *
 * Gated on "logged in to a non-archived account" — coaches and members
 * both need this. Real download links + credentials are placeholders for
 * now; replace once we have the production Ralph account.
 */
export default async function LightsPage() {
  await requireAuthedPerson();
  const [brand, terms] = await Promise.all([getCurrentBrand(), getTerms()]);
  const courtSingular = terms.court.singular.toLowerCase();
  const memberSingular = terms.member.singular.toLowerCase();

  return (
    <div className="mx-auto max-w-xl space-y-8 px-6 py-12">
      <header className="space-y-2">
        <h1 className="text-2xl font-semibold tracking-tight">
          Turn on the {courtSingular} lights
        </h1>
        <p className="text-sm text-[var(--muted-foreground)]">
          {brand.shortName} {courtSingular} lights are controlled through the
          Ralph app. Every {memberSingular} uses the same shared login.
        </p>
      </header>

      <section className="space-y-3">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-[var(--muted-foreground)]">
          1. Get the app
        </h2>
        <div className="flex flex-wrap gap-2">
          <Button asChild variant="outline">
            <a href="#" target="_blank" rel="noreferrer">
              Download for iOS
            </a>
          </Button>
          <Button asChild variant="outline">
            <a href="#" target="_blank" rel="noreferrer">
              Download for Android
            </a>
          </Button>
        </div>
        <p className="text-xs text-[var(--muted-foreground)]">
          Real store links coming soon.
        </p>
      </section>

      <section className="space-y-3">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-[var(--muted-foreground)]">
          2. Sign in
        </h2>
        <dl className="grid grid-cols-[max-content_1fr] gap-x-6 gap-y-2 rounded-md border border-[var(--border)] bg-[var(--card)] p-4 text-sm">
          <dt className="text-[var(--muted-foreground)]">Username</dt>
          <dd className="font-mono">
            {brand.officeEmail ?? "members@example.com"}
          </dd>
          <dt className="text-[var(--muted-foreground)]">Password</dt>
          <dd className="font-mono">
            {brand.shortName.toLowerCase()}-lights
          </dd>
        </dl>
        <p className="text-xs text-[var(--muted-foreground)]">
          Please don&apos;t share these outside the {terms.club.singular.toLowerCase()}.
        </p>
      </section>

      <section className="space-y-3">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-[var(--muted-foreground)]">
          3. Pick your {courtSingular}
        </h2>
        <p className="text-sm text-[var(--muted-foreground)]">
          Open the app, choose your {courtSingular}, and tap on. Lights stay on
          for the rest of your hour and switch off automatically.
        </p>
      </section>

      <div className="pt-4">
        <Link
          href="/portal"
          className="text-sm text-[var(--muted-foreground)] underline hover:text-[var(--foreground)]"
        >
          ← Back
        </Link>
      </div>
    </div>
  );
}
