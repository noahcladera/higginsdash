/**
 * Emergency / dev-only: set a Supabase Auth user's password by email using the
 * service role key. Run locally — never expose SUPABASE_SERVICE_ROLE_KEY.
 *
 * Usage (from repo root):
 *   npm run auth:set-password -- you@example.com 'your-new-password'
 *
 * Then sign in at /login using the Password tab (not magic link).
 */
import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRole = process.env.SUPABASE_SERVICE_ROLE_KEY;

async function findUserIdByEmail(
  admin: ReturnType<typeof createClient>,
  email: string,
): Promise<string | null> {
  const normalized = email.trim().toLowerCase();
  let page = 1;
  const perPage = 1000;

  for (;;) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage });
    if (error) throw error;
    const match = data.users.find(
      (u) => u.email?.toLowerCase() === normalized,
    );
    if (match) return match.id;
    if (data.users.length < perPage) return null;
    page += 1;
  }
}

async function main() {
  const [, , emailArg, passwordArg] = process.argv;
  if (!emailArg || !passwordArg) {
    console.error(
      "Usage: npm run auth:set-password -- <email> <new-password>",
    );
    process.exit(1);
  }
  if (!url || !serviceRole) {
    console.error(
      "Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in env.",
    );
    process.exit(1);
  }

  const admin = createClient(url, serviceRole, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const userId = await findUserIdByEmail(admin, emailArg);
  if (!userId) {
    console.error(`No Supabase auth user found for email: ${emailArg}`);
    process.exit(1);
  }

  const { error } = await admin.auth.admin.updateUserById(userId, {
    password: passwordArg,
  });
  if (error) {
    console.error(error.message);
    process.exit(1);
  }

  console.log(`Password updated for ${emailArg} (${userId}).`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
