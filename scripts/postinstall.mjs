// scripts/postinstall.mjs
//
// Runs after every `npm install`. Two jobs:
//   1. Make sure the generated Prisma client in node_modules/@prisma/client
//      matches prisma/schema.prisma. Stale clients are why you get errors
//      like `Cannot read properties of undefined (reading 'findMany')` —
//      the model exists in the schema but isn't on the client.
//   2. Be safe in CI / Vercel where there's no .env.local: env vars come
//      from the platform's env injection, so we run `prisma generate`
//      with the ambient process.env in that case.
//
// Local devs put DATABASE_URL / DIRECT_URL in .env.local; we load that
// file when present so the schema's `env(...)` references resolve.
//
// This script never throws on its own — if `prisma generate` fails we
// log a hint and exit 0 so a missing DB connection during a fresh
// install on a brand-new machine doesn't block `npm install`.

import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(__dirname, "..");
const envFile = join(repoRoot, ".env.local");

const args = ["prisma", "generate", "--schema", "prisma/schema.prisma"];
const useDotenv = existsSync(envFile);

const cmd = "npx";
const fullArgs = useDotenv
  ? ["dotenv", "-e", ".env.local", "--", ...args]
  : args;

console.log(
  `\u25b6 postinstall: running \`${cmd} ${fullArgs.join(" ")}\`${
    useDotenv ? " (loaded .env.local)" : " (using ambient env)"
  }`,
);

const result = spawnSync(cmd, fullArgs, {
  cwd: repoRoot,
  stdio: "inherit",
  shell: process.platform === "win32",
});

if (result.status !== 0) {
  console.warn(
    "\u26a0  postinstall: `prisma generate` failed. Run `npm run db:generate` manually once your DB env vars are in place.",
  );
  process.exit(0);
}
