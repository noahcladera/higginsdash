/**
 * Pre-compile key mobile routes so the first iPhone tap is not a cold dev compile.
 *
 * Run: npm run warm:mobile  (dev server must be up on :3000)
 */

const BASE = process.env.WARM_BASE_URL ?? "http://127.0.0.1:3000";

const ROUTES = [
  "/login",
  "/portal",
  "/portal/book",
  "/portal/membership",
  "/portal/programs",
  "/portal/classes",
  "/portal/family",
  "/coach",
  "/coach/book",
  "/coach/calendar",
];

async function warm(path: string): Promise<{ path: string; ms: number; ok: boolean }> {
  const start = Date.now();
  try {
    const res = await fetch(`${BASE}${path}`, { redirect: "follow" });
    return { path, ms: Date.now() - start, ok: res.ok || res.status === 307 };
  } catch {
    return { path, ms: Date.now() - start, ok: false };
  }
}

async function main() {
  console.log(`Warming mobile routes at ${BASE}\n`);
  const results = [];
  for (const path of ROUTES) {
    const r = await warm(path);
    results.push(r);
    const mark = r.ok ? "ok" : "FAIL";
    console.log(`  ${mark.padEnd(4)} ${String(r.ms).padStart(5)}ms  ${path}`);
  }
  const failed = results.filter((r) => !r.ok);
  if (failed.length > 0) {
    console.error(`\n${failed.length} route(s) failed — is npm run dev:lan running?`);
    process.exit(1);
  }
  console.log("\nAll routes warmed.");
}

main();
