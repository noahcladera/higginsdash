import { Suspense } from "react";

import { getCurrentBrand } from "@/lib/tenant";
import { LoginCard } from "./login-card";

/**
 * Login page shell (server component). Resolves the active tenant's
 * brand so the heading ("Higgins Tennis NL" for Higgins, whatever
 * displayName the org config carries for a programs-mode pilot) is
 * rendered server-side and the client bundle stays tenant-agnostic.
 */
export default async function LoginPage() {
  const brand = await getCurrentBrand();
  return (
    <main className="flex min-h-screen items-center justify-center bg-[var(--background)] px-4">
      <Suspense fallback={null}>
        <LoginCard
          brandName={brand.displayName}
          brandLogoUrl={brand.logoUrl}
        />
      </Suspense>
    </main>
  );
}
