/**
 * Prints Redirect URLs to paste into Supabase → Authentication → URL configuration.
 *
 * Usage: npx tsx scripts/print-supabase-auth-urls.ts
 */
import { SUPABASE_AUTH_REDIRECT_URLS } from "../src/lib/auth/redirect-pkce-code";

console.log("Supabase → Authentication → URL configuration\n");
console.log("Site URL (production example):");
console.log("  https://higginsdash.onrender.com\n");
console.log("Redirect URLs (add each line):");
for (const url of SUPABASE_AUTH_REDIRECT_URLS) {
  console.log(`  ${url}`);
}
