-- ============================================================
-- Tag coverage: "Not this topic" answers from the review queue
-- ============================================================
--
-- The Tag coverage screen (Question Bank > Tag coverage) suggests registry
-- tags for untagged questions from a keyword dictionary. A teacher who says a
-- suggestion is wrong should never see that same question offered for that
-- same tag again, so the answer is kept here, one row per (question, tag).
--
-- Only the Nexus API routes read or write this table, through the service
-- role. RLS is on with no policies, and anon and authenticated lose every
-- privilege explicitly: Supabase grants table privileges to both roles
-- directly, so REVOKE FROM PUBLIC alone would leave them in.

CREATE TABLE IF NOT EXISTS nexus_qb_tag_suggestion_dismissals (
  question_id  uuid        NOT NULL REFERENCES nexus_qb_questions(id) ON DELETE CASCADE,
  tag_id       uuid        NOT NULL REFERENCES nexus_qb_tags(id) ON DELETE CASCADE,
  dismissed_by uuid,
  created_at   timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (question_id, tag_id)
);

-- The queue for one topic reads every dismissal for that tag.
CREATE INDEX IF NOT EXISTS idx_nexus_qb_tag_suggestion_dismissals_tag
  ON nexus_qb_tag_suggestion_dismissals (tag_id);

COMMENT ON TABLE nexus_qb_tag_suggestion_dismissals IS
  'Keyword tag suggestions a teacher rejected ("Not this topic") on the Question Bank Tag coverage screen. One row per question and tag; the pair is never suggested again. Service role only.';

ALTER TABLE nexus_qb_tag_suggestion_dismissals ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE nexus_qb_tag_suggestion_dismissals FROM PUBLIC, anon, authenticated;
GRANT ALL ON TABLE nexus_qb_tag_suggestion_dismissals TO service_role;
