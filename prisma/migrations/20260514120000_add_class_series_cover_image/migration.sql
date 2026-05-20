-- Add an optional hero image to ClassSeries.
--
-- This is the picture parents see at the top of a class page when
-- they're deciding whether to enrol. NULL means "fall back to the
-- program's cover image" so existing rows keep working with no
-- backfill.

ALTER TABLE "class_series"
  ADD COLUMN "cover_image_url" text;
