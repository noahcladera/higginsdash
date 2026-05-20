-- Phase 8 (issue #2 family): inboxes need an unread state.
--
-- Adds a `read_at` timestamp on `notifications`. Inbox queries use
-- `WHERE read_at IS NULL` to count unread items for the nav badge,
-- and clear it when the user marks a notification as read.

ALTER TABLE "notifications"
  ADD COLUMN "read_at" TIMESTAMPTZ(6);

CREATE INDEX "notifications_recipient_person_id_read_at_idx"
  ON "notifications" ("recipient_person_id", "read_at");
