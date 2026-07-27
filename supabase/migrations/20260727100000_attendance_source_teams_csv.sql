-- Allow attendance rows that came from an uploaded Teams attendance report.
--
-- Why a third source value rather than reusing 'teams':
--
-- Reading attendance from Microsoft Graph is blocked on a Teams application
-- access policy that only a tenant administrator can grant, and which has never
-- been in effect here. Every one of the ~200 classes still has
-- attendance_synced_at IS NULL. The organizer can, however, download the
-- attendance report straight out of the Teams meeting recap with no Azure
-- configuration at all, so importing that file is the one path to real Teams
-- attendance that does not depend on the grant.
--
-- Those rows must stay distinguishable from Graph rows. The day the policy does
-- land, the first useful thing to do is reconcile the two and look at where they
-- disagree, and that is impossible if both say 'teams'. It also lets the UI say
-- "From uploaded report" instead of claiming a live Teams sync that never ran.
--
-- The original constraint is inline on the CREATE TABLE
-- (20260318_nexus_phase1_tables.sql), so it has to be dropped and re-added
-- rather than altered. This only ever widens the allowed set, and today the
-- column holds nothing but 'manual', so it cannot fail on existing data.

ALTER TABLE nexus_attendance DROP CONSTRAINT IF EXISTS nexus_attendance_source_check;

ALTER TABLE nexus_attendance
  ADD CONSTRAINT nexus_attendance_source_check
  CHECK (source IN ('teams', 'manual', 'teams_csv'));

COMMENT ON COLUMN nexus_attendance.source IS
  'Where this row came from. teams = Microsoft Graph attendanceRecords (matched on the stable AAD oid, carries real attendanceIntervals). teams_csv = a staff member uploaded the Teams attendance report for this class, matched on email or name. manual = a teacher toggled it by hand, which outranks both syncs.';
