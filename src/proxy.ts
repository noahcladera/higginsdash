import type { NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/middleware";

// Renamed from `middleware` to `proxy` per Next 16 convention.
// See: https://nextjs.org/docs/app/api-reference/file-conventions/proxy
export async function proxy(request: NextRequest) {
  return await updateSession(request);
}

export const config = {
  matcher: [
    /*
     * Run on every route except:
     *   - Next internals (`_next/static`, `_next/image`, `_next/data`)
     *   - The favicon and other root-level static icons
     *   - Static asset requests (svg/png/jpg/jpeg/gif/webp/ico/woff/woff2)
     *
     * The previous matcher missed `_next/data` (RSC payload fetches),
     * which meant every Server Component navigation paid for a Supabase
     * Auth round-trip in the proxy on top of the one already happening
     * inside the layout. Skipping it here is safe: the layout itself
     * still calls `requireMember`, so protected routes remain protected.
     */
    "/((?!_next/static|_next/image|_next/data|favicon\\.ico|robots\\.txt|sitemap\\.xml|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|woff|woff2)$).*)",
  ],
};
