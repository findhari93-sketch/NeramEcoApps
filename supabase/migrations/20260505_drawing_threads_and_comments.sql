-- Drawing Threads & Comments: iterative submission workflow
-- Students submit → teacher reviews (redo/complete) → student resubmits → repeat

-- ============================================================
-- 1. Extend drawing_submissions with thread columns
-- ============================================================
ALTER TABLE drawing_submissions ADD COLUMN thread_id UUID;
ALTER TABLE drawing_submissions ADD COLUMN attempt_number INTEGER DEFAULT 1;

-- Self-referencing FK: thread_id points to the first submission in the thread
ALTER TABLE drawing_submissions ADD CONSTRAINT fk_ds_thread_id
  FOREIGN KEY (thread_id) REFERENCES drawing_submissions(id);

CREATE INDEX idx_ds_thread ON drawing_submissions(thread_id);

-- Expand status constraint to include redo and completed
ALTER TABLE drawing_submissions DROP CONSTRAINT drawing_submissions_status_check;
ALTER TABLE drawing_submissions ADD CONSTRAINT drawing_submissions_status_check
  CHECK (status IN ('submitted', 'under_review', 'redo', 'completed', 'reviewed', 'published'));

-- ============================================================
-- 2. Create drawing_thread_status (one per student+question)
-- ============================================================
CREATE TABLE drawing_thread_status (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  question_id UUID NOT NULL REFERENCES drawing_questions(id) ON DELETE CASCADE,
  thread_id UUID NOT NULL REFERENCES drawing_submissions(id),
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'redo', 'completed')),
  total_attempts INTEGER DEFAULT 1,
  latest_submission_id UUID REFERENCES drawing_submissions(id),
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(student_id, question_id)
);

CREATE INDEX idx_dts_student ON drawing_thread_status(student_id);
CREATE INDEX idx_dts_status ON drawing_thread_status(status);
CREATE INDEX idx_dts_question ON drawing_thread_status(question_id);

-- RLS
ALTER TABLE drawing_thread_status ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Students read own thread status" ON drawing_thread_status
  FOR SELECT TO authenticated USING (student_id = auth.uid());

CREATE POLICY "Service role full access thread status" ON drawing_thread_status
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- Updated_at trigger
CREATE TRIGGER set_drawing_thread_status_updated_at
  BEFORE UPDATE ON drawing_thread_status
  FOR EACH ROW
  EXECUTE FUNCTION update_nexus_updated_at();

-- ============================================================
-- 3. Create drawing_submission_comments
-- ============================================================
CREATE TABLE drawing_submission_comments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  submission_id UUID NOT NULL REFERENCES drawing_submissions(id) ON DELETE CASCADE,
  author_id UUID NOT NULL REFERENCES users(id),
  author_role TEXT NOT NULL CHECK (author_role IN ('student', 'teacher')),
  comment_text TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_dsc_submission ON drawing_submission_comments(submission_id);
CREATE INDEX idx_dsc_author ON drawing_submission_comments(author_id);

-- RLS
ALTER TABLE drawing_submission_comments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Read comments on accessible submissions" ON drawing_submission_comments
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "Create comments" ON drawing_submission_comments
  FOR INSERT TO authenticated WITH CHECK (author_id = auth.uid());

CREATE POLICY "Service role full access comments" ON drawing_submission_comments
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- ============================================================
-- 4. Backfill existing submissions
-- ============================================================
-- Every existing submission becomes its own thread (thread_id = self, attempt = 1)
UPDATE drawing_submissions SET thread_id = id, attempt_number = 1 WHERE thread_id IS NULL;

-- Create thread status rows for submissions that have a question_id
INSERT INTO drawing_thread_status (student_id, question_id, thread_id, status, total_attempts, latest_submission_id, completed_at)
SELECT
  ds.student_id,
  ds.question_id,
  ds.id,
  CASE
    WHEN ds.status IN ('reviewed', 'published') THEN 'completed'
    ELSE 'active'
  END,
  1,
  ds.id,
  CASE WHEN ds.status IN ('reviewed', 'published') THEN ds.reviewed_at ELSE NULL END
FROM drawing_submissions ds
WHERE ds.question_id IS NOT NULL
ON CONFLICT (student_id, question_id) DO NOTHING;

-- thread_id stays nullable — first insert sets it to self after creation
