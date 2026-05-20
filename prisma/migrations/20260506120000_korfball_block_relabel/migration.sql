-- Heather feedback v1: rename the seeded Triaz × KV Triaz korfball
-- blocks and switch them to `members_only` scope so members are
-- blocked from booking but coaches can still teach private lessons on
-- courts 3-4 during the shared-use window.
UPDATE "recurring_blocks"
SET
  "purpose_description" = 'KV Triaz — korfball training (split use)',
  scope = 'members_only'
WHERE
  "purpose_type" = 'external_partner'
  AND "purpose_description" = 'Korfball club shared use';
