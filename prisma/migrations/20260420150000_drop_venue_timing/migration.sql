-- Drop the two Venue timing fields. Pickup timing now lives solely on
-- schools.coach_arrive_at_hub_minutes; at-club / onsite classes have
-- no separate setup buffer (coach shows up at class start).

ALTER TABLE venues DROP COLUMN IF EXISTS coach_arrive_minutes;
ALTER TABLE venues DROP COLUMN IF EXISTS transit_minutes;
