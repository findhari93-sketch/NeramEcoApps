-- ═══════════════════════════════════════════════════════════════════════════
-- A different paper every sitting
-- ═══════════════════════════════════════════════════════════════════════════
-- A nexus_tests test is a fixed, ordered list of question ids: composeTest
-- writes one nexus_test_questions row per question and getComposedTestQuestions
-- reads them all back by sort_order. Nothing takes an attempt number, so a
-- student on their seventh go gets a byte-identical paper to their first. On a
-- chapter gate whose whole purpose is to check the chapter was read, one
-- screenshot defeats it permanently.
--
-- nexus_class_recap_draws already solved this for checkpoint quizzes. This is
-- the same two defences for the main test engine: serve fewer questions than
-- the test holds and rotate the window per attempt, and permute the option
-- letters so "the answer was B" carries nothing into the retry.

-- ── 1. THE POOL ──────────────────────────────────────────────────────────────
-- NULL means serve everything, which is what every existing test does today, so
-- this column changes nothing until a test opts in by setting it.
ALTER TABLE nexus_tests
  ADD COLUMN IF NOT EXISTS questions_to_serve INTEGER;

COMMENT ON COLUMN nexus_tests.questions_to_serve IS
  'How many of the test''s questions one sitting is served. NULL serves all of them.';

ALTER TABLE nexus_tests
  DROP CONSTRAINT IF EXISTS nexus_tests_questions_to_serve_positive;
ALTER TABLE nexus_tests
  ADD CONSTRAINT nexus_tests_questions_to_serve_positive
  CHECK (questions_to_serve IS NULL OR questions_to_serve > 0);

-- ── 2. THE DRAW ──────────────────────────────────────────────────────────────
-- Which questions one attempt was served, and under which lettering.
--
-- Keyed on (test, student, attempt_number) rather than on the attempt row,
-- copying nexus_class_recap_draws for the same reason it did: a study chapter
-- test is served by getPlacedTestForStudent on a GET, and its attempt row is
-- only written when the answers arrive. Keying on attempt_id would leave the
-- served paper undrawable, and the grade would then be computed against a
-- different subset than the student actually saw. attempt_id is stamped on
-- afterwards, so the draw can still be found from an attempt.
--
-- Persisted rather than recomputed on demand: the pick is deterministic, but a
-- test whose question set changed between the serve and the submit would
-- otherwise re-draw underneath a student who was halfway through it.
CREATE TABLE IF NOT EXISTS nexus_test_draws (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  test_id UUID NOT NULL REFERENCES nexus_tests(id) ON DELETE CASCADE,
  student_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  attempt_number INTEGER NOT NULL,
  -- Filled in once the attempt row exists. Nullable because on the one-shot
  -- path the draw is older than the attempt it belongs to.
  attempt_id UUID REFERENCES nexus_test_attempts(id) ON DELETE SET NULL,
  -- Exactly the questions served, in the order served.
  question_ids UUID[] NOT NULL,
  -- { questionId: ['c','a','d','b'] }: the option shown first is the question's
  -- original option C. Grading reads this backwards.
  option_maps JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (test_id, student_id, attempt_number)
);

CREATE INDEX IF NOT EXISTS idx_nexus_test_draws_attempt
  ON nexus_test_draws(attempt_id)
  WHERE attempt_id IS NOT NULL;

COMMENT ON TABLE nexus_test_draws IS
  'The questions and option lettering one test attempt was served. Absent means the attempt was served the whole test in sort_order, which is the pre-pool behaviour.';
