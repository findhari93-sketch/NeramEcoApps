-- ============================================
-- NEXUS CATCH-UP: AUTOMATIC CONGRATULATIONS
--
-- Congratulating used to be a teacher pressing "Congratulate in Teams", which
-- posted to the class group, named the same students again every time they
-- cleared one more class, and depended on someone remembering to press it.
-- Now a student is congratulated personally (Neram Assistant) the moment they
-- clear a missed class, and once more, bigger, when nothing is left.
--
-- congratulated_at is the claim. The sender stamps it with a conditional UPDATE
-- (WHERE congratulated_at IS NULL ... RETURNING) and only messages the rows it
-- won, so two writers racing on the same clear cannot both send.
--
-- The backfill marks every class cleared before today as already congratulated.
-- Without it the first run would message every student about every class they
-- ever caught up on (83 on prod when this was written).
-- ============================================

ALTER TABLE nexus_class_absences
  ADD COLUMN IF NOT EXISTS congratulated_at TIMESTAMPTZ;

UPDATE nexus_class_absences
SET congratulated_at = caught_up_at
WHERE caught_up_at IS NOT NULL
  AND congratulated_at IS NULL;

-- 'auto': the all-clear message sent by the system.
-- 'note': a teacher's personal note, sent 1:1 by Neram Assistant "From <teacher>".
-- 'teams' stays for the history rows written by the retired group post.
ALTER TABLE nexus_catchup_celebrations
  DROP CONSTRAINT IF EXISTS nexus_catchup_celebrations_source_check;
ALTER TABLE nexus_catchup_celebrations
  ADD CONSTRAINT nexus_catchup_celebrations_source_check
  CHECK (source IN ('teams', 'marked', 'auto', 'note'));

NOTIFY pgrst, 'reload schema';
