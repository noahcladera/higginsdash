-- Venue hero photos (editable from Admin → Venues).
ALTER TABLE venues
ADD COLUMN IF NOT EXISTS cover_image_url TEXT,
ADD COLUMN IF NOT EXISTS cover_image_focus_y INTEGER NOT NULL DEFAULT 50;

-- Backfill club venue photos from existing marketing image rows.
UPDATE venues v
SET cover_image_url = mi.url
FROM marketing_images mi
WHERE v.slug IN ('triaz', 'randwijck')
  AND mi.key = 'club:' || v.slug
  AND v.cover_image_url IS NULL;
