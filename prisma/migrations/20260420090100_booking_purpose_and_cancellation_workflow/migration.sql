-- Booking purpose enum + court_bookings.purpose column,
-- 4 cancellation-decision columns, and rebuild the EXCLUDE constraint
-- to ALSO block 'cancellation_requested' (so a slot stays reserved while
-- admin reviews a coach's deletion request).
--
-- The 'cancellation_requested' value itself was added in the previous
-- migration; doing both in the same transaction is not allowed by Postgres.

-- 1. New BookingPurpose enum + column on court_bookings.
CREATE TYPE "booking_purpose" AS ENUM ('personal', 'coaching');

ALTER TABLE "court_bookings"
  ADD COLUMN "purpose" "booking_purpose" NOT NULL DEFAULT 'personal';

-- 2. Cancellation-decision columns. Reuses existing `cancellation_reason`
--    for the coach-supplied reason; these new columns capture the admin's
--    decision (approve = booking moves to 'cancelled', deny = back to
--    'confirmed' with a denial reason captured for the audit trail).
ALTER TABLE "court_bookings"
  ADD COLUMN "cancellation_requested_at"          TIMESTAMPTZ(6),
  ADD COLUMN "cancellation_decision_at"           TIMESTAMPTZ(6),
  ADD COLUMN "cancellation_decided_by_person_id"  UUID REFERENCES "people"("id"),
  ADD COLUMN "cancellation_denial_reason"         TEXT;

CREATE INDEX "court_bookings_cancellation_requested_at_idx"
  ON "court_bookings"("cancellation_requested_at")
  WHERE "cancellation_requested_at" IS NOT NULL;

-- 3. Rebuild the EXCLUDE constraint so it covers BOTH 'confirmed' and
--    'cancellation_requested'. This is what guarantees nobody can grab a
--    slot while a coach's deletion request is pending admin review.
--
--    Note: dropping + recreating an EXCLUDE constraint requires holding an
--    ACCESS EXCLUSIVE lock briefly. On a fresh / low-traffic DB this is
--    instant.
ALTER TABLE "court_bookings" DROP CONSTRAINT IF EXISTS "court_bookings_no_overlap";

ALTER TABLE "court_bookings"
  ADD CONSTRAINT "court_bookings_no_overlap"
  EXCLUDE USING gist (
    court_id WITH =,
    during   WITH &&
  )
  WHERE (status IN ('confirmed', 'cancellation_requested'));
