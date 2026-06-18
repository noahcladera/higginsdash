/**
 * Validates Mollie env vars and API key authentication.
 *
 *   dotenv -e .env.local -- npx tsx scripts/check-mollie-config.ts
 */

import { getMollieClient } from "@/lib/payments/mollie-client";
import { getMollieApiKey, getSiteUrl, isMollieConfigured } from "@/lib/payments/config";
import type { MollieAccount } from "@/lib/payments/mollie-accounts";

function checkKeyShape(name: string, key: string | null): boolean {
  if (!key) {
    console.log(`  [MISSING] ${name}`);
    return false;
  }
  const ok = key.startsWith("test_") || key.startsWith("live_");
  const mode = key.startsWith("test_") ? "test" : key.startsWith("live_") ? "live" : "invalid";
  console.log(`  [${ok ? "OK" : "WARN"}] ${name} — ${mode} key (${key.length} chars)`);
  return ok;
}

async function pingAccount(account: MollieAccount): Promise<boolean> {
  const key = getMollieApiKey(account);
  if (!key) return false;
  try {
    const client = getMollieClient(account);
    await client.payments.page({ limit: 1 });
    console.log(`  [OK] ${account} API — authenticated`);
    return true;
  } catch (e) {
    console.log(`  [FAIL] ${account} API — ${(e as Error).message}`);
    return false;
  }
}

async function main() {
  console.log("Mollie configuration check\n");

  let ok = true;

  const triazKey = getMollieApiKey("triaz");
  const higginsKey = getMollieApiKey("higgins");
  if (!checkKeyShape("MOLLIE_API_KEY_TRIAZ", triazKey)) ok = false;
  if (!checkKeyShape("MOLLIE_API_KEY_HIGGINS", higginsKey)) ok = false;

  if (triazKey && higginsKey && triazKey === higginsKey) {
    console.log("  [INFO] TRIAZ and HIGGINS keys are identical (single Mollie account)");
  }

  if (!isMollieConfigured()) {
    console.log("\nNo Mollie keys configured — portal uses demo checkout.");
    console.log("See handoff/mollie-credentials-email-william.md");
    process.exit(1);
  }

  let siteUrl = "";
  try {
    siteUrl = getSiteUrl();
    console.log(`\n  [OK] NEXT_PUBLIC_SITE_URL — ${siteUrl}`);
    console.log(`  [INFO] Webhook URL — ${siteUrl}/api/mollie/webhook`);
  } catch (e) {
    console.log(`\n  [FAIL] NEXT_PUBLIC_SITE_URL — ${(e as Error).message}`);
    ok = false;
  }

  const demoFlag = process.env.NEXT_PUBLIC_DEMO_MOLLIE?.trim();
  if (demoFlag === "false") {
    console.log("  [OK] NEXT_PUBLIC_DEMO_MOLLIE=false — demo routes blocked");
  } else if (siteUrl.startsWith("https://") && !siteUrl.includes("localhost")) {
    console.log("  [WARN] NEXT_PUBLIC_DEMO_MOLLIE — not false on public URL");
  }

  console.log("\nAPI authentication:");
  if (triazKey && !(await pingAccount("triaz"))) ok = false;
  if (higginsKey && !(await pingAccount("higgins"))) ok = false;

  console.log(
    ok
      ? "\nMollie ready for checkout."
      : "\nFix Mollie config before testing payments.",
  );
  process.exit(ok ? 0 : 1);
}

main();
