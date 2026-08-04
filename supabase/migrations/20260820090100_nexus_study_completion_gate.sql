-- ============================================================
-- STUDY FILE COMPLETION: two halves, not one
-- ------------------------------------------------------------
-- A Foundation chapter is complete when the student has (a) finished a gated
-- video track in EITHER language and (b) passed the chapter test. An ordinary
-- study file has no track and must keep completing on the test alone.
--
-- The rule lives in the RPC rather than in dispatchPlacementSideEffect. Both
-- halves can land in either order, from two different code paths, and a rule
-- split across two callers is a rule that will eventually disagree with itself.
-- In the function, every writer inherits it and none can forget it.
--
-- SAFETY: on the day this runs, no study file has a track, so v_requires_video
-- is false for every file and behaviour is byte-identical to today.
-- ============================================================

ALTER TABLE nexus_study_file_reads
  -- The durable "half one is done" fact. completed_at cannot carry it any more,
  -- because completed_at now means BOTH halves.
  ADD COLUMN IF NOT EXISTS test_passed_at          TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS video_completed_at      TIMESTAMPTZ,
  -- Which track satisfied it. Answers "how many students chose Tamil", which is
  -- what decides whether both languages are worth recording again next year.
  ADD COLUMN IF NOT EXISTS video_language          TEXT,
  -- Revision, kept strictly apart from the official record below.
  ADD COLUMN IF NOT EXISTS revision_best_score_pct NUMERIC(5,2),
  ADD COLUMN IF NOT EXISTS revision_attempts       INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_revision_at        TIMESTAMPTZ;

COMMENT ON COLUMN nexus_study_file_reads.best_score_pct IS
  'The OFFICIAL best score: the highest mode=official attempt. Revision never touches it.';
COMMENT ON COLUMN nexus_study_file_reads.completed_at IS
  'Both halves done: the chapter test passed AND, where the chapter has a servable video track, one track finished. Never cleared once set.';

-- Backfill test_passed_at from completed_at. Sound because before this migration
-- the ONLY writer of completed_at was nexus_study_mark_completed, and it only
-- ever fired from the study_file branch of dispatchPlacementSideEffect on a
-- PASSED attempt. So on every existing row, completed_at IS the moment the test
-- was passed.
UPDATE nexus_study_file_reads
SET test_passed_at = completed_at
WHERE completed_at IS NOT NULL
  AND test_passed_at IS NULL;

-- ── Half one: the test ───────────────────────────────────────────────────────
-- Same signature, so no caller changes. LANGUAGE moves sql -> plpgsql, which
-- CREATE OR REPLACE permits: only the name and argument types are the identity.
CREATE OR REPLACE FUNCTION nexus_study_mark_completed(
  p_user uuid, p_file uuid, p_score numeric, p_attempt uuid
) RETURNS void
LANGUAGE plpgsql
AS $$
DECLARE
  v_requires_video BOOLEAN;
  v_video_lang     TEXT;
  v_video_at       TIMESTAMPTZ;
  v_video_done     BOOLEAN := false;
BEGIN
  -- A file with no SERVABLE track is an ordinary study file and completes on the
  -- test alone, exactly as before. readiness is checked as well as status: a held
  -- track is invisible to the student, so gating on it would trap them behind a
  -- video they are not allowed to open.
  SELECT EXISTS (
    SELECT 1 FROM nexus_class_recaps r
    WHERE r.study_file_id = p_file
      AND r.status = 'published'
      AND COALESCE(r.readiness, 'ready') = 'ready'
  ) INTO v_requires_video;

  IF v_requires_video THEN
    -- EITHER language. Whichever track was finished first wins.
    SELECT r.language, pr.completed_at
      INTO v_video_lang, v_video_at
    FROM nexus_class_recap_progress pr
    JOIN nexus_class_recaps r ON r.id = pr.recap_id
    WHERE pr.student_id = p_user
      AND r.study_file_id = p_file
      AND pr.status = 'completed'
    ORDER BY pr.completed_at NULLS LAST
    LIMIT 1;
    v_video_done := v_video_lang IS NOT NULL;
  END IF;

  INSERT INTO nexus_study_file_reads (
    user_id, file_id, opened_at, completed_at, test_passed_at,
    video_completed_at, video_language,
    best_score_pct, best_attempt_id, last_activity_at
  )
  VALUES (
    p_user, p_file, NOW(),
    CASE WHEN (NOT v_requires_video) OR v_video_done THEN NOW() END,
    NOW(),
    CASE WHEN v_video_done THEN COALESCE(v_video_at, NOW()) END,
    v_video_lang,
    p_score, p_attempt, NOW()
  )
  ON CONFLICT (user_id, file_id) DO UPDATE SET
    -- Never blanks an existing completion. A chapter completed before its tracks
    -- were added stays completed: attaching a video months later must not
    -- retroactively take a finished chapter away from a student. Re-gating a
    -- cohort is a deliberate admin action, not a side effect of authoring.
    completed_at = CASE
      WHEN nexus_study_file_reads.completed_at IS NOT NULL
        THEN nexus_study_file_reads.completed_at
      WHEN (NOT v_requires_video) OR v_video_done THEN NOW()
      ELSE NULL
    END,
    test_passed_at     = COALESCE(nexus_study_file_reads.test_passed_at, NOW()),
    video_completed_at = COALESCE(nexus_study_file_reads.video_completed_at,
                                  EXCLUDED.video_completed_at),
    video_language     = COALESCE(nexus_study_file_reads.video_language,
                                  EXCLUDED.video_language),
    -- GREATEST ignores NULLs in Postgres, so an ungraded attempt cannot wipe a
    -- stored best score.
    best_score_pct     = GREATEST(COALESCE(nexus_study_file_reads.best_score_pct, 0),
                                  EXCLUDED.best_score_pct),
    best_attempt_id    = CASE
                           WHEN EXCLUDED.best_score_pct
                                >= COALESCE(nexus_study_file_reads.best_score_pct, 0)
                           THEN EXCLUDED.best_attempt_id
                           ELSE nexus_study_file_reads.best_attempt_id
                         END,
    last_activity_at   = NOW();
END $$;

-- ── Half two: the video ──────────────────────────────────────────────────────
-- Called when a track's LAST checkpoint passes. Returns whether that completed
-- the chapter, so the quiz route can tell the student what just happened.
CREATE OR REPLACE FUNCTION nexus_study_mark_video_completed(
  p_user uuid, p_file uuid, p_language text
) RETURNS boolean
LANGUAGE plpgsql
AS $$
DECLARE v_test_passed BOOLEAN;
BEGIN
  INSERT INTO nexus_study_file_reads (
    user_id, file_id, opened_at, video_completed_at, video_language, last_activity_at
  )
  VALUES (p_user, p_file, NOW(), NOW(), p_language, NOW())
  ON CONFLICT (user_id, file_id) DO UPDATE SET
    -- COALESCE, so finishing the SECOND language does not overwrite which track
    -- actually satisfied the requirement.
    video_completed_at = COALESCE(nexus_study_file_reads.video_completed_at, NOW()),
    video_language     = COALESCE(nexus_study_file_reads.video_language, p_language),
    last_activity_at   = NOW();

  SELECT (test_passed_at IS NOT NULL) INTO v_test_passed
  FROM nexus_study_file_reads
  WHERE user_id = p_user AND file_id = p_file;

  IF COALESCE(v_test_passed, false) THEN
    UPDATE nexus_study_file_reads
    SET completed_at = COALESCE(completed_at, NOW())
    WHERE user_id = p_user AND file_id = p_file;
  END IF;

  RETURN COALESCE(v_test_passed, false);
END $$;

-- ── Revision, which never touches the official record ────────────────────────
-- UPDATE, not upsert. A revision attempt can only exist on a chapter the student
-- has already completed, so a missing row means the mode flag was set wrongly
-- upstream. Creating one here would hide that bug behind a plausible row;
-- touching nothing surfaces it.
CREATE OR REPLACE FUNCTION nexus_study_record_revision(
  p_user uuid, p_file uuid, p_score numeric, p_attempt uuid
) RETURNS void
LANGUAGE sql
AS $$
  UPDATE nexus_study_file_reads SET
    revision_best_score_pct = GREATEST(COALESCE(revision_best_score_pct, 0),
                                       COALESCE(p_score, 0)),
    revision_attempts       = revision_attempts + 1,
    last_revision_at        = NOW(),
    last_activity_at        = NOW()
  WHERE user_id = p_user AND file_id = p_file;
$$;

GRANT EXECUTE ON FUNCTION nexus_study_mark_completed(uuid, uuid, numeric, uuid)  TO service_role;
GRANT EXECUTE ON FUNCTION nexus_study_mark_video_completed(uuid, uuid, text)     TO service_role;
GRANT EXECUTE ON FUNCTION nexus_study_record_revision(uuid, uuid, numeric, uuid) TO service_role;

-- ── Official vs revision on the attempt itself ───────────────────────────────
-- A column, not a derived rule. "Any attempt after completed_at is revision"
-- breaks in the exact case this feature creates: a student who passes the test
-- BEFORE finishing the video sat an official attempt that predates completion,
-- and one who finishes the video first has completed_at set by the video. The
-- mode is decided when the attempt STARTS and is never re-derived.
ALTER TABLE nexus_test_attempts
  ADD COLUMN IF NOT EXISTS mode TEXT NOT NULL DEFAULT 'official';

ALTER TABLE nexus_test_attempts DROP CONSTRAINT IF EXISTS nexus_test_attempts_mode_check;
ALTER TABLE nexus_test_attempts ADD CONSTRAINT nexus_test_attempts_mode_check
  CHECK (mode IN ('official', 'revision'));

COMMENT ON COLUMN nexus_test_attempts.mode IS
  'official = counts towards the record. revision = practice after completion, excluded from every cohort aggregate and from best_score_pct.';

-- Every aggregate that means "how did this cohort do" must read this predicate,
-- not the whole table. A parent seeing a practice score reported as their
-- child's test result is the most likely regression this feature can cause.
CREATE INDEX IF NOT EXISTS idx_test_attempts_official
  ON nexus_test_attempts(test_id, student_id, attempt_number DESC)
  WHERE mode = 'official';

-- DELIBERATELY NOT TOUCHED: uq_test_attempt_one_in_progress is
-- (test_id, student_id) WHERE status='in_progress'. Adding mode to it would
-- permit two open attempts on one test, which is the exact two-tab race that
-- index exists to stop. startOrResumeAttempt is made mode-aware instead: an open
-- attempt whose mode differs from the one requested is abandoned, not resumed.

NOTIFY pgrst, 'reload schema';
