-- ============================================
-- NEXUS FOUNDATION FEEDBACK & ISSUE REPORTING
-- Like/dislike reactions + issue reports per chapter
-- ============================================

-- 1. CHAPTER REACTIONS (like/dislike per student per chapter)
CREATE TABLE IF NOT EXISTS nexus_foundation_reactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  chapter_id UUID NOT NULL REFERENCES nexus_foundation_chapters(id) ON DELETE CASCADE,
  reaction TEXT NOT NULL CHECK (reaction IN ('like', 'dislike')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(student_id, chapter_id)
);

CREATE INDEX idx_foundation_reactions_chapter ON nexus_foundation_reactions(chapter_id);

-- 2. ISSUE REPORTS (students report problems with chapters/sections)
CREATE TABLE IF NOT EXISTS nexus_foundation_issues (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  chapter_id UUID NOT NULL REFERENCES nexus_foundation_chapters(id) ON DELETE CASCADE,
  section_id UUID REFERENCES nexus_foundation_sections(id) ON DELETE SET NULL,
  title TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'in_progress', 'resolved')),
  resolved_by UUID REFERENCES users(id),
  resolved_at TIMESTAMPTZ,
  resolution_note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_foundation_issues_student ON nexus_foundation_issues(student_id);
CREATE INDEX idx_foundation_issues_chapter ON nexus_foundation_issues(chapter_id);
CREATE INDEX idx_foundation_issues_status ON nexus_foundation_issues(status);

-- 3. RLS POLICIES
ALTER TABLE nexus_foundation_reactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE nexus_foundation_issues ENABLE ROW LEVEL SECURITY;

CREATE POLICY "service_role_foundation_reactions" ON nexus_foundation_reactions FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "service_role_foundation_issues" ON nexus_foundation_issues FOR ALL TO service_role USING (true) WITH CHECK (true);

-- 4. Add new notification event type for issue resolution
ALTER TYPE notification_event_type ADD VALUE IF NOT EXISTS 'foundation_issue_resolved';
