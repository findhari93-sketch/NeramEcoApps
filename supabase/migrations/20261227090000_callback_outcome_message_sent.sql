-- Demo follow-up: a WhatsApp message sent, waiting for a reply (spec 2026-10-24).
-- Own file: a new enum value cannot be used in the transaction that adds it.
ALTER TYPE callback_outcome ADD VALUE IF NOT EXISTS 'message_sent';
