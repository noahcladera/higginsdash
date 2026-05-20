import { cache } from "react";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

/**
 * Server-side Supabase client for use inside Server Components,
 * Route Handlers, and Server Actions. Reads/writes auth cookies via
 * Next's `cookies()` helper.
 *
 * Wrapped in `React.cache` so we hand back the same client instance
 * (and skip the redundant `cookies()` read) for every call within a
 * single request. The Supabase client itself memoises the resolved
 * `auth.getUser()` result internally, so a shared instance also means
 * a shared in-memory user lookup across layout/page/server actions.
 */
export const createSupabaseServerClient = cache(async () => {
  const cookieStore = await cookies();

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            );
          } catch {
            // Server Components are not allowed to set cookies — that's fine,
            // the middleware will refresh the session on the next request.
          }
        },
      },
    }
  );
});
