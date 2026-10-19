-- ============================================================================
-- CONFIRM WHO IS COMING: ASK, CHASE, RECORD
--
-- The day forecast reads "~23 of 41 likely" against "33 of 33 expected". The
-- gap is a guess built from attendance records. This table turns the guess into
-- answers: staff ask the students who often miss to confirm, the office calls
-- the ones who do not reply, and either side can record the answer.
--
-- ONLY "COMING" AND THE CHASE LOG LIVE HERE. "Not coming" already has two homes
-- and is never stored a third time:
--   one class      nexus_class_rsvp (response = 'not_attending', reason_code)
--   several days   nexus_student_away_windows
-- A student's status is derived in lib/attendance-confirm.ts, away first, then
-- not coming, then coming, then asked with no reply, then never asked. So a
-- reason filed anywhere takes a student off the office's call list with no
-- second write to keep in step.
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.nexus_attendance_confirmations (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  scheduled_class_id UUID NOT NULL REFERENCES public.nexus_scheduled_classes(id) ON DELETE CASCADE,
  student_id         UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  classroom_id       UUID NOT NULL REFERENCES public.nexus_classrooms(id) ON DELETE CASCADE,

  -- When staff asked through Neram Assistant. NULL when the row was made by a
  -- call or a recorded answer without anyone being messaged.
  asked_at           TIMESTAMPTZ,
  asked_by           UUID REFERENCES public.users(id) ON DELETE SET NULL,
  -- sendNudge's receipt string, verbatim ('chat+inapp', 'inapp', 'failed').
  channel            TEXT,

  -- "I'll be there". confirmed_by NULL means the student said so themselves; a
  -- staff id means somebody was told on the phone and typed it in.
  confirmed_at       TIMESTAMPTZ,
  confirmed_by       UUID REFERENCES public.users(id) ON DELETE SET NULL,

  -- The office's chase log. A call that ended in an answer also records the
  -- answer above (or an RSVP / away window); these columns only say we tried.
  last_called_at     TIMESTAMPTZ,
  last_called_by     UUID REFERENCES public.users(id) ON DELETE SET NULL,
  call_note          TEXT,
  call_count         SMALLINT NOT NULL DEFAULT 0,

  created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (scheduled_class_id, student_id)
);

-- The only hot read: every row for the classes on a month grid.
CREATE INDEX IF NOT EXISTS idx_attendance_confirmations_class
  ON public.nexus_attendance_confirmations (scheduled_class_id);

DROP TRIGGER IF EXISTS nexus_attendance_confirmations_updated_at
  ON public.nexus_attendance_confirmations;
CREATE TRIGGER nexus_attendance_confirmations_updated_at
  BEFORE UPDATE ON public.nexus_attendance_confirmations
  FOR EACH ROW EXECUTE FUNCTION update_nexus_updated_at();

-- Service-role only; authorization happens in the API layer, matching every
-- other Nexus table.
ALTER TABLE public.nexus_attendance_confirmations ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "service_role_full_access" ON public.nexus_attendance_confirmations;
CREATE POLICY "service_role_full_access" ON public.nexus_attendance_confirmations
  FOR ALL TO service_role USING (true) WITH CHECK (true);

COMMENT ON TABLE public.nexus_attendance_confirmations IS
  'Who was asked to confirm a class, who said they are coming, and the office''s call log. Not coming lives in nexus_class_rsvp and nexus_student_away_windows.';

-- The Assistant's "will you be in class?" message. ADD VALUE is safe inside the
-- migration's transaction on PG12+ so long as nothing uses the value in that
-- same transaction, and nothing here does.
ALTER TYPE notification_event_type ADD VALUE IF NOT EXISTS 'attendance_confirm';

NOTIFY pgrst, 'reload schema';
