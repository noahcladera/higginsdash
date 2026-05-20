import { getCurrentBrand } from "@/lib/tenant";

import { SignupCard } from "./signup-card";

/**
 * Signup shell (server component). Resolves the current tenant's
 * brand so the heading and copy reference the org the user is
 * actually signing up with. The client card below stays
 * tenant-agnostic.
 */
export default async function SignupPage() {
  const brand = await getCurrentBrand();
  return (
    <main className="min-h-screen bg-[var(--background)]">
      <div className="mx-auto max-w-2xl px-4 py-10 sm:py-16">
        <SignupCard brandName={brand.displayName} />
      </div>
    </main>
  );
}
