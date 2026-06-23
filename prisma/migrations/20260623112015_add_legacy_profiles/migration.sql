-- Legacy "Customer 360" read-only history (precomputed by the Higgins brain).
-- Only creates the two new tables; unrelated schema drift from `migrate diff`
-- was stripped so this migration is additive and safe to apply.

-- CreateTable
CREATE TABLE "legacy_profiles" (
    "id" UUID NOT NULL,
    "household_key" TEXT NOT NULL,
    "display_name" TEXT NOT NULL,
    "member_names" TEXT[],
    "total_paid_cents" INTEGER NOT NULL DEFAULT 0,
    "total_refunded_cents" INTEGER NOT NULL DEFAULT 0,
    "booking_count" INTEGER NOT NULL DEFAULT 0,
    "email_count" INTEGER NOT NULL DEFAULT 0,
    "complaint_count" INTEGER NOT NULL DEFAULT 0,
    "first_seen" DATE,
    "last_seen" DATE,
    "data" JSONB NOT NULL,
    "imported_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "legacy_profiles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "legacy_profile_emails" (
    "email" TEXT NOT NULL,
    "profile_id" UUID NOT NULL,

    CONSTRAINT "legacy_profile_emails_pkey" PRIMARY KEY ("email")
);

-- CreateIndex
CREATE UNIQUE INDEX "legacy_profiles_household_key_key" ON "legacy_profiles"("household_key");

-- CreateIndex
CREATE INDEX "legacy_profile_emails_profile_id_idx" ON "legacy_profile_emails"("profile_id");

-- AddForeignKey
ALTER TABLE "legacy_profile_emails" ADD CONSTRAINT "legacy_profile_emails_profile_id_fkey" FOREIGN KEY ("profile_id") REFERENCES "legacy_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;
