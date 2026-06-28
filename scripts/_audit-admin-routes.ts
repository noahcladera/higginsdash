/**
 * Admin route health probe — HTTP 200 or expected redirect, no error boundaries.
 * Usage: npx dotenv -e .env.local -- tsx scripts/_audit-admin-routes.ts
 *
 * Requires ADMIN_EMAIL (must be isAdmin) + higgins-test password.
 * Skips authenticated probes when ADMIN_EMAIL is unset.
 */
import { createServerClient } from "@supabase/ssr";
import { writeFileSync, mkdirSync } from "fs";

const BASE = process.env.NEXT_PUBLIC_SITE_URL ?? "http://127.0.0.1:3000";
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SUPABASE_ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const PASSWORD = process.env.E2E_PASSWORD ?? "higgins-test";
const ADMIN_EMAIL = process.env.ADMIN_EMAIL;

const ADMIN_ROUTES = [
  "/admin",
  "/admin/classes",
  "/admin/bookings",
  "/admin/households",
  "/admin/memberships",
  "/admin/payments",
  "/admin/inbox",
  "/admin/settings",
  "/admin/coaches",
  "/admin/programs",
];

type Row = { route: string; status: string; http?: number; ms: number; note: string };

async function signIn(email: string): Promise<string> {
  const jar = new Map<string, string>();
  const supabase = createServerClient(SUPABASE_URL, SUPABASE_ANON, {
    cookies: {
      getAll: () => [...jar.entries()].map(([name, value]) => ({ name, value })),
      setAll: (cookies) => {
        for (const c of cookies) {
          if (c.value) jar.set(c.name, c.value);
          else jar.delete(c.name);
        }
      },
    },
  });
  const { error } = await supabase.auth.signInWithPassword({
    email,
    password: PASSWORD,
  });
  if (error) throw error;
  return [...jar.entries()].map(([n, v]) => `${n}=${v}`).join("; ");
}

async function probe(route: string, cookie?: string): Promise<Row> {
  const t0 = Date.now();
  try {
    const res = await fetch(`${BASE}${route}`, {
      headers: cookie ? { Cookie: cookie } : {},
      redirect: "follow",
    });
    const html = await res.text();
    const ms = Date.now() - t0;
    if (html.includes("Application error") || html.includes("Something went wrong")) {
      return { route, status: "fail", http: res.status, ms, note: "Error boundary" };
    }
    if (res.url.includes("/login")) {
      return { route, status: cookie ? "fail" : "pass", http: res.status, ms, note: "Redirect login" };
    }
    if (!res.ok) {
      return { route, status: "fail", http: res.status, ms, note: `HTTP ${res.status}` };
    }
    return { route, status: "pass", http: res.status, ms, note: "OK" };
  } catch (e) {
    return {
      route,
      status: "fail",
      ms: Date.now() - t0,
      note: e instanceof Error ? e.message : String(e),
    };
  }
}

async function main() {
  console.log("=== Admin route health ===\n");
  const rows: Row[] = [];

  for (const route of ADMIN_ROUTES) {
    rows.push(await probe(route));
  }

  if (ADMIN_EMAIL) {
    console.log(`Authenticated probes as ${ADMIN_EMAIL}\n`);
    const cookie = await signIn(ADMIN_EMAIL);
    for (const route of ADMIN_ROUTES) {
      rows.push(await probe(route, cookie));
    }
  } else {
    console.log("Set ADMIN_EMAIL for authenticated admin probes.\n");
  }

  const fails = rows.filter((r) => r.status === "fail");
  console.table(rows);
  mkdirSync("docs/audit", { recursive: true });
  writeFileSync(
    "docs/audit/_admin-route-probe.json",
    JSON.stringify({ at: new Date().toISOString(), rows }, null, 2),
  );
  console.log(`\nWrote docs/audit/_admin-route-probe.json`);
  if (fails.length) {
    console.error(`${fails.length} route(s) failed`);
    process.exit(1);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
