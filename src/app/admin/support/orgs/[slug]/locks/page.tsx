import Link from "next/link";
import { notFound } from "next/navigation";

import { requireAdmin } from "@/lib/auth/require-admin";
import { isPlatformSupportEmail } from "@/lib/auth/require-platform-support";
import { PageHeader } from "@/components/ui/page-header";
import { prisma } from "@/lib/prisma";

import { UnlockProfileLockForm } from "./unlock-profile-lock-form";

export default async function SupportOrgLocksPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { user } = await requireAdmin();
  const { slug } = await params;

  if (!isPlatformSupportEmail(user.email)) {
    return (
      <div className="mx-auto max-w-2xl space-y-4 p-8">
        <h1 className="text-xl font-semibold">Not available</h1>
        <p className="text-sm text-[var(--muted-foreground)]">
          Platform support tools are restricted to addresses listed in{" "}
          <code className="rounded bg-[var(--surface)] px-1 py-0.5">
            PLATFORM_SUPPORT_EMAILS
          </code>
          .
        </p>
        <Link href="/admin" className="text-sm underline">
          Back to dashboard
        </Link>
      </div>
    );
  }

  const org = await prisma.organization.findUnique({
    where: { slug },
    select: {
      slug: true,
      displayName: true,
      shortName: true,
      presetSlug: true,
      presetLockedAt: true,
      terminologyLocked: true,
    },
  });

  if (!org) notFound();

  const isLocked = org.presetLockedAt != null;

  return (
    <div className="mx-auto max-w-2xl space-y-8 p-6">
      <PageHeader
        kicker="Platform support"
        title="Organization profile lock"
        description="Clear preset / terminology lock so the tenant can pick a different industry preset or edit glossary and features again. This is audited."
      />
      <div className="rounded-2xl border border-[var(--border)] bg-[var(--card)] p-6 text-sm space-y-2">
        <p>
          <strong>{org.displayName}</strong>{" "}
          <span className="text-[var(--muted-foreground)]">({org.slug})</span>
        </p>
        <p className="text-[var(--muted-foreground)]">
          Short name: {org.shortName}
        </p>
        <p className="text-[var(--muted-foreground)]">
          Preset: <code className="text-[var(--foreground)]">{org.presetSlug}</code>
        </p>
        <p className="text-[var(--muted-foreground)]">
          Locked:{" "}
          <strong className="text-[var(--foreground)]">
            {isLocked ? "yes" : "no"}
          </strong>
          {org.presetLockedAt && (
            <>
              {" "}
              (since {org.presetLockedAt.toISOString()})
            </>
          )}
        </p>
        <p className="text-[var(--muted-foreground)]">
          Terminology locked flag:{" "}
          <strong className="text-[var(--foreground)]">
            {org.terminologyLocked ? "true" : "false"}
          </strong>
        </p>
      </div>
      <UnlockProfileLockForm orgSlug={org.slug} isLocked={isLocked} />
      <p className="text-xs text-[var(--muted-foreground)]">
        If unlock fails with a configuration error, set{" "}
        <code>PLATFORM_SUPPORT_EMAILS</code> in the deployment environment.
      </p>
    </div>
  );
}
