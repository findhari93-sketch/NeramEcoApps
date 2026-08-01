-- Give a drawing brief parts instead of one box.
--
-- A drawing assignment's whole brief lived in `instructions`: what to draw, what
-- a good result looks like, and what to concentrate on, all run together in one
-- three-row textarea. That is the same wall-of-text problem already fixed on the
-- reading side, still present on the writing side.
--
-- These are real columns rather than headings parsed back out of `instructions`,
-- because editing has to round-trip losslessly. A parser that re-reads its own
-- output will eventually mangle something a teacher wrote, and a mangled brief
-- is worse than an unstructured one.
--
-- Both are nullable with no default, so every existing assignment is untouched
-- and its brief renders exactly as it does today.

ALTER TABLE nexus_class_assignments
  ADD COLUMN IF NOT EXISTS expected_outcome TEXT,
  ADD COLUMN IF NOT EXISTS focus_points TEXT;

COMMENT ON COLUMN nexus_class_assignments.expected_outcome IS
  'What a finished, successful piece of work looks like. Shown to the student as its own labelled block.';

COMMENT ON COLUMN nexus_class_assignments.focus_points IS
  'What to concentrate on, one point per line. Rendered as a bulleted list for the student and carried into the drawing question so the reviewer sees it while marking.';
