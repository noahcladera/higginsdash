-- Allow court bookings to start at :00 or :30 (still 60-minute duration).
UPDATE "booking_settings"
SET "start_time_constraint" = 'on_the_half_hour';
