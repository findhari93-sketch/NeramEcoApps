-- "Something is wrong with this question", from the student who is stuck on it.
--
-- Until now there was no way to say it. The checkpoint quiz opens with closing
-- disabled (RecapWatch passes dismissable={false}), so a student who meets a
-- question with a wrong answer key has exactly three buttons: Submit, Retry and
-- Rewatch and Retry. None of them can get past it, and none of them tells
-- anybody. The class stays uncleared and the teacher sees a student who stopped
-- trying.
--
-- nexus_qb_question_reports already exists and cannot be reused: its
-- question_id references nexus_qb_questions, and a recap checkpoint question
-- lives in nexus_class_recap_questions, a different table. The qb_question_id
-- bridge column on recap questions has been NULL for everything written since
-- the one-off backfill in 20260713210000, so there is no twin to point at
-- either. Hence a table of its own, shaped the same way so the two inboxes can
-- eventually be read together.
CREATE TABLE IF NOT EXISTS nexus_class_recap_question_reports (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  question_id  UUID NOT NULL REFERENCES nexus_class_recap_questions(id) ON DELETE CASCADE,
  -- Denormalised so the teacher's list is one query rather than a three-table
  -- join, and so a report survives in a readable form if the question is
  -- rewritten. Saving a checkpoint deactivates its questions and inserts new
  -- rows (rewriteSectionQuestions), which would otherwise orphan the report's
  -- only route back to a class.
  recap_id     UUID NOT NULL REFERENCES nexus_class_recaps(id) ON DELETE CASCADE,
  section_id   UUID NOT NULL REFERENCES nexus_class_recap_sections(id) ON DELETE CASCADE,
  student_id   UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  report_type  TEXT NOT NULL CHECK (report_type IN (
    'wrong_answer',      -- the marked answer is not the right one
    'no_correct_option', -- none of the four is right
    'unclear_question',  -- cannot tell what is being asked
    'not_taught',        -- this was never covered in the class
    'other'
  )),
  description  TEXT,
  status       TEXT NOT NULL DEFAULT 'open'
                 CHECK (status IN ('open', 'resolved', 'dismissed')),
  resolution_note TEXT,
  resolved_by  UUID REFERENCES users(id) ON DELETE SET NULL,
  resolved_at  TIMESTAMPTZ,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- One student, one question, once. Reporting drops the question from that
-- student's attempt, so without this a student could report their way through a
-- checkpoint one question at a time.
CREATE UNIQUE INDEX IF NOT EXISTS uq_recap_question_report_student
  ON nexus_class_recap_question_reports(question_id, student_id);

-- The teacher's list: open reports for a classroom's recaps, newest first.
CREATE INDEX IF NOT EXISTS idx_recap_question_reports_recap
  ON nexus_class_recap_question_reports(recap_id, status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_recap_question_reports_open
  ON nexus_class_recap_question_reports(status, created_at DESC)
  WHERE status = 'open';

ALTER TABLE nexus_class_recap_question_reports ENABLE ROW LEVEL SECURITY;

CREATE POLICY "service_role_full_access" ON nexus_class_recap_question_reports
  FOR ALL TO service_role USING (true) WITH CHECK (true);

COMMENT ON TABLE nexus_class_recap_question_reports IS
  'A student saying a catch-up checkpoint question is wrong. Reporting also drops that question from their attempt, so a broken question stops being a gate nobody can pass.';
