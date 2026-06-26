-- Per-occurrence event enrollments (e.g. next Vrijmibo Friday only).
ALTER TABLE "enrollments" ADD COLUMN "event_occurrence_date" DATE;

-- Backfill active event enrollments to their series' next future session date.
UPDATE "enrollments" e
SET "event_occurrence_date" = sub.next_date
FROM (
  SELECT DISTINCT ON (e2.id)
    e2.id AS enrollment_id,
    (cs.starts_at AT TIME ZONE 'UTC')::date AS next_date
  FROM "enrollments" e2
  INNER JOIN "class_series" ser ON ser.id = e2.class_series_id
  INNER JOIN "class_sessions" cs ON cs.class_series_id = ser.id
  WHERE ser.class_type = 'event'
    AND cs.status <> 'cancelled'
    AND cs.starts_at >= CURRENT_DATE
  ORDER BY e2.id, cs.starts_at ASC
) sub
WHERE e.id = sub.enrollment_id
  AND e.event_occurrence_date IS NULL;

-- Past-only event enrollments: anchor to most recent session date.
UPDATE "enrollments" e
SET "event_occurrence_date" = sub.last_date
FROM (
  SELECT DISTINCT ON (e2.id)
    e2.id AS enrollment_id,
    (cs.starts_at AT TIME ZONE 'UTC')::date AS last_date
  FROM "enrollments" e2
  INNER JOIN "class_series" ser ON ser.id = e2.class_series_id
  INNER JOIN "class_sessions" cs ON cs.class_series_id = ser.id
  WHERE ser.class_type = 'event'
    AND cs.status <> 'cancelled'
    AND e2.event_occurrence_date IS NULL
  ORDER BY e2.id, cs.starts_at DESC
) sub
WHERE e.id = sub.enrollment_id
  AND e.event_occurrence_date IS NULL;

CREATE INDEX "enrollments_class_series_id_event_occurrence_date_idx"
  ON "enrollments" ("class_series_id", "event_occurrence_date");
