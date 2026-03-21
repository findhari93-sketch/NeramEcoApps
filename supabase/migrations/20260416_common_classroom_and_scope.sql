-- ============================================================================
-- Common Classroom + Target Scope for Cross-Classroom Meetings
-- ============================================================================
-- Enables creating live classes visible to ALL students across classrooms.
-- Uses a "Common" classroom that auto-enrolls every student.

-- Step 1: Allow 'common' as a classroom type
ALTER TABLE nexus_classrooms
  DROP CONSTRAINT IF EXISTS nexus_classrooms_type_check;

ALTER TABLE nexus_classrooms
  ADD CONSTRAINT nexus_classrooms_type_check
  CHECK (type IN ('nata', 'jee', 'revit', 'other', 'common'));

-- Step 2: Add target_scope to nexus_scheduled_classes (audit/display only)
ALTER TABLE nexus_scheduled_classes
  ADD COLUMN IF NOT EXISTS target_scope TEXT DEFAULT 'classroom'
  CHECK (target_scope IN ('all', 'classroom', 'batch'));

-- Step 3: Add short_code column for easy-to-remember classroom IDs
ALTER TABLE nexus_classrooms
  ADD COLUMN IF NOT EXISTS short_code TEXT UNIQUE;

-- Step 4: Create the Common classroom (unique partial index prevents duplicates)
CREATE UNIQUE INDEX IF NOT EXISTS nexus_classrooms_unique_common
  ON nexus_classrooms (type) WHERE type = 'common';

INSERT INTO nexus_classrooms (name, type, description, is_active, short_code)
VALUES (
  'Common Classes',
  'common',
  'Cross-classroom classes visible to all enrolled students',
  true,
  'COM'
)
ON CONFLICT DO NOTHING;

-- Step 5: Bulk-enroll all existing active students in the Common classroom
INSERT INTO nexus_enrollments (user_id, classroom_id, role, is_active)
SELECT DISTINCT e.user_id,
  (SELECT id FROM nexus_classrooms WHERE type = 'common' LIMIT 1),
  'student',
  true
FROM nexus_enrollments e
WHERE e.role = 'student'
  AND e.is_active = true
  AND (SELECT id FROM nexus_classrooms WHERE type = 'common' LIMIT 1) IS NOT NULL
ON CONFLICT (user_id, classroom_id) DO NOTHING;

-- Step 6: Auto-enroll trigger — whenever a student is enrolled in any classroom,
-- also enroll them in the Common classroom automatically.
CREATE OR REPLACE FUNCTION auto_enroll_common_classroom()
RETURNS TRIGGER AS $$
DECLARE
  common_id UUID;
BEGIN
  -- Only for students being actively enrolled
  IF NEW.role = 'student' AND NEW.is_active = true THEN
    SELECT id INTO common_id FROM nexus_classrooms WHERE type = 'common' AND is_active = true LIMIT 1;
    IF common_id IS NOT NULL AND NEW.classroom_id != common_id THEN
      INSERT INTO nexus_enrollments (user_id, classroom_id, role, is_active)
      VALUES (NEW.user_id, common_id, 'student', true)
      ON CONFLICT (user_id, classroom_id) DO NOTHING;
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_auto_enroll_common ON nexus_enrollments;
CREATE TRIGGER trg_auto_enroll_common
  AFTER INSERT ON nexus_enrollments
  FOR EACH ROW EXECUTE FUNCTION auto_enroll_common_classroom();
