-- One open demo request per person. Only v2 rows (they carry a ref_code) are
-- covered, so historical slot registrations can never block this index.
-- Separate from 20261110090000 because 'contacted' is added there.
CREATE UNIQUE INDEX IF NOT EXISTS idx_demo_reg_one_active_per_user
  ON demo_class_registrations (user_id)
  WHERE ref_code IS NOT NULL
    AND user_id IS NOT NULL
    AND status IN ('pending', 'contacted', 'approved');
