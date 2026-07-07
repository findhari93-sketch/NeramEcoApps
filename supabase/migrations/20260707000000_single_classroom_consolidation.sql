-- ============================================================================
-- Single-classroom consolidation
-- ============================================================================
-- The ecosystem is collapsing to ONE active classroom for the current cohort
-- (the "Common Classes" classroom, type='common', is repurposed and renamed in
-- an environment-specific data step, not here). Every enrollment path now
-- targets that single classroom directly in application code and ALSO syncs the
-- student to the linked Microsoft Team + group chat.
--
-- The DB-only auto-enroll trigger below is therefore redundant and misleading:
-- it could only ever insert the enrollment ROW (a Postgres trigger cannot call
-- Microsoft Graph), and it only fired when a student first got some OTHER
-- enrollment, which no longer happens with a single classroom. Drop it so there
-- is exactly one code path (the app-side helper) that owns enrollment + Teams.
--
-- The type='common' CHECK constraint and the `nexus_classrooms_unique_common`
-- partial unique index are intentionally KEPT: they still guarantee exactly one
-- such classroom, which is now the single active classroom.

DROP TRIGGER IF EXISTS trg_auto_enroll_common ON nexus_enrollments;
DROP FUNCTION IF EXISTS auto_enroll_common_classroom();
