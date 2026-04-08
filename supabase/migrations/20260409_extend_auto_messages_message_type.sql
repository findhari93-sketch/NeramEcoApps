-- Extend auto_messages message_type CHECK constraint to include phone_drip_* types
ALTER TABLE auto_messages DROP CONSTRAINT auto_messages_message_type_check;

ALTER TABLE auto_messages ADD CONSTRAINT auto_messages_message_type_check
  CHECK (message_type = ANY (ARRAY[
    'first_touch'::text,
    'follow_up_3d'::text,
    'follow_up_7d'::text,
    'nurture'::text,
    'phone_drip_1'::text,
    'phone_drip_2'::text,
    'phone_drip_3'::text,
    'phone_drip_4'::text,
    'phone_drip_5'::text
  ]));
