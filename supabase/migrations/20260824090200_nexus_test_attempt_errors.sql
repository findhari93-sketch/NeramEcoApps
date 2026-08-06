-- ============================================================================
-- WHAT WENT WRONG WHILE A STUDENT WAS SITTING A TEST
--
-- The evidence half of the "is this test broken" question. Its companion,
-- nexus_test_attempts.abandon_reason_* (20260824090100), is the TESTIMONY half:
-- a student saying "something went wrong". This table is what the machine
-- observed at the moment it happened, which is the part a student cannot be
-- expected to describe accurately and usually does not report at all.
--
-- The two are kept apart on purpose. Testimony without evidence is a complaint
-- nobody can act on; evidence without testimony is a log nobody reads. A paper
-- with both is a bug with a repro.
--
-- WHY IT IS NEEDED. On 2026-08-06 production held 19 student-built papers, of
-- which 9 had been opened and abandoned with no submission. Nothing anywhere
-- recorded whether any of those sittings hit an error. A teacher looking at that
-- screen had literally no way to tell a broken paper from a hard one, and the
-- number shown for both was "0 attempts".
--
-- THIS IS A DIAGNOSTIC TABLE, NOT AN AUDIT LOG. It is written best-effort from
-- the client, it is allowed to lose rows, and nothing a student is graded on may
-- ever depend on it. A failure to record an error must never fail the attempt:
-- the student's paper is the thing that matters, and telemetry that can break a
-- test is worse than no telemetry.
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.nexus_test_attempt_errors (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Nullable: the most interesting failures happen BEFORE an attempt row exists.
  -- A test that will not load never creates one, and that is exactly the case
  -- staff most need to see. A NOT NULL here would have silently discarded the
  -- worst category of failure.
  attempt_id UUID REFERENCES public.nexus_test_attempts(id) ON DELETE CASCADE,

  test_id     UUID NOT NULL REFERENCES public.nexus_tests(id) ON DELETE CASCADE,
  student_id  UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  -- Which question, when the failure was about one. A pattern of errors on a
  -- single question_id is the single most actionable shape this table produces.
  question_id UUID REFERENCES public.nexus_qb_questions(id) ON DELETE SET NULL,

  -- WHERE in the sitting it broke. Deliberately coarse: five buckets a teacher
  -- can reason about, not a stack-trace taxonomy only a developer can read.
  --   load     the paper would not open at all
  --   render   a question could not be displayed
  --   image    a figure or diagram failed to load (very common, very fixable)
  --   submit   answers could not be sent
  --   grade    the server accepted the submission and then failed to score it
  phase TEXT NOT NULL CHECK (phase IN ('load', 'render', 'image', 'submit', 'grade')),

  message TEXT NOT NULL,
  -- Free-form context: url, status code, user agent, question index. Kept as
  -- jsonb rather than columns because what is worth capturing differs per phase
  -- and this is a diagnostic surface, not a reporting one.
  detail JSONB,

  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.nexus_test_attempt_errors IS
  'Technical failures observed while a student sat a test. Best-effort diagnostics: rows may be lost, and NOTHING a student is graded on may depend on this table. Companion to nexus_test_attempts.abandon_reason_*, which is the student''s own account of the same moment. Together they answer "is this paper broken", which the teacher hub could not answer at all before 20260824090200.';

COMMENT ON COLUMN public.nexus_test_attempt_errors.attempt_id IS
  'NULL when the failure happened before an attempt existed, which is the case for a paper that will not open at all. That is the most important failure to capture, hence nullable.';

COMMENT ON COLUMN public.nexus_test_attempt_errors.phase IS
  'load | render | image | submit | grade. Coarse on purpose: five buckets a teacher can act on rather than a taxonomy only a developer can read.';

-- The reads this feature performs: "what is wrong with this test" (the health
-- panel), and "which question keeps failing" (the actionable one).
CREATE INDEX IF NOT EXISTS idx_test_attempt_errors_test
  ON public.nexus_test_attempt_errors (test_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_test_attempt_errors_question
  ON public.nexus_test_attempt_errors (question_id, created_at DESC)
  WHERE question_id IS NOT NULL;

-- Service-role only, matching nexus_test_skip_reasons and
-- nexus_enrollment_classification_events. Every write goes through a route that
-- has already resolved the caller, so RLS on with no policy is default deny.
ALTER TABLE public.nexus_test_attempt_errors ENABLE ROW LEVEL SECURITY;

CREATE POLICY "service_role_full_access" ON public.nexus_test_attempt_errors
  FOR ALL TO service_role USING (true) WITH CHECK (true);

NOTIFY pgrst, 'reload schema';
