CREATE SCHEMA IF NOT EXISTS ci;
CREATE TABLE IF NOT EXISTS ci.schema_migrations (version text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE ci.projections (
  scope text PRIMARY KEY CHECK (scope IN ('catalog','consumer')),
  generation uuid NOT NULL, source_as_of timestamptz NOT NULL,
  digest text NOT NULL, payload jsonb NOT NULL,
  published_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE ci.feed_snapshots (
  snapshot_id uuid PRIMARY KEY, user_key text NOT NULL, city_code text NOT NULL,
  model_version text NOT NULL, signature text NOT NULL,
  generated_at timestamptz NOT NULL, data_as_of timestamptz NOT NULL, payload jsonb NOT NULL,
  UNIQUE (user_key,city_code,model_version,signature)
);
CREATE INDEX ci_snapshot_lookup ON ci.feed_snapshots (user_key,city_code,generated_at DESC);
CREATE TABLE ci.feed_instances (
  instance_id uuid PRIMARY KEY, created_at timestamptz NOT NULL,
  retention_until timestamptz NOT NULL, payload jsonb NOT NULL
);
CREATE INDEX ci_instance_retention ON ci.feed_instances(retention_until);
CREATE TABLE ci.analytics_sessions (
  installation_id uuid NOT NULL, session_id uuid NOT NULL,
  owner_user_key text NOT NULL, authenticated_at timestamptz NOT NULL,
  integrity_error boolean NOT NULL DEFAULT false,
  PRIMARY KEY(installation_id,session_id)
);
CREATE TABLE ci.identity_operations (
  operation_id uuid PRIMARY KEY, installation_id uuid NOT NULL, session_id uuid NOT NULL,
  user_key text NOT NULL, fingerprint text NOT NULL, received_at timestamptz NOT NULL,
  payload jsonb NOT NULL
);
CREATE INDEX ci_identity_session ON ci.identity_operations(installation_id,session_id);
CREATE TABLE ci.events (
  event_id uuid PRIMARY KEY, installation_id uuid NOT NULL, session_id uuid NOT NULL,
  occurred_at timestamptz NOT NULL, received_at timestamptz NOT NULL DEFAULT now(),
  semantic_key text UNIQUE, raw jsonb NOT NULL, enrichment jsonb NOT NULL,
  resolved_user_key text, identity_state text NOT NULL DEFAULT 'unresolved'
);
CREATE INDEX ci_event_session ON ci.events(installation_id,session_id,occurred_at);
CREATE INDEX ci_event_user_time ON ci.events(resolved_user_key,occurred_at) WHERE resolved_user_key IS NOT NULL;
CREATE TABLE ci.event_receipts (
  event_id uuid PRIMARY KEY, fingerprint text NOT NULL, received_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE ci.refresh_requests (
  user_key text NOT NULL, city_code text NOT NULL, requested_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY(user_key,city_code)
);
-- All tables are private service storage; no public/anonymous database grants.
REVOKE ALL ON SCHEMA ci FROM PUBLIC;
