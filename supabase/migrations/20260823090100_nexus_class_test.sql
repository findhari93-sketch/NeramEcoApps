-- ============================================
-- CLASS TEST: one test per class, due after it, with reminders
--
-- Two things only. There is deliberately NO per-student state table here, unlike
-- nexus_class_prep_state next door.
--
-- Completion is derived live from nexus_test_attempts. A class test is an
-- ordinary paper sat through the ordinary take engine, so the attempt row IS the
-- truth, and a cached copy of "has Yahul passed it" could only ever be a second
-- opinion that drifts. The prep gate needs its cache because it also stores
-- OBSERVED facts (how often a locked Join was hit, the reason a student gave)
-- that nothing else could reproduce. This feature observes nothing, so it stores
-- nothing.
-- ============================================

-- 1. One active class test per class ----------------------------------------

-- classroom_assignment and student_practice may hold many tests; every context
-- that means "the test for this one thing" may hold one. class_test joins that
-- second group, so POST replaces rather than accumulating.
--
-- Re-created rather than altered because a partial index's predicate cannot be
-- extended in place. Zero rows carry the new context at migration time, so the
-- re-create cannot fail on an existing duplicate.
DROP INDEX IF EXISTS uq_placement_single_test;
CREATE UNIQUE INDEX IF NOT EXISTS uq_placement_single_test
  ON nexus_test_placements(context_type, context_id)
  WHERE is_active = true
    AND context_type IN ('study_file', 'class_recap_section', 'foundation_section', 'module_item', 'catchup_class', 'class_prep_test', 'class_test');

-- A READER'S WARNING, because this has already cost a day once.
--
-- nexus_test_placements carries TWO uniqueness rules and only one of them is
-- partial. The index above is `WHERE is_active`, so deactivating a row frees the
-- class for a DIFFERENT test. uq_placement_test_context, from the original
-- table, is `UNIQUE (context_type, context_id, test_id)` with no predicate at
-- all, so a deactivated row still occupies its triple forever.
--
-- Deactivate-then-insert therefore works for "swap in a different paper" and
-- throws 23505 for "put the same paper back", which is an ordinary thing for a
-- teacher to do. attachClassTest revives the existing row instead. Do not
-- "simplify" it back into an insert.

-- 2. Who has been chased about it -------------------------------------------

-- The direct analogue of nexus_assignment_reminders, and separate from it for
-- one reason: that table's assignment_id is NOT NULL and REFERENCES
-- nexus_class_assignments, so a test has nothing to hang a row on.
--
-- Keyed on the PLACEMENT rather than the test. The same repository paper can be
-- set on two different classes with two different deadlines, and "chased about
-- Tuesday's" must not silence the chase about Thursday's.
CREATE TABLE IF NOT EXISTS nexus_class_test_reminders (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  placement_id  UUID NOT NULL REFERENCES nexus_test_placements(id) ON DELETE CASCADE,
  student_id    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  -- NULL means the nightly sweep sent it. A user id means a teacher pressed
  -- Remind, which is what lets one teacher see that another already has.
  sent_by       UUID REFERENCES users(id) ON DELETE SET NULL,
  channel       TEXT,
  template      TEXT,
  sent_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- The cooldown read: "has this student been chased about this placement with
-- this template recently". Ordered so the sweep's filter is one index scan.
CREATE INDEX IF NOT EXISTS idx_nexus_class_test_reminders_lookup
  ON nexus_class_test_reminders(placement_id, student_id, template);
CREATE INDEX IF NOT EXISTS idx_nexus_class_test_reminders_placement
  ON nexus_class_test_reminders(placement_id);

ALTER TABLE nexus_class_test_reminders ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "service_role_full_access" ON nexus_class_test_reminders;
CREATE POLICY "service_role_full_access" ON nexus_class_test_reminders
  FOR ALL TO service_role USING (true) WITH CHECK (true);

COMMENT ON TABLE nexus_class_test_reminders IS
  'One row per reminder sent about one class-test placement. Keyed on the placement, not the test, because the same paper set on two classes has two deadlines and two separate chases. sent_by NULL means the nightly sweep; a user id means a teacher pressed Remind.';

-- PostgREST caches the schema. Without this, every read of the new table fails
-- with "relation does not exist" until the cache happens to refresh.
NOTIFY pgrst, 'reload schema';
