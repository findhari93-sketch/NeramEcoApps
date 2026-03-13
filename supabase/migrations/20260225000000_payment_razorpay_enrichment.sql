-- Payment Razorpay Enrichment
-- Adds columns to store detailed Razorpay payment data fetched after verification
-- Also adds payment_scheme column that was missing from payments table

ALTER TABLE payments
  ADD COLUMN IF NOT EXISTS payment_scheme TEXT DEFAULT 'full',
  ADD COLUMN IF NOT EXISTS razorpay_method TEXT,
  ADD COLUMN IF NOT EXISTS razorpay_bank TEXT,
  ADD COLUMN IF NOT EXISTS razorpay_vpa TEXT,
  ADD COLUMN IF NOT EXISTS razorpay_card_last4 TEXT,
  ADD COLUMN IF NOT EXISTS razorpay_card_network TEXT,
  ADD COLUMN IF NOT EXISTS razorpay_fee DECIMAL(10,2),
  ADD COLUMN IF NOT EXISTS razorpay_tax DECIMAL(10,2),
  ADD COLUMN IF NOT EXISTS direct_payment_screenshot_url TEXT,
  ADD COLUMN IF NOT EXISTS direct_payment_utr TEXT,
  ADD COLUMN IF NOT EXISTS direct_payment_payer_name TEXT,
  ADD COLUMN IF NOT EXISTS verification_notes TEXT;

-- Note: payment_status enum only has 'pending','paid','failed','refunded'
-- The verify routes previously set 'completed' which would fail against the enum
-- This has been fixed to use 'paid' instead

-- Add indexes for common payment queries
CREATE INDEX IF NOT EXISTS idx_payments_receipt_number ON payments(receipt_number) WHERE receipt_number IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_payments_paid_at ON payments(paid_at DESC) WHERE paid_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_payments_status ON payments(status);
