// scripts/db-new-migration.mjs
//
// Author a new Prisma migration without using a shadow database.
//
// Usage: npm run db:new <snake_case_name>
//
// Diffs the live DB (DATABASE_URL) against prisma/schema.prisma and writes the
// resulting SQL to prisma/migrations/<UTC-timestamp>_<name>/migration.sql.
// Apply afterwards with `npm run db:migrate`.
//
// Why this exists: `prisma migrate dev` requires a shadow Postgres that
// replays every existing migration. On Supabase that rehearsal fails (see
// design notes / chat history). `migrate diff` is the supported way to
// generate migration SQL without a shadow DB.

import { spawnSync } from "node:child_process";
import { mkdirSync, existsSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(__dirname, "..");
const migrationsDir = join(repoRoot, "prisma", "migrations");
const schemaPath = join(repoRoot, "prisma", "schema.prisma");

function die(msg, code = 1) {
  console.error(`\u2717 ${msg}`);
  process.exit(code);
}

const rawName = process.argv[2];
if (!rawName) {
  die(
    "Usage: npm run db:new <snake_case_name>\n" +
      "  e.g. npm run db:new add_court_lights_table",
  );
}

const name = rawName.trim().toLowerCase().replace(/[^a-z0-9]+/g, "_");
if (!name || name === "_") {
  die("Migration name must contain at least one alphanumeric character.");
}

// Use DIRECT_URL (port 5432) — DATABASE_URL goes through Supabase's PgBouncer
// pooler on port 6543, which doesn't support the prepared statements that
// `prisma migrate diff` needs for introspection. `migrate deploy` uses
// directUrl from schema.prisma for the same reason.
const fromUrl = process.env.DIRECT_URL ?? process.env.DATABASE_URL;
if (!fromUrl) {
  die(
    "Neither DIRECT_URL nor DATABASE_URL is set. Make sure .env.local has " +
      "DIRECT_URL and that you ran this via `npm run db:new` (which loads .env.local).",
  );
}

console.log(`\u2192 Diffing live DB against schema.prisma...`);
const diff = spawnSync(
  "npx",
  [
    "prisma",
    "migrate",
    "diff",
    "--from-url",
    fromUrl,
    "--to-schema-datamodel",
    schemaPath,
    "--script",
  ],
  { encoding: "utf8" },
);

if (diff.status !== 0) {
  console.error(diff.stderr || diff.stdout);
  die(`prisma migrate diff exited with code ${diff.status}`);
}

const sql = (diff.stdout ?? "").trim();
const isEmpty =
  sql === "" ||
  /^-- This is an empty migration\.?\s*$/i.test(sql);

if (isEmpty) {
  console.log("\u2713 Schema matches DB \u2014 nothing to migrate. Skipping.");
  process.exit(0);
}

// Postgres-only objects schema.prisma can't represent. `migrate diff` will
// always want to drop or recreate these because they're invisible to Prisma.
// Applying any of these would destroy the R13 EXCLUDE constraint and similar
// invariants. We refuse to write a migration that touches them and tell the
// user exactly which lines to strip before retrying.
const PROTECTED_OBJECTS = [
  '"during"',
  "during ",
  "court_bookings_no_overlap",
  "email_addresses_one_primary_per_person",
  "payment_lines_exactly_one_target",
  "court_bookings_club_matches_court",
  "recurring_blocks_club_matches_court",
];

const sqlLines = sql.split("\n");
const hits = sqlLines
  .map((line, i) => ({ line, i }))
  .filter(({ line }) =>
    PROTECTED_OBJECTS.some((needle) => line.includes(needle)),
  );

const ts = new Date()
  .toISOString()
  .replace(/[-T:]/g, "")
  .replace(/\..+$/, "")
  .slice(0, 14);

const folder = join(migrationsDir, `${ts}_${name}`);
if (existsSync(folder)) {
  die(`Migration folder already exists: ${folder}`);
}

mkdirSync(folder, { recursive: true });
const outPath = join(folder, "migration.sql");
writeFileSync(outPath, `${sql}\n`, "utf8");

console.log(`\u2713 Wrote ${outPath}`);
console.log("");

if (hits.length > 0) {
  console.log("\u26a0  WARNING: the generated SQL touches Postgres-only objects");
  console.log("   that schema.prisma cannot represent. Applying these lines will");
  console.log("   silently destroy R13 EXCLUDE constraints, partial unique indexes,");
  console.log("   or trigger-based invariants. Strip them before `db:migrate`:");
  console.log("");
  for (const { line, i } of hits) {
    console.log(`   line ${i + 1}: ${line.trim()}`);
  }
  console.log("");
  console.log("   See prisma/migrations/20260419131500_postgres_extras/migration.sql");
  console.log("   for the canonical definitions of these objects.");
  console.log("");
}

console.log("Next steps:");
console.log("  1. Open the file and review the SQL. Strip any lines flagged above.");
console.log(
  "     Hand-edit if Prisma can't express the change (partial indexes,",
);
console.log("     EXCLUDE constraints, triggers, generated columns, etc.)");
console.log("  2. npm run db:migrate   # applies pending migrations");
console.log("  3. npm run db:status    # confirm 'up to date'");
