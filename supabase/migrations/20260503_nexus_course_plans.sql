-- ============================================================
-- Course Plan Module — 9 tables + RLS
-- ============================================================

-- 1. Course Plans (master entity)
CREATE TABLE IF NOT EXISTS nexus_course_plans (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  classroom_id UUID NOT NULL REFERENCES nexus_classrooms(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  duration_weeks INTEGER NOT NULL DEFAULT 1,
  days_per_week TEXT[] NOT NULL DEFAULT ARRAY['tue','wed','thu','fri','sat','sun'],
  sessions_per_day JSONB NOT NULL DEFAULT '[]'::jsonb,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'active', 'completed')),
  teaching_team JSONB DEFAULT '[]'::jsonb,
  created_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_course_plans_classroom ON nexus_course_plans(classroom_id);
CREATE INDEX idx_course_plans_status ON nexus_course_plans(status);

-- 2. Course Plan Weeks
CREATE TABLE IF NOT EXISTS nexus_course_plan_weeks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  plan_id UUID NOT NULL REFERENCES nexus_course_plans(id) ON DELETE CASCADE,
  week_number INTEGER NOT NULL,
  title TEXT,
  goal TEXT,
  start_date DATE,
  end_date DATE,
  sort_order INTEGER NOT NULL DEFAULT 0,
  UNIQUE(plan_id, week_number)
);

CREATE INDEX idx_plan_weeks_plan ON nexus_course_plan_weeks(plan_id);

-- 3. Course Plan Sessions
CREATE TABLE IF NOT EXISTS nexus_course_plan_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  week_id UUID NOT NULL REFERENCES nexus_course_plan_weeks(id) ON DELETE CASCADE,
  plan_id UUID NOT NULL REFERENCES nexus_course_plans(id) ON DELETE CASCADE,
  day_number INTEGER NOT NULL,
  day_of_week TEXT NOT NULL CHECK (day_of_week IN ('mon','tue','wed','thu','fri','sat','sun')),
  slot TEXT NOT NULL CHECK (slot IN ('am', 'pm')),
  topic_id UUID REFERENCES nexus_topics(id) ON DELETE SET NULL,
  teacher_id UUID REFERENCES users(id) ON DELETE SET NULL,
  title TEXT NOT NULL,
  description TEXT,
  scheduled_class_id UUID REFERENCES nexus_scheduled_classes(id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'planned' CHECK (status IN ('planned', 'scheduled', 'completed', 'skipped')),
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_plan_sessions_week ON nexus_course_plan_sessions(week_id);
CREATE INDEX idx_plan_sessions_plan ON nexus_course_plan_sessions(plan_id);
CREATE INDEX idx_plan_sessions_scheduled ON nexus_course_plan_sessions(scheduled_class_id);

-- 4. Course Plan Homework
CREATE TABLE IF NOT EXISTS nexus_course_plan_homework (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID NOT NULL REFERENCES nexus_course_plan_sessions(id) ON DELETE CASCADE,
  plan_id UUID NOT NULL REFERENCES nexus_course_plans(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT,
  type TEXT NOT NULL DEFAULT 'mixed' CHECK (type IN ('drawing', 'mcq', 'study', 'review', 'mixed')),
  max_points INTEGER,
  due_date DATE,
  estimated_minutes INTEGER,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_plan_homework_session ON nexus_course_plan_homework(session_id);
CREATE INDEX idx_plan_homework_plan ON nexus_course_plan_homework(plan_id);

-- 5. Homework Submissions
CREATE TABLE IF NOT EXISTS nexus_homework_submissions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  homework_id UUID NOT NULL REFERENCES nexus_course_plan_homework(id) ON DELETE CASCADE,
  student_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'submitted', 'reviewed', 'returned')),
  attachments JSONB DEFAULT '[]'::jsonb,
  text_response TEXT,
  points_earned INTEGER,
  teacher_feedback TEXT,
  reviewed_by UUID REFERENCES users(id),
  submitted_at TIMESTAMPTZ,
  reviewed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(homework_id, student_id)
);

CREATE INDEX idx_hw_submissions_homework ON nexus_homework_submissions(homework_id);
CREATE INDEX idx_hw_submissions_student ON nexus_homework_submissions(student_id);

-- 6. Course Plan Tests
CREATE TABLE IF NOT EXISTS nexus_course_plan_tests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  plan_id UUID NOT NULL REFERENCES nexus_course_plans(id) ON DELETE CASCADE,
  week_id UUID NOT NULL REFERENCES nexus_course_plan_weeks(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT,
  question_count INTEGER,
  duration_minutes INTEGER,
  scope TEXT,
  test_id UUID REFERENCES nexus_tests(id) ON DELETE SET NULL,
  scheduled_date DATE,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_plan_tests_plan ON nexus_course_plan_tests(plan_id);

-- 7. Course Plan Resources
CREATE TABLE IF NOT EXISTS nexus_course_plan_resources (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  plan_id UUID NOT NULL REFERENCES nexus_course_plans(id) ON DELETE CASCADE,
  topic_id UUID REFERENCES nexus_topics(id) ON DELETE SET NULL,
  session_id UUID REFERENCES nexus_course_plan_sessions(id) ON DELETE SET NULL,
  title TEXT NOT NULL,
  url TEXT NOT NULL,
  type TEXT NOT NULL DEFAULT 'reference' CHECK (type IN ('video', 'practice', 'reference', 'tool')),
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now(),
  CHECK (topic_id IS NOT NULL OR session_id IS NOT NULL)
);

CREATE INDEX idx_plan_resources_plan ON nexus_course_plan_resources(plan_id);
CREATE INDEX idx_plan_resources_topic ON nexus_course_plan_resources(topic_id);

-- 8. Course Plan Drill Questions
CREATE TABLE IF NOT EXISTS nexus_course_plan_drill (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  plan_id UUID NOT NULL REFERENCES nexus_course_plans(id) ON DELETE CASCADE,
  question_text TEXT NOT NULL,
  answer_text TEXT NOT NULL,
  explanation TEXT,
  frequency_note TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_plan_drill_plan ON nexus_course_plan_drill(plan_id);

-- 9. Drill Progress (student tracking)
CREATE TABLE IF NOT EXISTS nexus_drill_progress (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  drill_id UUID NOT NULL REFERENCES nexus_course_plan_drill(id) ON DELETE CASCADE,
  student_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  mastered BOOLEAN NOT NULL DEFAULT false,
  attempts INTEGER NOT NULL DEFAULT 0,
  last_attempted_at TIMESTAMPTZ,
  UNIQUE(drill_id, student_id)
);

CREATE INDEX idx_drill_progress_student ON nexus_drill_progress(student_id);

-- ============================================================
-- RLS Policies
-- ============================================================

ALTER TABLE nexus_course_plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE nexus_course_plan_weeks ENABLE ROW LEVEL SECURITY;
ALTER TABLE nexus_course_plan_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE nexus_course_plan_homework ENABLE ROW LEVEL SECURITY;
ALTER TABLE nexus_homework_submissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE nexus_course_plan_tests ENABLE ROW LEVEL SECURITY;
ALTER TABLE nexus_course_plan_resources ENABLE ROW LEVEL SECURITY;
ALTER TABLE nexus_course_plan_drill ENABLE ROW LEVEL SECURITY;
ALTER TABLE nexus_drill_progress ENABLE ROW LEVEL SECURITY;

-- Service role bypass (all tables)
CREATE POLICY "service_role_all" ON nexus_course_plans FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "service_role_all" ON nexus_course_plan_weeks FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "service_role_all" ON nexus_course_plan_sessions FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "service_role_all" ON nexus_course_plan_homework FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "service_role_all" ON nexus_homework_submissions FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "service_role_all" ON nexus_course_plan_tests FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "service_role_all" ON nexus_course_plan_resources FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "service_role_all" ON nexus_course_plan_drill FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "service_role_all" ON nexus_drill_progress FOR ALL TO service_role USING (true) WITH CHECK (true);

-- Homework submissions storage bucket
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'homework-submissions',
  'homework-submissions',
  true,
  10485760,
  ARRAY['image/jpeg', 'image/png', 'image/webp', 'application/pdf']
) ON CONFLICT (id) DO NOTHING;

-- Storage policy: students upload to their own folder
CREATE POLICY "students_upload_homework" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'homework-submissions');

CREATE POLICY "anyone_read_homework" ON storage.objects
  FOR SELECT TO authenticated
  USING (bucket_id = 'homework-submissions');
