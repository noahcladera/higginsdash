import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const serviceRole = process.env.SUPABASE_SERVICE_ROLE_KEY!;

async function main() {
  const admin = createClient(url, serviceRole, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { data, error } = await admin.auth.admin.listUsers({
    page: 1,
    perPage: 1000,
  });
  if (error) throw error;
  for (const u of data.users) {
    console.log(
      [
        u.id,
        u.email ?? "(no email)",
        u.created_at,
        `last_sign_in=${u.last_sign_in_at ?? "never"}`,
      ].join("  "),
    );
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
