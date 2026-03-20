-- Question reports / tickets from students
CREATE TABLE IF NOT EXISTS nexus_qb_question_reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  question_id UUID NOT NULL REFERENCES nexus_qb_questions(id) ON DELETE CASCADE,
  student_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  report_type TEXT NOT NULL CHECK (report_type IN (
    'wrong_answer', 'no_correct_option', 'question_error',
    'missing_solution', 'unclear_question', 'other'
  )),
  description TEXT,
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'in_review', 'resolved', 'dismissed')),
  resolution_note TEXT,
  resolved_by UUID REFERENCES users(id),
  resolved_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_qb_reports_question ON nexus_qb_question_reports(question_id);
CREATE INDEX IF NOT EXISTS idx_qb_reports_student ON nexus_qb_question_reports(student_id);
CREATE INDEX IF NOT EXISTS idx_qb_reports_status ON nexus_qb_question_reports(status);
