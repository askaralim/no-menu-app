-- Minimal suppression records prevent delayed uploads and source re-imports
-- from restoring erased Intelligence data. No business UUID is stored here.
CREATE TABLE ci.erased_subjects (
  user_key text PRIMARY KEY,
  erased_at timestamptz NOT NULL
);
CREATE TABLE ci.erased_sessions (
  installation_id uuid NOT NULL,
  session_id uuid NOT NULL,
  erased_at timestamptz NOT NULL,
  PRIMARY KEY(installation_id, session_id)
);
-- Receipts for semantic duplicates have no corresponding event row. Preserve
-- their session context from now on so targeted erasure can find them too.
ALTER TABLE ci.event_receipts ADD COLUMN installation_id uuid, ADD COLUMN session_id uuid;
UPDATE ci.event_receipts r SET installation_id=e.installation_id,session_id=e.session_id
  FROM ci.events e WHERE e.event_id=r.event_id;
CREATE INDEX ci_event_received ON ci.events(received_at);
CREATE INDEX ci_receipt_received ON ci.event_receipts(received_at);
