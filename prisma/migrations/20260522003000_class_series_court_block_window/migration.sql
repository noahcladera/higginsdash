ALTER TABLE "class_series"
ADD COLUMN "court_block_start_time" TIME(6),
ADD COLUMN "court_block_end_time" TIME(6);

UPDATE "class_series"
SET
  "court_block_start_time" = "start_time",
  "court_block_end_time" = "end_time"
WHERE
  "default_court_id" IS NOT NULL
  AND "court_block_start_time" IS NULL
  AND "court_block_end_time" IS NULL;
