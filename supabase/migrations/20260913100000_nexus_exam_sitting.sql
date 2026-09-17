-- ============================================
-- EXAM RESULTS: TWO SITTINGS, RANKED SEPARATELY
--
-- A student who started the paper after the exam's shared window closed had
-- days or weeks longer to prepare than one who sat on the day. Ranking both in
-- one list lets the extra time buy a podium place.
--
-- The partition also replaces a workaround. The comment on `rank` said it was
-- frozen so a make-up could not renumber an announced podium, but
-- saveExamResults upserts every row, so republishing renumbered everyone. Once
-- the two sittings are separate sets a late paper cannot enter the main one, so
-- the main ranks are stable by construction and no freeze flag is needed.
--
-- Additive with a safe default, and there is nothing to backfill: no exam has
-- ever been published, so nexus_exam_results is empty.
-- ============================================

ALTER TABLE nexus_exam_results
  ADD COLUMN IF NOT EXISTS sitting TEXT NOT NULL DEFAULT 'main'
    CHECK (sitting IN ('main', 'second'));

COMMENT ON COLUMN nexus_exam_results.sitting IS
  'main: started the paper before the exam closed. second: started it after, through a make-up, a reopen or a catch-up unlock. Decided by started_at, never by which table opened the door.';

COMMENT ON COLUMN nexus_exam_results.rank IS
  '1-based and dense WITHIN this row''s sitting: ties share a rank and the next rank skips. A second sitting is ranked among itself, which is what stops a late paper renumbering a podium already named in a Teams post.';
