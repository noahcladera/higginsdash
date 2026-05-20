-- Add Gender enum, three emergency-contact columns + gender to people,
-- and a school column to students.

CREATE TYPE "gender" AS ENUM ('male', 'female', 'other', 'prefer_not_to_say');

ALTER TABLE "people"
  ADD COLUMN "gender"                          "gender",
  ADD COLUMN "emergency_contact_name"          TEXT,
  ADD COLUMN "emergency_contact_phone"         TEXT,
  ADD COLUMN "emergency_contact_relationship"  TEXT;

ALTER TABLE "students"
  ADD COLUMN "school" TEXT;
