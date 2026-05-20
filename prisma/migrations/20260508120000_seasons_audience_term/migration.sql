-- =============================================================================
-- seasons_audience_term.sql
--
-- Restructures `seasons` so each `regular` row encodes:
--   audience  ∈ {youth, adult}
--   term      ∈ {fall, winter, spring, summer}
--   term_part ∈ {1, 2} or NULL
--   year      int
--
-- Cadence:
--   youth → 4 rows/year (Fall, Winter, Spring, Summer); term_part NULL
--   adult → 7 rows/year (Fall 1/2, Winter 1/2, Spring 1/2, Summer);
--           term_part 1|2 for fall/winter/spring, NULL for summer.
--
-- Names + slugs are auto-derived from the structured fields ("Spring 2026",
-- "Winter 2 2026", "Summer 2026") and regenerated for backfilled rows so the
-- pre-existing free-text values converge on the canonical format.
--
-- Camp / event_window / holiday rows keep free-form name/slug; their
-- audience / term / term_part / year columns stay NULL.
--
-- The legacy `season_type='summer'` value is dropped; any such rows migrate
-- to `season_type='regular'` + `term='summer'`.
-- =============================================================================

-- 1. New enums --------------------------------------------------------------
CREATE TYPE "season_audience" AS ENUM ('youth', 'adult');
CREATE TYPE "season_term"     AS ENUM ('fall', 'winter', 'spring', 'summer');

-- 2. New nullable columns ---------------------------------------------------
ALTER TABLE "seasons"
  ADD COLUMN "audience"  "season_audience",
  ADD COLUMN "term"      "season_term",
  ADD COLUMN "term_part" SMALLINT,
  ADD COLUMN "year"      INT;

-- 3. Backfill structured fields by parsing the existing names ---------------
--    Patterns covered: "Spring 1 2026", "Spring 2026", "Summer 2026",
--    "Winter 2026", "Winter 2026/2027". Anything that doesn't match is left
--    NULL and converted to season_type='event_window' below so the cadence
--    constraints stay satisfied.
UPDATE "seasons" SET
  term = (CASE
    WHEN name ILIKE 'fall%'   OR slug ILIKE 'fall%'   THEN 'fall'::season_term
    WHEN name ILIKE 'winter%' OR slug ILIKE 'winter%' THEN 'winter'::season_term
    WHEN name ILIKE 'spring%' OR slug ILIKE 'spring%' THEN 'spring'::season_term
    WHEN name ILIKE 'summer%' OR slug ILIKE 'summer%' OR season_type = 'summer'
                                                       THEN 'summer'::season_term
    ELSE NULL
  END),
  term_part = NULLIF(substring(name FROM '\s([12])\s'), '')::int,
  year = NULLIF(substring(name FROM '(\d{4})'), '')::int
WHERE season_type IN ('regular', 'summer');

-- Default audience for backfilled regular rows: existing seed catalog has
-- always been adult-only, so we tag everything 'adult' except plain youth-
-- shaped names ("Spring 2026" with no part), which are kept as adult too
-- (post-launch, Heather will re-create the youth seasons explicitly).
UPDATE "seasons" SET audience = 'adult'::season_audience
WHERE season_type IN ('regular', 'summer') AND term IS NOT NULL;

-- Adult Summer is always a single row → force term_part NULL.
UPDATE "seasons" SET term_part = NULL
WHERE term = 'summer';

-- Adult Fall/Winter/Spring without an explicit "1"/"2" in the name → assume
-- part 1 so the cadence constraint passes. (Heather can rename in the UI.)
UPDATE "seasons" SET term_part = 1
WHERE audience = 'adult'
  AND term IN ('fall', 'winter', 'spring')
  AND term_part IS NULL;

-- 4. Convert the legacy season_type='summer' rows to 'regular' --------------
UPDATE "seasons" SET season_type = 'regular' WHERE season_type = 'summer';

-- 5. Re-cast season_type without the 'summer' member ------------------------
ALTER TYPE "season_type" RENAME TO "season_type_old";
CREATE TYPE "season_type" AS ENUM ('regular', 'camp', 'event_window', 'holiday');
ALTER TABLE "seasons"
  ALTER COLUMN "season_type" TYPE "season_type"
  USING ("season_type"::text::"season_type");
DROP TYPE "season_type_old";

-- 6. Demote any leftover regular rows that we couldn't parse ----------------
--    (term/year still NULL after backfill — would violate the cadence CHECK).
--    Convert them to event_window so they survive without breaking the
--    constraint; admin can clean them up.
UPDATE "seasons"
SET season_type = 'event_window',
    audience = NULL, term = NULL, term_part = NULL, year = NULL
WHERE season_type = 'regular' AND (term IS NULL OR year IS NULL);

-- 7. Regenerate name + slug for every regular row so they match the
--    canonical "<Term> [<Part> ]<Year>" format ------------------------------
UPDATE "seasons" SET
  name = INITCAP(term::text)
         || COALESCE(' ' || term_part::text, '')
         || ' ' || year::text,
  slug = term::text
         || COALESCE('-' || term_part::text, '')
         || '-' || year::text
WHERE season_type = 'regular';

-- 8. Cadence constraints ----------------------------------------------------
ALTER TABLE "seasons" ADD CONSTRAINT "seasons_regular_requires_structured" CHECK (
  season_type <> 'regular'
  OR (audience IS NOT NULL AND term IS NOT NULL AND year IS NOT NULL)
);

ALTER TABLE "seasons" ADD CONSTRAINT "seasons_nonregular_no_structured" CHECK (
  season_type = 'regular'
  OR (audience IS NULL AND term IS NULL AND term_part IS NULL AND year IS NULL)
);

ALTER TABLE "seasons" ADD CONSTRAINT "seasons_youth_has_no_part" CHECK (
  audience IS DISTINCT FROM 'youth' OR term_part IS NULL
);

ALTER TABLE "seasons" ADD CONSTRAINT "seasons_adult_term_part_cadence" CHECK (
  audience IS DISTINCT FROM 'adult'
  OR (term = 'summer' AND term_part IS NULL)
  OR (term IN ('fall', 'winter', 'spring') AND term_part IN (1, 2))
);

ALTER TABLE "seasons" ADD CONSTRAINT "seasons_year_range_sane" CHECK (
  year IS NULL OR (year BETWEEN 2000 AND 2100)
);

-- 9. Uniqueness on the structured identity ----------------------------------
--    Use NULLS NOT DISTINCT (Postgres 15+) so that two youth rows with the
--    same (audience, term, year) collide even though both have term_part
--    NULL. Non-regular rows have all-NULL structured cols and would
--    therefore *also* dedupe — gate them out via a partial index.
CREATE UNIQUE INDEX "seasons_regular_identity_unique"
  ON "seasons"("season_type", "audience", "term", "term_part", "year")
  NULLS NOT DISTINCT
  WHERE "season_type" = 'regular';
