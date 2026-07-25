-- Post-class attendance analytics: capture the FULL set of join/leave segments from
-- the Teams attendance report, not just the first join and last leave. This is what
-- lets the insights view show "left in the middle" / rejoined, versus a single
-- continuous stretch. NULL for manual rows and pre-migration rows.

ALTER TABLE nexus_attendance
  ADD COLUMN IF NOT EXISTS attendance_intervals JSONB;

COMMENT ON COLUMN nexus_attendance.attendance_intervals IS
  'Raw Teams attendanceIntervals [{joinDateTime, leaveDateTime, durationInSeconds}]. More than one entry = the student left and rejoined mid-class.';
