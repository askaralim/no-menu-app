-- Execute as schema owner AFTER creating ci_api/ci_worker login accounts in RDS.
-- No passwords in source control. Runtime processes must NOT use schema owner.
GRANT USAGE ON SCHEMA ci TO ci_api,ci_worker;
GRANT SELECT ON ci.schema_migrations TO ci_api,ci_worker;
GRANT SELECT ON ci.projections,ci.feed_snapshots TO ci_api;
GRANT SELECT,INSERT ON ci.feed_instances,ci.identity_operations,ci.event_receipts TO ci_api;
GRANT SELECT,INSERT ON ci.analytics_sessions,ci.events TO ci_api;
GRANT UPDATE(integrity_error) ON ci.analytics_sessions TO ci_api;
GRANT UPDATE(resolved_user_key,identity_state) ON ci.events TO ci_api;
GRANT SELECT,INSERT ON ci.refresh_requests TO ci_api;
GRANT SELECT,INSERT,UPDATE ON ci.projections TO ci_worker;
GRANT SELECT,INSERT ON ci.feed_snapshots TO ci_worker;
GRANT SELECT,DELETE ON ci.refresh_requests TO ci_worker;
GRANT SELECT ON ci.events TO ci_worker;
GRANT SELECT,INSERT,UPDATE ON ci.assisted_visit_projection TO ci_worker;

-- Runtime may read suppression records, never erase data or lift suppression.
GRANT SELECT ON ci.erased_subjects,ci.erased_sessions TO ci_api,ci_worker;

GRANT SELECT,INSERT ON ci.e1_instance_withdrawals TO ci_api;

GRANT SELECT ON ci.e1_policy,ci.e1_refresh_intents TO ci_api,ci_worker;
GRANT UPDATE(worker_epoch,worker_fingerprint,worker_until) ON ci.e1_policy TO ci_worker;
GRANT INSERT ON ci.e1_refresh_intents TO ci_api,ci_worker;
GRANT DELETE ON ci.e1_refresh_intents TO ci_worker;
GRANT SELECT ON ci.e1_required_assets TO ci_api,ci_worker;
GRANT UPDATE(requested_at) ON ci.refresh_requests,ci.e1_refresh_intents TO ci_api;
GRANT SELECT ON ci.e1_revoked_assets TO ci_api,ci_worker;
