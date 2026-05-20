-- Enrollment pricing breakdown.
--
-- Snapshot the math the parent saw at checkout so the office can
-- reconstruct (and audit) the invoice forever.
--
--   * price_membership_add_on - what the membership add-on cost the
--     parent at the time of enrollment, when the chosen student
--     didn't yet hold a covering membership. Null when no add-on was
--     quoted (already a member, or waitlist row).
--   * sessions_remaining_at_enrollment - how many sessions were still
--     ahead of `enrolled_on`. Together with `price_paid` this is
--     enough to back out the per-session price and verify proration.
--
-- See computeEnrollmentPricing() in
-- src/lib/portal/enrollment-pricing.ts for the policy.

-- AlterTable
ALTER TABLE "enrollments" ADD COLUMN     "price_membership_add_on" DECIMAL(10,2),
ADD COLUMN     "sessions_remaining_at_enrollment" INTEGER;
