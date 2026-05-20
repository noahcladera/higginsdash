-- =============================================================================
-- court_booking_overlap_includes_cancellation_requested.sql
--
-- The original EXCLUDE constraint added in 20260419131500_postgres_extras only
-- protected rows in `confirmed`. The schema comment on
-- CourtBookingStatus.cancellation_requested explicitly states that the slot
-- remains blocked while a coach's deletion request is in flight, but the
-- partial predicate disagreed: a fresh `confirmed` booking could overlap a
-- slot still held in `cancellation_requested`. Widen the predicate so the slot
-- stays reserved until admin actually approves the cancellation (which flips
-- the row to `cancelled`).
-- =============================================================================

ALTER TABLE court_bookings DROP CONSTRAINT IF EXISTS court_bookings_no_overlap;

ALTER TABLE court_bookings
  ADD CONSTRAINT court_bookings_no_overlap
  EXCLUDE USING gist (
    court_id WITH =,
    during   WITH &&
  ) WHERE (status IN ('confirmed', 'cancellation_requested'));
