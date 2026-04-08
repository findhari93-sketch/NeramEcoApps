-- supabase/migrations/20260408_email_opt_out.sql

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS email_opt_out BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS email_opt_out_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_users_email_opt_out
  ON users (email_opt_out)
  WHERE email_opt_out = TRUE;

COMMENT ON COLUMN users.email_opt_out IS 'TRUE when user has unsubscribed from marketing/drip emails';
COMMENT ON COLUMN users.email_opt_out_at IS 'Timestamp when the user unsubscribed';
