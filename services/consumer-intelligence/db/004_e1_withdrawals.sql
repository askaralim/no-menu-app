-- Preserve immutable delivered items for analytics while making withdrawals monotonic.
CREATE TABLE ci.e1_instance_withdrawals (
  instance_id uuid NOT NULL REFERENCES ci.feed_instances(instance_id) ON DELETE CASCADE,
  item_id text NOT NULL,
  PRIMARY KEY (instance_id, item_id)
);
