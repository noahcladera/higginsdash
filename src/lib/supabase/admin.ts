import type { SupabaseClient, User } from "@supabase/supabase-js";

/** Paginated lookup of a Supabase Auth user by email (case-insensitive). */
export async function findAuthUserByEmail(
  admin: SupabaseClient,
  email: string,
): Promise<User | null> {
  const normalized = email.trim().toLowerCase();
  let page = 1;
  const perPage = 1000;

  for (;;) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage });
    if (error) throw error;
    const match = data.users.find(
      (u) => u.email?.trim().toLowerCase() === normalized,
    );
    if (match) return match;
    if (data.users.length < perPage) return null;
    page += 1;
  }
}

export function isAlreadyRegisteredInviteError(message: string): boolean {
  return /already.*(registered|exists)/i.test(message);
}
