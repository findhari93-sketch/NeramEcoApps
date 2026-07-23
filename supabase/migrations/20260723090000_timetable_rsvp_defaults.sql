-- ============================================
-- TIMETABLE RSVP: DEFAULT-ATTENDING
--
-- Every student is attending every class unless they say otherwise. Only
-- opt-outs are stored, so the absence of a row IS "attending" and there is no
-- "no response" state to chase.
--
-- Two columns support that model:
--   reason_code   : a small closed set, so the teacher dashboard can chart WHY
--                   students miss classes instead of reading free text.
--   wants_catchup : the "send me the recording and the assignment" opt-in shown
--                   when declining. Defaults true, the helpful default.
--
-- `reason` stays as the optional free-text note, required only for 'other'.
--
-- The `response` CHECK is intentionally left alone: rows with response
-- 'attending' predate this model and are still valid to read. New opt-ins
-- delete the row rather than writing 'attending'.
--
-- Additive and idempotent.
-- ============================================

ALTER TABLE nexus_class_rsvp ADD COLUMN IF NOT EXISTS reason_code TEXT;
ALTER TABLE nexus_class_rsvp ADD COLUMN IF NOT EXISTS wants_catchup BOOLEAN NOT NULL DEFAULT true;

-- Closed set, matching the four options in the approved design. Extend by
-- widening this constraint and the array in lib/rsvp-reasons.ts together.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'nexus_class_rsvp_reason_code_check'
      AND conrelid = 'nexus_class_rsvp'::regclass
  ) THEN
    ALTER TABLE nexus_class_rsvp
      ADD CONSTRAINT nexus_class_rsvp_reason_code_check
      CHECK (reason_code IS NULL OR reason_code IN ('unwell', 'family', 'clash', 'other'));
  END IF;
END $$;

-- Teacher dashboards read "who opted out of this class", so index the lookup.
CREATE INDEX IF NOT EXISTS idx_nexus_rsvp_class_response
  ON nexus_class_rsvp(scheduled_class_id, response);

-- Backfill: existing opt-outs have free text but no code. Map the obvious
-- cases so the reason chart is not blank on day one, and leave anything
-- unrecognised as 'other' (its free text is preserved and still shown).
UPDATE nexus_class_rsvp
SET reason_code = CASE
  WHEN reason ILIKE '%fever%' OR reason ILIKE '%sick%' OR reason ILIKE '%unwell%'
    OR reason ILIKE '%health%' OR reason ILIKE '%hospital%' OR reason ILIKE '%ill%' THEN 'unwell'
  WHEN reason ILIKE '%exam%' OR reason ILIKE '%test%' OR reason ILIKE '%school%'
    OR reason ILIKE '%college%' OR reason ILIKE '%class%' THEN 'clash'
  WHEN reason ILIKE '%family%' OR reason ILIKE '%function%' OR reason ILIKE '%wedding%'
    OR reason ILIKE '%travel%' OR reason ILIKE '%marriage%' OR reason ILIKE '%home%' THEN 'family'
  ELSE 'other'
END
WHERE response = 'not_attending' AND reason_code IS NULL;
