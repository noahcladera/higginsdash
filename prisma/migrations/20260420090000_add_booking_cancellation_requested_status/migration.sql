-- Add the 'cancellation_requested' value to the existing CourtBookingStatus
-- enum. Postgres allows ALTER TYPE ... ADD VALUE inside a transaction block
-- (Postgres 12+) but the new value cannot be referenced in the SAME
-- transaction, so this is split into its own migration. The follow-up
-- migration uses the value in the EXCLUDE constraint WHERE clause.

ALTER TYPE "court_booking_status"
  ADD VALUE IF NOT EXISTS 'cancellation_requested' BEFORE 'cancelled';
