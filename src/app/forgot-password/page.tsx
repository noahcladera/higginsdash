import { getCurrentBrand } from "@/lib/tenant";
import { ForgotPasswordCard } from "./forgot-password-card";

export default async function ForgotPasswordPage() {
  const brand = await getCurrentBrand();
  return (
    <main className="flex min-h-screen items-center justify-center bg-[var(--background)] px-4">
      <ForgotPasswordCard
        brandName={brand.displayName}
        brandLogoUrl={brand.logoUrl}
      />
    </main>
  );
}
