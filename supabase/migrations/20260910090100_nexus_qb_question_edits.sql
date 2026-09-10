-- ============================================
-- NEXUS QB QUESTION EDITS (audit log)
--
-- nexus_qb_questions has created_by, created_at and updated_at, but no
-- updated_by and no revision history at all. That was tolerable while editing a
-- question meant navigating to the paper workspace on purpose. The results
-- screen now offers "fix this question" one tap from the analysis that flagged
-- it, including an AI-assisted path that can rewrite four fields at once, so the
-- edit has to leave a trail.
--
-- What this answers, and nothing else could: who changed the answer key on a
-- question forty students had already sat, when, from which surface, and what it
-- used to say. `before` and `after` hold only the fields that actually changed,
-- so the row stays readable.
--
-- test_id is the run the teacher was looking at, kept for context. It is
-- nullable and unconstrained by intent: a question outlives any one test, and
-- losing the test must never cost the audit row.
--
-- Accessed only via the service-role admin client, so RLS is enabled with no
-- policy (default-deny for anon/authenticated; service role bypasses RLS).
-- ============================================
CREATE TABLE IF NOT EXISTS nexus_qb_question_edits (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  question_id UUID NOT NULL REFERENCES nexus_qb_questions(id) ON DELETE CASCADE,
  test_id     UUID,
  edited_by   UUID REFERENCES users(id) ON DELETE SET NULL,
  source      TEXT NOT NULL CHECK (source IN ('inline', 'ai_review')),
  before      JSONB NOT NULL DEFAULT '{}'::jsonb,
  after       JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_nexus_qb_question_edits_question
  ON nexus_qb_question_edits(question_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_nexus_qb_question_edits_test
  ON nexus_qb_question_edits(test_id) WHERE test_id IS NOT NULL;

ALTER TABLE nexus_qb_question_edits ENABLE ROW LEVEL SECURITY;

NOTIFY pgrst, 'reload schema';
