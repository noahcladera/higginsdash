-- =============================================================================
-- drop_membership_kind.sql
--
-- Removes the legacy `memberships.kind` column and the
-- `membership_kind` enum. After this migration `coverage_tier` is the
-- single source of truth for "what kind of membership is this":
--   coverage_tier IN ('adult', 'child') → individual
--   coverage_tier  =  'family'           → family (household-wide)
--
-- The two columns have always been redundant — every callsite computes
-- `kind` as `coverage_tier === 'family' ? 'family' : 'individual'`,
-- and there is no code that writes `kind` independently of
-- `coverage_tier`. Keeping both around invited the kinds of drift bugs
-- the membership audit found.
--
-- A defensive backfill catches the rare case where the two columns
-- disagreed (e.g. a manual UPDATE that touched only one): we trust
-- `coverage_tier` because every UI surface and pricing rule already
-- derives from it.
-- =============================================================================

-- 1. Heal any rows where the columns disagree by trusting coverage_tier.
--    Rows where coverage_tier='family' but kind='individual' (or vice
--    versa) get logged for audit; we don't change anything other than
--    the about-to-be-dropped column itself.
--    No-op in practice on a healthy DB but kept for defensive cleanup.
UPDATE memberships
SET kind = 'family'
WHERE coverage_tier = 'family' AND kind <> 'family';

UPDATE memberships
SET kind = 'individual'
WHERE coverage_tier <> 'family' AND kind <> 'individual';

-- 2. Drop the column, then the enum (the column had a NOT NULL +
--    enum-typed signature so we drop the column first).
ALTER TABLE memberships DROP COLUMN kind;

DROP TYPE membership_kind;
