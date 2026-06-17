-- Drop adult ladder tables (feature removed for summer launch scope).

DROP TABLE IF EXISTS "ladder_awards";
DROP TABLE IF EXISTS "ladder_matches";
DROP TABLE IF EXISTS "ladder_availability";
DROP TABLE IF EXISTS "ladder_entries";
DROP TABLE IF EXISTS "ladder_seasons";

DROP TYPE IF EXISTS "ladder_award_kind";
DROP TYPE IF EXISTS "ladder_match_status";
DROP TYPE IF EXISTS "ladder_entry_status";
