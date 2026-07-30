-- The exam we are counting down to, and how sure we are of the date.
--
-- Three tables already claim to know when a student sits their exam, and they
-- disagree: nexus_exam_dates (the staff registry, 20260321_exam_tracking_
-- enhancement), the free-text nexus_teaching_plans.exam_date field
-- (20260703120000_nexus_plan_autoflow), and nexus_student_exam_attempts
-- .exam_date, which is what the student read off their own slot booking
-- (20260507_exam_schedule_v2). A "days left" counter that silently picks a
-- different one on each screen is worse than having no counter at all, because
-- the student, the parent and the teacher then argue about which number is real.
--
-- So: the course plan POINTS AT a registry row, and the registry learns to admit
-- when a date is a guess.
--
-- WHY CONFIDENCE BELONGS ON nexus_exam_dates AND NOT ON THE PLAN: the date is a
-- fact about the exam, not about the batch preparing for it. JEE Main 2027
-- Session 1 has not been announced by the NTA. Every plan aimed at it must hedge
-- identically, and when the official date is published ONE staff edit has to
-- correct every screen at once. Put the flag on the plan instead and the second
-- batch that targets the same exam will hedge differently from the first.
--
-- WHY 'confirmed' IS THE DEFAULT AND NOT 'expected': every row that exists today
-- was typed in from a published notification. Defaulting to 'expected' would
-- retroactively hedge the NATA windows students are sitting right now. New rows
-- created through the staff UI default to 'expected' at the form level, which is
-- the safe direction for data that does not exist yet.
--
-- DELIBERATELY NOT IN HERE:
--   * No `paper` column for JEE Paper 2A (B.Arch) vs 2B (B.Planning). Both papers
--     are conducted in the same session on the same day, so they are one date.
--     Which paper a batch writes is already answered by nexus_teaching_plans
--     .exam_type plus this row's `label`. A column would add a join key that
--     never changes the answer.
--   * No widening of the exam_type CHECK. 'jee' is already allowed, and JEE Main
--     Paper 2A is a jee row.
--   * NO partial unique index on (exam_type, year, phase, attempt_number). It
--     looks like the obvious guard against two rows for one exam, and it is
--     wrong: NATA deliberately holds MANY active rows per phase because the
--     candidate picks a slot (see 20260507_exam_schedule_v2). The plan's
--     target_exam_date_id is what removes the ambiguity, not a constraint.
--   * nexus_teaching_plans.exam_date is NOT dropped. A 'foundation' or 'custom'
--     plan has no row in a registry of NATIONAL exams, and a Class 10 foundation
--     batch still has an internal target. It becomes the last rung of the
--     resolution ladder and is always treated as unconfirmed, because nothing
--     records who typed it or how sure they were.
--
-- Additive and idempotent. No new tables, so no new RLS policies: both tables
-- already have RLS enabled with authorization enforced at the API layer, which
-- is how every Nexus table works (MSAL means auth.uid() is always null here).

-- 1. How sure are we ---------------------------------------------------------
ALTER TABLE nexus_exam_dates
  ADD COLUMN IF NOT EXISTS date_confidence TEXT NOT NULL DEFAULT 'confirmed',
  ADD COLUMN IF NOT EXISTS date_note       TEXT;

-- TEXT + CHECK rather than a Postgres enum: widening this to 'provisional' later
-- is a cheap drop-and-readd, which is the house rule (20260801092200_nexus_test_kind).
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'nexus_exam_dates_date_confidence_check'
      AND conrelid = 'nexus_exam_dates'::regclass
  ) THEN
    ALTER TABLE nexus_exam_dates
      ADD CONSTRAINT nexus_exam_dates_date_confidence_check
      CHECK (date_confidence IN ('expected', 'confirmed'));
  END IF;
END $$;

COMMENT ON COLUMN nexus_exam_dates.date_confidence IS
  'confirmed = copied from the conducting body''s published notification; safe to render as an exact weekday and date and as a precise day count. expected = our own estimate from previous years; rendered hedged ("about six months to go", plus a visible "Expected date" marker) and never as a precise countdown. Defaults to confirmed because every row predating this column came from a real notification. Flipping ONE row to confirmed is the single edit that turns a hedged countdown into a firm one on every student, parent and teacher screen simultaneously.';

COMMENT ON COLUMN nexus_exam_dates.date_note IS
  'Why the date is what it is, shown verbatim to students and parents beneath an expected date. One sentence, true, no em dashes (house content rule). Example: "NTA has not announced Session 1 yet. For the last three years Paper 2A has fallen in the third week of January." Read by anxious sixteen year olds and their parents, so it is a promise, not a disclaimer.';

-- 2. The plan points at the exam ---------------------------------------------
ALTER TABLE nexus_teaching_plans
  ADD COLUMN IF NOT EXISTS target_exam_date_id UUID
    REFERENCES nexus_exam_dates(id) ON DELETE SET NULL;

-- The hot query is "which exam does this classroom's active plan target", which
-- reads plan -> exam through the FK embed. This index serves the reverse
-- question, "which plans break if I delete this date", asked by the staff UI.
CREATE INDEX IF NOT EXISTS idx_nexus_teaching_plans_target_exam_date
  ON nexus_teaching_plans(target_exam_date_id)
  WHERE target_exam_date_id IS NOT NULL;

COMMENT ON COLUMN nexus_teaching_plans.target_exam_date_id IS
  'The nexus_exam_dates row this season prepares for. Set it and the countdown on every student, parent and teacher screen resolves through that one row, so announcing the official date is one edit in one place. ON DELETE SET NULL and not CASCADE, deliberately: soft-deleting an exam date (is_active = false) must never remove a season of teaching, and a hard delete must degrade the plan to its own exam_date fallback rather than take the plan with it. A resolver MUST also check the target row''s is_active, because a soft delete leaves this pointer intact.';

COMMENT ON COLUMN nexus_teaching_plans.exam_date IS
  'Manual fallback target date, used only when target_exam_date_id is NULL: foundation and custom plans, which have no row in a registry of national exams. ALWAYS treated as unconfirmed by the countdown resolver, because nothing here records who typed it or how sure they were. For nata/jee plans prefer target_exam_date_id. Kept rather than dropped so no existing plan silently loses its date; revisit dropping it only once every live nata/jee plan has a target.';

-- 3. Reload the PostgREST schema cache ---------------------------------------
-- Required before the plan -> exam FK embed used by the dashboards resolves.
-- Without this the dashboards 400 with "could not find a relationship".
NOTIFY pgrst, 'reload schema';
