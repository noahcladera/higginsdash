-- Phase 5 (issue #2 family): coach swap workflow
--
-- Coaches request a substitute for a single session. Office reviews and
-- assigns by inserting a `class_session_coaches` row with `is_substitute=true`
-- and flipping the request to `filled`.

CREATE TYPE "coach_sub_request_status" AS ENUM (
  'pending',
  'filled',
  'cancelled',
  'expired'
);

CREATE TABLE "coach_sub_requests" (
  "id"                          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "class_session_id"            UUID        NOT NULL,
  "requester_coach_person_id"   UUID        NOT NULL,
  "reason"                      TEXT        NOT NULL,
  "status"                      "coach_sub_request_status" NOT NULL DEFAULT 'pending',
  "filled_by_coach_person_id"   UUID,
  "filled_at"                   TIMESTAMPTZ(6),
  "cancelled_at"                TIMESTAMPTZ(6),
  "decided_by_person_id"        UUID,
  "admin_note"                  TEXT,
  "created_at"                  TIMESTAMPTZ(6) NOT NULL DEFAULT now(),
  "updated_at"                  TIMESTAMPTZ(6) NOT NULL DEFAULT now(),

  CONSTRAINT "coach_sub_requests_class_session_id_fkey"
    FOREIGN KEY ("class_session_id") REFERENCES "class_sessions"("id") ON DELETE CASCADE,
  CONSTRAINT "coach_sub_requests_requester_coach_person_id_fkey"
    FOREIGN KEY ("requester_coach_person_id") REFERENCES "people"("id") ON DELETE RESTRICT,
  CONSTRAINT "coach_sub_requests_filled_by_coach_person_id_fkey"
    FOREIGN KEY ("filled_by_coach_person_id") REFERENCES "people"("id") ON DELETE SET NULL,
  CONSTRAINT "coach_sub_requests_decided_by_person_id_fkey"
    FOREIGN KEY ("decided_by_person_id") REFERENCES "people"("id") ON DELETE SET NULL
);

CREATE INDEX "coach_sub_requests_class_session_id_idx"
  ON "coach_sub_requests" ("class_session_id");
CREATE INDEX "coach_sub_requests_requester_coach_person_id_idx"
  ON "coach_sub_requests" ("requester_coach_person_id");
CREATE INDEX "coach_sub_requests_status_idx"
  ON "coach_sub_requests" ("status");

-- One pending request per (session, coach) — coaches can't double-request.
CREATE UNIQUE INDEX "coach_sub_requests_one_pending_per_coach_session"
  ON "coach_sub_requests" ("class_session_id", "requester_coach_person_id")
  WHERE "status" = 'pending';
