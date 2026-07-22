-- Microsoft profile photo sync support for user_avatars
--
-- Adds a `source` discriminator so we can tell a Microsoft-synced photo apart
-- from a user-uploaded one, and a `content_hash` so re-syncing the same
-- Microsoft photo is a no-op (never clobbers a newer user upload).
-- The avatar shown everywhere is still users.avatar_url; this just lets the
-- per-user photo history record where each photo came from.
--
-- NOTE: this file originally lived only in packages/database/supabase/migrations/,
-- which the deploy pipeline never pushes (deploy.yml runs `supabase db push` from
-- the ROOT supabase/ folder). It is duplicated here so prod/fresh envs apply it.
-- Idempotent (IF NOT EXISTS), so re-running against an env that already has it is a no-op.

ALTER TABLE user_avatars
  ADD COLUMN IF NOT EXISTS source text NOT NULL DEFAULT 'upload',
  ADD COLUMN IF NOT EXISTS content_hash text;

-- Fast lookup of a user's most recent Microsoft photo (for dedupe on sync).
CREATE INDEX IF NOT EXISTS idx_user_avatars_user_source
  ON user_avatars (user_id, source);

COMMENT ON COLUMN user_avatars.source IS 'Origin of the photo: ''upload'' (user) or ''microsoft'' (Graph sync).';
COMMENT ON COLUMN user_avatars.content_hash IS 'sha256 of the image bytes; used to skip re-storing an unchanged Microsoft photo.';
