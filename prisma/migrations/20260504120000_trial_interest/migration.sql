-- Trial-interest leads from the public form.
--
-- Heather wanted a low-friction way for non-members to ask about a
-- trial without creating an account first; the admin works the queue
-- (contact → schedule → either convert to enrollment or close).

CREATE TYPE "trial_interest_audience" AS ENUM ('kids', 'adults');
CREATE TYPE "trial_interest_club" AS ENUM ('triaz', 'randwijck', 'no_preference');
CREATE TYPE "trial_interest_status" AS ENUM ('new', 'in_progress', 'scheduled', 'converted', 'closed');

CREATE TABLE "trial_interests" (
  "id"             UUID                       PRIMARY KEY DEFAULT gen_random_uuid(),
  "audience"       "trial_interest_audience"  NOT NULL,
  "contact_name"   TEXT                       NOT NULL,
  "player_name"    TEXT,
  "player_age"     INTEGER,
  "email"          TEXT                       NOT NULL,
  "phone"          TEXT,
  "preferred_club" "trial_interest_club",
  "notes"          TEXT,
  "status"         "trial_interest_status"    NOT NULL DEFAULT 'new',
  "admin_notes"    TEXT,
  "contacted_at"   TIMESTAMPTZ(6),
  "closed_at"      TIMESTAMPTZ(6),
  "created_at"     TIMESTAMPTZ(6)             NOT NULL DEFAULT now(),
  "updated_at"     TIMESTAMPTZ(6)             NOT NULL DEFAULT now()
);

CREATE INDEX "trial_interests_status_created_at_idx"
  ON "trial_interests" ("status", "created_at");
CREATE INDEX "trial_interests_audience_idx"
  ON "trial_interests" ("audience");
