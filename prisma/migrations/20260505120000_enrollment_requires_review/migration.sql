-- Heather feedback v1: when a parent enrolls a child outside the
-- configured age band the portal lets them push through with an
-- explicit override; we mark the row for admin review here so the
-- office can confirm with the family before the lesson starts.

ALTER TABLE "enrollments"
  ADD COLUMN "requires_review" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "review_reason"   TEXT;

CREATE INDEX "enrollments_requires_review_idx"
  ON "enrollments" ("requires_review")
  WHERE "requires_review" = true;
