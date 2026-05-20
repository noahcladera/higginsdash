-- Progression rubric, season-end review, and class updates feed.
--
-- Adds four new tables and two enums on top of the existing
-- LevelContent / Student / Enrollment / ClassSeries surface:
--
--   • level_criteria              — admin-managed checklist per skill level
--   • student_level_progress      — per-student tick of a criterion
--   • enrollment_level_reviews    — coach end-of-season decision per enrollment
--   • class_updates               — coach-authored class update (with optional video)
--
-- Plus extends `level_content` with `how_to_graduate` (free-text companion
-- to the structured criteria checklist).
--
-- Source-of-truth in design/database.md.

-- ---------------------------------------------------------------------
-- 1. level_content extension
-- ---------------------------------------------------------------------
ALTER TABLE "level_content"
  ADD COLUMN "how_to_graduate" text;

-- ---------------------------------------------------------------------
-- 2. enums
-- ---------------------------------------------------------------------
CREATE TYPE "enrollment_level_review_outcome" AS ENUM ('stayed', 'promoted', 'demoted');
CREATE TYPE "class_update_video_provider"    AS ENUM ('youtube', 'vimeo');

-- ---------------------------------------------------------------------
-- 3. level_criteria
-- ---------------------------------------------------------------------
CREATE TABLE "level_criteria" (
  "id"          uuid           PRIMARY KEY DEFAULT gen_random_uuid(),
  "skill_level" "skill_level"  NOT NULL,
  "label"       text           NOT NULL,
  "description" text,
  "sort_order"  integer        NOT NULL DEFAULT 0,
  "archived_at" timestamptz(6),
  "created_at"  timestamptz(6) NOT NULL DEFAULT now(),
  "updated_at"  timestamptz(6) NOT NULL DEFAULT now()
);

CREATE INDEX "level_criteria_skill_level_sort_order_idx"
  ON "level_criteria" ("skill_level", "sort_order");
CREATE INDEX "level_criteria_archived_at_idx"
  ON "level_criteria" ("archived_at");

-- ---------------------------------------------------------------------
-- 4. student_level_progress
-- ---------------------------------------------------------------------
CREATE TABLE "student_level_progress" (
  "id"                     uuid           PRIMARY KEY DEFAULT gen_random_uuid(),
  "student_id"             uuid           NOT NULL,
  "criterion_id"           uuid           NOT NULL,
  "achieved_at"            timestamptz(6) NOT NULL DEFAULT now(),
  "achieved_by_person_id"  uuid           NOT NULL,
  "note"                   text,
  CONSTRAINT "student_level_progress_student_id_fkey"
    FOREIGN KEY ("student_id") REFERENCES "students" ("person_id") ON DELETE CASCADE,
  CONSTRAINT "student_level_progress_criterion_id_fkey"
    FOREIGN KEY ("criterion_id") REFERENCES "level_criteria" ("id") ON DELETE CASCADE,
  CONSTRAINT "student_level_progress_achieved_by_person_id_fkey"
    FOREIGN KEY ("achieved_by_person_id") REFERENCES "people" ("id")
);

CREATE UNIQUE INDEX "student_level_progress_student_id_criterion_id_key"
  ON "student_level_progress" ("student_id", "criterion_id");
CREATE INDEX "student_level_progress_student_id_idx"
  ON "student_level_progress" ("student_id");
CREATE INDEX "student_level_progress_criterion_id_idx"
  ON "student_level_progress" ("criterion_id");

-- ---------------------------------------------------------------------
-- 5. enrollment_level_reviews
-- ---------------------------------------------------------------------
CREATE TABLE "enrollment_level_reviews" (
  "id"                    uuid                              PRIMARY KEY DEFAULT gen_random_uuid(),
  "enrollment_id"         uuid                              NOT NULL,
  "decided_at"            timestamptz(6)                    NOT NULL DEFAULT now(),
  "decided_by_person_id"  uuid                              NOT NULL,
  "outcome"               "enrollment_level_review_outcome" NOT NULL,
  "from_level"            "skill_level",
  "to_level"              "skill_level",
  "comment"               text,
  "created_at"            timestamptz(6)                    NOT NULL DEFAULT now(),
  CONSTRAINT "enrollment_level_reviews_enrollment_id_fkey"
    FOREIGN KEY ("enrollment_id") REFERENCES "enrollments" ("id") ON DELETE CASCADE,
  CONSTRAINT "enrollment_level_reviews_decided_by_person_id_fkey"
    FOREIGN KEY ("decided_by_person_id") REFERENCES "people" ("id")
);

CREATE UNIQUE INDEX "enrollment_level_reviews_enrollment_id_key"
  ON "enrollment_level_reviews" ("enrollment_id");
CREATE INDEX "enrollment_level_reviews_decided_at_idx"
  ON "enrollment_level_reviews" ("decided_at");
CREATE INDEX "enrollment_level_reviews_decided_by_person_id_idx"
  ON "enrollment_level_reviews" ("decided_by_person_id");

-- ---------------------------------------------------------------------
-- 6. class_updates
-- ---------------------------------------------------------------------
CREATE TABLE "class_updates" (
  "id"                  uuid                          PRIMARY KEY DEFAULT gen_random_uuid(),
  "class_series_id"     uuid                          NOT NULL,
  "class_session_id"    uuid,
  "posted_by_person_id" uuid                          NOT NULL,
  "title"               text                          NOT NULL,
  "body_markdown"       text                          NOT NULL DEFAULT '',
  "video_url"           text,
  "video_provider"      "class_update_video_provider",
  "video_id"            text,
  "thumbnail_url"       text,
  "published_at"        timestamptz(6)                NOT NULL DEFAULT now(),
  "archived_at"         timestamptz(6),
  "created_at"          timestamptz(6)                NOT NULL DEFAULT now(),
  "updated_at"          timestamptz(6)                NOT NULL DEFAULT now(),
  CONSTRAINT "class_updates_class_series_id_fkey"
    FOREIGN KEY ("class_series_id") REFERENCES "class_series" ("id") ON DELETE CASCADE,
  CONSTRAINT "class_updates_class_session_id_fkey"
    FOREIGN KEY ("class_session_id") REFERENCES "class_sessions" ("id"),
  CONSTRAINT "class_updates_posted_by_person_id_fkey"
    FOREIGN KEY ("posted_by_person_id") REFERENCES "people" ("id")
);

CREATE INDEX "class_updates_class_series_id_published_at_idx"
  ON "class_updates" ("class_series_id", "published_at" DESC);
CREATE INDEX "class_updates_class_session_id_idx"
  ON "class_updates" ("class_session_id");
CREATE INDEX "class_updates_archived_at_idx"
  ON "class_updates" ("archived_at");
