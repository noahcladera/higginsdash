-- =============================================================================
-- Household credit wallet (lessons only)
--
-- Append-only ledger of EUR-cent movements per household. Positive amounts
-- are credits granted (refund-replacement, transfer remainder, manual
-- admin adjustment); negative amounts are credits spent against a paid
-- enrollment. The displayed balance for a household is `SUM(amount_cents)`.
--
-- Hard rule: credits may only be earned/spent against lesson enrollments,
-- never memberships. Enforced in src/lib/credits/spend.ts at the application
-- layer plus the CHECK constraints below.
-- =============================================================================

CREATE TYPE household_credit_reason AS ENUM (
  'transfer_remainder',
  'withdrawal_refund',
  'admin_adjustment',
  'enrollment_payment'
);

CREATE TABLE household_credits (
  id                       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  household_id             UUID NOT NULL REFERENCES households(id) ON DELETE RESTRICT,
  amount_cents             INTEGER NOT NULL,
  reason                   household_credit_reason NOT NULL,
  related_enrollment_id    UUID REFERENCES enrollments(id) ON DELETE SET NULL,
  related_payment_id       UUID REFERENCES payments(id) ON DELETE SET NULL,
  related_transfer_id      UUID,
  created_by_person_id     UUID NOT NULL REFERENCES people(id),
  note                     TEXT,
  created_at               TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- A spend (enrollment_payment) row must be negative and tied to an enrollment.
  -- All other reasons must be positive (issuing credit) and unrelated to enrollment
  -- spend; transfer_remainder may carry an enrollment for context.
  CONSTRAINT household_credits_spend_signs CHECK (
    (reason = 'enrollment_payment' AND amount_cents < 0 AND related_enrollment_id IS NOT NULL)
    OR (reason <> 'enrollment_payment' AND amount_cents > 0)
  )
);

CREATE INDEX household_credits_household_id_idx
  ON household_credits (household_id, created_at DESC);
CREATE INDEX household_credits_related_enrollment_id_idx
  ON household_credits (related_enrollment_id)
  WHERE related_enrollment_id IS NOT NULL;
CREATE INDEX household_credits_related_payment_id_idx
  ON household_credits (related_payment_id)
  WHERE related_payment_id IS NOT NULL;

-- Add credit_ledger_id to payment_lines so a payment can include a
-- "credit applied" line that points at the spend ledger row. Every
-- payment_lines row must still target exactly ONE thing — extend the
-- existing one-target CHECK to include the new column.
ALTER TABLE payment_lines
  ADD COLUMN credit_ledger_id UUID REFERENCES household_credits(id) ON DELETE RESTRICT;

CREATE INDEX payment_lines_credit_ledger_id_idx
  ON payment_lines (credit_ledger_id)
  WHERE credit_ledger_id IS NOT NULL;

ALTER TABLE payment_lines DROP CONSTRAINT IF EXISTS payment_lines_exactly_one_target;

ALTER TABLE payment_lines
  ADD CONSTRAINT payment_lines_exactly_one_target CHECK (
    (
      (enrollment_id      IS NOT NULL)::int
    + (membership_id      IS NOT NULL)::int
    + (recurring_block_id IS NOT NULL)::int
    + (court_booking_id   IS NOT NULL)::int
    + (credit_ledger_id   IS NOT NULL)::int
    ) = 1
  );
