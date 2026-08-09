-- Sections become a real, persisted property of a question.
--
-- WHY THIS EXISTS
-- A JEE/NATA paper is sat in sections (Mathematics, Aptitude, Drawing), and a
-- scheduled exam must shuffle WITHIN a section while keeping the sections in
-- their paper order. Until now the split was guessed at upload time by
-- classifyQuestion() in apps/nexus/src/lib/nta-parser.ts and then thrown away:
-- only `categories[]` survived, and only by convention that categories[0] is
-- the broad slug.
--
-- WHY NOT REUSE categories[]
-- categories is a topic taxonomy. A question can carry several, nothing
-- guarantees array order, and retagging a question would silently change which
-- marking scheme it falls under (marksForQuestions keys on categories[0]).
-- A question sits in exactly one section, so it gets one column.
--
-- WHY ON THE QUESTION AND NOT ON nexus_qb_question_sources
-- The sources table is the real per-paper membership, but a question repeated
-- in 2019 and 2023 is an aptitude question in both sittings. Section is a
-- property of the question's kind, not of its position in one sitting. If a
-- paper ever genuinely needs a per-paper override, add a nullable `section` to
-- nexus_qb_question_sources later and read it with COALESCE. Nothing here
-- blocks that.

ALTER TABLE nexus_qb_questions
  ADD COLUMN IF NOT EXISTS section       TEXT,
  ADD COLUMN IF NOT EXISTS section_order SMALLINT;

COMMENT ON COLUMN nexus_qb_questions.section IS
  'Which part of its paper this question belongs to: math_mcq, math_numerical, aptitude or drawing. Drives section-wise shuffle, per-section marks and the section-wise score report. Backfilled from the position heuristic in nta-parser.ts and correctable by a teacher in the paper workspace.';

COMMENT ON COLUMN nexus_qb_questions.section_order IS
  'Sort position of the section within its paper. Sections are ordered by this, never by name, so renaming a section can never reorder a live paper.';

-- Serving a paper reads every question of one paper in section then display
-- order. This is that read.
CREATE INDEX IF NOT EXISTS idx_qb_questions_paper_section
  ON nexus_qb_questions(original_paper_id, section_order, display_order)
  WHERE original_paper_id IS NOT NULL;

-- ---------------------------------------------------------------------------
-- Backfill
--
-- The rule, in priority order, matching the TypeScript in nta-parser.ts so the
-- two can never disagree:
--   1. A DRAWING_PROMPT is a drawing question wherever it sits. Format beats
--      position, which is an improvement on the pure-position heuristic: a
--      paper that numbers its drawing prompts differently still lands right.
--   2. For JEE Paper 2, the published structure: Q1-20 maths MCQ, Q21-25 maths
--      numerical, Q26-75 aptitude, Q76+ drawing.
--   3. For NATA, whose section boundaries are not fixed across years, fall back
--      to the format alone and let the teacher correct it in the workspace.
--      A wrong guess a teacher can see and fix beats a confident wrong guess.
--
-- The question number comes from display_order, falling back to the sources
-- table. The COALESCE(session,'') / COALESCE(shift,'') join deliberately
-- mirrors paperKey() in qb-papers.ts, or the join silently halves a paper.
-- ---------------------------------------------------------------------------
WITH numbered AS (
  SELECT q.id,
         p.exam_type,
         q.question_format,
         COALESCE(q.display_order, s.question_number) AS qnum
  FROM nexus_qb_questions q
  JOIN nexus_qb_original_papers p ON p.id = q.original_paper_id
  LEFT JOIN LATERAL (
    SELECT src.question_number
    FROM nexus_qb_question_sources src
    WHERE src.question_id = q.id
      AND src.exam_type = p.exam_type
      AND src.year = p.year
      AND COALESCE(src.session, '') = COALESCE(p.session, '')
      AND COALESCE(src.shift, '') = COALESCE(p.shift, '')
    LIMIT 1
  ) s ON true
  WHERE q.section IS NULL
),
guessed AS (
  SELECT id,
    CASE
      WHEN question_format = 'DRAWING_PROMPT'                             THEN 'drawing'
      WHEN exam_type = 'JEE_PAPER_2' AND qnum IS NOT NULL AND qnum <= 20  THEN 'math_mcq'
      WHEN exam_type = 'JEE_PAPER_2' AND qnum IS NOT NULL AND qnum <= 25  THEN 'math_numerical'
      WHEN exam_type = 'JEE_PAPER_2' AND qnum IS NOT NULL AND qnum <= 75  THEN 'aptitude'
      WHEN exam_type = 'JEE_PAPER_2' AND qnum IS NOT NULL                 THEN 'drawing'
      WHEN question_format = 'NUMERICAL'                                  THEN 'math_numerical'
      ELSE 'aptitude'
    END AS section
  FROM numbered
)
UPDATE nexus_qb_questions q
SET section = g.section,
    section_order = CASE g.section
      WHEN 'math_mcq'       THEN 1
      WHEN 'math_numerical' THEN 2
      WHEN 'aptitude'       THEN 3
      WHEN 'drawing'        THEN 4
      ELSE 9
    END
FROM guessed g
WHERE q.id = g.id;
