-- A teacher's answer to "does this question need a figure?", beating the guess.
--
-- Until now the answer was inferred every render from a keyword search over the
-- question text. That search cannot be made right: "Select one group from the
-- options given below" is a text MCQ that reads exactly like a question about a
-- picture, and "how many rectangles are in the figure given below" keeps
-- matching long after its figure is uploaded.
--
-- Tri-state on purpose. NULL is not "no": it means nobody has looked, so the
-- guess still applies and improves whenever the wordlist does. Only an explicit
-- true or false is a decision, and a decision survives every later change to the
-- guess.
--
-- Deliberately NOT backfilled from the guess. Freezing today's inference into
-- 30,000 rows would make every future improvement to it a no-op.

ALTER TABLE nexus_qb_questions
  ADD COLUMN IF NOT EXISTS needs_image BOOLEAN;

COMMENT ON COLUMN nexus_qb_questions.needs_image IS
  'Tri-state. NULL: nobody has looked, fall back to the keyword guess in apps/nexus/src/lib/qb-image-needs.ts. true: a teacher says this question needs a figure. false: a teacher says it does not. A teacher''s answer always beats the guess.';

-- Only the questions a teacher has ruled on, which is the small side of the
-- table and the side every filter has to subtract.
CREATE INDEX IF NOT EXISTS idx_nexus_qb_questions_needs_image
  ON nexus_qb_questions(needs_image)
  WHERE needs_image IS NOT NULL;
