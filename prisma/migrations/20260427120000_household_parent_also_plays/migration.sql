-- Persist the "I'm a parent and I also play" toggle from signup so the
-- portal home can recommend adult programs to parents who play (and skip
-- them for kid-only households). Defaults to false; existing rows can be
-- backfilled later from `enrollment_history.json` if needed.
ALTER TABLE "households"
  ADD COLUMN "parent_also_plays" BOOLEAN NOT NULL DEFAULT FALSE;
