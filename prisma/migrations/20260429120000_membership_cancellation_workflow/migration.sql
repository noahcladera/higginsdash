-- Phase 6 (issue #2 family): membership cancellation workflow
--
-- Members can ask the office to cancel an active membership. We don't flip
-- the row to `cancelled` immediately because:
--   1. The office may want to discuss / save the relationship first.
--   2. Coverage should stay live until the office actually pulls the plug
--      (the EXCLUDE / M-rule constraints in 20260421013700 only consider
--      `status = 'active'`, and we want them to keep behaving the same).
--
-- So we stamp `cancellation_requested_at` + reason on the row instead. The
-- inbox surfaces it as a pending decision; the office either denies (clears
-- the stamps) or approves (flips status → 'cancelled' and sets
-- cancelled_at + cancelled_by_person_id, optionally flagging a refund).

ALTER TABLE "memberships"
  ADD COLUMN "cancellation_requested_at"        TIMESTAMPTZ(6),
  ADD COLUMN "cancellation_requested_reason"    TEXT,
  ADD COLUMN "cancellation_requested_by_person_id" UUID,
  ADD COLUMN "cancelled_at"                     TIMESTAMPTZ(6),
  ADD COLUMN "cancelled_by_person_id"           UUID,
  ADD COLUMN "cancellation_denial_reason"       TEXT,
  ADD COLUMN "refund_requested_at"              TIMESTAMPTZ(6);

ALTER TABLE "memberships"
  ADD CONSTRAINT "memberships_cancellation_requested_by_person_id_fkey"
    FOREIGN KEY ("cancellation_requested_by_person_id")
    REFERENCES "people"("id") ON DELETE SET NULL,
  ADD CONSTRAINT "memberships_cancelled_by_person_id_fkey"
    FOREIGN KEY ("cancelled_by_person_id")
    REFERENCES "people"("id") ON DELETE SET NULL;

CREATE INDEX "memberships_cancellation_requested_at_idx"
  ON "memberships" ("cancellation_requested_at");
