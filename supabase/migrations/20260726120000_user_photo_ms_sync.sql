-- Track whether an approved photo actually reached Microsoft.
--
-- A student's photo is meant to be ONE picture: the same image in Nexus and in
-- Teams/Outlook. When a teacher approves it we push it to Microsoft Graph. That
-- push is best-effort by nature, because app-only photo write needs the target
-- user to have an Exchange Online mailbox, so it will legitimately fail for some
-- accounts. Recording the outcome is what lets the review grid say "synced" or
-- "could not sync, retry" instead of silently pretending the two are in step.
--
-- These ride the select('*') that /api/auth/me already does on users, so they
-- cost no extra read on the hot path.

ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS photo_ms_synced_at   TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS photo_ms_sync_status TEXT,
  ADD COLUMN IF NOT EXISTS photo_ms_sync_error  TEXT;

-- 'synced'      the photo is live on the Microsoft account
-- 'no_account'  no ms_oid on file, nothing to push to
-- 'no_photo'    approved but avatar_url was empty or unreadable
-- 'no_mailbox'  Graph 404: the account has no Exchange mailbox to hold a photo
-- 'denied'      Graph 401/403: ProfilePhoto.ReadWrite.All is missing or unconsented
-- 'throttled'   Graph 429 after retries
-- 'failed'      anything else (network, 5xx, storage read)
-- 'disabled'    the push feature flag was off when the photo was approved
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'users_photo_ms_sync_status_check'
  ) THEN
    ALTER TABLE public.users ADD CONSTRAINT users_photo_ms_sync_status_check
      CHECK (
        photo_ms_sync_status IS NULL
        OR photo_ms_sync_status IN (
          'synced', 'no_account', 'no_photo', 'no_mailbox',
          'denied', 'throttled', 'failed', 'disabled'
        )
      );
  END IF;
END $$;

-- Finding the approved students whose photo never made it, for a retry sweep.
CREATE INDEX IF NOT EXISTS idx_users_photo_ms_sync_failed
  ON public.users (photo_ms_sync_status)
  WHERE photo_ms_sync_status IS NOT NULL AND photo_ms_sync_status <> 'synced';

COMMENT ON COLUMN public.users.photo_ms_sync_status IS
  'Outcome of the last attempt to mirror this user''s approved photo to Microsoft Graph. NULL means never attempted.';
