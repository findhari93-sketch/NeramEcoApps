-- ============================================
-- CLASS PREP GATE: what each student owes before a class, and what they did
--
-- One row per (student, scheduled class). It answers two different questions
-- with two different kinds of column, and keeping them apart is the whole design:
--
--   DERIVED columns are a cache. Every one of them is a pure function of
--   nexus_test_placements / nexus_test_attempts / nexus_class_assignments /
--   nexus_assignment_submissions / drawing_submissions. recomputeClassPrep() is
--   their ONLY writer, they are safe to drop and rebuild, and drift self-heals.
--
--   OBSERVED columns are the system of record. Nothing else in the database
--   could reproduce them, because they record what a student DID: how often they
--   hit a locked button, whether they came through our door, and the reason they
--   gave. recomputeClassPrep() must NEVER write them. A recompute that clears an
--   observation is the single easiest way to destroy this feature's credibility.
--
-- No function writes both kinds. There is a unit test for that.
--
-- Note what is NOT here. "Which test must be passed" is not denormalised: it is
-- resolved live from nexus_test_placements, exactly as the catch-up journey does,
-- so a teacher swapping the paper does not need a backfill. placement_id is
-- cached only so the roster read does not need the join.
-- ============================================

-- 1. Let a class hold exactly one active prep test --------------------------

-- classroom_assignment and student_practice may hold many tests; every gated
-- single-test context may hold one. class_prep_test joins that second group.
-- Zero rows carry the new context at migration time, so the re-create cannot
-- fail on an existing duplicate.
DROP INDEX IF EXISTS uq_placement_single_test;
CREATE UNIQUE INDEX IF NOT EXISTS uq_placement_single_test
  ON nexus_test_placements(context_type, context_id)
  WHERE is_active = true
    AND context_type IN ('study_file', 'class_recap_section', 'foundation_section', 'module_item', 'catchup_class', 'class_prep_test');

-- 2. The per-student, per-class prep state ----------------------------------

CREATE TABLE IF NOT EXISTS nexus_class_prep_state (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  scheduled_class_id UUID NOT NULL REFERENCES nexus_scheduled_classes(id) ON DELETE CASCADE,
  -- Denormalised for the same reason nexus_prework_reasons.classroom_id is: the
  -- teacher's "who is not ready in my classroom" read must not join through
  -- nexus_scheduled_classes on every dashboard load.
  classroom_id UUID NOT NULL REFERENCES nexus_classrooms(id) ON DELETE CASCADE,

  -- ---------------- DERIVED (recomputeClassPrep only) ----------------

  -- The active class_prep_test placement at last recompute. Cached for the
  -- roster read, never trusted for an authorization decision: the join route
  -- re-resolves it from nexus_test_placements before deciding anything.
  placement_id UUID REFERENCES nexus_test_placements(id) ON DELETE SET NULL,

  -- WHICH test they passed, not just that they did. A teacher who swaps the
  -- paper after half the class has passed must not silently re-lock them at
  -- 11pm, so a pass on any test that was ever this class's prep test counts.
  passed_test_id UUID REFERENCES nexus_tests(id) ON DELETE SET NULL,

  -- Best of every submitted attempt, because the rule is retry-until-pass.
  -- NUMERIC(5,2) matches nexus_test_attempts.percentage exactly; a rounded copy
  -- here would disagree with the result screen the student was just shown.
  test_best_pct NUMERIC(5,2),
  -- Counts submitted attempts ONLY. api/tests/attempt writes status 'abandoned',
  -- which the nexus_test_attempts CHECK rejects, so stale in_progress rows exist
  -- and would inflate a number the teacher is told to read as effort.
  test_attempts INTEGER NOT NULL DEFAULT 0,
  -- The FIRST passing attempt, so it is stable once set.
  test_passed_at TIMESTAMPTZ,

  -- Published prework on this class, and how much of it this student handed in.
  -- Both counts, because the gate asks "all of it?" and the roster shows "2 of 3".
  assignments_required INTEGER NOT NULL DEFAULT 0,
  assignments_submitted INTEGER NOT NULL DEFAULT 0,

  -- When the door first opened, and what opened it. Derivable because every
  -- input is a stored timestamp: min(test_passed_at, all submitted_at) or
  -- test_reason_at. 'reason' means they told us why instead of doing the work.
  unlocked_at TIMESTAMPTZ,
  unlocked_via TEXT CHECK (unlocked_via IN ('earned', 'reason', 'not_required')),

  -- Was this student ready when the class STARTED. Derived, but deliberately by
  -- comparing stored timestamps against the class start rather than by asking
  -- "is the gate open now": a student who fails at 7pm and passes at 10pm has
  -- test_passed_at = 10pm, so this stays false forever and the parent report
  -- cannot retroactively rewrite them into someone who came prepared.
  -- NULL means undecidable yet: the class has not started, or nothing was asked.
  prepared_at_class_start BOOLEAN,

  -- ---------------- OBSERVED (never recomputed) ----------------

  -- How many times this student hit a locked Join. The signal that tells us the
  -- gate is too hard or the copy is unclear, and it has nowhere else to live.
  blocked_attempts INTEGER NOT NULL DEFAULT 0,
  last_blocked_at TIMESTAMPTZ,
  -- They came through our door. Its absence plus a nexus_attendance row is how
  -- we detect a join straight from the Teams calendar invite, which we cannot
  -- and do not pretend to prevent.
  joined_via_nexus_at TIMESTAMPTZ,

  -- "I cannot do this, here is why." Same vocabulary as nexus_prework_reasons so
  -- a teacher's tally stays one set of words, but stored here because that
  -- table's assignment_id is NOT NULL and the test half of the gate has no
  -- assignment to hang a reason on.
  test_reason_code TEXT
    CHECK (test_reason_code IN ('not_understood', 'no_time', 'materials', 'unwell', 'other')),
  test_reason_note TEXT,
  test_reason_at TIMESTAMPTZ,

  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- The upsert target for recomputeClassPrep.
  UNIQUE (student_id, scheduled_class_id)
);

-- The two hot reads: one student's week (batched with .in() on class ids), and
-- the teacher's roster for one class.
CREATE INDEX IF NOT EXISTS idx_class_prep_state_student
  ON nexus_class_prep_state(student_id, scheduled_class_id);
CREATE INDEX IF NOT EXISTS idx_class_prep_state_class
  ON nexus_class_prep_state(scheduled_class_id);
-- The future progress report: one student across a whole classroom.
CREATE INDEX IF NOT EXISTS idx_class_prep_state_classroom
  ON nexus_class_prep_state(classroom_id, student_id);

DROP TRIGGER IF EXISTS nexus_class_prep_state_updated_at ON nexus_class_prep_state;
CREATE TRIGGER nexus_class_prep_state_updated_at
  BEFORE UPDATE ON nexus_class_prep_state
  FOR EACH ROW EXECUTE FUNCTION update_nexus_updated_at();

ALTER TABLE nexus_class_prep_state ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "service_role_full_access" ON nexus_class_prep_state;
CREATE POLICY "service_role_full_access" ON nexus_class_prep_state
  FOR ALL TO service_role USING (true) WITH CHECK (true);

COMMENT ON TABLE nexus_class_prep_state IS
  'Per student, per class: what they owe before the class and what they did. Hybrid by design. Derived columns (placement_id, passed_test_id, test_best_pct, test_attempts, test_passed_at, assignments_required, assignments_submitted, unlocked_at, unlocked_via, prepared_at_class_start) are a rebuildable cache written only by recomputeClassPrep. Observed columns (blocked_attempts, last_blocked_at, joined_via_nexus_at, test_reason_code, test_reason_note, test_reason_at) are the system of record and are never recomputed.';

COMMENT ON COLUMN nexus_class_prep_state.prepared_at_class_start IS
  'Derived by comparing stored timestamps against the class start time, NOT by asking whether the gate is open now. A student who passes the test after the class must stay recorded as unprepared.';

-- PostgREST caches the schema. Without this, every read of the new table fails
-- with "relation does not exist" until the cache happens to refresh.
NOTIFY pgrst, 'reload schema';
