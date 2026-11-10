-- Derived private projection: per-TAP evidence and aggregated visits are
-- published together. Recalculation can retract attribution without touching
-- immutable events, instances or business records. No public/API role access.
CREATE TABLE ci.assisted_visit_projection (
  singleton boolean PRIMARY KEY CHECK (singleton),
  computed_at timestamptz NOT NULL,
  consumer_generation uuid NOT NULL,
  consumer_source_as_of timestamptz NOT NULL,
  payload jsonb NOT NULL
);
