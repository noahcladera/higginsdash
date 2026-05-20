-- Coach AR invoices (private-lesson court rental) are billed to the
-- coach personally and should not require a household. Make the FK
-- nullable so `createCoachInvoice` can omit it. Existing rows already
-- have a value, so no data backfill is needed.

ALTER TABLE "payments"
  ALTER COLUMN "paid_by_household_id" DROP NOT NULL;
