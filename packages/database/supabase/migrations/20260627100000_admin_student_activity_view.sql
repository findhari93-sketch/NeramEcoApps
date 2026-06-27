-- Per-student Nexus activity rollup for the admin alumni workspace.
--
-- The admin "Students" tab needs to flag students who have never done anything in
-- Nexus (no drawing submissions). Drawing submissions are the single best "did
-- anything" signal, so this view pre-aggregates a submission count + latest
-- submission per student. The list query LEFT JOINs it, so a student with no
-- submissions reads as submission_count 0.
--
-- Idempotent: CREATE OR REPLACE.

CREATE OR REPLACE VIEW admin_student_activity AS
SELECT
  ds.student_id,
  COUNT(*)            AS submission_count,
  MAX(ds.submitted_at) AS last_submitted_at
FROM drawing_submissions ds
GROUP BY ds.student_id;

COMMENT ON VIEW admin_student_activity IS 'Per-student drawing-submission rollup (count + latest) for the admin alumni/graduation workspace activity indicator.';
