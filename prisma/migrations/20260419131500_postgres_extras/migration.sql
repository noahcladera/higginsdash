-- =============================================================================
-- postgres_extras.sql
--
-- Postgres-only constraints / columns Prisma cannot express in schema.prisma.
-- Run this AFTER `npx prisma migrate dev --name initial_schema` succeeds.
--
-- How it gets applied (the proper way for production):
--   `npx prisma migrate dev --create-only --name postgres_extras`
--   Then paste the contents of THIS file into the generated migration.sql
--   Then `npx prisma migrate dev` (no flag) to apply it.
--
-- For local dev one-off, you can also just psql straight into the DB.
-- =============================================================================

-- 1. Range types live in btree_gist for the EXCLUDE constraint below.
CREATE EXTENSION IF NOT EXISTS btree_gist;

-- 2. R13 — court_bookings cannot have two confirmed bookings overlapping on the
--    same court. Generated `during` column gives us a tstzrange to apply the
--    GIST EXCLUDE constraint against.
ALTER TABLE court_bookings
  ADD COLUMN IF NOT EXISTS during tstzrange
  GENERATED ALWAYS AS (tstzrange(starts_at, ends_at, '[)')) STORED;

ALTER TABLE court_bookings
  DROP CONSTRAINT IF EXISTS court_bookings_no_overlap;

ALTER TABLE court_bookings
  ADD CONSTRAINT court_bookings_no_overlap
  EXCLUDE USING gist (
    court_id WITH =,
    during   WITH &&
  ) WHERE (status = 'confirmed');

-- 3. R-A §2.2.1 — exactly one primary email per person. Prisma can't express
--    a partial unique index, so we add it as raw SQL.
DROP INDEX IF EXISTS email_addresses_one_primary_per_person;
CREATE UNIQUE INDEX email_addresses_one_primary_per_person
  ON email_addresses (person_id) WHERE is_primary = true;

-- 4. §2.14.2 — exactly one of (enrollment_id, membership_id, recurring_block_id,
--    court_booking_id) must be non-null on every payment_lines row.
ALTER TABLE payment_lines
  DROP CONSTRAINT IF EXISTS payment_lines_exactly_one_target;

ALTER TABLE payment_lines
  ADD CONSTRAINT payment_lines_exactly_one_target CHECK (
    (
      (enrollment_id      IS NOT NULL)::int
    + (membership_id      IS NOT NULL)::int
    + (recurring_block_id IS NOT NULL)::int
    + (court_booking_id   IS NOT NULL)::int
    ) = 1
  );

-- 5. §2.13.1 — court_bookings.club_id must equal courts.club_id.
--    Done with a CHECK function (we can't reference another table from a CHECK
--    directly, so a trigger is the canonical pattern).
CREATE OR REPLACE FUNCTION court_bookings_club_matches_court()
RETURNS trigger AS $$
DECLARE
  expected_club_id uuid;
BEGIN
  SELECT club_id INTO expected_club_id FROM courts WHERE id = NEW.court_id;
  IF expected_club_id IS NULL THEN
    RAISE EXCEPTION 'court_bookings.court_id % does not exist', NEW.court_id;
  END IF;
  IF NEW.club_id <> expected_club_id THEN
    RAISE EXCEPTION 'court_bookings.club_id % does not match courts.club_id %', NEW.club_id, expected_club_id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS court_bookings_club_matches_court_trigger ON court_bookings;
CREATE TRIGGER court_bookings_club_matches_court_trigger
  BEFORE INSERT OR UPDATE OF court_id, club_id ON court_bookings
  FOR EACH ROW EXECUTE FUNCTION court_bookings_club_matches_court();

-- Same idea for recurring_blocks.club_id matching its court's club_id.
CREATE OR REPLACE FUNCTION recurring_blocks_club_matches_court()
RETURNS trigger AS $$
DECLARE
  expected_club_id uuid;
BEGIN
  SELECT club_id INTO expected_club_id FROM courts WHERE id = NEW.court_id;
  IF expected_club_id IS NULL THEN
    RAISE EXCEPTION 'recurring_blocks.court_id % does not exist', NEW.court_id;
  END IF;
  IF NEW.club_id <> expected_club_id THEN
    RAISE EXCEPTION 'recurring_blocks.club_id % does not match courts.club_id %', NEW.club_id, expected_club_id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS recurring_blocks_club_matches_court_trigger ON recurring_blocks;
CREATE TRIGGER recurring_blocks_club_matches_court_trigger
  BEFORE INSERT OR UPDATE OF court_id, club_id ON recurring_blocks
  FOR EACH ROW EXECUTE FUNCTION recurring_blocks_club_matches_court();
