-- A refused autosave is its own kind of failure, and needs its own phase.
--
-- Until now the take page threw the answer to every autosave away. When the
-- server stopped accepting writes for a sitting the student was told nothing
-- and kept answering into a paper that no longer existed, losing everything
-- since the last accepted save. On the 18 Aug 2026 exam (paper acf8084d) that
-- cost Karthik Gregory all fifty answers and twenty-eight minutes, and
-- Samruddhi wani thirty answers.
--
-- The page now stops the sitting and reports the refusal the moment it happens,
-- under phase 'save', so a teacher sees it without waiting for a submit that
-- may never come. The CHECK has to allow it or every one of those reports is
-- rejected with a 23514 and the route logs it and stores nothing.
--
-- Widening a CHECK only: no existing row can fail it, so this is safe to apply
-- to an environment already holding data.

ALTER TABLE nexus_test_attempt_errors
  DROP CONSTRAINT IF EXISTS nexus_test_attempt_errors_phase_check;

ALTER TABLE nexus_test_attempt_errors
  ADD CONSTRAINT nexus_test_attempt_errors_phase_check
  CHECK (phase = ANY (ARRAY['load'::text, 'render'::text, 'image'::text, 'save'::text, 'submit'::text, 'grade'::text]));
