-- ============================================
-- ASSIGNMENT SHARE LINKS + MANUAL TEAMS SHARE
--
-- An assignment could be published (which posts one automatic card, see
-- 20260904090000) but never handed out again. A teacher who wanted to chase the
-- students still to submit had no link to paste, no message to copy, and no way
-- to post into the class Teams group tagging exactly those students.
--
-- This adds the two things that surface needs:
--
--   1. share_slug: a short, stable, pasteable id for the assignment. The row's
--      UUID would work as a path, but it is 36 characters and it is the internal
--      key; a slug keeps shared links short and means the identifier a student
--      sees in a Teams message is not the one our own foreign keys use.
--   2. teams_share_* : what a MANUAL share posted, kept strictly separate from
--      the teams_announced_* / teams_channel_message_id columns above, which
--      record the automatic publish card. Overwriting those would make the
--      announce-once guard think the assignment had never been announced, and
--      the next unrelated save would post the publish card a second time.
--      Mirrors the same four columns on nexus_scheduled_classes.
--
-- Additive and idempotent.
-- ============================================

-- 1. The short link id.
ALTER TABLE nexus_class_assignments
  ADD COLUMN IF NOT EXISTS share_slug TEXT;

COMMENT ON COLUMN nexus_class_assignments.share_slug IS
  'Short public id for /a/<slug>. Minted on first share, never reused or rotated: an old Teams message must keep resolving.';

-- Backfill every existing row. md5 of a fresh uuid rather than gen_random_bytes
-- + encode: base32 is not a pgcrypto encoding, and base64 yields '/' and '+',
-- which do not belong in a path segment. 8 hex chars is 4.3 billion values,
-- which the unique index below makes safe regardless.
UPDATE nexus_class_assignments
   SET share_slug = substr(md5(gen_random_uuid()::text), 1, 8)
 WHERE share_slug IS NULL;

-- Partial, so rows that somehow arrive without a slug do not all collide on
-- NULL. The application mints one on first read, so this stays empty in practice.
CREATE UNIQUE INDEX IF NOT EXISTS nexus_class_assignments_share_slug_key
  ON nexus_class_assignments (share_slug)
  WHERE share_slug IS NOT NULL;

-- New rows get one without the application having to remember.
ALTER TABLE nexus_class_assignments
  ALTER COLUMN share_slug SET DEFAULT substr(md5(gen_random_uuid()::text), 1, 8);

-- 2. What a manual share posted, and when.
ALTER TABLE nexus_class_assignments
  ADD COLUMN IF NOT EXISTS teams_share_message_id TEXT,
  ADD COLUMN IF NOT EXISTS teams_share_chat_message_id TEXT,
  ADD COLUMN IF NOT EXISTS teams_share_posted_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS teams_share_posted_by UUID;

COMMENT ON COLUMN nexus_class_assignments.teams_share_posted_at IS
  'When a human last pressed Share. NOT teams_announced_at, which marks the automatic publish card.';
