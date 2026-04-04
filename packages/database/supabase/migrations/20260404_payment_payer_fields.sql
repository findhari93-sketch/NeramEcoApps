-- Add payer tracking fields to payments table
-- Allows tracking who actually paid (student, parent, guardian, etc.)

ALTER TABLE payments ADD COLUMN IF NOT EXISTS payer_name TEXT;
ALTER TABLE payments ADD COLUMN IF NOT EXISTS payer_relationship TEXT
  CHECK (payer_relationship IN ('self', 'parent', 'guardian', 'sibling', 'other'));

COMMENT ON COLUMN payments.payer_name IS 'Name of the person who made the payment';
COMMENT ON COLUMN payments.payer_relationship IS 'Relationship of the payer to the student';
