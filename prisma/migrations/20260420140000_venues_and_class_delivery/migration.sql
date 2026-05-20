-- Migration: venues + class delivery mode
--
-- Adds a unified `venues` model covering all 5 physical sites where a
-- class can happen (Triaz, Randwijck, AICS, AJ Ernststraat, VU
-- Sportcentrum) plus delivery-mode / pickup-timing columns on
-- `class_series`.

-- ---------------------------------------------------------------------------
-- 1. New enums
-- ---------------------------------------------------------------------------

CREATE TYPE "venue_kind" AS ENUM ('club', 'school', 'rented_court');

CREATE TYPE "class_delivery_mode" AS ENUM ('at_club', 'onsite', 'pickup');

-- ---------------------------------------------------------------------------
-- 2. Venues table
-- ---------------------------------------------------------------------------

CREATE TABLE "venues" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "kind" "venue_kind" NOT NULL,
    "address_line1" TEXT,
    "address_line2" TEXT,
    "postal_code" TEXT,
    "city" TEXT,
    "country" TEXT NOT NULL DEFAULT 'NL',
    "club_id" UUID,
    "coach_arrive_minutes" INTEGER NOT NULL DEFAULT 30,
    "transit_minutes" INTEGER NOT NULL DEFAULT 0,
    "notes" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT TRUE,
    "archived_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    CONSTRAINT "venues_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "venues_slug_key" ON "venues"("slug");
CREATE INDEX "venues_club_id_idx" ON "venues"("club_id");
CREATE INDEX "venues_kind_idx" ON "venues"("kind");

ALTER TABLE "venues"
    ADD CONSTRAINT "venues_club_id_fkey"
    FOREIGN KEY ("club_id") REFERENCES "clubs"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;

-- ---------------------------------------------------------------------------
-- 3. Seed the 5 core venues (idempotent on slug)
-- ---------------------------------------------------------------------------

INSERT INTO "venues" (
    "id", "slug", "name", "kind", "club_id",
    "address_line1", "postal_code", "city", "country",
    "coach_arrive_minutes", "transit_minutes",
    "is_active", "created_at", "updated_at"
)
SELECT
    gen_random_uuid(),
    'triaz',
    'Triaz',
    'club',
    c.id,
    c.address_line1, c.postal_code, c.city, c.country,
    30, 0,
    TRUE, NOW(), NOW()
FROM "clubs" c
WHERE c.slug = 'triaz'
ON CONFLICT ("slug") DO NOTHING;

INSERT INTO "venues" (
    "id", "slug", "name", "kind", "club_id",
    "address_line1", "postal_code", "city", "country",
    "coach_arrive_minutes", "transit_minutes",
    "is_active", "created_at", "updated_at"
)
SELECT
    gen_random_uuid(),
    'randwijck',
    'Randwijck',
    'club',
    c.id,
    c.address_line1, c.postal_code, c.city, c.country,
    30, 0,
    TRUE, NOW(), NOW()
FROM "clubs" c
WHERE c.slug = 'randwijck'
ON CONFLICT ("slug") DO NOTHING;

INSERT INTO "venues" (
    "id", "slug", "name", "kind",
    "address_line1", "postal_code", "city", "country",
    "coach_arrive_minutes", "transit_minutes",
    "notes",
    "is_active", "created_at", "updated_at"
) VALUES (
    gen_random_uuid(),
    'aics',
    'AICS',
    'school',
    'Jacob Marislaan 27',
    '1058 JC',
    'Amsterdam',
    'NL',
    30, 15,
    'Amsterdam International Community School. Coach picks up kids at school dismissal and walks to Randwijck.',
    TRUE, NOW(), NOW()
)
ON CONFLICT ("slug") DO NOTHING;

INSERT INTO "venues" (
    "id", "slug", "name", "kind",
    "address_line1", "postal_code", "city", "country",
    "coach_arrive_minutes", "transit_minutes",
    "notes",
    "is_active", "created_at", "updated_at"
) VALUES (
    gen_random_uuid(),
    'aj-ernststraat',
    'A.J. Ernststraat',
    'rented_court',
    'A.J. Ernststraat',
    NULL,
    'Amsterdam',
    'NL',
    30, 0,
    'Rented court (onsite lessons).',
    TRUE, NOW(), NOW()
)
ON CONFLICT ("slug") DO NOTHING;

INSERT INTO "venues" (
    "id", "slug", "name", "kind",
    "address_line1", "postal_code", "city", "country",
    "coach_arrive_minutes", "transit_minutes",
    "notes",
    "is_active", "created_at", "updated_at"
) VALUES (
    gen_random_uuid(),
    'vu-sportcentrum',
    'VU Sportcentrum',
    'rented_court',
    'De Boelelaan 1109',
    '1081 HV',
    'Amsterdam',
    'NL',
    30, 0,
    'Rented court at Vrije Universiteit Sportcentrum.',
    TRUE, NOW(), NOW()
)
ON CONFLICT ("slug") DO NOTHING;

-- ---------------------------------------------------------------------------
-- 4. class_series: add delivery_mode, venue_id, destination_club_id, pickup_at
-- ---------------------------------------------------------------------------

ALTER TABLE "class_series"
    ADD COLUMN "delivery_mode"       "class_delivery_mode" NOT NULL DEFAULT 'at_club',
    ADD COLUMN "venue_id"            UUID,
    ADD COLUMN "destination_club_id" UUID,
    ADD COLUMN "pickup_at"           TIME(6);

-- Backfill venue_id for existing series:
--   - if the series already references a club, use that club's venue,
--   - otherwise fall back to the triaz venue so the column can be NOT
--     NULL (no existing series is expected in practice; seed data does
--     not create class_series today, but we handle it defensively).
UPDATE "class_series" cs
SET "venue_id" = v.id
FROM "venues" v
WHERE v."club_id" = cs."club_id" AND v."kind" = 'club';

UPDATE "class_series" cs
SET "venue_id" = v.id
FROM "venues" v
WHERE cs."venue_id" IS NULL AND v."slug" = 'triaz';

-- Backfill delivery_mode from the existing class_type so pickup /
-- onsite series that predate this migration retain their mode.
UPDATE "class_series" SET "delivery_mode" = 'pickup' WHERE "class_type" = 'school_pickup';
UPDATE "class_series" SET "delivery_mode" = 'onsite' WHERE "class_type" = 'school_onsite';

ALTER TABLE "class_series"
    ALTER COLUMN "venue_id" SET NOT NULL;

ALTER TABLE "class_series"
    ADD CONSTRAINT "class_series_venue_id_fkey"
    FOREIGN KEY ("venue_id") REFERENCES "venues"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "class_series"
    ADD CONSTRAINT "class_series_destination_club_id_fkey"
    FOREIGN KEY ("destination_club_id") REFERENCES "clubs"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "class_series_venue_id_idx"            ON "class_series"("venue_id");
CREATE INDEX "class_series_destination_club_id_idx" ON "class_series"("destination_club_id");
