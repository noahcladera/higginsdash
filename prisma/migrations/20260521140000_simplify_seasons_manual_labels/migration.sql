-- =============================================================================
-- Simplify catalog seasons: manual name/slug, audience-only structure.
-- Drops term/type/year cadence and season-level enrollment windows.
-- =============================================================================

-- 1. Drop legacy constraints and indexes --------------------------------------
ALTER TABLE "seasons" DROP CONSTRAINT IF EXISTS "seasons_regular_requires_structured";
ALTER TABLE "seasons" DROP CONSTRAINT IF EXISTS "seasons_nonregular_no_structured";
ALTER TABLE "seasons" DROP CONSTRAINT IF EXISTS "seasons_youth_has_no_part";
ALTER TABLE "seasons" DROP CONSTRAINT IF EXISTS "seasons_adult_term_part_cadence";
ALTER TABLE "seasons" DROP CONSTRAINT IF EXISTS "seasons_year_range_sane";

DROP INDEX IF EXISTS "seasons_regular_identity_unique";

-- 2. Backfill audience for any legacy free-form rows ------------------------
UPDATE "seasons"
SET audience = 'adult'::season_audience
WHERE audience IS NULL;

-- 3. Drop structured / enrollment columns -------------------------------------
ALTER TABLE "seasons"
  DROP COLUMN IF EXISTS "season_type",
  DROP COLUMN IF EXISTS "term",
  DROP COLUMN IF EXISTS "term_part",
  DROP COLUMN IF EXISTS "year",
  DROP COLUMN IF EXISTS "enrollment_opens_at",
  DROP COLUMN IF EXISTS "enrollment_closes_at";

-- 4. Audience required; dates optional ----------------------------------------
ALTER TABLE "seasons"
  ALTER COLUMN "audience" SET NOT NULL,
  ALTER COLUMN "starts_on" DROP NOT NULL,
  ALTER COLUMN "ends_on" DROP NOT NULL;

-- 5. Drop unused enums --------------------------------------------------------
DROP TYPE IF EXISTS "season_type";
DROP TYPE IF EXISTS "season_term";

-- 6. New constraints ----------------------------------------------------------
ALTER TABLE "seasons" ADD CONSTRAINT "seasons_youth_requires_dates" CHECK (
  audience <> 'youth'
  OR (starts_on IS NOT NULL AND ends_on IS NOT NULL)
);

ALTER TABLE "seasons" ADD CONSTRAINT "seasons_dates_order" CHECK (
  starts_on IS NULL
  OR ends_on IS NULL
  OR ends_on >= starts_on
);
