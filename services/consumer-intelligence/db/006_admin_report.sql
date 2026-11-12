-- Owner-backed view exposes visit counts/context, never subjects or evidence.
-- ci_api retains no SELECT permission on the underlying attribution table.
CREATE INDEX ci_event_occurred ON ci.events(occurred_at);

CREATE VIEW ci.admin_assisted_visit_summary AS
SELECT p.computed_at,
  COALESCE((SELECT jsonb_agg(jsonb_build_object(
    'tenant_id', v->>'tenant_id',
    'first_tap_created_at', v->>'first_tap_created_at',
    'tap_count', v->'tap_count',
    'matched_windows', v->'matched_windows'
  )) FROM jsonb_array_elements(p.payload->'visits') v), '[]'::jsonb) AS visits
FROM ci.assisted_visit_projection p WHERE p.singleton;
