import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { RECOVERY_COOKIE } from "@/lib/auth/password-reset";
import { getCurrentBrand } from "@/lib/tenant";
import { ResetPasswordCard } from "./reset-password-card";

export default async function ResetPasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string }>;
}) {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login?error=auth_callback_failed");
  }

  const params = await searchParams;
  const cookieStore = await cookies();
  const hasRecoveryCookie = cookieStore.get(RECOVERY_COOKIE)?.value === "1";

  if (!hasRecoveryCookie && params.from === "recovery") {
    cookieStore.set(RECOVERY_COOKIE, "1", {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: 3600,
      path: "/reset-password",
    });
  } else if (!hasRecoveryCookie) {
    redirect("/login?error=auth_callback_failed");
  }

  const brand = await getCurrentBrand();
  return (
    <main className="flex min-h-screen items-center justify-center bg-[var(--background)] px-4">
      <ResetPasswordCard
        brandName={brand.displayName}
        brandLogoUrl={brand.logoUrl}
      />
    </main>
  );
}
