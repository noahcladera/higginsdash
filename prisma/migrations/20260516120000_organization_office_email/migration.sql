-- Add a configurable "office email" column to organizations.
--
-- Several user-visible flows route mail to a tenant-specific inbox
-- (booking deletion requests, ladder admin pings, the Programs page
-- "talk to the office" mailto, the lights instructions page, etc.).
-- Up to now those addresses lived as hardcoded literals in the
-- callers; this column moves them into the tenant config row so each
-- org can edit theirs from the Settings hub.

ALTER TABLE "organizations"
  ADD COLUMN IF NOT EXISTS "office_email" text;

-- Backfill the production tenant. Demo tenant intentionally left
-- NULL so the placeholder copy is exercised in QA.
UPDATE "organizations"
SET "office_email" = 'office@higginstennisnl.com'
WHERE "slug" = 'higgins-nl' AND "office_email" IS NULL;
