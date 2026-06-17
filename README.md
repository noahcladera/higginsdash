# Higgins

Internal operations app for [Higgins Tennis Nederland](https://higginstennis.nl),
and the shared codebase for a lean "Higgins Programs" packaging aimed at
youth programs, afterschool organizations, and schools still running on
spreadsheets.

Replaces the SuperSaaS + GoTimmy + ad-hoc-spreadsheet stack with a single
purpose-built system for memberships, classes, court bookings, and payments.

**Owner / ops walkthrough (slides + demo):** see [`docs/stakeholder-guide.md`](docs/stakeholder-guide.md).

## Product direction — one codebase, two packagings

This is **one codebase, two packagings**. We do NOT maintain a fork. We do NOT
maintain a separate "Higgins USA" branch. Every instance of the product is an
`Organization` row with a `productMode` flag:

| `productMode` | Who it's for                                        | What's enabled                                                                                    |
| ------------- | --------------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| `club`        | Higgins Tennis NL (and future racket-sport clubs)   | Full surface: memberships, court bookings, recurring blocks, ladder, KNLTB-grade scheduling, etc. |
| `programs`    | Youth programs, afterschool, schools, music schools | Lean surface: CRM, class/program/camp enrollment, parent billing, coach scheduling, attendance.   |

Club-only models (`Membership`, `CourtBooking`, `RecurringBlock`, `Ladder*`,
`Court`, `Venue`, `BookingSettings`) stay in the schema. Programs-mode orgs
simply never write rows there and the routes / nav are hidden.

**Why not fork.** The convolution people blame on Higgins is concentrated in
~5% of the codebase ([src/lib/pricing.ts](src/lib/pricing.ts) +
[src/lib/club-theme.ts](src/lib/club-theme.ts) + some hardcoded brand
literals). The other 95% is generic CRM + enrollment + coaching + billing.
Forking would force us to maintain two copies of that 95% — a waste. The
Higgins-specific 5% is config, not code, and we treat it that way.

See [context/market-research/lean-enrollment-strategy.md](context/market-research/lean-enrollment-strategy.md)
for the full strategy study behind this decision.

## What's here today

Full Higgins portal (Next.js App Router):

- Admin, coach, and member portals
- Memberships, classes, court booking, ladder, payments (Mollie + demo fallback)
- Postgres on Supabase + Prisma migrations
- Supabase Auth (magic links + signup)

## Layout

```text
.
├── context/                     historical data + product context (untouched)
├── design/database.md           the database source-of-truth (30 tables)
├── prisma/
│   ├── schema.prisma            Prisma model of every table
│   ├── seed.ts                  catalog-only seed (clubs, courts, programs, …)
│   └── sql/postgres_extras.sql  Postgres-only constraints (EXCLUDE, triggers)
└── src/
    ├── app/
    │   ├── login/               magic-link sign-in
    │   ├── auth/callback/       PKCE GET route + hash invite page → people upsert
    │   └── (admin)/             gated routes (just a placeholder for now)
    ├── lib/
    │   ├── prisma.ts            Prisma client singleton
    │   ├── supabase/{server,client,middleware}.ts
    │   └── auth/ensure-person.ts  bridges auth.users → people on first login
    ├── components/ui/           shadcn primitives
    └── proxy.ts                 session refresh + /admin gate (Next 16 proxy convention)
```

## One-time Supabase setup

1. Create a free account at [supabase.com](https://supabase.com).
2. Create a new project. Region: **West EU (eu-west-1)** — Amsterdam.
   Pick a strong DB password and save it in 1Password.
3. Copy `.env.example` → `.env.local`.
4. From your Supabase project, fill in the values in [`.env.example`](.env.example) (copy to `.env.local`):
   - **Settings → API**
     - `Project URL` → `NEXT_PUBLIC_SUPABASE_URL`
     - `anon public` key → `NEXT_PUBLIC_SUPABASE_ANON_KEY`
     - `service_role` key → `SUPABASE_SERVICE_ROLE_KEY` (secret)
   - **Settings → Database → Connection string**
     - "Connection pooling" mode `transaction`, port `6543` → `DATABASE_URL`
     - "Direct connection", port `5432` → `DIRECT_URL`
   - **`NEXT_PUBLIC_SITE_URL`** — same origin you use in the browser (e.g. `http://localhost:3000`). Magic-link `emailRedirectTo` is built from this; it must match **exactly** (including `localhost` vs `127.0.0.1`) or PKCE cookies will not be present when you click the link.
5. **Settings → Auth → URL Configuration**
   - Set `Site URL` to `http://localhost:3000` (for dev).
   - Add `http://localhost:3000/auth/callback` to "Redirect URLs". If you sometimes use `127.0.0.1`, add that origin and `http://127.0.0.1:3000/auth/callback` too.

> Magic-link emails are sent through Supabase's built-in SMTP for free in dev.
> For prod, swap to Postmark / Resend later via Supabase Auth settings.

**Magic links (PKCE):** request the link and open it in the **same browser** (and same host as `NEXT_PUBLIC_SITE_URL`). Opening the email on your phone while you requested the link on your laptop will fail. PKCE completion runs on a server `GET` to `/auth/callback?code=…` ([`src/app/auth/callback/route.ts`](src/app/auth/callback/route.ts)); hash-style invite links are finished on [`/auth/callback/hash`](src/app/auth/callback/hash/page.tsx).

## Run locally

```bash
npm install
cp .env.example .env.local        # then fill in the values
npm run db:migrate                # creates initial_schema migration + applies it
psql "$DIRECT_URL" -f prisma/sql/postgres_extras.sql   # one-off post-migration SQL
npm run db:seed                   # loads catalog data
npm run dev                       # boots http://localhost:3000
```

Then visit `http://localhost:3000`. You'll be redirected to `/login`. Type your
email, click the magic link in your inbox, land on `/admin`. You're the first
user — your `people` row gets `is_admin = true`.

### Note on the postgres_extras.sql step

Some constraints in `design/database.md` (the `EXCLUDE` constraint on
`court_bookings`, the partial unique index on `email_addresses`, the per-table
`club_id` triggers) cannot be expressed in `schema.prisma`. They live in
[`prisma/sql/postgres_extras.sql`](prisma/sql/postgres_extras.sql) and are
applied by hand after the first Prisma migration. For production we'll fold this
into a hand-edited Prisma migration so it auto-applies — see comments in the
file.

## Scripts

| Script             | What it does                                       |
| ------------------ | -------------------------------------------------- |
| `npm run dev`      | Start the dev server                               |
| `npm run build`    | Production build                                   |
| `npm run start`    | Run the production build                           |
| `npm run lint`     | ESLint                                             |
| `npm run db:migrate` | `prisma migrate dev` — create + apply migrations |
| `npm run db:reset` | Wipe + remigrate + reseed (DEV ONLY)               |
| `npm run db:seed`  | Run `prisma/seed.ts`                               |
| `npm run db:studio` | Open Prisma Studio (visual DB browser)            |
| `npm run db:generate` | Regenerate the Prisma client                    |

## Adding a table

1. Edit [`prisma/schema.prisma`](prisma/schema.prisma).
2. `npm run db:migrate -- --name <short_change_description>`
3. If your change relies on a Postgres-only feature (range types, partial
   indexes, triggers), add it to
   [`prisma/sql/postgres_extras.sql`](prisma/sql/postgres_extras.sql) AND
   create a `--create-only` migration that includes the same SQL so prod gets
   it automatically.
4. Update [`design/database.md`](design/database.md) — that doc stays the
   source-of-truth for the conceptual model. Schema changes that don't make it
   back into the design doc are bugs.

## Acceptance checklist (foundation slice v1)

- [ ] `npm install` succeeds.
- [ ] `.env.local` exists with 5 real Supabase values (plus optional
      `PLATFORM_SUPPORT_EMAILS` — comma-separated staff addresses that can
      clear tenant preset/terminology locks at `/admin/support/...`).
- [ ] `npm run db:migrate` succeeds; Supabase Table Editor shows all 30 tables.
- [ ] `psql "$DIRECT_URL" -f prisma/sql/postgres_extras.sql` succeeds; the
      `court_bookings_no_overlap` EXCLUDE constraint exists.
- [ ] `npm run db:seed` succeeds; Supabase shows 2 clubs, 6 courts,
      2 booking_settings rows, 6 programs, 4 korfball recurring_blocks.
- [ ] `npm run dev` boots without errors at `http://localhost:3000`.
- [ ] Visiting `http://localhost:3000` redirects to `/login`.
- [ ] Submitting your email shows "Check your email for a magic link".
- [ ] Clicking the magic link redirects to `/admin` showing
      "Logged in as `<your-email>`".
- [ ] Supabase Table Editor's `people` table shows one row with your UUID
      and `is_admin = true`.
- [ ] Clicking "Sign out" returns you to `/login`.

## Status (updated)

> The original "foundation slice" list below is **historical**. Most of it is
> now built. As of the Phase-1 revamp the portal has: member self-signup,
> membership purchase + renewal, class/camp/event enrollment (GoTimmy-style),
> court booking + conflict detection, recurring blocks, ladder, in-app
> notifications + transactional email, audit logging, and **real Mollie
> checkout** (enrollment, membership, ladder, court booking) with demo fallback.
> See [`handoff/summer-launch-runbook.md`](handoff/summer-launch-runbook.md)
> for what's still config/manual at launch.

Still open / manual at launch:

1. Full historical data migration from GoTimmy (parallel mode imports active
   members/households only for the summer).
2. Coach ZZP invoice checkout (collected manually).
3. Cash refunds via the Mollie API (refunds are admin-entered; before-start
   withdrawals auto-issue household credit).
4. Joint-membership second-leg reconciliation (manual, by design).
## Deploy (Render or Vercel)

Git remote: `https://github.com/noahcladera/higginsdash.git`

1. Push this repo to GitHub.
2. Create a **Web Service** on [Render](https://render.com) (or import on Vercel) from that repo.
3. Copy every variable from [`.env.example`](.env.example) into the host's environment settings.
4. Set `NEXT_PUBLIC_SITE_URL` to your public URL (e.g. `https://higginsdash.onrender.com`) — **no trailing slash**, not `http://localhost:3000`.
5. **Redeploy after changing any `NEXT_PUBLIC_*` variable** — Next inlines them at build time; updating env alone is not enough for magic links.
6. In **Supabase → Authentication → URL configuration**:
   - **Site URL:** `https://<your-host>` (same as step 4; no trailing slash)
   - **Redirect URLs** (add each explicitly — wildcards alone may not allow `/auth/callback`):
     - `https://higginsdash.onrender.com/auth/callback` (production)
     - `http://localhost:3000/auth/callback`
     - `http://127.0.0.1:3000/auth/callback` (local dev)
   - Optional: `https://<your-host>/**` for other same-origin paths.
   - If `/auth/callback` is missing, magic links fall back to Site URL (`/`) and login loops until you redeploy with the PKCE redirect fix in middleware.
7. After first deploy, run migrations against the same database:
   `npx prisma migrate deploy` (locally with production `DATABASE_URL`, or Render shell).
8. Optional: `npm run db:seed` on an empty database for catalog data.

Render: this repo includes [`render.yaml`](render.yaml) (build: `npm ci && npx prisma generate && npm run build`, start: `npm run start`).
