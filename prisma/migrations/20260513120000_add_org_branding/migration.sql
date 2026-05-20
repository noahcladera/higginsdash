-- Per-org branding overrides — one row per tenant, keyed by the slug
-- used in `src/lib/tenant.ts`'s in-code ORG_REGISTRY. Admins edit this
-- at runtime via /admin/settings/branding; the tenant resolver reads
-- a row here and merges over the static brand defaults.
--
-- Deliberately NOT FK'd to any `organizations` table — tenants in
-- Pass 1 are still code-configured. When Pass 2 introduces a real
-- tenants table, we add the FK constraint in a follow-up migration.

CREATE TABLE "org_branding" (
  "org_slug"      text            PRIMARY KEY,
  "logo_url"      text,
  "brand_title"   text,
  "brand_subline" text,
  "created_at"    timestamptz(6)  NOT NULL DEFAULT now(),
  "updated_at"    timestamptz(6)  NOT NULL DEFAULT now()
);
