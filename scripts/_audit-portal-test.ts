/**
 * Portal UX audit runner — logs in as seed personas and probes key routes.
 * Usage: npx dotenv -e .env.local -- tsx scripts/_audit-portal-test.ts
 */
import { createServerClient } from "@supabase/ssr";
import { writeFileSync, mkdirSync } from "fs";

const BASE = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SUPABASE_ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const PASSWORD = "higgins-test";
const FETCH_TIMEOUT_MS = 25_000;

type Result = {
  flow: string;
  persona: string;
  route: string;
  status: "pass" | "fail" | "partial" | "skip";
  httpStatus?: number;
  elapsedMs: number;
  notes: string;
  markers?: string[];
};

const results: Result[] = [];

function withTimeout<T>(
  promise: Promise<T>,
  ms: number,
  label: string,
): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) =>
      setTimeout(
        () => reject(new Error(`TIMEOUT after ${ms}ms: ${label}`)),
        ms,
      ),
    ),
  ]);
}

/** Sign in via @supabase/ssr so cookies match what Next middleware expects. */
async function signIn(email: string): Promise<string> {
  const jar = new Map<string, string>();
  const supabase = createServerClient(SUPABASE_URL, SUPABASE_ANON, {
    cookies: {
      getAll() {
        return [...jar.entries()].map(([name, value]) => ({ name, value }));
      },
      setAll(cookies) {
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
  if (error) throw new Error(`Login failed for ${email}: ${error.message}`);
  return [...jar.entries()].map(([n, v]) => `${n}=${v}`).join("; ");
}

async function fetchRoute(
  path: string,
  cookie: string,
): Promise<{ status: number; html: string; elapsedMs: number; finalUrl: string }> {
  const start = Date.now();
  const res = await withTimeout(
    fetch(`${BASE}${path}`, {
      headers: { Cookie: cookie, Accept: "text/html" },
      redirect: "follow",
    }),
    FETCH_TIMEOUT_MS,
    path,
  );
  const html = await res.text();
  return {
    status: res.status,
    html,
    elapsedMs: Date.now() - start,
    finalUrl: res.url,
  };
}

function has(html: string, ...needles: string[]): string[] {
  const lower = html.toLowerCase();
  return needles.filter((n) => lower.includes(n.toLowerCase()));
}

function missing(html: string, ...needles: string[]): string[] {
  const lower = html.toLowerCase();
  return needles.filter((n) => !lower.includes(n.toLowerCase()));
}

async function probe(
  flow: string,
  persona: string,
  route: string,
  cookie: string,
  opts: {
    expectStatus?: number;
    mustInclude?: string[];
    mustNotInclude?: string[];
    notes?: string;
  },
): Promise<void> {
  try {
    const { status, html, elapsedMs, finalUrl } = await fetchRoute(route, cookie);
    const found = opts.mustInclude ? has(html, ...opts.mustInclude) : [];
    const absent = opts.mustNotInclude
      ? missing(html, ...opts.mustNotInclude)
      : opts.mustInclude
        ? opts.mustInclude.filter((n) => !found.includes(n))
        : [];

    let resultStatus: Result["status"] = "pass";
    const notes: string[] = [opts.notes ?? ""].filter(Boolean);

    if (finalUrl.includes("/login")) {
      resultStatus = "fail";
      notes.push("Redirected to login — session not accepted");
    }

    if (opts.expectStatus && status !== opts.expectStatus) {
      resultStatus = "fail";
      notes.push(`Expected HTTP ${opts.expectStatus}, got ${status}`);
    }
    if (absent.length) {
      resultStatus = resultStatus === "pass" ? "partial" : "fail";
      notes.push(`Missing markers: ${absent.join(", ")}`);
    }
    if (html.includes("Application error") || html.includes("Something went wrong")) {
      resultStatus = "fail";
      notes.push("Error boundary triggered");
    }

    results.push({
      flow,
      persona,
      route,
      status: resultStatus,
      httpStatus: status,
      elapsedMs,
      notes: notes.join("; ") || "OK",
      markers: found,
    });
  } catch (e) {
    results.push({
      flow,
      persona,
      route,
      status: "fail",
      elapsedMs: FETCH_TIMEOUT_MS,
      notes: e instanceof Error ? e.message : String(e),
    });
  }
}

async function main() {
  console.log(`\n=== Portal audit probe ===`);
  console.log(`Base URL: ${BASE}`);
  console.log(`Timeout per request: ${FETCH_TIMEOUT_MS}ms\n`);

  // Health check
  const healthStart = Date.now();
  try {
    const res = await withTimeout(
      fetch(`${BASE}/login`),
      10_000,
      "/login health",
    );
    console.log(`Server health: /login → ${res.status} (${Date.now() - healthStart}ms)\n`);
    if (!res.ok) throw new Error(`Server not healthy: ${res.status}`);
  } catch (e) {
    console.error("FATAL: Dev server not reachable.", e);
    process.exit(1);
  }

  const personas = {
    adult: "adult.example@higginstennisnl.test",
    parentMulti: "parent.multi.example@higginstennisnl.test",
    parentSingle: "parent.single.example@higginstennisnl.test",
  };

  const cookies: Record<string, string> = {};
  for (const [key, email] of Object.entries(personas)) {
    try {
      cookies[key] = await signIn(email);
      console.log(`✓ Logged in: ${email}`);
    } catch (e) {
      console.error(`✗ Login failed: ${email}`, e);
    }
  }

  // Flow probes by persona
  if (cookies.adult) {
    await probe("D", "adult solo member", "/portal", cookies.adult, {
      mustInclude: ["Good", "Book a court"],
      notes: "Member home greeting + booking CTA",
    });
    await probe("D", "adult solo member", "/portal/programs", cookies.adult, {
      mustInclude: ["Enrollment"],
      notes: "Programs catalog loads",
    });
    await probe("D", "adult solo member", "/portal/classes", cookies.adult, {
      notes: "My classes page",
    });
    await probe("G", "adult solo member", "/portal/book", cookies.adult, {
      mustInclude: ["court", "book"],
      notes: "Court booking (case-insensitive partial match)",
    });
    await probe("K", "adult solo member", "/portal/profile", cookies.adult, {
      mustInclude: ["Profile", "calendar"],
      notes: "Profile + calendar sync",
    });
    await probe("L", "adult solo member", "/portal/inbox", cookies.adult, {
      notes: "Inbox",
    });
    await probe("J", "adult solo member", "/portal/membership", cookies.adult, {
      mustInclude: ["membership"],
      notes: "Membership management",
    });
    await probe("T", "adult solo member", "/portal/payments", cookies.adult, {
      notes: "Payment history",
    });
  }

  if (cookies.parentMulti) {
    await probe("E", "returning parent", "/portal", cookies.parentMulti, {
      mustInclude: ["family", "Good"],
      notes: "Parent home — family context",
    });
    await probe("E", "returning parent", "/portal/family", cookies.parentMulti, {
      mustInclude: ["family", "child"],
      notes: "Family management with children",
    });
    await probe("E", "returning parent", "/portal/classes", cookies.parentMulti, {
      notes: "Children's classes",
    });
    await probe("E", "returning parent", "/portal/programs", cookies.parentMulti, {
      mustInclude: ["Enrollment"],
      notes: "Enrollment catalog for parent",
    });
  }

  if (cookies.parentSingle) {
    await probe("F", "parent no kids yet", "/portal/family", cookies.parentSingle, {
      notes: "Family page for household without children",
    });
    await probe("F", "parent no kids yet", "/portal/profile", cookies.parentSingle, {
      mustInclude: ["Profile"],
      notes: "Profile as add-child entry point",
    });
    await probe("B", "parent no membership?", "/portal/membership", cookies.parentSingle, {
      mustInclude: ["membership"],
      notes: "Membership buy flow entry",
    });
    await probe("B", "parent no membership?", "/portal/membership#buy", cookies.parentSingle, {
      mustInclude: ["membership"],
      notes: "Membership buy anchor",
    });
  }

  // Public / auth pages (no cookie)
  await probe("A", "anonymous", "/login", "", {
    mustInclude: ["Sign in", "Password"],
    notes: "Login page with password method",
  });
  await probe("A", "anonymous", "/signup", "", {
    mustInclude: ["Sign up", "household"],
    notes: "Signup page",
  });

  // Non-member home markers — use parentSingle if no active membership
  if (cookies.parentSingle) {
    const { html } = await fetchRoute("/portal", cookies.parentSingle);
    const isNonMember =
      html.includes("Browse lessons") ||
      html.includes("Get a membership") ||
      html.includes("Welcome to");
    const isMemberHome =
      html.includes("Active memberships") || html.includes("Book a court");
    results.push({
      flow: "Non-member vs member home",
      persona: "parent.single",
      route: "/portal",
      status: isNonMember || isMemberHome ? "pass" : "partial",
      elapsedMs: 0,
      notes: isNonMember
        ? "NonMemberHome detected (lessons-first welcome)"
        : isMemberHome
          ? "MemberHome detected (has active membership)"
          : "Could not classify home variant",
    });
  }

  // Summary
  console.log("\n=== Results ===\n");
  const table = results.map((r) => ({
    flow: r.flow,
    persona: r.persona,
    route: r.route,
    status: r.status,
    http: r.httpStatus ?? "—",
    ms: r.elapsedMs,
    notes: r.notes.slice(0, 80),
  }));
  console.table(table);

  const fails = results.filter((r) => r.status === "fail").length;
  const partials = results.filter((r) => r.status === "partial").length;
  console.log(`\nTotal: ${results.length} | pass: ${results.filter((r) => r.status === "pass").length} | partial: ${partials} | fail: ${fails}`);

  // Write JSON for audit doc
  mkdirSync("docs/audit", { recursive: true });
  writeFileSync(
    "docs/audit/_portal-test-results.json",
    JSON.stringify(results, null, 2),
  );
  console.log(`\nWrote docs/audit/_portal-test-results.json`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
