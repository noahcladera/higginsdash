-- Add multi-court support for events (and future series types).
ALTER TABLE "class_series" ADD COLUMN "assigned_court_ids" UUID[] NOT NULL DEFAULT ARRAY[]::UUID[];
