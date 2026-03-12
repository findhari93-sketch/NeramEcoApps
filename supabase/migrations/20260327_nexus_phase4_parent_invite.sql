-- ============================================
-- NEXUS PHASE 4: Parent Invite Codes
-- ============================================
-- Tables: nexus_parent_invite_codes

-- ============================================
-- 1. PARENT INVITE CODES (short codes for parent onboarding)
-- ============================================

CREATE TABLE IF NOT EXISTS nexus_parent_invite_codes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  classroom_id UUID NOT NULL REFERENCES nexus_classrooms(id) ON DELETE CASCADE,
  student_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  invite_code TEXT NOT NULL UNIQUE,
  created_by UUID REFERENCES users(id),
  expires_at TIMESTAMPTZ NOT NULL,
  used_at TIMESTAMPTZ,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- ============================================
-- INDEXES
-- ============================================

CREATE INDEX IF NOT EXISTS idx_nexus_parent_invite_codes_invite_code ON nexus_parent_invite_codes(invite_code);
CREATE INDEX IF NOT EXISTS idx_nexus_parent_invite_codes_student ON nexus_parent_invite_codes(student_id);
CREATE INDEX IF NOT EXISTS idx_nexus_parent_invite_codes_classroom ON nexus_parent_invite_codes(classroom_id);

-- ============================================
-- ROW LEVEL SECURITY
-- ============================================

ALTER TABLE nexus_parent_invite_codes ENABLE ROW LEVEL SECURITY;

-- Service role full access
CREATE POLICY "service_role_full_access" ON nexus_parent_invite_codes FOR ALL TO service_role USING (true) WITH CHECK (true);

-- Teachers can read invite codes for their classroom
CREATE POLICY "teachers_read_invite_codes" ON nexus_parent_invite_codes
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM nexus_enrollments
      WHERE nexus_enrollments.classroom_id = nexus_parent_invite_codes.classroom_id
      AND nexus_enrollments.user_id = auth.uid()
      AND nexus_enrollments.role = 'teacher'
      AND nexus_enrollments.is_active = true
    )
  );

-- Teachers can create invite codes for their classroom
CREATE POLICY "teachers_create_invite_codes" ON nexus_parent_invite_codes
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM nexus_enrollments
      WHERE nexus_enrollments.classroom_id = nexus_parent_invite_codes.classroom_id
      AND nexus_enrollments.user_id = auth.uid()
      AND nexus_enrollments.role = 'teacher'
      AND nexus_enrollments.is_active = true
    )
  );

-- Authenticated users can read invite codes by code (for redemption lookup)
CREATE POLICY "authenticated_read_by_code" ON nexus_parent_invite_codes
  FOR SELECT TO authenticated
  USING (
    is_active = true
    AND expires_at > now()
    AND used_at IS NULL
  );
