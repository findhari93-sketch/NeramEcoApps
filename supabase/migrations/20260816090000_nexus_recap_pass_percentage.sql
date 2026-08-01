-- ============================================
-- CHECKPOINTS: FIFTEEN MINUTES, AND A PASS MARK THAT IS A PERCENTAGE
--
-- Two changes to how a recap is cut up and graded.
--
-- 1. `target_segment_seconds` moves from 300 to 900.
--
--    Five minutes gave a one hour class twelve checkpoints and a ninety minute
--    class eighteen. Eighteen segments needed six Gemini calls against a ceiling
--    of five, so the last batch was silently dropped and the recap was then held
--    for thin questions. Fifteen minutes gives four checkpoints for an hour,
--    which is what the teaching staff asked for and what fits in one call.
--
-- 2. `pass_percentage` replaces a raw count as the knob a teacher sets.
--
--    The count broke whenever the number of questions moved. A checkpoint that
--    generated 8 usable questions instead of 10 still demanded "8 correct",
--    which is every question right. A percentage survives that: the count is
--    derived from it whenever sections are written.
--
--    NULL means "use the classroom default", which lives in nexus_settings under
--    the key `recap_defaults` alongside feature_flags. Same pattern, no schema
--    change needed to move the default.
--
-- `questions_to_pass` is deliberately kept. It is the derived count and stays in
-- sync, so anything still reading it keeps working.
-- ============================================

ALTER TABLE nexus_class_recaps
  ADD COLUMN IF NOT EXISTS pass_percentage INTEGER
    CHECK (pass_percentage IS NULL OR (pass_percentage BETWEEN 1 AND 100));

COMMENT ON COLUMN nexus_class_recaps.pass_percentage IS
  'Share of the served questions a student must get right. NULL inherits nexus_settings.recap_defaults.pass_percentage.';

ALTER TABLE nexus_class_recaps
  ALTER COLUMN target_segment_seconds SET DEFAULT 900;

-- Existing rows that have never been generated should pick up the new shape.
-- A recap that already HAS checkpoints is left alone: its sections are cut at
-- the old boundaries and students may already have passed some, so changing the
-- target underneath them would only make the stored knob disagree with reality.
UPDATE nexus_class_recaps
SET target_segment_seconds = 900
WHERE generated_at IS NULL
  AND target_segment_seconds = 300;

-- The classroom-wide defaults. Written only if absent, so re-running this never
-- overwrites what an admin has since chosen.
INSERT INTO nexus_settings (key, value)
VALUES (
  'recap_defaults',
  jsonb_build_object(
    'target_segment_seconds', 900,
    'question_pool_per_segment', 15,
    'questions_per_segment', 10,
    'pass_percentage', 70
  )
)
ON CONFLICT (key) DO NOTHING;

NOTIFY pgrst, 'reload schema';
