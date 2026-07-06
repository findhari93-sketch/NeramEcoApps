-- ============================================
-- NEXUS CLASS ASSIGNMENTS (Course Plan v2)
-- Per-class-day assignments: a teacher attaches an assignment to the class it
-- was given in (Class Day screen), students upload their work (single PDF or
-- photos, per the assignment's format lock), and the teacher marks it out of a
-- max with written feedback and an optional redo request. Also adds:
--   - youtube_url on nexus_scheduled_classes (unlisted backup of the Teams
--     recording; Teams copies expire after ~6 months)
--   - a 'section' flag on topic resources so drill files are distinguishable
--     from general resources
--   - a system study folder that holds teacher-uploaded assignment/drill
--     attachments (empty targeting = every student can view, view-only)
--   - new notification event types for assignment publish/review
--
-- Follows the Course Plan v2 convention: RLS enabled, service_role-only
-- policies, all authorization in the API layer. Idempotent.
-- ============================================

-- 1. ASSIGNMENTS - one per handout, pinned to the class day it was given.
-- classroom_id is the survival anchor (CASCADE); plan/entry/topic are context
-- (SET NULL) so marked submissions never disappear when a plan is rearranged
-- or archived. class_date is denormalized on purpose: auto-flow recomputes
-- entry dates when the teacher reorders or carries topics, but the assignment
-- must stay on the day it was actually handed out.
CREATE TABLE IF NOT EXISTS nexus_class_assignments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  classroom_id UUID NOT NULL REFERENCES nexus_classrooms(id) ON DELETE CASCADE,
  plan_id UUID REFERENCES nexus_teaching_plans(id) ON DELETE SET NULL,
  plan_entry_id UUID REFERENCES nexus_teaching_plan_entries(id) ON DELETE SET NULL,
  topic_id UUID REFERENCES nexus_course_topics(id) ON DELETE SET NULL,
  class_date DATE NOT NULL,
  title TEXT NOT NULL,
  instructions TEXT,
  submission_format TEXT NOT NULL DEFAULT 'pdf_or_image'
    CHECK (submission_format IN ('pdf', 'pdf_or_image')),
  max_marks NUMERIC(6,2) NOT NULL DEFAULT 10 CHECK (max_marks > 0),
  due_at TIMESTAMPTZ, -- NULL = no due date; "late" is derived (submitted_at > due_at)
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'published', 'closed')),
  published_at TIMESTAMPTZ,
  created_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_class_assignments_classroom ON nexus_class_assignments(classroom_id, status);
CREATE INDEX IF NOT EXISTS idx_class_assignments_plan_date ON nexus_class_assignments(plan_id, class_date);
CREATE INDEX IF NOT EXISTS idx_class_assignments_entry ON nexus_class_assignments(plan_entry_id);

-- 2. ATTACHMENTS - teacher reference files (question papers, drill sheets).
-- Files live in the SharePoint-backed study-files pipeline; this table only
-- links them, so "attach this topic's drill files" is a pure FK link.
CREATE TABLE IF NOT EXISTS nexus_assignment_attachments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  assignment_id UUID NOT NULL REFERENCES nexus_class_assignments(id) ON DELETE CASCADE,
  study_file_id UUID NOT NULL REFERENCES nexus_study_files(id) ON DELETE CASCADE,
  source TEXT NOT NULL DEFAULT 'upload' CHECK (source IN ('upload', 'topic_drill')),
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (assignment_id, study_file_id)
);

CREATE INDEX IF NOT EXISTS idx_assignment_attachments_assignment
  ON nexus_assignment_attachments(assignment_id);

-- 3. SUBMISSIONS - one row per student per assignment. Student files live in
-- the private 'assignment-submissions' bucket (browser uploads directly via
-- signed upload URLs; reads via short-TTL signed URLs). files is
-- [{ path, name, mime, size_bytes }]. On a redo-resubmit the previous
-- attempt's files are appended to history and attempt_number increments.
CREATE TABLE IF NOT EXISTS nexus_assignment_submissions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  assignment_id UUID NOT NULL REFERENCES nexus_class_assignments(id) ON DELETE CASCADE,
  student_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  files JSONB NOT NULL DEFAULT '[]',
  status TEXT NOT NULL DEFAULT 'submitted' CHECK (status IN ('submitted', 'reviewed', 'redo')),
  attempt_number INTEGER NOT NULL DEFAULT 1,
  marks NUMERIC(6,2),
  feedback TEXT,
  reviewed_by UUID REFERENCES users(id) ON DELETE SET NULL,
  reviewed_at TIMESTAMPTZ,
  submitted_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  history JSONB NOT NULL DEFAULT '[]',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (assignment_id, student_id)
);

CREATE INDEX IF NOT EXISTS idx_assignment_submissions_assignment
  ON nexus_assignment_submissions(assignment_id);
CREATE INDEX IF NOT EXISTS idx_assignment_submissions_student
  ON nexus_assignment_submissions(student_id);

-- 4. STORAGE BUCKET - private; no anon/authenticated policies on purpose.
-- Writes: service-role createSignedUploadUrl (browser PUTs bytes directly to
-- storage, so 25-30MB scanned PDFs never pass through a Vercel function).
-- Reads: service-role createSignedUrl with a short TTL.
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('assignment-submissions', 'assignment-submissions', false, 52428800,
        ARRAY['image/jpeg', 'image/png', 'image/webp', 'application/pdf'])
ON CONFLICT (id) DO NOTHING;

-- 5. YouTube backup link for a class recording (recording_url = Teams copy).
ALTER TABLE nexus_scheduled_classes ADD COLUMN IF NOT EXISTS youtube_url TEXT;

-- 6. Drill flag on topic resources: 'drill' files are take-home practice
-- material (attachable to assignments in one tap), 'resource' is everything else.
ALTER TABLE nexus_course_topic_resources
  ADD COLUMN IF NOT EXISTS section TEXT NOT NULL DEFAULT 'resource';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'nexus_course_topic_resources_section_check'
      AND conrelid = 'nexus_course_topic_resources'::regclass
  ) THEN
    ALTER TABLE nexus_course_topic_resources
      ADD CONSTRAINT nexus_course_topic_resources_section_check
      CHECK (section IN ('resource', 'drill'));
  END IF;
END $$;

-- 7. System folder that receives assignment/drill attachment uploads. Hidden
-- from the study-materials browse tree (is_system) but its files are served by
-- the existing view-only content route: empty target_exams/target_programs
-- means visible to every authenticated student, and allow_download=false keeps
-- it view-only.
ALTER TABLE nexus_study_folders ADD COLUMN IF NOT EXISTS is_system BOOLEAN NOT NULL DEFAULT false;

INSERT INTO nexus_study_folders (id, name, description, is_system, allow_download)
VALUES ('a0000000-0000-4000-8000-000000000001',
        'Assignment and curriculum attachments',
        'System folder for files attached to class assignments and topic drills. Managed automatically.',
        true, false)
ON CONFLICT (id) DO NOTHING;

-- 8. New notification event types (bell already renders this table).
ALTER TABLE nexus_timetable_notifications
  DROP CONSTRAINT IF EXISTS nexus_timetable_notifications_event_type_check;
ALTER TABLE nexus_timetable_notifications
  ADD CONSTRAINT nexus_timetable_notifications_event_type_check
  CHECK (event_type IN (
    'rsvp_attending',
    'rsvp_not_attending',
    'class_created',
    'class_cancelled',
    'class_rescheduled',
    'holiday_marked',
    'recording_available',
    'review_submitted',
    'assignment_published',
    'assignment_reviewed'
  ));

-- ============================================
-- AUTO-UPDATE TIMESTAMPS
-- ============================================

DROP TRIGGER IF EXISTS nexus_class_assignments_updated_at ON nexus_class_assignments;
CREATE TRIGGER nexus_class_assignments_updated_at
  BEFORE UPDATE ON nexus_class_assignments
  FOR EACH ROW EXECUTE FUNCTION update_nexus_updated_at();

DROP TRIGGER IF EXISTS nexus_assignment_submissions_updated_at ON nexus_assignment_submissions;
CREATE TRIGGER nexus_assignment_submissions_updated_at
  BEFORE UPDATE ON nexus_assignment_submissions
  FOR EACH ROW EXECUTE FUNCTION update_nexus_updated_at();

-- ============================================
-- ROW LEVEL SECURITY (service_role only; all access via server routes)
-- ============================================

ALTER TABLE nexus_class_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE nexus_assignment_attachments ENABLE ROW LEVEL SECURITY;
ALTER TABLE nexus_assignment_submissions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "service_role_full_access" ON nexus_class_assignments;
CREATE POLICY "service_role_full_access" ON nexus_class_assignments FOR ALL TO service_role USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "service_role_full_access" ON nexus_assignment_attachments;
CREATE POLICY "service_role_full_access" ON nexus_assignment_attachments FOR ALL TO service_role USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "service_role_full_access" ON nexus_assignment_submissions;
CREATE POLICY "service_role_full_access" ON nexus_assignment_submissions FOR ALL TO service_role USING (true) WITH CHECK (true);
