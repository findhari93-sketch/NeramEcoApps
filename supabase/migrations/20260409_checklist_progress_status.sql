-- Add status tracking to student progress tables
-- Enables: not_started → in_progress → completed workflow

CREATE TYPE nexus_progress_status AS ENUM ('not_started', 'in_progress', 'completed');

-- Entry progress: add status + started_at
ALTER TABLE nexus_student_entry_progress
  ADD COLUMN IF NOT EXISTS status nexus_progress_status DEFAULT 'not_started',
  ADD COLUMN IF NOT EXISTS started_at TIMESTAMPTZ;

-- Module item progress: add status + started_at
ALTER TABLE nexus_student_module_item_progress
  ADD COLUMN IF NOT EXISTS status nexus_progress_status DEFAULT 'not_started',
  ADD COLUMN IF NOT EXISTS started_at TIMESTAMPTZ;

-- Backfill existing completed rows
UPDATE nexus_student_entry_progress
SET status = 'completed', started_at = completed_at
WHERE is_completed = true;

UPDATE nexus_student_module_item_progress
SET status = 'completed', started_at = completed_at
WHERE is_completed = true;

-- Indexes for teacher queries
CREATE INDEX IF NOT EXISTS idx_entry_progress_status ON nexus_student_entry_progress(status);
CREATE INDEX IF NOT EXISTS idx_module_progress_status ON nexus_student_module_item_progress(status);
