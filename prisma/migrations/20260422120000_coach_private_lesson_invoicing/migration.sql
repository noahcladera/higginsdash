-- Add coach_private_lesson purpose to RecurringBlockPurpose enum.
ALTER TYPE "recurring_block_purpose" ADD VALUE IF NOT EXISTS 'coach_private_lesson';

-- Relax Payment for AR-style manual invoices:
--   - mollie_payment_id becomes nullable
--   - invoice_number, issued_at, due_at added

-- Drop the existing unique constraint on mollie_payment_id and replace with
-- a partial unique index that only enforces uniqueness for non-null values,
-- so multiple manual invoices can coexist with null mollie IDs.
ALTER TABLE "payments" DROP CONSTRAINT IF EXISTS "payments_mollie_payment_id_key";
ALTER TABLE "payments" ALTER COLUMN "mollie_payment_id" DROP NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS "payments_mollie_payment_id_key"
  ON "payments" ("mollie_payment_id")
  WHERE "mollie_payment_id" IS NOT NULL;

ALTER TABLE "payments"
  ADD COLUMN IF NOT EXISTS "invoice_number" TEXT,
  ADD COLUMN IF NOT EXISTS "issued_at" TIMESTAMPTZ(6),
  ADD COLUMN IF NOT EXISTS "due_at" TIMESTAMPTZ(6);

CREATE UNIQUE INDEX IF NOT EXISTS "payments_invoice_number_key"
  ON "payments" ("invoice_number");
