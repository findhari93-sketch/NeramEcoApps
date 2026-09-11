-- ============================================
-- NEXUS QB QUESTION REVIEWS (what an AI check said, and what it changed)
--
-- The test results screen sends questions to an external AI (ChatGPT, Gemini,
-- Claude) and brings the verdict back. Until this table the only trace was
-- nexus_qb_question_edits, which records a change and nothing else. A check
-- that found nothing wrong left no mark at all, so the same question could be
-- sent for review again and again, and a teacher looking at a pool of 150 had
-- no way to tell which ones had already been looked at.
--
-- One row per question per check. Keyed on the QUESTION rather than the test:
-- the wording and the answer key an AI judged are the same in every paper that
-- reuses the question, so a check made from one paper counts in all of them.
-- test_id and placement_id are context only and unconstrained, like the edits
-- log, so losing a test never costs the history.
--
--   verdict               wrong_key | ambiguous | hard_but_fair | fine.
--                         NULL only on rows backfilled from edits made before
--                         this table existed, whose verdict was never stored.
--   applied_fields        the fields the teacher accepted from this check.
--                         Empty means "checked, nothing changed".
--   edit_id               the audit row those fields were written through.
--   correct_pct_at_check  the correct rate the teacher was looking at, so the
--   answered_at_check     list can say "was 0%, now 44%" once a key fix moves it.
--
-- Accessed only via the service-role admin client, so RLS is enabled with no
-- policy (default-deny for anon/authenticated; service role bypasses RLS).
-- ============================================
CREATE TABLE IF NOT EXISTS nexus_qb_question_reviews (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  question_id          UUID NOT NULL REFERENCES nexus_qb_questions(id) ON DELETE CASCADE,
  test_id              UUID,
  placement_id         UUID,
  verdict              TEXT CHECK (verdict IN ('wrong_key', 'ambiguous', 'hard_but_fair', 'fine')),
  note                 TEXT,
  applied_fields       TEXT[] NOT NULL DEFAULT '{}',
  edit_id              UUID REFERENCES nexus_qb_question_edits(id) ON DELETE SET NULL,
  correct_pct_at_check SMALLINT,
  answered_at_check    INTEGER,
  reviewed_by          UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_nexus_qb_question_reviews_question
  ON nexus_qb_question_reviews(question_id, created_at DESC);

-- One check per audit row. Also what makes the backfill below safe to re-run.
CREATE UNIQUE INDEX IF NOT EXISTS uq_nexus_qb_question_reviews_edit
  ON nexus_qb_question_reviews(edit_id) WHERE edit_id IS NOT NULL;

ALTER TABLE nexus_qb_question_reviews ENABLE ROW LEVEL SECURITY;

-- Every AI fix already applied was a check that changed something. Its verdict
-- was never stored, so it stays NULL rather than being guessed.
INSERT INTO nexus_qb_question_reviews
  (question_id, test_id, verdict, applied_fields, edit_id, reviewed_by, created_at)
SELECT e.question_id,
       e.test_id,
       NULL,
       ARRAY(SELECT jsonb_object_keys(e.after) ORDER BY 1),
       e.id,
       e.edited_by,
       e.created_at
FROM nexus_qb_question_edits e
WHERE e.source = 'ai_review'
ON CONFLICT DO NOTHING;

NOTIFY pgrst, 'reload schema';
