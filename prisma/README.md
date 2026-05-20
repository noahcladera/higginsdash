# Prisma workflow

This project does **not** use `prisma migrate dev`. Supabase's managed
Postgres can't host the temporary "shadow" database Prisma needs to validate
new migrations, so we author migrations with `migrate diff` and apply them
with `migrate deploy`.

## Day-to-day

1. Edit `prisma/schema.prisma`.
2. `npm run db:new <snake_case_name>` — diffs the live DB against the schema and writes a new `prisma/migrations/<timestamp>_<name>/migration.sql`.
3. Open the generated SQL and review it. Hand-edit if Prisma can't express the change (partial unique indexes, `EXCLUDE` constraints, triggers, generated columns — see `prisma/migrations/20260419131500_postgres_extras/` for examples).
4. `npm run db:migrate` — applies all pending migrations. Idempotent.
5. `npm run db:status` — should print "Database schema is up to date".

### Important: drift artifacts

`migrate diff` compares the live DB (which has Postgres-only constructs like the `during` generated column and the R13 EXCLUDE constraint) against `schema.prisma` (which can't express them). Every diff will therefore include "noise" trying to drop those objects.

`db:new` flags these lines with a `WARNING` and the canonical objects to leave alone. **Always strip flagged lines before `db:migrate`** or you will silently destroy invariants. The protected-object list lives at the top of [`scripts/db-new-migration.mjs`](../scripts/db-new-migration.mjs).

## Other commands

- `npm run db:generate` — regenerate the Prisma client (run after pulling new migrations).
- `npm run db:seed` — re-seed reference data (system person, level content, clubs, courts, programs, etc.). Idempotent.
- `npm run db:studio` — open Prisma Studio.
- `CONFIRM=yes npm run db:reset` — DROP+recreate the `public` schema, reapply every migration, then seed. Destroys all data.

## Files

- `schema.prisma` — Prisma model definitions (snake_case via `@map`).
- `migrations/` — append-only ordered SQL migrations. Treat applied files as immutable.
- `seed.ts` — idempotent seed for reference data.
- `sql/postgres_extras.sql` — historical mirror of the Postgres-only DDL. Not executed; the live copy is the tracked migration `20260419131500_postgres_extras/`.
