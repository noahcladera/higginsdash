-- Add personal address fields to people.
--
-- A person's own postal address. For people who live in a multi-person
-- household the household's address is the canonical mailing address;
-- these fields exist so that single people (no household) and household
-- members who live elsewhere can still have a personal address on file.
ALTER TABLE "people"
  ADD COLUMN "address_line1" TEXT,
  ADD COLUMN "address_line2" TEXT,
  ADD COLUMN "postal_code"   TEXT,
  ADD COLUMN "city"          TEXT,
  ADD COLUMN "country"       TEXT NOT NULL DEFAULT 'NL';
