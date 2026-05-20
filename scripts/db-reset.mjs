// scripts/db-reset.mjs
//
// Wipe + reseed the live database. Drops the `public` schema, recreates it,
// reapplies every tracked migration, then runs the seed.
//
// Usage:  CONFIRM=yes npm run db:reset
//
// The CONFIRM=yes guard is intentional: a stray Enter shouldn't be able to
// nuke production data. Replaces `prisma migrate reset`, which would also
// require a working shadow database against Supabase.

import { spawnSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { writeFileSync, unlinkSync } from "node:fs";
import { tmpdir } from "node:os";

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(__dirname, "..");
const schemaPath = join(repoRoot, "prisma", "schema.prisma");
const seedPath = join(repoRoot, "prisma", "seed.ts");

function die(msg, code = 1) {
  console.error(`\u2717 ${msg}`);
  process.exit(code);
}

if (process.env.CONFIRM !== "yes") {
  die(
    "Refusing to reset. This will DROP every table in the `public` schema.\n" +
      "  Re-run with: CONFIRM=yes npm run db:reset",
  );
}

if (!process.env.DATABASE_URL) {
  die("DATABASE_URL is not set. Did you load .env.local?");
}

const dropSql = [
  "DROP SCHEMA IF EXISTS public CASCADE;",
  "CREATE SCHEMA public;",
  "GRANT ALL ON SCHEMA public TO postgres;",
  "GRANT ALL ON SCHEMA public TO public;",
].join("\n");

const tmpFile = join(tmpdir(), `higgins-db-reset-${Date.now()}.sql`);
writeFileSync(tmpFile, `${dropSql}\n`, "utf8");

const cleanup = () => {
  try {
    unlinkSync(tmpFile);
  } catch {
    /* ignore */
  }
};

function run(cmd, args, label) {
  console.log(`\u2192 ${label}`);
  const res = spawnSync(cmd, args, { stdio: "inherit" });
  if (res.status !== 0) {
    cleanup();
    die(`${label} failed (exit code ${res.status})`);
  }
}

try {
  run(
    "npx",
    [
      "prisma",
      "db",
      "execute",
      "--schema",
      schemaPath,
      "--file",
      tmpFile,
    ],
    "Dropping + recreating public schema",
  );

  run(
    "npx",
    ["prisma", "migrate", "deploy"],
    "Applying all migrations",
  );

  run(
    "npx",
    ["tsx", seedPath],
    "Seeding",
  );

  console.log("\u2713 Database reset complete.");
} finally {
  cleanup();
}
