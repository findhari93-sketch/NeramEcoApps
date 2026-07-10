-- Course Plan v2: a "task" plan-entry type (an info task / no-class day).
--
-- A task sits on a chosen date (like a pinned test) and carries a title
-- (label), a description (notes) and a time (task_time). Students see it
-- read-only in their timeline. There are no submissions or grading here; that
-- is the separate nexus_class_assignments feature.
--
-- Two constraints change: the entry_type enum gains 'task', and the row-level
-- check that forces a topic/test FK is relaxed so a task (like a test) may be a
-- standalone row with no topic and no test.

ALTER TABLE nexus_teaching_plan_entries
  ADD COLUMN IF NOT EXISTS task_time time;

-- entry_type enum: add 'task'.
ALTER TABLE nexus_teaching_plan_entries
  DROP CONSTRAINT IF EXISTS nexus_teaching_plan_entries_entry_type_check;
ALTER TABLE nexus_teaching_plan_entries
  ADD CONSTRAINT nexus_teaching_plan_entries_entry_type_check
  CHECK (entry_type IN ('live_class', 'self_learning', 'test', 'task'));

-- Row-level check: a test OR a task may have no topic/test FK.
ALTER TABLE nexus_teaching_plan_entries
  DROP CONSTRAINT IF EXISTS nexus_teaching_plan_entries_check;
ALTER TABLE nexus_teaching_plan_entries
  ADD CONSTRAINT nexus_teaching_plan_entries_check
  CHECK (topic_id IS NOT NULL OR test_id IS NOT NULL OR entry_type IN ('test', 'task'));
