-- Add coverage tier enum + column on memberships, with backfill so existing
-- rows (only seed memberships at this point) get a sensible value.

CREATE TYPE "membership_coverage_tier" AS ENUM ('adult', 'child', 'family');

ALTER TABLE "memberships"
  ADD COLUMN "coverage_tier" "membership_coverage_tier";

UPDATE "memberships"
  SET "coverage_tier" = 'family'
  WHERE "kind" = 'family';

-- Best-guess for legacy individual rows: assume an adult seat. There are
-- only a handful of these in the seed; new rows always set it explicitly.
UPDATE "memberships"
  SET "coverage_tier" = 'adult'
  WHERE "kind" = 'individual'
    AND "coverage_tier" IS NULL;

ALTER TABLE "memberships"
  ALTER COLUMN "coverage_tier" SET NOT NULL;
