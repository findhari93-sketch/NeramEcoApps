-- ============================================================
-- Nexus test attempts: many attempts per student, one engine
-- ------------------------------------------------------------
-- Three things, all additive:
--
-- 1. attempt_number. A student may sit a test as often as they like, and
--    both they and the teacher need to see which go this was. Backfilled by
--    ordering the rows that already exist.
--
-- 2. placement_id. An attempt is taken THROUGH a placement (this chapter,
--    this class), and the pass bar lives on the placement. Without it, a
--    historical attempt cannot be re-scored against the bar it was actually
--    sat under, and per-placement analytics have to guess.
--
-- 3. The status CHECK gains 'abandoned'. Two routes already write it (the
--    stale-attempt sweep and the sendBeacon abandon), so today those writes
--    hit a constraint violation and the row silently stays 'in_progress',
--    which is what makes a timed-out attempt block the next one.
-- ============================================================

ALTER TABLE nexus_test_attempts
  ADD COLUMN IF NOT EXISTS attempt_number INTEGER NOT NULL DEFAULT 1;

ALTER TABLE nexus_test_attempts
  ADD COLUMN IF NOT EXISTS placement_id UUID REFERENCES nexus_test_placements(id) ON DELETE SET NULL;

-- Widen status. Drop first: a CHECK cannot be altered in place.
ALTER TABLE nexus_test_attempts DROP CONSTRAINT IF EXISTS nexus_test_attempts_status_check;
ALTER TABLE nexus_test_attempts ADD CONSTRAINT nexus_test_attempts_status_check
  CHECK (status IN ('in_progress', 'submitted', 'graded', 'expired', 'abandoned'));

-- Backfill attempt_number over the rows already there, oldest first per
-- (test, student). started_at can be null on very old rows, so created_at is
-- the tiebreak and id is the final one, keeping the order total and stable.
WITH ordered AS (
  SELECT id,
         ROW_NUMBER() OVER (
           PARTITION BY test_id, student_id
           ORDER BY COALESCE(started_at, created_at), created_at, id
         ) AS n
  FROM nexus_test_attempts
)
UPDATE nexus_test_attempts a
SET attempt_number = ordered.n
FROM ordered
WHERE a.id = ordered.id AND a.attempt_number IS DISTINCT FROM ordered.n;

-- Reads this feature actually performs: "this student's go at this test"
-- (resume, attempt count) and "everything this student has sat" (history).
CREATE INDEX IF NOT EXISTS idx_test_attempts_student_test
  ON nexus_test_attempts(test_id, student_id, attempt_number DESC);
CREATE INDEX IF NOT EXISTS idx_test_attempts_student_recent
  ON nexus_test_attempts(student_id, submitted_at DESC);
CREATE INDEX IF NOT EXISTS idx_test_attempts_placement
  ON nexus_test_attempts(placement_id) WHERE placement_id IS NOT NULL;

-- Collapse any duplicate open attempts BEFORE the unique index below tries to
-- build, otherwise this migration fails on whichever environment happens to
-- carry one. The newest survives (it holds the most recent answers); the rest
-- become 'abandoned', which the widened CHECK above now permits.
UPDATE nexus_test_attempts a
SET status = 'abandoned',
    submitted_at = COALESCE(a.submitted_at, now())
WHERE a.status = 'in_progress'
  AND EXISTS (
    SELECT 1 FROM nexus_test_attempts b
    WHERE b.test_id = a.test_id
      AND b.student_id = a.student_id
      AND b.status = 'in_progress'
      AND (COALESCE(b.started_at, b.created_at), b.id) > (COALESCE(a.started_at, a.created_at), a.id)
  );

-- At most ONE attempt in progress per student per test. Resuming is supposed to
-- find the existing row; a race between two tabs otherwise leaves two open
-- attempts and the answers saved into whichever one the client happens to hold.
CREATE UNIQUE INDEX IF NOT EXISTS uq_test_attempt_one_in_progress
  ON nexus_test_attempts(test_id, student_id)
  WHERE status = 'in_progress';
