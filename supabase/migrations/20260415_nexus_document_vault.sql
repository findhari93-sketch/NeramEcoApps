-- ============================================
-- NEXUS DOCUMENT VAULT
-- Templates, exam plans, versioned documents, audit log
-- ============================================

-- ============================================
-- 1. ADD current_standard TO nexus_enrollments
-- ============================================

ALTER TABLE nexus_enrollments
  ADD COLUMN IF NOT EXISTS current_standard TEXT
  CHECK (current_standard IN ('10th', '11th', '12th', 'gap_year'));

-- ============================================
-- 2. DOCUMENT TEMPLATES
-- ============================================

CREATE TABLE IF NOT EXISTS nexus_document_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  description TEXT,
  category TEXT NOT NULL CHECK (category IN ('identity', 'academic', 'exam', 'photo', 'other')),
  applicable_standards TEXT[] NOT NULL DEFAULT '{}',
  is_required BOOLEAN DEFAULT false,
  unlock_date TIMESTAMPTZ,
  linked_exam TEXT CHECK (linked_exam IN ('nata', 'jee', 'both')),
  exam_state_threshold TEXT CHECK (exam_state_threshold IN ('still_thinking', 'planning_to_write', 'applied', 'completed')),
  max_file_size_mb INTEGER DEFAULT 10,
  allowed_file_types TEXT[] DEFAULT '{image/jpeg,image/png,application/pdf}',
  sort_order INTEGER DEFAULT 0,
  is_active BOOLEAN DEFAULT true,
  created_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- ============================================
-- 3. STUDENT EXAM PLANS
-- ============================================

CREATE TABLE IF NOT EXISTS nexus_student_exam_plans (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  classroom_id UUID NOT NULL REFERENCES nexus_classrooms(id) ON DELETE CASCADE,
  exam_type TEXT NOT NULL CHECK (exam_type IN ('nata', 'jee')),
  state TEXT NOT NULL DEFAULT 'still_thinking' CHECK (state IN ('still_thinking', 'planning_to_write', 'applied', 'completed')),
  application_number TEXT,
  notes TEXT,
  updated_at TIMESTAMPTZ DEFAULT now(),
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(student_id, classroom_id, exam_type)
);

-- ============================================
-- 4. EXTEND nexus_student_documents
-- ============================================

ALTER TABLE nexus_student_documents
  ADD COLUMN IF NOT EXISTS template_id UUID REFERENCES nexus_document_templates(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS sharepoint_item_id TEXT,
  ADD COLUMN IF NOT EXISTS sharepoint_web_url TEXT,
  ADD COLUMN IF NOT EXISTS file_size_bytes BIGINT,
  ADD COLUMN IF NOT EXISTS version INTEGER DEFAULT 1,
  ADD COLUMN IF NOT EXISTS is_current BOOLEAN DEFAULT true,
  ADD COLUMN IF NOT EXISTS previous_version_id UUID REFERENCES nexus_student_documents(id),
  ADD COLUMN IF NOT EXISTS is_deleted BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS deleted_by UUID REFERENCES users(id),
  ADD COLUMN IF NOT EXISTS rejection_reason TEXT,
  ADD COLUMN IF NOT EXISTS uploaded_by UUID REFERENCES users(id);

-- Widen category constraint to include new categories
ALTER TABLE nexus_student_documents DROP CONSTRAINT IF EXISTS nexus_student_documents_category_check;
ALTER TABLE nexus_student_documents ADD CONSTRAINT nexus_student_documents_category_check
  CHECK (category IN ('aadhaar', 'marksheet', 'hall_ticket', 'photo', 'other', 'identity', 'academic', 'exam'));

-- ============================================
-- 5. DOCUMENT AUDIT LOG
-- ============================================

CREATE TABLE IF NOT EXISTS nexus_document_audit_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id UUID REFERENCES nexus_student_documents(id) ON DELETE SET NULL,
  student_id UUID NOT NULL REFERENCES users(id),
  classroom_id UUID NOT NULL REFERENCES nexus_classrooms(id),
  action TEXT NOT NULL CHECK (action IN ('uploaded', 'verified', 'rejected', 're_uploaded', 'soft_deleted', 'hard_deleted', 'restored')),
  performed_by UUID NOT NULL REFERENCES users(id),
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT now()
);

-- ============================================
-- 6. INDEXES
-- ============================================

CREATE INDEX IF NOT EXISTS idx_nexus_doc_templates_standards ON nexus_document_templates USING GIN (applicable_standards);
CREATE INDEX IF NOT EXISTS idx_nexus_doc_templates_active ON nexus_document_templates(is_active);
CREATE INDEX IF NOT EXISTS idx_nexus_student_exam_plans_student ON nexus_student_exam_plans(student_id, classroom_id);
CREATE INDEX IF NOT EXISTS idx_nexus_doc_audit_document ON nexus_document_audit_log(document_id);
CREATE INDEX IF NOT EXISTS idx_nexus_doc_audit_student ON nexus_document_audit_log(student_id, classroom_id);
CREATE INDEX IF NOT EXISTS idx_nexus_student_documents_template ON nexus_student_documents(template_id);
CREATE INDEX IF NOT EXISTS idx_nexus_student_documents_current ON nexus_student_documents(student_id, classroom_id, is_current, is_deleted);

-- ============================================
-- 7. ROW LEVEL SECURITY
-- ============================================

ALTER TABLE nexus_document_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE nexus_student_exam_plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE nexus_document_audit_log ENABLE ROW LEVEL SECURITY;

-- Service role full access
CREATE POLICY "service_role_full_access" ON nexus_document_templates FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "service_role_full_access" ON nexus_student_exam_plans FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "service_role_full_access" ON nexus_document_audit_log FOR ALL TO service_role USING (true) WITH CHECK (true);

-- Templates: anyone authenticated can read active templates
CREATE POLICY "authenticated_read_active_templates" ON nexus_document_templates
  FOR SELECT TO authenticated
  USING (is_active = true);

-- Templates: teachers/admins can manage
CREATE POLICY "teachers_manage_templates" ON nexus_document_templates
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM nexus_enrollments
      WHERE nexus_enrollments.user_id = auth.uid()
      AND nexus_enrollments.role = 'teacher'
      AND nexus_enrollments.is_active = true
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM nexus_enrollments
      WHERE nexus_enrollments.user_id = auth.uid()
      AND nexus_enrollments.role = 'teacher'
      AND nexus_enrollments.is_active = true
    )
  );

-- Exam plans: students manage their own
CREATE POLICY "students_manage_own_exam_plans" ON nexus_student_exam_plans
  FOR ALL TO authenticated
  USING (student_id = auth.uid())
  WITH CHECK (student_id = auth.uid());

-- Exam plans: teachers can read in their classrooms
CREATE POLICY "teachers_read_exam_plans" ON nexus_student_exam_plans
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM nexus_enrollments
      WHERE nexus_enrollments.classroom_id = nexus_student_exam_plans.classroom_id
      AND nexus_enrollments.user_id = auth.uid()
      AND nexus_enrollments.role = 'teacher'
      AND nexus_enrollments.is_active = true
    )
  );

-- Audit log: teachers can read for their classrooms
CREATE POLICY "teachers_read_audit" ON nexus_document_audit_log
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM nexus_enrollments
      WHERE nexus_enrollments.classroom_id = nexus_document_audit_log.classroom_id
      AND nexus_enrollments.user_id = auth.uid()
      AND nexus_enrollments.role = 'teacher'
      AND nexus_enrollments.is_active = true
    )
  );

-- Audit log: students can read their own
CREATE POLICY "students_read_own_audit" ON nexus_document_audit_log
  FOR SELECT TO authenticated
  USING (student_id = auth.uid());
