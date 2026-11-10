-- Private CI only. The schema owner publishes policy; the worker may only attest.
CREATE TABLE ci.e1_policy (
  singleton boolean PRIMARY KEY CHECK(singleton),
  epoch bigint NOT NULL DEFAULT 0,
  mode text NOT NULL CHECK(mode IN ('off','shadow','serve')),
  model_version text,
  cohort text[] NOT NULL DEFAULT '{}',
  fingerprint text,
  worker_epoch bigint,
  worker_fingerprint text,
  worker_until timestamptz
);
INSERT INTO ci.e1_policy(singleton,mode) VALUES(true,'off');

-- One parent can owe more than one immutable version across a policy change.
CREATE TABLE ci.e1_refresh_intents (
  user_key text NOT NULL, city_code text NOT NULL, epoch bigint NOT NULL,
  model_version text NOT NULL, requested_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY(user_key,city_code,epoch,model_version),
  FOREIGN KEY(user_key,city_code) REFERENCES ci.refresh_requests(user_key,city_code) ON DELETE RESTRICT
);

-- 004 had shared, unversioned hints. Keep *every* evidenced E1 obligation during upgrade,
-- including a building instance whose payload has only ranking_version. Never infer from the local flag.
INSERT INTO ci.e1_refresh_intents(user_key,city_code,epoch,model_version,requested_at)
SELECT r.user_key,r.city_code,0,v.version,r.requested_at
FROM ci.refresh_requests r
JOIN (
  SELECT user_key,city_code,model_version AS version FROM ci.feed_snapshots
  UNION
  SELECT payload->>'owner_user_key',payload->>'city_code',coalesce(payload->>'model_version',payload->>'ranking_version')
  FROM ci.feed_instances
) v USING(user_key,city_code)
WHERE v.version LIKE 'rules-v2-e1:%';

-- Only identifiers, no user or feed payload exposed to the release preflight.
CREATE VIEW ci.e1_required_assets AS
SELECT DISTINCT version FROM (
  SELECT coalesce(payload->>'model_version',payload->>'ranking_version') AS version FROM ci.feed_instances
  UNION SELECT model_version FROM ci.feed_snapshots
  UNION SELECT model_version FROM ci.e1_refresh_intents
  UNION SELECT model_version FROM ci.e1_policy
  UNION SELECT enrichment->>'model_version' FROM ci.events
) r WHERE version LIKE 'rules-v2-e1:%';

-- A rollback of process configuration cannot undo an operator revocation.
CREATE TABLE ci.e1_revoked_assets (
  model_version text PRIMARY KEY CHECK (model_version ~ '^rules-v2-e1:[0-9a-f]{64}$'),
  revoked_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
