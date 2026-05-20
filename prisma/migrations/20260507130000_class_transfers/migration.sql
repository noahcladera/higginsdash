-- =============================================================================
-- Class transfer requests
--
-- Parent-initiated request to move a paid enrollment to a different class.
-- Admin reviews, picks a financial resolution (refund / credit / extra bill /
-- exact), and the workflow writes the new enrollment + ledger/refund/payment
-- rows in a single transaction.
-- =============================================================================

CREATE TYPE class_transfer_request_status AS ENUM (
  'pending',
  'approved',
  'rejected',
  'cancelled'
);

CREATE TYPE class_transfer_resolution AS ENUM (
  'exact',
  'refund',
  'credit',
  'extra_bill'
);

CREATE TABLE class_transfer_requests (
  id                              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  from_enrollment_id              UUID NOT NULL REFERENCES enrollments(id),
  requested_by_person_id          UUID NOT NULL REFERENCES people(id),
  requested_target_class_series_id UUID REFERENCES class_series(id),
  requested_note                  TEXT,
  status                          class_transfer_request_status NOT NULL DEFAULT 'pending',
  decided_by_person_id            UUID REFERENCES people(id),
  decided_at                      TIMESTAMPTZ,
  admin_note                      TEXT,
  result_enrollment_id            UUID REFERENCES enrollments(id),
  delta_cents                     INTEGER,
  resolution                      class_transfer_resolution,
  resolution_payment_id           UUID REFERENCES payments(id),
  resolution_refund_id            UUID REFERENCES refunds(id),
  resolution_credit_id            UUID REFERENCES household_credits(id),
  created_at                      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at                      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX class_transfer_requests_status_idx
  ON class_transfer_requests (status);
CREATE INDEX class_transfer_requests_from_enrollment_id_idx
  ON class_transfer_requests (from_enrollment_id);
CREATE INDEX class_transfer_requests_requested_by_person_id_idx
  ON class_transfer_requests (requested_by_person_id);
CREATE INDEX class_transfer_requests_decided_at_idx
  ON class_transfer_requests (decided_at);
