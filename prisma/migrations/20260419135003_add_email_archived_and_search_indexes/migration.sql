/*
  Warnings:

  - You are about to drop the column `during` on the `court_bookings` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "booking_settings" ALTER COLUMN "opens_at_local_time" SET DEFAULT '09:00'::time,
ALTER COLUMN "closes_at_local_time" SET DEFAULT '22:00'::time;

-- AlterTable
ALTER TABLE "court_bookings" DROP COLUMN "during";

-- AlterTable
ALTER TABLE "email_addresses" ADD COLUMN     "archived_at" TIMESTAMPTZ(6);

-- CreateIndex
CREATE INDEX "email_addresses_archived_at_idx" ON "email_addresses"("archived_at");

-- CreateIndex
CREATE INDEX "households_display_name_idx" ON "households"("display_name");

-- CreateIndex
CREATE INDEX "people_first_name_last_name_idx" ON "people"("first_name", "last_name");
