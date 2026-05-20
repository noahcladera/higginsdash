-- Class sub-groups + per-coach pickup attendance.
--
-- Adds:
--   - class_series_groups               one or more sub-rosters per series
--   - class_series_coach_groups         optional per-coach group scope
--   - class_session_coach_groups        same, at single-session level
--   - enrollments.group_id              FK to chosen sub-group
--   - class_series_coaches.participates_in_pickup       (default true)
--   - class_session_coaches.participates_in_pickup      (NULL = inherit)
--
-- Backfills exactly one default group per existing class_series (mirroring
-- the series' name/end_time/limits/age band/levels) and points every
-- existing enrollment at that group, so post-migration every series has
-- ≥1 group and every enrollment has a group_id.

-- 1. New table: class_series_groups -----------------------------------------
CREATE TABLE "class_series_groups" (
    "id"                    UUID NOT NULL DEFAULT gen_random_uuid(),
    "class_series_id"       UUID NOT NULL,
    "name"                  TEXT NOT NULL,
    "display_order"         INTEGER NOT NULL DEFAULT 0,
    "min_age"               INTEGER,
    "max_age"               INTEGER,
    "eligible_skill_levels" "skill_level"[] NOT NULL DEFAULT ARRAY[]::"skill_level"[],
    "end_time"              TIME(6) NOT NULL,
    "max_students"          INTEGER NOT NULL,
    "min_students"          INTEGER,
    "internal_notes"        TEXT,
    "archived_at"           TIMESTAMPTZ(6),
    "created_at"            TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at"            TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "class_series_groups_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "class_series_groups_class_series_id_idx" ON "class_series_groups"("class_series_id");

ALTER TABLE "class_series_groups"
    ADD CONSTRAINT "class_series_groups_class_series_id_fkey"
    FOREIGN KEY ("class_series_id") REFERENCES "class_series"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

-- 2. Backfill: one default group per existing series ------------------------
INSERT INTO "class_series_groups" (
    "id", "class_series_id", "name", "display_order",
    "min_age", "max_age", "eligible_skill_levels",
    "end_time", "max_students", "min_students",
    "internal_notes", "created_at", "updated_at"
)
SELECT
    gen_random_uuid(),
    cs."id",
    'Default group',
    0,
    cs."min_age",
    cs."max_age",
    COALESCE(cs."eligible_skill_levels", ARRAY[]::"skill_level"[]),
    cs."end_time",
    cs."max_students",
    cs."min_students",
    NULL,
    NOW(),
    NOW()
FROM "class_series" cs;

-- 3. enrollments.group_id ---------------------------------------------------
ALTER TABLE "enrollments"
    ADD COLUMN "group_id" UUID;

CREATE INDEX "enrollments_group_id_idx" ON "enrollments"("group_id");

ALTER TABLE "enrollments"
    ADD CONSTRAINT "enrollments_group_id_fkey"
    FOREIGN KEY ("group_id") REFERENCES "class_series_groups"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;

-- Point every existing enrollment at its series' default (and only) group.
UPDATE "enrollments" e
SET "group_id" = csg."id"
FROM "class_series_groups" csg
WHERE csg."class_series_id" = e."class_series_id"
  AND e."group_id" IS NULL;

-- 4. class_series_coaches.participates_in_pickup ----------------------------
ALTER TABLE "class_series_coaches"
    ADD COLUMN "participates_in_pickup" BOOLEAN NOT NULL DEFAULT TRUE;

-- 5. class_session_coaches.participates_in_pickup ---------------------------
-- Nullable: NULL = inherit from the matching series-coach row.
ALTER TABLE "class_session_coaches"
    ADD COLUMN "participates_in_pickup" BOOLEAN;

-- 6. New table: class_series_coach_groups -----------------------------------
CREATE TABLE "class_series_coach_groups" (
    "id"                       UUID NOT NULL DEFAULT gen_random_uuid(),
    "class_series_coach_id"    UUID NOT NULL,
    "group_id"                 UUID NOT NULL,
    "created_at"               TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "class_series_coach_groups_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "class_series_coach_groups_class_series_coach_id_group_id_key"
    ON "class_series_coach_groups"("class_series_coach_id", "group_id");
CREATE INDEX "class_series_coach_groups_group_id_idx"
    ON "class_series_coach_groups"("group_id");

ALTER TABLE "class_series_coach_groups"
    ADD CONSTRAINT "class_series_coach_groups_class_series_coach_id_fkey"
    FOREIGN KEY ("class_series_coach_id") REFERENCES "class_series_coaches"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "class_series_coach_groups"
    ADD CONSTRAINT "class_series_coach_groups_group_id_fkey"
    FOREIGN KEY ("group_id") REFERENCES "class_series_groups"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

-- 7. New table: class_session_coach_groups ----------------------------------
CREATE TABLE "class_session_coach_groups" (
    "id"                       UUID NOT NULL DEFAULT gen_random_uuid(),
    "class_session_coach_id"   UUID NOT NULL,
    "group_id"                 UUID NOT NULL,
    "created_at"               TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "class_session_coach_groups_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "class_session_coach_groups_class_session_coach_id_group_id_key"
    ON "class_session_coach_groups"("class_session_coach_id", "group_id");
CREATE INDEX "class_session_coach_groups_group_id_idx"
    ON "class_session_coach_groups"("group_id");

ALTER TABLE "class_session_coach_groups"
    ADD CONSTRAINT "class_session_coach_groups_class_session_coach_id_fkey"
    FOREIGN KEY ("class_session_coach_id") REFERENCES "class_session_coaches"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "class_session_coach_groups"
    ADD CONSTRAINT "class_session_coach_groups_group_id_fkey"
    FOREIGN KEY ("group_id") REFERENCES "class_series_groups"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
