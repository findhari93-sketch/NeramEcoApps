-- Replace partial first_touch-only unique index with a full unique index
-- so ON CONFLICT works for all message types including phone_drip_*
DROP INDEX IF EXISTS idx_auto_msg_first_touch_unique;

CREATE UNIQUE INDEX idx_auto_msg_type_unique
  ON auto_messages (user_id, message_type, channel);
