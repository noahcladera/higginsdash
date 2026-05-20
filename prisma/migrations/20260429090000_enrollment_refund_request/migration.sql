-- Phase 3 of the unified cancel/withdraw/refund/swap workflow.
--
-- When a parent withdraws an enrollment after they've already paid (and
-- before the series starts) we don't auto-refund — the office decides.
-- These two columns let `withdrawEnrollment` flag the row for admin
-- review and prefill the refund form once Phase 7 lands.

ALTER TABLE "enrollments"
  ADD COLUMN IF NOT EXISTS "refund_requested_at" TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS "refund_requested_reason" TEXT;

CREATE INDEX IF NOT EXISTS "enrollments_refund_requested_at_idx"
  ON "enrollments" ("refund_requested_at")
  WHERE "refund_requested_at" IS NOT NULL;
