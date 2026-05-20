-- Quick read-only check: did postgres_extras restore the dropped objects?
SELECT
  (SELECT COUNT(*) FROM information_schema.columns
   WHERE table_name = 'court_bookings' AND column_name = 'during') AS during_col,
  (SELECT COUNT(*) FROM pg_constraint
   WHERE conname = 'court_bookings_no_overlap') AS overlap_constraint,
  (SELECT COUNT(*) FROM pg_indexes
   WHERE indexname = 'email_addresses_one_primary_per_person') AS primary_email_idx,
  (SELECT COUNT(*) FROM pg_constraint
   WHERE conname = 'payment_lines_exactly_one_target') AS payment_lines_constraint,
  (SELECT COUNT(*) FROM pg_trigger
   WHERE tgname = 'court_bookings_club_matches_court_trigger') AS court_club_trigger,
  (SELECT COUNT(*) FROM pg_trigger
   WHERE tgname = 'recurring_blocks_club_matches_court_trigger') AS rb_club_trigger;
