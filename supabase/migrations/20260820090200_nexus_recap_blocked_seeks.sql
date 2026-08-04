-- ============================================================
-- WATCH HONESTY: count the skips that were refused
-- ------------------------------------------------------------
-- A tutor looking at a chapter report can already see how long a student
-- actually watched (watched_seconds, which only moves during real playback and
-- stays at zero if the scrubber is dragged). What they cannot see is intent.
--
-- A student who tried to jump ahead eleven times and was refused eleven times
-- has a watch record identical to one who never tried. Those are different
-- students and a tutor should be able to tell them apart, so the player reports
-- every refused seek and they are counted here.
--
-- Read it as a signal, not a verdict. A rewatch on a phone with a fat thumb
-- produces a few of these honestly. It is worth a conversation at eleven, not at
-- two.
--
-- Deliberately NOT folded into nexus_bump_recap_progress. That function has a
-- five-argument signature and callers pass positionally; adding a sixth
-- parameter with a default creates an overload that both five- and six-argument
-- calls match, and Postgres then refuses the call as ambiguous. A separate
-- increment is atomic on its own (col = col + n is a single statement) and costs
-- one more write on a route that is already writing.
-- ============================================================

ALTER TABLE nexus_class_recap_progress
  ADD COLUMN IF NOT EXISTS blocked_seeks INTEGER NOT NULL DEFAULT 0;

COMMENT ON COLUMN nexus_class_recap_progress.blocked_seeks IS
  'How many times this student tried to seek past an unpassed checkpoint and was snapped back. A signal about intent, not a score.';

-- Its own function so the increment stays a single statement. UPDATE-only,
-- never an upsert: a refused seek can only happen inside a session that already
-- created the progress row, so a missing row means something upstream is wrong
-- and inventing one here would hide it behind a plausible record.
CREATE OR REPLACE FUNCTION nexus_increment_blocked_seeks(
  p_student uuid, p_recap uuid, p_delta integer
) RETURNS void
LANGUAGE sql
AS $$
  UPDATE nexus_class_recap_progress
  SET blocked_seeks = blocked_seeks + GREATEST(0, COALESCE(p_delta, 0))
  WHERE student_id = p_student AND recap_id = p_recap;
$$;

GRANT EXECUTE ON FUNCTION nexus_increment_blocked_seeks(uuid, uuid, integer) TO service_role;

NOTIFY pgrst, 'reload schema';
