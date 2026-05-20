-- Organization config table.
--
-- Promotes the in-code ORG_REGISTRY (src/lib/tenant.ts) into a real,
-- runtime-editable row per tenant. Holds:
--
--   - identity / locale (slug, display_name, short_name, country, locale, currency)
--   - product_mode + preset_slug (lets admins jump between bundled presets like
--     tennis_club, music_school, after_school, solo_coach, dance_studio)
--   - features  jsonb — every feature gate, granular (replaces the 8-flag
--     ProductMode-derived FeatureFlags)
--   - terms     jsonb — per-tenant terminology overrides keyed by glossary
--     keys (e.g. {"coach.singular":"Teacher","court.singular":"Studio"})
--   - branding (logo_url, brand_title, brand_subline) — folded in from the
--     deprecated org_branding table so admins edit one row, not two
--
-- We backfill any existing org_branding rows into organizations and then
-- drop the old table. The slug column is the same value used by the
-- higgins_current_org cookie so all existing call sites keep working.

CREATE TABLE "organizations" (
  "slug"          text            PRIMARY KEY,
  "display_name"  text            NOT NULL,
  "short_name"    text            NOT NULL,
  "country"       text            NOT NULL DEFAULT 'NL',
  "locale"        text            NOT NULL DEFAULT 'nl-NL',
  "currency"      text            NOT NULL DEFAULT 'EUR',
  "product_mode"  text            NOT NULL DEFAULT 'club',
  "preset_slug"   text,
  "features"      jsonb           NOT NULL DEFAULT '{}'::jsonb,
  "terms"         jsonb           NOT NULL DEFAULT '{}'::jsonb,
  "logo_url"      text,
  "brand_title"   text,
  "brand_subline" text,
  "created_at"    timestamptz(6)  NOT NULL DEFAULT now(),
  "updated_at"    timestamptz(6)  NOT NULL DEFAULT now()
);

-- Seed the two known tenants so any cookie value already in use keeps
-- resolving. Feature flags / terms start empty — the application layer
-- merges them with code-defined defaults derived from the preset.
INSERT INTO "organizations"
  ("slug", "display_name", "short_name", "country", "locale", "currency",
   "product_mode", "preset_slug", "features", "terms")
VALUES
  ('higgins-nl',     'Higgins Tennis Nederland', 'Higgins', 'NL', 'nl-NL', 'EUR',
   'club',     'tennis_club',  '{}'::jsonb, '{}'::jsonb),
  ('demo-programs', 'Demo Programs Org',         'Demo',    'NL', 'en-US', 'EUR',
   'programs', 'after_school', '{}'::jsonb, '{}'::jsonb)
ON CONFLICT ("slug") DO NOTHING;

-- Migrate any existing branding overrides into the new row.
UPDATE "organizations" o SET
  "logo_url"      = COALESCE(b."logo_url", o."logo_url"),
  "brand_title"   = COALESCE(b."brand_title", o."brand_title"),
  "brand_subline" = COALESCE(b."brand_subline", o."brand_subline")
FROM "org_branding" b
WHERE b."org_slug" = o."slug";

-- Backfill any branded slug that wasn't seeded above (should be empty in
-- practice but keeps us safe if a third tenant snuck a row in).
INSERT INTO "organizations"
  ("slug", "display_name", "short_name", "country", "locale", "currency",
   "product_mode", "preset_slug", "features", "terms",
   "logo_url", "brand_title", "brand_subline")
SELECT
  b."org_slug",
  COALESCE(b."brand_title", b."org_slug"),
  COALESCE(b."brand_title", b."org_slug"),
  'NL',
  'nl-NL',
  'EUR',
  'custom',
  'custom',
  '{}'::jsonb,
  '{}'::jsonb,
  b."logo_url",
  b."brand_title",
  b."brand_subline"
FROM "org_branding" b
WHERE NOT EXISTS (
  SELECT 1 FROM "organizations" o WHERE o."slug" = b."org_slug"
);

DROP TABLE "org_branding";
