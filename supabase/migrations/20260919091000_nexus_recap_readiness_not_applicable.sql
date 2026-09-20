-- A recap for a class where nothing was taught.
--
-- The 2026-09-18 "class" was the tutor announcing that classes were postponed
-- for school exams. The generator, told to write up to fifteen questions per
-- segment, wrote five about the announcement itself ("What was the primary
-- reason for postponing the class?"). The grounding floor correctly refused to
-- publish them, so the recap sat held, and seventeen students went on owing a
-- catch-up for a class that never happened. Held was the right verdict and the
-- wrong outcome: a hold asks a human to decide, and there is nothing here to
-- decide.
--
-- 'not_applicable' is that third answer. listRecapsNeedingReview asks for
-- ('held','failed') and so never shows it, and the sweep excuses the open
-- absences for the class when it sets this.
ALTER TABLE nexus_class_recaps
  DROP CONSTRAINT IF EXISTS nexus_class_recaps_readiness_check;

ALTER TABLE nexus_class_recaps
  ADD CONSTRAINT nexus_class_recaps_readiness_check
  CHECK (readiness IN ('pending', 'ready', 'held', 'failed', 'not_applicable'));

COMMENT ON COLUMN nexus_class_recaps.readiness IS
  'pending = the sweep has not finished; ready = servable; held/failed = a human is needed; not_applicable = the recording holds no teaching, so no recap is owed and the class is excused for everyone who missed it.';
