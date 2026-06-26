-- Align Randwijck (and any legacy) booking opens-at with 09:00 club hours.
UPDATE "booking_settings"
SET "opens_at_local_time" = '09:00'::time
WHERE "opens_at_local_time" = '08:00'::time;
