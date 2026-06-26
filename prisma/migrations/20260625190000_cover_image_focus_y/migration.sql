-- Vertical crop anchor for cover images (0 = top, 50 = center, 100 = bottom).
ALTER TABLE "programs"
ADD COLUMN "cover_image_focus_y" INTEGER NOT NULL DEFAULT 50;

ALTER TABLE "class_series"
ADD COLUMN "cover_image_focus_y" INTEGER NOT NULL DEFAULT 50;
