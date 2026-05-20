-- Industry preset + terminology lock: once set, JSON overrides are ignored at
-- resolve time and tenant admins cannot change preset/features/terms without
-- platform support clearing the lock.

ALTER TABLE "organizations"
  ADD COLUMN "preset_locked_at" TIMESTAMPTZ(6),
  ADD COLUMN "terminology_locked" BOOLEAN NOT NULL DEFAULT false;

COMMENT ON COLUMN "organizations"."preset_locked_at" IS 'When set, org profile (preset features + glossary) is locked; applyPreset is blocked.';
COMMENT ON COLUMN "organizations"."terminology_locked" IS 'Mirrors lock for clarity; set true together with preset_locked_at.';
