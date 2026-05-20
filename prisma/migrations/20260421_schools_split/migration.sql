-- Migration: split schools from venues
--
-- Venues are lesson locations (Triaz, Randwijck, AICS active; AJ
-- Ernststraat + VU Sportcentrum archived as backups). Schools are
-- pickup-only origins (IFS, AICS, BSA, AMITY) with per-school
-- "coach at Triaz N minutes before pickupAt to grab the gocab" timings.
-- AICS deliberately exists in both tables.

-- ---------------------------------------------------------------------------
-- 1. Schools table
-- ---------------------------------------------------------------------------

CREATE TABLE "schools" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "coach_arrive_at_hub_minutes" INTEGER NOT NULL DEFAULT 30,
    "notes" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT TRUE,
    "archived_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    CONSTRAINT "schools_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "schools_slug_key" ON "schools"("slug");

-- ---------------------------------------------------------------------------
-- 2. Seed the 4 pickup schools (idempotent on slug)
-- ---------------------------------------------------------------------------

INSERT INTO "schools" ("id", "slug", "name", "coach_arrive_at_hub_minutes", "notes", "is_active", "created_at", "updated_at")
VALUES
    (gen_random_uuid(), 'ifs',   'IFS',   20, 'International French School of Amsterdam. Coach at Triaz 20 min before pickup to grab the gocab.', TRUE, NOW(), NOW()),
    (gen_random_uuid(), 'aics',  'AICS',  15, 'Amsterdam International Community School. Also exists as a venue for on-site lessons.',              TRUE, NOW(), NOW()),
    (gen_random_uuid(), 'bsa',   'BSA',   30, 'British School of Amsterdam. Coach at Triaz 30 min before pickup.',                                   TRUE, NOW(), NOW()),
    (gen_random_uuid(), 'amity', 'AMITY', 30, 'Amity International School. Coach at Triaz 30 min before pickup.',                                    TRUE, NOW(), NOW())
ON CONFLICT ("slug") DO NOTHING;

-- ---------------------------------------------------------------------------
-- 3. class_series: add school_id, drop destination_club_id
-- ---------------------------------------------------------------------------

ALTER TABLE "class_series"
    ADD COLUMN "school_id" UUID;

-- Backfill pickup rows: previously venue_id pointed at a `school`-kind
-- venue (e.g. AICS) and destination_club_id told us where they played.
-- Move those apart: school_id <- school-matched by slug; venue_id <-
-- the club venue for the destination club. Best-effort only; any row
-- we can't resolve is left for manual fixup (no pickup rows are
-- expected in prod yet).
UPDATE "class_series" cs
SET "school_id" = s.id
FROM "venues" v
JOIN "schools" s ON s.slug = v.slug
WHERE cs."venue_id" = v.id
  AND cs."delivery_mode" = 'pickup'
  AND v.kind = 'school';

UPDATE "class_series" cs
SET "venue_id" = v.id
FROM "venues" v
WHERE cs."delivery_mode" = 'pickup'
  AND cs."destination_club_id" IS NOT NULL
  AND v.club_id = cs."destination_club_id"
  AND v.kind = 'club';

ALTER TABLE "class_series"
    DROP CONSTRAINT IF EXISTS "class_series_destination_club_id_fkey";

DROP INDEX IF EXISTS "class_series_destination_club_id_idx";

ALTER TABLE "class_series"
    DROP COLUMN "destination_club_id";

ALTER TABLE "class_series"
    ADD CONSTRAINT "class_series_school_id_fkey"
    FOREIGN KEY ("school_id") REFERENCES "schools"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "class_series_school_id_idx" ON "class_series"("school_id");

-- ---------------------------------------------------------------------------
-- 4. Archive unused backup venues
-- ---------------------------------------------------------------------------

UPDATE "venues"
SET "is_active" = FALSE,
    "archived_at" = COALESCE("archived_at", NOW()),
    "updated_at" = NOW()
WHERE "slug" IN ('aj-ernststraat', 'vu-sportcentrum');
