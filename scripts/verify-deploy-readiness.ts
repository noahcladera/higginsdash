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

function warn(name: string, ok: boolean, detail?: string) {
  const mark = ok ? "OK" : "WARN";
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

  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL?.trim() ?? "";
  if (siteUrl) {
    warn(
      "NEXT_PUBLIC_SITE_URL shape",
      !siteUrl.endsWith("/") && siteUrl.startsWith("http"),
      siteUrl.endsWith("/") ? "remove trailing slash" : siteUrl,
    );
  }

  const adminEmails = process.env.PLATFORM_ADMIN_EMAILS?.trim();
  warn(
    "PLATFORM_ADMIN_EMAILS",
    !!adminEmails,
    adminEmails
      ? `${adminEmails.split(",").length} allowlisted`
      : "unset — first login may become admin on empty DB",
  );

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

  const resend = !!process.env.RESEND_API_KEY?.trim();
  warn(
    "RESEND_API_KEY",
    resend,
    resend
      ? "coach invites + receipts enabled"
      : "admin must copy magic links manually; no receipt email",
  );

  if (process.env.NODE_ENV === "production") {
    if (mollieTriaz || mollieHiggins) {
      check(
        "NEXT_PUBLIC_DEMO_MOLLIE=false",
        process.env.NEXT_PUBLIC_DEMO_MOLLIE === "false",
        "recommended when Mollie is live",
      );
    }
  }

  console.log("\nSupabase Auth (dashboard, not env):");
  console.log("  - Site URL must match NEXT_PUBLIC_SITE_URL");
  console.log("  - Redirect URLs must include <origin>/auth/callback");

  if (siteUrl) {
    console.log("\nMollie webhook (register in Mollie dashboard per account):");
    console.log(`  ${siteUrl}/api/mollie/webhook`);
  }

  const skipDb = process.argv.includes("--skip-db");
  const dbUrl = process.env.DATABASE_URL;
  if (dbUrl && !skipDb) {
    console.log("\nDatabase ping…");
    const prisma = new PrismaClient();
    try {
      await prisma.$queryRaw`SELECT 1`;
      console.log("  [OK] DATABASE_URL connects");

      const pending = await prisma.$queryRaw<
        { count: bigint }[]
      >`SELECT COUNT(*)::bigint AS count FROM _prisma_migrations WHERE finished_at IS NULL`;
      const n = Number(pending[0]?.count ?? 0);
      if (n > 0) {
        console.log(`  [WARN] ${n} pending migration(s) — run prisma migrate deploy`);
      }
    } catch (e) {
      console.log("  [FAIL] DATABASE_URL:", (e as Error).message);
      allOk = false;
    } finally {
      await prisma.$disconnect();
    }
  } else if (skipDb) {
    warn("DATABASE_URL", false, "skipped (--skip-db)");
  }

  console.log(
    allOk
      ? "\nReady for deploy (env). Run manual QA: handoff/qa-signoff-checklist.md"
      : "\nFix missing env before deploy.",
  );
  process.exit(allOk ? 0 : 1);
}

main();
