-- Nexus owns what a class WAS. Teams still owns WHEN it is.
--
-- syncClassroomMeetings treated the Teams meeting subject as the source of truth
-- for nexus_scheduled_classes.title and rewrote the row on every cycle. A teacher
-- who named a class in the Wrap Up panel ("Isometric Subtractive Cubes") watched it
-- revert to the meeting subject ("Class by Ar.Hari Babu") the next time the
-- reconciler ran. On 2026-07-30 at 15:45 UTC one cron pass retitled four classes in
-- the same second, each of which still carries the brief and bullets that prove a
-- human had wrapped it up.
--
-- content_edited_at is the fact that stops it: once set, the reconciler keeps the
-- local title and stops proposing an update for it. Date, time and cancellation are
-- deliberately NOT covered, Teams remains the source of truth for those.

ALTER TABLE nexus_scheduled_classes
  ADD COLUMN IF NOT EXISTS content_edited_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS content_edited_by UUID REFERENCES users(id) ON DELETE SET NULL,
  -- The "what we actually covered" card in Teams. Tracked separately from
  -- teams_channel_message_id so cancelling a class still soft-deletes the JOIN card
  -- rather than the wrap-up.
  ADD COLUMN IF NOT EXISTS teams_wrapup_message_id TEXT,
  ADD COLUMN IF NOT EXISTS teams_wrapup_chat_message_id TEXT,
  ADD COLUMN IF NOT EXISTS teams_wrapup_posted_at TIMESTAMPTZ,
  -- Hash of the card last pushed to Teams. Without it, every later wrap-up save (a
  -- typo fix, a YouTube link pasted a week on) would post another card.
  ADD COLUMN IF NOT EXISTS teams_wrapup_hash TEXT;

COMMENT ON COLUMN nexus_scheduled_classes.content_edited_at IS
  'When a human last edited this class''s title/description/notes/bullets in Nexus. Non-NULL means the Teams reconciler must not overwrite the title.';
COMMENT ON COLUMN nexus_scheduled_classes.content_edited_by IS
  'Who made that edit. NULL for rows locked by the backfill, where it is unknowable.';
COMMENT ON COLUMN nexus_scheduled_classes.teams_wrapup_message_id IS
  'Channel message carrying the wrap-up card. Separate from teams_channel_message_id (the join card) so cancellation cleanup does not remove it.';
COMMENT ON COLUMN nexus_scheduled_classes.teams_wrapup_hash IS
  'Hash of the last wrap-up card pushed to Teams, so re-saving an unchanged wrap-up posts nothing.';

-- Protect every class a human has already wrapped up, the moment this lands.
-- Without this the next cron run reverts them one last time.
--
-- Evidence of a human: a detailed note, a non-empty bullet list, tags, or images.
-- None of those can come from a Teams calendar event, which carries only a subject
-- and a body. content_edited_by stays NULL because who typed it is not recoverable.
UPDATE nexus_scheduled_classes c
SET content_edited_at = COALESCE(c.updated_at, c.created_at, now())
WHERE c.content_edited_at IS NULL
  AND (
    c.notes IS NOT NULL
    OR (c.summary_bullets IS NOT NULL
        AND jsonb_typeof(c.summary_bullets) = 'array'
        AND jsonb_array_length(c.summary_bullets) > 0)
    OR EXISTS (SELECT 1 FROM nexus_class_tags   t WHERE t.scheduled_class_id = c.id)
    OR EXISTS (SELECT 1 FROM nexus_class_images i WHERE i.scheduled_class_id = c.id)
  );

NOTIFY pgrst, 'reload schema';
