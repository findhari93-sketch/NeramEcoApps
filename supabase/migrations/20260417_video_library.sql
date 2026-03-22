-- ============================================================
-- VIDEO LIBRARY - Core Tables
-- Module: Video Library (Class Archive) for Nexus
-- ============================================================

-- Main video table
CREATE TABLE library_videos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- YouTube metadata (from API sync)
  youtube_video_id TEXT NOT NULL UNIQUE,
  youtube_channel_id TEXT,
  original_title TEXT,
  original_description TEXT,
  youtube_thumbnail_url TEXT,
  youtube_thumbnail_hq_url TEXT,
  duration_seconds INTEGER,
  published_at TIMESTAMPTZ,
  privacy_status TEXT DEFAULT 'unlisted',

  -- Transcript data
  transcript_text TEXT,
  transcript_language TEXT,
  transcript_is_generated BOOLEAN DEFAULT true,
  transcript_segments JSONB,
  transcript_status TEXT DEFAULT 'pending'
    CHECK (transcript_status IN ('pending', 'fetched', 'unavailable', 'error')),

  -- AI Classification (auto-generated, reviewed by admin)
  suggested_title TEXT,
  suggested_description TEXT,
  language TEXT CHECK (language IN ('ta', 'en', 'ta_en')),
  exam TEXT CHECK (exam IN ('nata', 'jee_barch', 'both', 'general')),
  category TEXT,
  subcategories TEXT[] DEFAULT '{}',
  topics TEXT[] DEFAULT '{}',
  difficulty TEXT CHECK (difficulty IN ('beginner', 'intermediate', 'advanced', 'mixed')),
  key_concepts TEXT[] DEFAULT '{}',
  is_practical_demo BOOLEAN DEFAULT false,
  ai_confidence NUMERIC(3,2),
  classification_status TEXT DEFAULT 'pending'
    CHECK (classification_status IN ('pending', 'classified', 'error', 'skipped')),
  classification_error TEXT,

  -- Admin review (human verification of AI tags)
  approved_title TEXT,
  approved_description TEXT,
  review_status TEXT DEFAULT 'pending'
    CHECK (review_status IN ('pending', 'approved', 'rejected', 'needs_reclass')),
  reviewed_by UUID REFERENCES users(id),
  reviewed_at TIMESTAMPTZ,
  admin_notes TEXT,
  is_published BOOLEAN DEFAULT false,

  -- Engagement counters (denormalized for performance)
  view_count INTEGER DEFAULT 0,
  total_watch_seconds BIGINT DEFAULT 0,
  bookmark_count INTEGER DEFAULT 0,

  -- Full-text search (maintained by trigger)
  search_vector tsvector,

  -- Timestamps
  synced_at TIMESTAMPTZ DEFAULT now(),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Indexes for common queries
CREATE INDEX idx_library_videos_category ON library_videos(category);
CREATE INDEX idx_library_videos_exam ON library_videos(exam);
CREATE INDEX idx_library_videos_language ON library_videos(language);
CREATE INDEX idx_library_videos_difficulty ON library_videos(difficulty);
CREATE INDEX idx_library_videos_review_status ON library_videos(review_status);
CREATE INDEX idx_library_videos_is_published ON library_videos(is_published);
CREATE INDEX idx_library_videos_published_at ON library_videos(published_at);
CREATE INDEX idx_library_videos_classification ON library_videos(classification_status);
CREATE INDEX idx_library_videos_subcategories ON library_videos USING GIN(subcategories);
CREATE INDEX idx_library_videos_topics ON library_videos USING GIN(topics);
CREATE INDEX idx_library_videos_youtube_id ON library_videos(youtube_video_id);

-- Full-text search index on the generated column
CREATE INDEX idx_library_videos_search ON library_videos USING GIN(search_vector);


-- Collections (curated playlists by teachers)
CREATE TABLE library_collections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  description TEXT,
  cover_image_url TEXT,
  created_by UUID REFERENCES users(id),
  classroom_id UUID REFERENCES nexus_classrooms(id),
  exam TEXT CHECK (exam IN ('nata', 'jee_barch', 'both', 'general')),
  is_published BOOLEAN DEFAULT false,
  sort_order INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_library_collections_classroom ON library_collections(classroom_id);
CREATE INDEX idx_library_collections_published ON library_collections(is_published);


-- Collection items (videos in a collection)
CREATE TABLE library_collection_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  collection_id UUID REFERENCES library_collections(id) ON DELETE CASCADE,
  video_id UUID REFERENCES library_videos(id) ON DELETE CASCADE,
  sort_order INTEGER NOT NULL,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(collection_id, video_id)
);

CREATE INDEX idx_library_collection_items_collection ON library_collection_items(collection_id);


-- Student bookmarks
CREATE TABLE library_bookmarks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id UUID REFERENCES users(id) ON DELETE CASCADE,
  video_id UUID REFERENCES library_videos(id) ON DELETE CASCADE,
  timestamp_seconds INTEGER,
  note TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(student_id, video_id, timestamp_seconds)
);

CREATE INDEX idx_library_bookmarks_student ON library_bookmarks(student_id);
CREATE INDEX idx_library_bookmarks_video ON library_bookmarks(video_id);


-- Watch history (for "continue watching" and recommendations)
CREATE TABLE library_watch_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id UUID REFERENCES users(id) ON DELETE CASCADE,
  video_id UUID REFERENCES library_videos(id) ON DELETE CASCADE,
  last_position_seconds INTEGER DEFAULT 0,
  total_watched_seconds INTEGER DEFAULT 0,
  completed BOOLEAN DEFAULT false,
  watch_count INTEGER DEFAULT 1,
  first_watched_at TIMESTAMPTZ DEFAULT now(),
  last_watched_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(student_id, video_id)
);

CREATE INDEX idx_library_watch_history_student ON library_watch_history(student_id);
CREATE INDEX idx_library_watch_history_last_watched ON library_watch_history(last_watched_at);


-- Sync log (track YouTube sync runs)
CREATE TABLE library_sync_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  started_at TIMESTAMPTZ DEFAULT now(),
  completed_at TIMESTAMPTZ,
  total_videos_found INTEGER,
  new_videos_added INTEGER,
  transcripts_fetched INTEGER,
  transcripts_failed INTEGER,
  classifications_run INTEGER,
  classifications_failed INTEGER,
  status TEXT DEFAULT 'running'
    CHECK (status IN ('running', 'completed', 'failed')),
  error_log JSONB DEFAULT '[]',
  run_by UUID REFERENCES users(id)
);


-- ============================================================
-- ROW LEVEL SECURITY
-- ============================================================

-- library_videos: students see published, teachers/admins see all
ALTER TABLE library_videos ENABLE ROW LEVEL SECURITY;

CREATE POLICY "service_role_full_access_library_videos"
  ON library_videos FOR ALL TO service_role
  USING (true) WITH CHECK (true);

CREATE POLICY "authenticated_read_published_videos"
  ON library_videos FOR SELECT TO authenticated
  USING (
    is_published = true
    OR EXISTS (
      SELECT 1 FROM nexus_enrollments
      WHERE nexus_enrollments.user_id = auth.uid()
      AND nexus_enrollments.role IN ('teacher')
      AND nexus_enrollments.is_active = true
    )
  );

CREATE POLICY "teachers_update_videos"
  ON library_videos FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM nexus_enrollments
      WHERE nexus_enrollments.user_id = auth.uid()
      AND nexus_enrollments.role = 'teacher'
      AND nexus_enrollments.is_active = true
    )
  );

-- library_collections: published visible to all, draft to teachers
ALTER TABLE library_collections ENABLE ROW LEVEL SECURITY;

CREATE POLICY "service_role_full_access_library_collections"
  ON library_collections FOR ALL TO service_role
  USING (true) WITH CHECK (true);

CREATE POLICY "authenticated_read_published_collections"
  ON library_collections FOR SELECT TO authenticated
  USING (
    is_published = true
    OR EXISTS (
      SELECT 1 FROM nexus_enrollments
      WHERE nexus_enrollments.user_id = auth.uid()
      AND nexus_enrollments.role = 'teacher'
      AND nexus_enrollments.is_active = true
    )
  );

CREATE POLICY "teachers_manage_collections"
  ON library_collections FOR ALL TO authenticated
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

-- library_collection_items: same as collections
ALTER TABLE library_collection_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "service_role_full_access_library_collection_items"
  ON library_collection_items FOR ALL TO service_role
  USING (true) WITH CHECK (true);

CREATE POLICY "authenticated_read_collection_items"
  ON library_collection_items FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "teachers_manage_collection_items"
  ON library_collection_items FOR ALL TO authenticated
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

-- library_bookmarks: students own their bookmarks
ALTER TABLE library_bookmarks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "service_role_full_access_library_bookmarks"
  ON library_bookmarks FOR ALL TO service_role
  USING (true) WITH CHECK (true);

CREATE POLICY "students_own_bookmarks"
  ON library_bookmarks FOR ALL TO authenticated
  USING (student_id = auth.uid())
  WITH CHECK (student_id = auth.uid());

CREATE POLICY "teachers_read_bookmarks"
  ON library_bookmarks FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM nexus_enrollments
      WHERE nexus_enrollments.user_id = auth.uid()
      AND nexus_enrollments.role = 'teacher'
      AND nexus_enrollments.is_active = true
    )
  );

-- library_watch_history: students own their history
ALTER TABLE library_watch_history ENABLE ROW LEVEL SECURITY;

CREATE POLICY "service_role_full_access_library_watch_history"
  ON library_watch_history FOR ALL TO service_role
  USING (true) WITH CHECK (true);

CREATE POLICY "students_own_watch_history"
  ON library_watch_history FOR ALL TO authenticated
  USING (student_id = auth.uid())
  WITH CHECK (student_id = auth.uid());

CREATE POLICY "teachers_read_watch_history"
  ON library_watch_history FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM nexus_enrollments
      WHERE nexus_enrollments.user_id = auth.uid()
      AND nexus_enrollments.role = 'teacher'
      AND nexus_enrollments.is_active = true
    )
  );

-- library_sync_log: teachers only
ALTER TABLE library_sync_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "service_role_full_access_library_sync_log"
  ON library_sync_log FOR ALL TO service_role
  USING (true) WITH CHECK (true);

CREATE POLICY "teachers_read_sync_log"
  ON library_sync_log FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM nexus_enrollments
      WHERE nexus_enrollments.user_id = auth.uid()
      AND nexus_enrollments.role = 'teacher'
      AND nexus_enrollments.is_active = true
    )
  );


-- ============================================================
-- UPDATED_AT TRIGGER
-- ============================================================

CREATE OR REPLACE FUNCTION update_library_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER library_videos_updated_at
  BEFORE UPDATE ON library_videos
  FOR EACH ROW EXECUTE FUNCTION update_library_updated_at();

CREATE TRIGGER library_collections_updated_at
  BEFORE UPDATE ON library_collections
  FOR EACH ROW EXECUTE FUNCTION update_library_updated_at();


-- ============================================================
-- FULL-TEXT SEARCH TRIGGER
-- ============================================================

CREATE OR REPLACE FUNCTION update_library_search_vector()
RETURNS TRIGGER AS $$
BEGIN
  NEW.search_vector := to_tsvector('english',
    COALESCE(NEW.approved_title, NEW.suggested_title, '') || ' ' ||
    COALESCE(NEW.approved_description, NEW.suggested_description, '') || ' ' ||
    array_to_string(COALESCE(NEW.topics, '{}'), ' ')
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER library_videos_search_vector
  BEFORE INSERT OR UPDATE ON library_videos
  FOR EACH ROW EXECUTE FUNCTION update_library_search_vector();
