-- ============================================
-- QUESTION BANK PAPERS: read, practise, sit
--
-- A paper already existed as a row in nexus_qb_original_papers, but only as a
-- staging area for an upload: it held a parse status and three progress counts
-- and nothing a student could open. Students met papers somewhere else entirely,
-- through nexus_qb_question_sources, which is the many-to-many record of which
-- exam a question appeared in. Nothing joined the two, so the teacher's paper
-- list and the student's "Practice by Year Paper" grid were free to disagree,
-- and did.
--
-- This migration makes the papers table the OBJECT and leaves the sources table
-- as the MEMBERSHIP. A paper gains the two things it was missing: somewhere to
-- put its PDF, and a switch that says students may see it.
-- ============================================

-- 1. The original PDF ---------------------------------------------------------
--
-- A reference to a study file rather than a column holding an upload. The papers
-- are already being filed into Study Materials folders, and that subsystem
-- carries everything a view-only exam paper needs: SharePoint streaming that
-- never leaks the source URL, per-student watermarking, download grants with an
-- expiry, and reading-time tracking. Storing a second copy here would mean
-- reimplementing all four and then keeping them in step.
--
-- ON DELETE SET NULL, not CASCADE: deleting the PDF must not delete the paper
-- and its several hundred parsed questions.
--
-- pdf_url, the column added in the original 20260404 schema, is deliberately
-- left alone. It holds a bare link for the handful of papers imported before
-- Study Materials existed, and is read nowhere in the app.
ALTER TABLE nexus_qb_original_papers
  ADD COLUMN IF NOT EXISTS study_file_id UUID REFERENCES nexus_study_files(id) ON DELETE SET NULL;

-- 2. The publish switch -------------------------------------------------------
--
-- Defaults to false, so applying this migration publishes nothing. A paper is
-- uploaded, parsed, answer-keyed and reviewed over days, and upload_status
-- reaching 'complete' is a statement about the PARSE, not a decision to show
-- students a paper. Those are separate judgements and this is the second one.
ALTER TABLE nexus_qb_original_papers
  ADD COLUMN IF NOT EXISTS is_student_visible BOOLEAN NOT NULL DEFAULT false;

-- The student grid asks for exactly this: visible papers, newest year first,
-- within one exam.
CREATE INDEX IF NOT EXISTS idx_qb_papers_student_visible
  ON nexus_qb_original_papers(exam_type, year DESC)
  WHERE is_student_visible = true;

CREATE INDEX IF NOT EXISTS idx_qb_papers_study_file
  ON nexus_qb_original_papers(study_file_id)
  WHERE study_file_id IS NOT NULL;

COMMENT ON COLUMN nexus_qb_original_papers.study_file_id IS
  'The view-only original PDF, held in Study Materials. NULL means the questions were parsed from a paper we do not have a file for.';
COMMENT ON COLUMN nexus_qb_original_papers.is_student_visible IS
  'Staff decision to publish this paper to students. Independent of upload_status, which describes the parse.';

-- 3. One mock per paper -------------------------------------------------------
--
-- Extends the existing single-test rule to cover 'qb_paper'. A paper holds at
-- most one ACTIVE mock, for the same reason a study file holds one chapter test:
-- "sit this paper" has to mean one thing, and a second placement would make
-- "best score on NATA 2025" ambiguous.
--
-- The quick drill deliberately does not go through here. It is built by the
-- student through the existing custom-test route as a 'student_custom' test, so
-- it needs no placement and cannot collide with the mock.
--
-- Rewritten rather than added to, because a partial unique index's predicate
-- cannot be altered in place.
DROP INDEX IF EXISTS uq_placement_single_test;
CREATE UNIQUE INDEX uq_placement_single_test
  ON nexus_test_placements(context_type, context_id)
  WHERE is_active = true
    AND context_type IN (
      'study_file',
      'class_recap_section',
      'foundation_section',
      'module_item',
      'qb_paper'
    );

-- NOTE for whoever links and unlinks a mock: uq_placement_test_context, the
-- OTHER unique rule on this table, is NOT partial. It covers
-- (context_type, context_id, test_id) regardless of is_active, so unlinking a
-- test (which sets is_active = false) and then relinking the same test raises
-- 23505 on insert. Revive the existing row instead. linkTestToStudyFile already
-- does this; linkTestToQBPaper does the same.
