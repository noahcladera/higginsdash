-- Coaches booking on behalf of the business (purpose = coaching) and admins
-- shouldn't be required to belong to a household. Existing rows already
-- have a value, so dropping NOT NULL is a safe in-place change.

ALTER TABLE "court_bookings"
  ALTER COLUMN "booked_by_household_id" DROP NOT NULL;
