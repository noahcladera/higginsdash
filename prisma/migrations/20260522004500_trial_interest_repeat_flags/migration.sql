-- Link trial leads to known people/classes when available, and snapshot
-- repeat-trial metadata so admin can spot follow-ups quickly.

ALTER TABLE "trial_interests"
  ADD COLUMN "person_id" UUID,
  ADD COLUMN "class_series_id" UUID,
  ADD COLUMN "prior_trial_count" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "is_repeat" BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE "trial_interests"
  ADD CONSTRAINT "trial_interests_person_id_fkey"
    FOREIGN KEY ("person_id") REFERENCES "people"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "trial_interests"
  ADD CONSTRAINT "trial_interests_class_series_id_fkey"
    FOREIGN KEY ("class_series_id") REFERENCES "class_series"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "trial_interests_person_id_created_at_idx"
  ON "trial_interests" ("person_id", "created_at");

CREATE INDEX "trial_interests_class_series_id_idx"
  ON "trial_interests" ("class_series_id");
