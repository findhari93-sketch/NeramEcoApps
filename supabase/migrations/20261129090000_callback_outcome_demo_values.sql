-- Demo follow-up outcomes (spec 2026-10-15). Own file: a new enum value cannot
-- be used in the transaction that adds it.
ALTER TYPE callback_outcome ADD VALUE IF NOT EXISTS 'thinking';
ALTER TYPE callback_outcome ADD VALUE IF NOT EXISTS 'will_join';
ALTER TYPE callback_outcome ADD VALUE IF NOT EXISTS 'joined';
ALTER TYPE callback_outcome ADD VALUE IF NOT EXISTS 'not_interested';
