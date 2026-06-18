-- Higgins medal tracking (workbook replacement)

CREATE TYPE "medal_level" AS ENUM (
  'rwb',
  'yellow',
  'purple',
  'blue_1',
  'blue_2',
  'red_1',
  'red_2',
  'orange_1',
  'orange_2',
  'green_1',
  'green_2'
);

CREATE TYPE "series_feedback_visibility" AS ENUM ('coach_only', 'parent_visible');

ALTER TABLE "students" ADD COLUMN "medal_level" "medal_level";

CREATE TABLE "student_medal_history" (
  "id" UUID NOT NULL,
  "student_id" UUID NOT NULL,
  "from_level" "medal_level",
  "to_level" "medal_level",
  "changed_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "changed_by_person_id" UUID NOT NULL,
  "reason" TEXT,
  CONSTRAINT "student_medal_history_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "medal_level_content" (
  "medal_level" "medal_level" NOT NULL,
  "title" TEXT NOT NULL,
  "short_description" TEXT,
  "long_description" TEXT NOT NULL DEFAULT '',
  "how_to_graduate" TEXT,
  "sort_order" INTEGER NOT NULL DEFAULT 0,
  "updated_at" TIMESTAMPTZ(6) NOT NULL,
  "updated_by_person_id" UUID,
  CONSTRAINT "medal_level_content_pkey" PRIMARY KEY ("medal_level")
);

CREATE TABLE "student_series_feedback" (
  "id" UUID NOT NULL,
  "enrollment_id" UUID NOT NULL,
  "body" TEXT NOT NULL,
  "visibility" "series_feedback_visibility" NOT NULL DEFAULT 'coach_only',
  "author_person_id" UUID NOT NULL,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL,
  CONSTRAINT "student_series_feedback_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "class_series" ADD COLUMN "eligible_medal_levels" "medal_level"[] DEFAULT ARRAY[]::"medal_level"[];
ALTER TABLE "class_series_groups" ADD COLUMN "eligible_medal_levels" "medal_level"[] DEFAULT ARRAY[]::"medal_level"[];

CREATE INDEX "students_medal_level_idx" ON "students"("medal_level");
CREATE INDEX "student_medal_history_student_id_changed_at_idx" ON "student_medal_history"("student_id", "changed_at");
CREATE INDEX "student_series_feedback_author_person_id_idx" ON "student_series_feedback"("author_person_id");
CREATE UNIQUE INDEX "student_series_feedback_enrollment_id_key" ON "student_series_feedback"("enrollment_id");

ALTER TABLE "student_medal_history" ADD CONSTRAINT "student_medal_history_student_id_fkey"
  FOREIGN KEY ("student_id") REFERENCES "students"("person_id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "student_medal_history" ADD CONSTRAINT "student_medal_history_changed_by_person_id_fkey"
  FOREIGN KEY ("changed_by_person_id") REFERENCES "people"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "medal_level_content" ADD CONSTRAINT "medal_level_content_updated_by_person_id_fkey"
  FOREIGN KEY ("updated_by_person_id") REFERENCES "people"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "student_series_feedback" ADD CONSTRAINT "student_series_feedback_enrollment_id_fkey"
  FOREIGN KEY ("enrollment_id") REFERENCES "enrollments"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "student_series_feedback" ADD CONSTRAINT "student_series_feedback_author_person_id_fkey"
  FOREIGN KEY ("author_person_id") REFERENCES "people"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Map existing kid skill levels to medal levels where possible
UPDATE "students" s
SET "medal_level" = CASE s."skill_level"::text
  WHEN 'red_1' THEN 'red_1'::"medal_level"
  WHEN 'red_2' THEN 'red_2'::"medal_level"
  WHEN 'red_3' THEN 'red_2'::"medal_level"
  WHEN 'orange_1' THEN 'orange_1'::"medal_level"
  WHEN 'orange_2' THEN 'orange_2'::"medal_level"
  WHEN 'orange_3' THEN 'orange_2'::"medal_level"
  WHEN 'green_1' THEN 'green_1'::"medal_level"
  WHEN 'green_2' THEN 'green_2'::"medal_level"
  WHEN 'yellow' THEN 'yellow'::"medal_level"
  ELSE NULL
END
WHERE s."skill_level"::text IN (
  'red_1', 'red_2', 'red_3', 'orange_1', 'orange_2', 'orange_3', 'green_1', 'green_2', 'yellow'
);

-- Clear skill_level on minors who now have a medal level
UPDATE "students" s
SET "skill_level" = NULL
WHERE s."medal_level" IS NOT NULL
  AND (
    EXISTS (
      SELECT 1 FROM "household_members" hm
      WHERE hm."person_id" = s."person_id" AND hm."role_in_household" = 'child'
    )
    OR EXISTS (
      SELECT 1 FROM "people" p
      WHERE p."id" = s."person_id"
        AND p."date_of_birth" IS NOT NULL
        AND p."date_of_birth" > (CURRENT_DATE - INTERVAL '18 years')
    )
  );

-- Seed medal level content rows
INSERT INTO "medal_level_content" ("medal_level", "title", "short_description", "long_description", "sort_order", "updated_at")
VALUES
  ('rwb', 'Red White Blue', 'Entry level', '', 0, NOW()),
  ('yellow', 'Yellow', 'Yellow ball', '', 1, NOW()),
  ('purple', 'Purple', 'Purple ball', '', 2, NOW()),
  ('blue_1', 'Blue 1', 'Blue ball — stage 1', '', 3, NOW()),
  ('blue_2', 'Blue 2', 'Blue ball — stage 2', '', 4, NOW()),
  ('red_1', 'Red 1', 'Red ball — stage 1', '', 5, NOW()),
  ('red_2', 'Red 2', 'Red ball — stage 2', '', 6, NOW()),
  ('orange_1', 'Orange 1', 'Orange ball — stage 1', '', 7, NOW()),
  ('orange_2', 'Orange 2', 'Orange ball — stage 2', '', 8, NOW()),
  ('green_1', 'Green 1', 'Green ball — stage 1', '', 9, NOW()),
  ('green_2', 'Green 2', 'Green ball — stage 2', '', 10, NOW())
ON CONFLICT ("medal_level") DO NOTHING;
