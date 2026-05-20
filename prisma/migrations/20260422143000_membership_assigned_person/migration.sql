ALTER TABLE "memberships"
  ADD COLUMN IF NOT EXISTS "assigned_person_id" UUID;

ALTER TABLE "memberships"
  ADD CONSTRAINT "memberships_assigned_person_fk"
  FOREIGN KEY ("assigned_person_id") REFERENCES "people"("id")
  ON DELETE SET NULL
  ON UPDATE CASCADE;

CREATE INDEX IF NOT EXISTS "memberships_assigned_person_id_idx"
  ON "memberships" ("assigned_person_id");
