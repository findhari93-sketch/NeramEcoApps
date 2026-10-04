-- JEE Paper 2B (B.Planning) as its own question-bank exam.
--
-- In a JEE Main session, Paper 2B carries the same Maths and Aptitude
-- questions as Paper 2A (B.Arch) and replaces Drawing with a Planning section.
-- The bank only knew 'JEE_PAPER_2' (meaning 2A) and 'NATA', so a Planning
-- question had nowhere to go.
--
-- 1. Allow 'JEE_PAPER_2B' on papers and on question sources.
-- 2. Seed the exam tag, next to 'jee' and 'nata'.
-- 3. Document the new 'planning' section value. nexus_qb_questions.section
--    has no CHECK, so nothing else changes there.
--
-- Questions on a 2B paper keep exam_relevance 'JEE': the shared Maths and
-- Aptitude are the very same JEE questions, so no new relevance value and no
-- change to nexus_qb_search.
--
-- nexus_qb_chapter_weightage needs no change: it buckets any section other
-- than the two maths ones under its own name, so 'planning' arrives as its own
-- section.

ALTER TABLE nexus_qb_original_papers
  DROP CONSTRAINT IF EXISTS nexus_qb_original_papers_exam_type_check;
ALTER TABLE nexus_qb_original_papers
  ADD CONSTRAINT nexus_qb_original_papers_exam_type_check
  CHECK (exam_type IN ('JEE_PAPER_2', 'JEE_PAPER_2B', 'NATA'));

ALTER TABLE nexus_qb_question_sources
  DROP CONSTRAINT IF EXISTS nexus_qb_question_sources_exam_type_check;
ALTER TABLE nexus_qb_question_sources
  ADD CONSTRAINT nexus_qb_question_sources_exam_type_check
  CHECK (exam_type IN ('JEE_PAPER_2', 'JEE_PAPER_2B', 'NATA'));

INSERT INTO nexus_qb_tags (group_type, slug, label, is_system, sort_order) VALUES
  ('exam', 'jee-2b', 'JEE Paper 2B (B.Planning)', true, 3)
ON CONFLICT (slug) DO NOTHING;

COMMENT ON COLUMN nexus_qb_questions.section IS
  'The paper section a candidate sits: math_mcq, math_numerical, aptitude, drawing (JEE Paper 2A and NATA) or planning (JEE Paper 2B). Ordered by section_order, never by name.';

NOTIFY pgrst, 'reload schema';
