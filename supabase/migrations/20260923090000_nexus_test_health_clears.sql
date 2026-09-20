-- ============================================================================
-- "MARK AS FIXED" FOR A PAPER'S APP PROBLEMS
--
-- The test health banner (apps/nexus/src/components/tests/TestHealthPanel.tsx)
-- counts nexus_test_attempt_errors for a paper over ALL TIME. Once a teacher has
-- dealt with a failure, nothing could say so: on 2026-09-17 paper acf8084d kept
-- its red "students could not submit" line after the submit bug behind it was
-- fixed (fd1c945d), and it would have stayed red forever.
--
-- A row here is a teacher saying "these are dealt with". The health route counts
-- only error rows created AFTER the latest clear for the paper, so anything that
-- fails from then on shows again. Undo deletes the latest clear.
--
-- A separate table rather than a column on nexus_tests, and rows rather than a
-- single timestamp, so the history of who cleared what and when survives an undo
-- and a second clear. nexus_test_attempt_errors is deliberately left untouched:
-- it is diagnostics, and hiding rows is a view over it, not a deletion.
--
-- If this migration has not landed, the health route behaves as if the paper was
-- never cleared and the clear route answers 503, so nothing else breaks.
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.nexus_test_health_clears (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  test_id UUID NOT NULL REFERENCES public.nexus_tests(id) ON DELETE CASCADE,

  -- Everything recorded at or before this moment is hidden from the banner.
  cleared_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- Nullable so removing a staff account never takes the record of their clear
  -- with it, or blocks the removal.
  cleared_by UUID REFERENCES public.users(id) ON DELETE SET NULL,

  note TEXT
);

COMMENT ON TABLE public.nexus_test_health_clears IS
  'A teacher marking a paper''s app problems as fixed. The test health route counts nexus_test_attempt_errors created after the latest row for the paper. Undo deletes the latest row. Added 20260923090000.';

COMMENT ON COLUMN public.nexus_test_health_clears.cleared_at IS
  'Error rows created at or before this moment are hidden from the health banner. New failures after it show again.';

-- The one read: the latest clear for a paper.
CREATE INDEX IF NOT EXISTS idx_test_health_clears_test
  ON public.nexus_test_health_clears (test_id, cleared_at DESC);

-- Service-role only, matching nexus_test_attempt_errors. Every read and write
-- goes through a staff-only route that has already resolved the caller, so RLS
-- on with no other policy is default deny.
ALTER TABLE public.nexus_test_health_clears ENABLE ROW LEVEL SECURITY;

CREATE POLICY "service_role_full_access" ON public.nexus_test_health_clears
  FOR ALL TO service_role USING (true) WITH CHECK (true);

NOTIFY pgrst, 'reload schema';
