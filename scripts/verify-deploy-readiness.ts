/**
 * Pre-deploy sanity checks (env vars, optional DB connectivity).
 *
 *   dotenv -e .env.local -- npx tsx scripts/verify-deploy-readiness.ts
 */

import { PrismaClient } from "@prisma/client";

const required = [
  "NEXT_PUBLIC_SUPABASE_URL",
  "NEXT_PUBLIC_SUPABASE_ANON_KEY",
  "SUPABASE_SERVICE_ROLE_KEY",
  "DATABASE_URL",
  "DIRECT_URL",
  "NEXT_PUBLIC_SITE_URL",
] as const;

function check(name: string, ok: boolean, detail?: string) {
  const mark = ok ? "OK" : "MISSING";
  console.log(`  [${mark}] ${name}${detail ? ` — ${detail}` : ""}`);
  return ok;
}

async function main() {
  console.log("Higgins deploy readiness\n");

  let allOk = true;
  for (const key of required) {
    const val = process.env[key]?.trim();
    if (!check(key, !!val)) allOk = false;
  }

  const mollieTriaz = !!process.env.MOLLIE_API_KEY_TRIAZ?.trim();
  const mollieHiggins = !!process.env.MOLLIE_API_KEY_HIGGINS?.trim();
  check(
    "MOLLIE (at least one key)",
    mollieTriaz || mollieHiggins,
    mollieTriaz && mollieHiggins
      ? "both accounts"
      : mollieTriaz
        ? "triaz only"
        : mollieHiggins
          ? "higgins only"
          : "demo checkout only",
  );

  check("RESEND_API_KEY", !!process.env.RESEND_API_KEY?.trim(), "transactional email");

  if (process.env.NODE_ENV === "production") {
    if (mollieTriaz || mollieHiggins) {
      check(
        "NEXT_PUBLIC_DEMO_MOLLIE=false",
        process.env.NEXT_PUBLIC_DEMO_MOLLIE === "false",
        "recommended when Mollie is live",
      );
    }
  }

  const dbUrl = process.env.DATABASE_URL;
  if (dbUrl) {
    console.log("\nDatabase ping…");
    const prisma = new PrismaClient();
    try {
      await prisma.$queryRaw`SELECT 1`;
      console.log("  [OK] DATABASE_URL connects");
    } catch (e) {
      console.log("  [FAIL] DATABASE_URL:", (e as Error).message);
      allOk = false;
    } finally {
      await prisma.$disconnect();
    }
  }

  console.log(allOk ? "\nReady for deploy (env)." : "\nFix missing env before deploy.");
  process.exit(allOk ? 0 : 1);
}

main();
