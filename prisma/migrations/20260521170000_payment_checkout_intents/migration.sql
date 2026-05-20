-- Server-side checkout intents for real Mollie hosted payments (webhook fulfillment).

CREATE TYPE "payment_checkout_intent_status" AS ENUM (
  'open',
  'paid',
  'failed',
  'expired',
  'canceled'
);

CREATE TABLE "payment_checkout_intents" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "paid_by_person_id" UUID NOT NULL,
  "amount" DECIMAL(10, 2) NOT NULL,
  "currency" TEXT NOT NULL DEFAULT 'EUR',
  "description" TEXT NOT NULL,
  "mollie_account" TEXT NOT NULL,
  "return_url" TEXT NOT NULL,
  "action" JSONB NOT NULL,
  "mollie_payment_id" TEXT,
  "status" "payment_checkout_intent_status" NOT NULL DEFAULT 'open',
  "fulfilled_at" TIMESTAMPTZ(6),
  "failure_reason" TEXT,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "payment_checkout_intents_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "payment_checkout_intents_mollie_payment_id_key"
  ON "payment_checkout_intents"("mollie_payment_id");

CREATE INDEX "payment_checkout_intents_paid_by_person_id_idx"
  ON "payment_checkout_intents"("paid_by_person_id");

CREATE INDEX "payment_checkout_intents_status_idx"
  ON "payment_checkout_intents"("status");

ALTER TABLE "payment_checkout_intents"
  ADD CONSTRAINT "payment_checkout_intents_paid_by_person_id_fkey"
  FOREIGN KEY ("paid_by_person_id") REFERENCES "people"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
