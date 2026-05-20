-- =============================================================================
-- Per-user iCal subscription tokens
--
-- A user generates a token in their portal profile and pastes the
-- corresponding URL into Google Calendar / Apple Calendar. Token IS the
-- secret — no auth header required when fetching the feed. Rotating /
-- revoking issues a new row and stamps the old one as revoked.
-- =============================================================================

CREATE TYPE calendar_feed_scope AS ENUM (
  'self',
  'household'
);

CREATE TABLE calendar_feed_tokens (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  person_id       UUID NOT NULL REFERENCES people(id) ON DELETE CASCADE,
  token           TEXT NOT NULL UNIQUE,
  scope           calendar_feed_scope NOT NULL DEFAULT 'self',
  label           TEXT,
  revoked_at      TIMESTAMPTZ,
  last_fetched_at TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX calendar_feed_tokens_person_id_idx
  ON calendar_feed_tokens (person_id);
