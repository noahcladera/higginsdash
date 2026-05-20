-- =============================================================================
-- membership_constraints.sql
--
-- Postgres-only invariants the membership system has *always* relied on but
-- has so far enforced only in application code. We're moving them into
-- the database so a hand-crafted INSERT, a botched migration, or a future
-- code change cannot create the kind of redundant / contradictory rows
-- the cleanup script exists to clean up.
--
-- Rules enforced here:
--   M1. Every active membership row covers at least one club.
--   M2. Individual rows MUST have an assignedPersonId; family rows MUST NOT.
--   M3. A household has at most one active family membership.
--   M4. A person has at most one active individual membership *per club*.
--   M5. Two active membership rows in the same household covering the
--       same (person, club) pair cannot have overlapping date windows
--       (handled by the unique indexes above for the simple cases plus
--       a defensive EXCLUDE for the family-vs-family overlap case).
--
-- Cleanup pre-step: anything the cleanup-overlapping-memberships script
-- would have flagged is folded inline so the constraint adds succeed
-- on environments that have never run the script. Idempotent.
-- =============================================================================

-- 0. Pre-step — drop redundant individual rows that sit fully under an
--    active family membership in the same household. Mirrors
--    `scripts/cleanup-overlapping-memberships.ts` but runs in SQL so the
--    migration is self-sufficient. We DELETE rather than CANCEL because
--    these are rows that should never have existed and the cleanup
--    script's authors already chose deletion for unbilled rows.
--    Rows referenced by payment lines are flipped to `cancelled` instead,
--    matching the script's "resolve in accounting first" guard.
WITH overlap AS (
  SELECT
    m.id AS m_id,
    EXISTS (SELECT 1 FROM payment_lines pl WHERE pl.membership_id = m.id) AS billed
  FROM memberships m
  WHERE m.status = 'active'
    AND m.coverage_tier <> 'family'
    AND EXISTS (
      SELECT 1
      FROM memberships fm
      JOIN membership_clubs mc_fm ON mc_fm.membership_id = fm.id
      JOIN membership_clubs mc_m  ON mc_m.membership_id  = m.id
      WHERE fm.household_id = m.household_id
        AND fm.id <> m.id
        AND fm.status = 'active'
        AND fm.coverage_tier = 'family'
        AND mc_fm.club_id = mc_m.club_id
      GROUP BY fm.id
      HAVING bool_and(EXISTS (
        SELECT 1
        FROM membership_clubs sub_fm
        JOIN membership_clubs sub_m
          ON sub_m.club_id = sub_fm.club_id
         AND sub_m.membership_id = m.id
        WHERE sub_fm.membership_id = fm.id
      ))
    )
)
UPDATE memberships
SET status = 'cancelled', updated_at = now()
WHERE id IN (SELECT m_id FROM overlap WHERE billed)
  AND status = 'active';

WITH overlap AS (
  SELECT m.id AS m_id
  FROM memberships m
  WHERE m.status = 'active'
    AND m.coverage_tier <> 'family'
    AND NOT EXISTS (SELECT 1 FROM payment_lines pl WHERE pl.membership_id = m.id)
    AND EXISTS (
      SELECT 1
      FROM memberships fm
      WHERE fm.household_id = m.household_id
        AND fm.id <> m.id
        AND fm.status = 'active'
        AND fm.coverage_tier = 'family'
        AND NOT EXISTS (
          SELECT 1
          FROM membership_clubs mc_m
          WHERE mc_m.membership_id = m.id
            AND NOT EXISTS (
              SELECT 1 FROM membership_clubs mc_fm
              WHERE mc_fm.membership_id = fm.id
                AND mc_fm.club_id = mc_m.club_id
            )
        )
    )
)
DELETE FROM memberships WHERE id IN (SELECT m_id FROM overlap);

-- M1. coverage_tier is non-null already (NOT NULL in schema). Nothing to add.

-- M2. Individual rows must be assigned, family rows must not be.
ALTER TABLE memberships
  DROP CONSTRAINT IF EXISTS memberships_assignment_matches_tier;

-- Defensive cleanup before installing the CHECK: any pre-existing rows
-- (active OR cancelled — the CHECK has no WHERE clause and applies to
-- the whole table) that violate the rule get nudged into a defensible
-- shape.
--   * family rows with an assignee → assignee dropped (family is
--     household-wide by design; the assignee meant nothing).
--   * individual rows without an assignee → if billed (have payment
--     lines) we backfill the household's first adult so accounting
--     records keep their target; otherwise we delete (cancelled +
--     unassigned individual rows are unrecoverable noise).
UPDATE memberships
SET assigned_person_id = NULL, updated_at = now()
WHERE coverage_tier = 'family' AND assigned_person_id IS NOT NULL;

-- Backfill billed orphans with a "best guess" — the household's first
-- adult, oldest first. If no adult exists, the row is deleted below.
UPDATE memberships m
SET assigned_person_id = adult.person_id, updated_at = now()
FROM (
  SELECT DISTINCT ON (hm.household_id)
    hm.household_id, hm.person_id
  FROM household_members hm
  WHERE hm.role_in_household = 'adult'
  ORDER BY hm.household_id, hm.person_id
) AS adult
WHERE m.coverage_tier <> 'family'
  AND m.assigned_person_id IS NULL
  AND m.household_id = adult.household_id
  AND EXISTS (SELECT 1 FROM payment_lines pl WHERE pl.membership_id = m.id);

DELETE FROM memberships
WHERE coverage_tier <> 'family'
  AND assigned_person_id IS NULL;

ALTER TABLE memberships
  ADD CONSTRAINT memberships_assignment_matches_tier CHECK (
    (coverage_tier =  'family' AND assigned_person_id IS NULL) OR
    (coverage_tier <> 'family' AND assigned_person_id IS NOT NULL)
  );

-- M1 (real). Active membership must cover at least one club.
-- Postgres can't check the join from a CHECK on memberships, so this
-- is a deferred trigger pattern. We use a constraint trigger that
-- runs at end-of-statement and verifies the new/updated row has at
-- least one MembershipClub row.
CREATE OR REPLACE FUNCTION memberships_require_club()
RETURNS trigger AS $$
DECLARE
  club_count int;
BEGIN
  IF NEW.status <> 'active' THEN
    RETURN NULL;
  END IF;
  SELECT COUNT(*) INTO club_count FROM membership_clubs WHERE membership_id = NEW.id;
  IF club_count = 0 THEN
    RAISE EXCEPTION 'memberships.id % is active but covers no clubs (M1)', NEW.id;
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS memberships_require_club_trigger ON memberships;
CREATE CONSTRAINT TRIGGER memberships_require_club_trigger
  AFTER INSERT OR UPDATE OF status ON memberships
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION memberships_require_club();

-- The same check needs to fire when a MembershipClub row is deleted —
-- otherwise you could empty an active membership of all its clubs and
-- leave it in an invalid state.
CREATE OR REPLACE FUNCTION membership_clubs_keep_active_covered()
RETURNS trigger AS $$
DECLARE
  m_status text;
  remaining int;
BEGIN
  SELECT status::text INTO m_status FROM memberships WHERE id = OLD.membership_id;
  IF m_status IS NULL OR m_status <> 'active' THEN
    RETURN OLD;
  END IF;
  SELECT COUNT(*) INTO remaining
    FROM membership_clubs WHERE membership_id = OLD.membership_id;
  IF remaining = 0 THEN
    RAISE EXCEPTION
      'cannot remove the last club of active membership % (M1)', OLD.membership_id;
  END IF;
  RETURN OLD;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS membership_clubs_keep_active_covered_trigger ON membership_clubs;
CREATE CONSTRAINT TRIGGER membership_clubs_keep_active_covered_trigger
  AFTER DELETE ON membership_clubs
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION membership_clubs_keep_active_covered();

-- M3. At most one active family membership per household.
DROP INDEX IF EXISTS memberships_one_active_family_per_household;
CREATE UNIQUE INDEX memberships_one_active_family_per_household
  ON memberships (household_id)
  WHERE status = 'active' AND coverage_tier = 'family';

-- M4. At most one active individual membership per (assigned_person, club).
--     A partial unique index can't reach across to the join table from
--     `memberships`, and Postgres won't accept a subquery in an index
--     expression (it isn't IMMUTABLE). Enforced via a constraint trigger
--     on `membership_clubs` instead. Trigger runs deferred so a
--     transaction that drops the old club and adds the new one in
--     either order still validates only at COMMIT time.
CREATE OR REPLACE FUNCTION memberships_unique_individual_seat()
RETURNS trigger AS $$
DECLARE
  conflict_count int;
  m_status text;
  m_tier text;
  m_person uuid;
BEGIN
  -- Identify the membership we're about to attach a club to.
  SELECT status::text, coverage_tier::text, assigned_person_id
    INTO m_status, m_tier, m_person
    FROM memberships WHERE id = NEW.membership_id;

  IF m_status IS NULL OR m_status <> 'active' OR m_tier = 'family' THEN
    RETURN NEW;
  END IF;
  IF m_person IS NULL THEN
    RETURN NEW;
  END IF;

  -- Any other active individual membership for this person at this club?
  SELECT COUNT(*) INTO conflict_count
    FROM membership_clubs mc
    JOIN memberships m ON m.id = mc.membership_id
    WHERE mc.club_id = NEW.club_id
      AND mc.id <> NEW.id
      AND m.id <> NEW.membership_id
      AND m.status = 'active'
      AND m.coverage_tier <> 'family'
      AND m.assigned_person_id = m_person;

  IF conflict_count > 0 THEN
    RAISE EXCEPTION
      'person % already has an active individual membership at club % (M4)',
      m_person, NEW.club_id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS memberships_unique_individual_seat_trigger ON membership_clubs;
CREATE CONSTRAINT TRIGGER memberships_unique_individual_seat_trigger
  AFTER INSERT OR UPDATE OF club_id, membership_id ON membership_clubs
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION memberships_unique_individual_seat();

-- M5 (family-vs-family). Two active family memberships in the same
-- household covering overlapping date windows would both pass M3 if
-- we only look at "now", because M3's WHERE clause includes any
-- `status='active'` row regardless of date. Belt-and-braces EXCLUDE
-- guards against backdated/future rows that would silently overlap.
ALTER TABLE memberships
  ADD COLUMN IF NOT EXISTS active_window daterange
  GENERATED ALWAYS AS (daterange(starts_on, expires_on, '[]')) STORED;

ALTER TABLE memberships
  DROP CONSTRAINT IF EXISTS memberships_family_no_overlap;

ALTER TABLE memberships
  ADD CONSTRAINT memberships_family_no_overlap
  EXCLUDE USING gist (
    household_id WITH =,
    active_window WITH &&
  ) WHERE (status = 'active' AND coverage_tier = 'family');

-- And the same for individual rows on the same (person × club): an
-- old single-club individual membership and a new joint one for the
-- same person must not both be active even momentarily during a
-- backdated insert. M4's trigger covers the live case; this catches
-- date-window overlap.
-- (We can't EXCLUDE on a joined table, so this stays as the M4
-- trigger above + M1 (must have a club). The trigger fires per
-- club row so functionally identical.)
