-- One-shot. Promotes the oldest non-system person to admin if there is no
-- real admin yet. Safe to re-run: once an admin exists, this is a no-op.
--
-- Reason this exists: an earlier version of `ensurePersonForAuthUser` counted
-- ALL people (including the System seed placeholder) when deciding whether
-- the new sign-in was the first user. That meant the very first real login
-- (Noah's) was created with is_admin=false. The logic is now fixed for any
-- future fresh installs, but this script repairs already-broken environments.
UPDATE people
SET is_admin = true
WHERE id = (
  SELECT id FROM people
  WHERE id <> '00000000-0000-0000-0000-000000000001'
  ORDER BY created_at ASC
  LIMIT 1
)
AND NOT EXISTS (
  SELECT 1 FROM people
  WHERE is_admin = true
    AND id <> '00000000-0000-0000-0000-000000000001'
);
