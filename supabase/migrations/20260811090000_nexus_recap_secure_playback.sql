-- ============================================
-- NEXUS RECAP: SECURE PLAYBACK + SAFE EDITING
--
-- Groundwork for serving a class recording through Nexus (proxied bytes, no
-- shareable Microsoft or YouTube URL) with teacher-authored, AI-generated
-- checkpoint quizzes that auto-publish after each class.
--
-- The urgent part of this migration is the SOFT DELETE pair at the bottom of
-- section 3. nexus_class_recap_attempts.section_id is ON DELETE CASCADE
-- (20260703130000, line 102) and replaceRecapSections blanket-deletes a recap's
-- sections before re-inserting them. So a teacher pressing Save on a published
-- recap silently destroys every student's passed checkpoints and re-locks them.
-- That is rare while publishing is manual. It becomes a daily data-loss event
-- the moment recaps auto-publish and teachers edit them live, which is the whole
-- direction of this work. archived_at and is_active let the query layer diff and
-- archive instead of tearing down.
-- ============================================

-- ── 1. RECAP: readiness, quality and the authoring knobs ──────────────────────
-- readiness is separate from status on purpose. status is the teacher-facing
-- lifecycle (draft/published/archived) and already gates what students can see.
-- readiness is why a recap is not servable yet, which the tutor queue reads and
-- the student never does: to a student, "held", "failed" and "not generated"
-- are all the same sentence, "your tutor is preparing this recording".
ALTER TABLE nexus_class_recaps
  ADD COLUMN IF NOT EXISTS readiness TEXT NOT NULL DEFAULT 'ready'
    CHECK (readiness IN ('pending', 'ready', 'held', 'failed')),
  -- Machine code: no_transcript | short_transcript | low_coverage |
  -- bad_boundaries | thin_questions | low_quality | generation_failed | manual
  ADD COLUMN IF NOT EXISTS hold_reason TEXT,
  ADD COLUMN IF NOT EXISTS hold_detail TEXT,
  ADD COLUMN IF NOT EXISTS quality_score NUMERIC(5, 2),
  -- Every check with the number it actually measured, so the tutor reads
  -- "coverage 0.62, needed 0.85" rather than "quality too low".
  ADD COLUMN IF NOT EXISTS quality_report JSONB,
  ADD COLUMN IF NOT EXISTS generation_attempts INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS auto_published_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS target_segment_seconds INTEGER NOT NULL DEFAULT 300,
  -- Generated vs served. A larger pool is what lets a retry draw different
  -- questions, so a failed attempt cannot be beaten by memorising positions.
  ADD COLUMN IF NOT EXISTS question_pool_per_segment INTEGER NOT NULL DEFAULT 15,
  ADD COLUMN IF NOT EXISTS questions_per_segment INTEGER NOT NULL DEFAULT 10,
  ADD COLUMN IF NOT EXISTS questions_to_pass INTEGER NOT NULL DEFAULT 8,
  -- 'proxied'  = bytes streamed through Nexus, no source URL in the browser.
  -- 'embedded' = YouTube fallback. YouTube bytes cannot be proxied, so the video
  --              id is in the DOM. A degraded fallback, not a security boundary,
  --              and the tutor queue says so in words.
  ADD COLUMN IF NOT EXISTS protection_level TEXT NOT NULL DEFAULT 'proxied'
    CHECK (protection_level IN ('proxied', 'embedded'));

-- Existing rows predate the concept. Anything already published was vetted by a
-- human, so it is ready; anything else has not been through the pipeline yet.
UPDATE nexus_class_recaps
SET readiness = CASE WHEN status = 'published' THEN 'ready' ELSE 'pending' END
WHERE readiness = 'ready' AND status <> 'published';

UPDATE nexus_class_recaps
SET protection_level = 'embedded'
WHERE video_source = 'youtube' AND protection_level = 'proxied';

-- The tutor review queue: everything not servable, newest first.
CREATE INDEX IF NOT EXISTS idx_class_recaps_needs_review
  ON nexus_class_recaps(classroom_id, updated_at DESC)
  WHERE readiness <> 'ready';

-- ── 2. SECTIONS: served count + soft delete ──────────────────────────────────
ALTER TABLE nexus_class_recap_sections
  -- NULL = serve every active question, which is today's behaviour.
  ADD COLUMN IF NOT EXISTS questions_to_serve INTEGER,
  -- Set instead of DELETE. See the header: deleting a section cascades away
  -- every student's attempt rows for it.
  ADD COLUMN IF NOT EXISTS archived_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_class_recap_sections_live
  ON nexus_class_recap_sections(recap_id, sort_order)
  WHERE archived_at IS NULL;

-- ── 3. QUESTIONS: soft delete ────────────────────────────────────────────────
-- Attempts reference section_id, never question ids, so question churn is safe
-- for student progress. Soft delete here is about keeping a deleted question's
-- text resolvable when reviewing an old attempt's stored answers.
ALTER TABLE nexus_class_recap_questions
  ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT true;

CREATE INDEX IF NOT EXISTS idx_class_recap_questions_active
  ON nexus_class_recap_questions(section_id, sort_order)
  WHERE is_active = true;

-- ── 4. PROGRESS: honest watch tracking ───────────────────────────────────────
-- last_video_position_seconds already exists and is deliberately NOT made
-- permanently monotonic: recordCatchupTestAttempt resets it to 0 to force a
-- rewatch after a failed class test, and rearmCatchupTest reads it against
-- 0.9 * duration. It is a high-water mark SINCE THE LAST RESET.
-- furthest_position_seconds is the never-reset one, used for anti-skip.
ALTER TABLE nexus_class_recap_progress
  ADD COLUMN IF NOT EXISTS furthest_position_seconds INTEGER NOT NULL DEFAULT 0,
  -- Accumulated real playback, not a position. A student who drags the scrubber
  -- to the end moves position and leaves this at zero, which is what any
  -- "did they actually watch it" gate has to read.
  ADD COLUMN IF NOT EXISTS watched_seconds INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_heartbeat_at TIMESTAMPTZ;

-- ── 5. QUESTION DRAWS ────────────────────────────────────────────────────────
-- Which questions a student was served for one attempt, decided server-side.
-- A table rather than columns on nexus_class_recap_attempts because the draw
-- exists when the quiz is opened (GET) while the attempt row is only written on
-- submit (POST). It also closes a live hole: the quiz endpoint currently returns
-- every question in sort_order, so one screenshot passes that checkpoint forever.
CREATE TABLE IF NOT EXISTS nexus_class_recap_draws (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  section_id UUID NOT NULL REFERENCES nexus_class_recap_sections(id) ON DELETE CASCADE,
  attempt_number INTEGER NOT NULL,
  -- Exactly the questions served, in the order served.
  question_ids UUID[] NOT NULL,
  -- Per-question option permutation, { questionId: ['c','a','d','b'] }, so the
  -- displayed letters differ between attempts.
  option_maps JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  consumed_at TIMESTAMPTZ,
  UNIQUE (student_id, section_id, attempt_number)
);

CREATE INDEX IF NOT EXISTS idx_class_recap_draws_open
  ON nexus_class_recap_draws(student_id, section_id, attempt_number DESC)
  WHERE consumed_at IS NULL;

-- ── 6. STREAM GRANTS ─────────────────────────────────────────────────────────
-- Audit of every short-lived video token minted, roughly one per 10 minutes of
-- watching. Deliberately NOT per byte-range request: a 90 minute recording is
-- hundreds of range requests and per-request accounting would be a write every
-- few megabytes for no investigative value.
CREATE TABLE IF NOT EXISTS nexus_class_recap_stream_grants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  recap_id UUID REFERENCES nexus_class_recaps(id) ON DELETE CASCADE,
  scheduled_class_id UUID REFERENCES nexus_scheduled_classes(id) ON DELETE CASCADE,
  session_id TEXT NOT NULL,
  issued_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ NOT NULL,
  ip TEXT,
  user_agent TEXT,
  revoked_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_recap_stream_grants_recap
  ON nexus_class_recap_stream_grants(recap_id, student_id, issued_at DESC);
CREATE INDEX IF NOT EXISTS idx_recap_stream_grants_session
  ON nexus_class_recap_stream_grants(session_id);

-- ── 7. RLS (service_role only; all access via server routes) ─────────────────
ALTER TABLE nexus_class_recap_draws ENABLE ROW LEVEL SECURITY;
ALTER TABLE nexus_class_recap_stream_grants ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "service_role_full_access" ON nexus_class_recap_draws;
DROP POLICY IF EXISTS "service_role_full_access" ON nexus_class_recap_stream_grants;

CREATE POLICY "service_role_full_access" ON nexus_class_recap_draws
  FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "service_role_full_access" ON nexus_class_recap_stream_grants
  FOR ALL TO service_role USING (true) WITH CHECK (true);

NOTIFY pgrst, 'reload schema';
