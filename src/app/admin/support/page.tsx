import Link from "next/link";

import { requireAdmin } from "@/lib/auth/require-admin";
import { isPlatformSupportEmail } from "@/lib/auth/require-platform-support";
import { PageHeader } from "@/components/ui/page-header";

/**
 * Entry point for Higgins staff tools (org profile unlock, etc.).
 */
export default async function SupportHomePage() {
  const { user } = await requireAdmin();

  if (!isPlatformSupportEmail(user.email)) {
    return (
      <div className="mx-auto max-w-2xl space-y-4 p-8">
        <h1 className="text-xl font-semibold">Not available</h1>
        <p className="text-sm text-[var(--muted-foreground)]">
          Add your email to <code>PLATFORM_SUPPORT_EMAILS</code> to use internal
          support routes.
        </p>
        <Link href="/admin" className="text-sm underline">
          Back to dashboard
        </Link>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6 p-6">
      <PageHeader
        kicker="Platform"
        title="Support tools"
        description="Internal-only utilities. Open an organization’s lock page from the URL below (replace the slug)."
      />
      <div className="rounded-2xl border border-[var(--border)] bg-[var(--card)] p-6 text-sm space-y-3">
        <p className="font-medium">Unlock preset / terminology lock</p>
        <p className="text-[var(--muted-foreground)]">
          <code className="break-all text-[var(--foreground)]">
            /admin/support/orgs/&lt;org-slug&gt;/locks
          </code>
        </p>
      </div>
    </div>
  );
}
