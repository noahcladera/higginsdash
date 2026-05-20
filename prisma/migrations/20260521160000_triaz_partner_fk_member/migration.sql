-- Triaz: partners must be selected from the member directory (no free-text guests).
UPDATE booking_settings
SET partner_capture_mode = 'fk_member'
WHERE club_id IN (
  SELECT id FROM clubs WHERE slug = 'triaz'
);
