-- Multi-classroom "Add Class": one logical class/meeting can now target several
-- classrooms at once. Because nexus_scheduled_classes stores a single classroom_id
-- (visibility is enrollment-based, no class<->classrooms join table), a multi-classroom
-- class is stored as one row per classroom. meeting_group_id ties those sibling rows
-- together so they share a single Teams meeting and can be edited/removed as a unit.
--
-- NULL meeting_group_id = a plain single-classroom class (all pre-existing rows).

ALTER TABLE nexus_scheduled_classes
  ADD COLUMN IF NOT EXISTS meeting_group_id UUID;

CREATE INDEX IF NOT EXISTS idx_nexus_scheduled_classes_meeting_group
  ON nexus_scheduled_classes (meeting_group_id)
  WHERE meeting_group_id IS NOT NULL;

COMMENT ON COLUMN nexus_scheduled_classes.meeting_group_id IS
  'Groups the per-classroom rows of one multi-classroom class so they share a single meeting. NULL = single-classroom class.';
