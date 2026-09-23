-- ============================================
-- "Attempt any one of two" becomes two things a student can practise.
--
-- JEE Paper 2 prints drawing questions as a choice: Q81 is "draw a rectangular
-- frame of cubes and cones" OR "rotate the graphic below". Two unrelated tasks
-- that share a number only because the exam lets you pick one. Practice is not
-- the exam, so a student wants to draw both, on different days, each with its
-- own figure, its own solution and its own attempt.
--
-- The paper is left alone. nexus_qb_questions keeps one row, so the paper keeps
-- its count and exam marking keeps asking for one drawing. What splits is the
-- practice side.
--
-- WHY A MIRROR ROW PER PART
--
-- drawing_thread_status is keyed on (student_id, question_id) where question_id
-- is the drawing_questions mirror, and a thread refuses a second upload until a
-- teacher asks for a redo. One mirror between two options would mean uploading
-- 81A locks 81B behind "wait for teacher review", which is the opposite of the
-- point. A mirror per part gives each option its own thread, its own attempt
-- numbering and its own redo cycle, for free, through machinery that already
-- works.
--
-- qb_part_id is '' (not NULL) for a question that is not split, so a plain
-- unique constraint holds. With NULL, Postgres counts two NULLs as distinct and
-- the same question could mint two mirrors.
--
-- WHAT THE STUDENT LEANED ON
--
-- nexus_qb_drawing_reveals stops being "opened the solution" and becomes "was
-- shown help of some kind", because a student may also look at how classmates
-- drew it. Both are legitimate ways to learn and neither is refused, but the
-- teacher marking the sheet has to be able to tell.
--
-- drawing_submissions.qb_help_used is stamped at submit time rather than
-- derived at read time on purpose: a student who opens the solution AFTER
-- submitting must not retroactively look like they copied.
-- ============================================

-- ---------- 1. A mirror drawing question per part ----------

ALTER TABLE drawing_questions
  ADD COLUMN IF NOT EXISTS qb_part_id TEXT NOT NULL DEFAULT '';

COMMENT ON COLUMN drawing_questions.qb_part_id IS
  'Which option of an "attempt any one of N" bank question this mirrors. Empty string for a question that is not split, which is every row before 2026-10.';

-- The old index allowed one mirror per bank question.
DROP INDEX IF EXISTS idx_dq_qb_question_id;
CREATE UNIQUE INDEX IF NOT EXISTS idx_dq_qb_question_part
  ON drawing_questions(qb_question_id, qb_part_id) WHERE qb_question_id IS NOT NULL;

-- ---------- 2. Reveals become per part, and per kind of help ----------

ALTER TABLE nexus_qb_drawing_reveals
  ADD COLUMN IF NOT EXISTS part_id TEXT NOT NULL DEFAULT '';

ALTER TABLE nexus_qb_drawing_reveals
  ADD COLUMN IF NOT EXISTS kind TEXT NOT NULL DEFAULT 'solution';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'nexus_qb_drawing_reveals_kind_check'
  ) THEN
    ALTER TABLE nexus_qb_drawing_reveals
      ADD CONSTRAINT nexus_qb_drawing_reveals_kind_check
      CHECK (kind IN ('solution', 'peers'));
  END IF;
END $$;

COMMENT ON COLUMN nexus_qb_drawing_reveals.part_id IS
  'Which option of an "attempt any one of N" drawing was unlocked. Empty string for the whole question. Unlocking 81B must not unlock 81A.';
COMMENT ON COLUMN nexus_qb_drawing_reveals.kind IS
  'solution = the teacher model answer. peers = other students'' attempts at the same question.';

ALTER TABLE nexus_qb_drawing_reveals
  DROP CONSTRAINT IF EXISTS nexus_qb_drawing_reveals_student_id_question_id_key;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'nexus_qb_drawing_reveals_student_question_part_kind_key'
  ) THEN
    ALTER TABLE nexus_qb_drawing_reveals
      ADD CONSTRAINT nexus_qb_drawing_reveals_student_question_part_kind_key
      UNIQUE (student_id, question_id, part_id, kind);
  END IF;
END $$;

-- ---------- 3. What the attempt was drawn with ----------

ALTER TABLE drawing_submissions
  ADD COLUMN IF NOT EXISTS qb_help_used TEXT[];

COMMENT ON COLUMN drawing_submissions.qb_help_used IS
  'What the student had open when they drew this: ''solution'', ''peers'', both, or empty for unaided. Stamped at submit time, never re-derived, so opening the solution afterwards cannot make an honest attempt look copied. NULL on rows that predate the column.';

-- ---------- 4. Backfill from the note prefix ----------
--
-- The marker used to be pushed into the student's own note, which is both
-- fragile and rude: system text inside a student's private reflection. Move it
-- to the column and give the note back.
--
-- Only the prefix is read, never nexus_qb_drawing_reveals: a reveal row carries
-- no time relative to the attempt, so deriving from it would stamp "copied" on
-- students who opened the answer after they had already drawn it.

UPDATE drawing_submissions
   SET qb_help_used = ARRAY['solution'],
       self_note    = nullif(btrim(substring(self_note from char_length('[Solution viewed first]') + 1)), '')
 WHERE source_type = 'question_bank'
   AND self_note LIKE '[Solution viewed first]%';

UPDATE drawing_submissions
   SET qb_help_used = '{}'
 WHERE source_type = 'question_bank'
   AND qb_help_used IS NULL;
