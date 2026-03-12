-- ============================================
-- NEXUS PHASE 3: Resources & Student Documents
-- ============================================
-- Tables: nexus_resources, nexus_student_documents

-- ============================================
-- 1. NEXUS RESOURCES (YouTube, PDF, OneNote links)
-- ============================================

CREATE TABLE IF NOT EXISTS nexus_resources (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  classroom_id UUID NOT NULL REFERENCES nexus_classrooms(id) ON DELETE CASCADE,
  topic_id UUID REFERENCES nexus_topics(id) ON DELETE SET NULL,
  title TEXT NOT NULL,
  description TEXT,
  resource_type TEXT NOT NULL CHECK (resource_type IN ('youtube', 'pdf', 'onenote', 'image', 'link')),
  url TEXT NOT NULL,
  thumbnail_url TEXT,
  sort_order INTEGER DEFAULT 0,
  is_active BOOLEAN DEFAULT true,
  created_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ DEFAULT now()
);

-- ============================================
-- 2. NEXUS STUDENT DOCUMENTS (Aadhaar, marksheets, etc.)
-- ============================================

CREATE TABLE IF NOT EXISTS nexus_student_documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  classroom_id UUID NOT NULL REFERENCES nexus_classrooms(id) ON DELETE CASCADE,
  category TEXT NOT NULL CHECK (category IN ('aadhaar', 'marksheet', 'hall_ticket', 'photo', 'other')),
  title TEXT NOT NULL,
  file_url TEXT NOT NULL,
  file_type TEXT,
  uploaded_at TIMESTAMPTZ DEFAULT now(),
  verified_by UUID REFERENCES users(id),
  verified_at TIMESTAMPTZ,
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'verified', 'rejected')),
  notes TEXT
);

-- ============================================
-- INDEXES
-- ============================================

CREATE INDEX IF NOT EXISTS idx_nexus_resources_classroom ON nexus_resources(classroom_id);
CREATE INDEX IF NOT EXISTS idx_nexus_resources_topic ON nexus_resources(topic_id);
CREATE INDEX IF NOT EXISTS idx_nexus_student_documents_student ON nexus_student_documents(student_id);
CREATE INDEX IF NOT EXISTS idx_nexus_student_documents_classroom ON nexus_student_documents(classroom_id);
CREATE INDEX IF NOT EXISTS idx_nexus_student_documents_category ON nexus_student_documents(category);
CREATE INDEX IF NOT EXISTS idx_nexus_student_documents_status ON nexus_student_documents(status);

-- ============================================
-- ROW LEVEL SECURITY
-- ============================================

ALTER TABLE nexus_resources ENABLE ROW LEVEL SECURITY;
ALTER TABLE nexus_student_documents ENABLE ROW LEVEL SECURITY;

-- Service role full access
CREATE POLICY "service_role_full_access" ON nexus_resources FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "service_role_full_access" ON nexus_student_documents FOR ALL TO service_role USING (true) WITH CHECK (true);

-- Resources: enrolled users can read
CREATE POLICY "enrolled_read_resources" ON nexus_resources
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM nexus_enrollments
      WHERE nexus_enrollments.classroom_id = nexus_resources.classroom_id
      AND nexus_enrollments.user_id = auth.uid()
      AND nexus_enrollments.is_active = true
    )
  );

-- Resources: teachers can manage (INSERT, UPDATE, DELETE)
CREATE POLICY "teachers_manage_resources" ON nexus_resources
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM nexus_enrollments
      WHERE nexus_enrollments.classroom_id = nexus_resources.classroom_id
      AND nexus_enrollments.user_id = auth.uid()
      AND nexus_enrollments.role = 'teacher'
      AND nexus_enrollments.is_active = true
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM nexus_enrollments
      WHERE nexus_enrollments.classroom_id = nexus_resources.classroom_id
      AND nexus_enrollments.user_id = auth.uid()
      AND nexus_enrollments.role = 'teacher'
      AND nexus_enrollments.is_active = true
    )
  );

-- Student documents: students can read their own documents
CREATE POLICY "students_read_own_documents" ON nexus_student_documents
  FOR SELECT TO authenticated
  USING (student_id = auth.uid());

-- Student documents: students can create their own documents
CREATE POLICY "students_create_own_documents" ON nexus_student_documents
  FOR INSERT TO authenticated
  WITH CHECK (student_id = auth.uid());

-- Student documents: teachers can read all documents in their classroom
CREATE POLICY "teachers_read_classroom_documents" ON nexus_student_documents
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM nexus_enrollments
      WHERE nexus_enrollments.classroom_id = nexus_student_documents.classroom_id
      AND nexus_enrollments.user_id = auth.uid()
      AND nexus_enrollments.role = 'teacher'
      AND nexus_enrollments.is_active = true
    )
  );

-- Student documents: teachers can update documents in their classroom (verify/reject)
CREATE POLICY "teachers_update_classroom_documents" ON nexus_student_documents
  FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM nexus_enrollments
      WHERE nexus_enrollments.classroom_id = nexus_student_documents.classroom_id
      AND nexus_enrollments.user_id = auth.uid()
      AND nexus_enrollments.role = 'teacher'
      AND nexus_enrollments.is_active = true
    )
  );
