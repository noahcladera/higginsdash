/**
 * Runs the automated portion of handoff/qa-signoff-checklist.md.
 * Manual browser checks (Mollie pay, magic link login) still required separately.
 *
 * Run: `npm run qa:automated`
 */

import { spawnSync } from "node:child_process";

const steps: { label: string; cmd: string; args: string[] }[] = [
  { label: "deploy readiness", cmd: "npx", args: ["tsx", "scripts/verify-deploy-readiness.ts"] },
  { label: "GoTimmy substitute smoke", cmd: "npx", args: ["tsx", "scripts/smoke-gotimmy.ts"] },
  { label: "coach E2E smoke", cmd: "npx", args: ["tsx", "scripts/smoke-coach-e2e.ts"] },
  { label: "concurrency checks", cmd: "npx", args: ["tsx", "scripts/verify-concurrency.ts"] },
];

let ok = true;
console.log("Higgins automated QA\n");

for (const step of steps) {
  console.log(`--- ${step.label} ---`);
  const res = spawnSync(step.cmd, step.args, {
    stdio: "inherit",
    env: process.env,
    cwd: process.cwd(),
  });
  if (res.status !== 0) {
    console.error(`FAIL: ${step.label}`);
    ok = false;
  } else {
    console.log(`PASS: ${step.label}\n`);
  }
}

console.log(
  ok
    ? "Automated QA passed. Complete manual items in handoff/qa-signoff-checklist.md."
    : "Automated QA failed — fix above before staging sign-off.",
);
process.exit(ok ? 0 : 1);
