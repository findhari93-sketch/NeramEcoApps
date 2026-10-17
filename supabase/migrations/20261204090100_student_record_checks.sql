-- Staff fill in a student's form and fees, the student checks it in Nexus, and
-- the office tracks second installments.
--
-- payments.idempotency_key
--   One key per payment line typed in Admin. A double click or a retry cannot
--   record the same money twice. Replaces "one office payment per student".
--
-- student_record_checks
--   One row per "Send to student to check". Only one live check per student.
--   fee_signature is a hash of the fee figures when sent, so a staff edit after
--   the student confirmed shows as 'changed'.
--
-- fee_correction_reports
--   "Something is wrong" from the student: what they say they paid, and a note.
--   Staff accept (through the Admin fee form, the single money writer) or reject.
--
-- fee_reminder_log
--   One row per reminder sent, staff or student. dedupe_key includes the due
--   date, so a reminder goes once and moving the date re-arms it.
--
-- All three tables are server-only (service role), like payment_installments.

ALTER TABLE public.payments
  ADD COLUMN IF NOT EXISTS idempotency_key TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS payments_idempotency_key_uidx
  ON public.payments (idempotency_key)
  WHERE idempotency_key IS NOT NULL;

-- ── student_record_checks ─────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.student_record_checks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  lead_profile_id UUID REFERENCES public.lead_profiles(id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'queued'
    CHECK (status IN ('queued', 'sent', 'opened', 'confirmed', 'correction_reported', 'changed', 'superseded', 'cancelled')),
  send_channel TEXT,
  send_attempts INT NOT NULL DEFAULT 0,
  sent_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
  sent_at TIMESTAMPTZ,
  opened_at TIMESTAMPTZ,
  confirmed_at TIMESTAMPTZ,
  confirmed_snapshot JSONB,
  fee_signature TEXT,
  details_updated_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_student_record_checks_user
  ON public.student_record_checks (user_id, created_at DESC);

-- One live check per student. A new send marks the old one superseded first.
CREATE UNIQUE INDEX IF NOT EXISTS student_record_checks_one_live_uidx
  ON public.student_record_checks (user_id)
  WHERE status IN ('queued', 'sent', 'opened', 'correction_reported');

DROP TRIGGER IF EXISTS student_record_checks_updated_at ON public.student_record_checks;
CREATE TRIGGER student_record_checks_updated_at
  BEFORE UPDATE ON public.student_record_checks
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ── fee_correction_reports ────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.fee_correction_reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  check_id UUID REFERENCES public.student_record_checks(id) ON DELETE SET NULL,
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  lead_profile_id UUID REFERENCES public.lead_profiles(id) ON DELETE SET NULL,
  items JSONB NOT NULL DEFAULT '[]'::jsonb,
  note TEXT NOT NULL CHECK (char_length(note) BETWEEN 1 AND 1000),
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'accepted', 'rejected')),
  resolved_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
  resolved_at TIMESTAMPTZ,
  resolution_note TEXT,
  resulting_payment_ids UUID[],
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_fee_correction_reports_open
  ON public.fee_correction_reports (created_at DESC)
  WHERE status = 'open';
CREATE INDEX IF NOT EXISTS idx_fee_correction_reports_user
  ON public.fee_correction_reports (user_id, created_at DESC);

-- ── fee_reminder_log ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.fee_reminder_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  installment_id UUID NOT NULL REFERENCES public.payment_installments(id) ON DELETE CASCADE,
  user_id UUID REFERENCES public.users(id) ON DELETE CASCADE,
  audience TEXT NOT NULL CHECK (audience IN ('staff', 'student')),
  kind TEXT NOT NULL CHECK (kind IN ('upcoming', 'due_today', 'overdue', 'overdue_weekly')),
  due_date DATE NOT NULL,
  dedupe_key TEXT NOT NULL UNIQUE,
  channel TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_fee_reminder_log_installment
  ON public.fee_reminder_log (installment_id, created_at DESC);

-- Installments are read by due date for Collections and the reminder crons.
CREATE INDEX IF NOT EXISTS idx_payment_installments_open_due
  ON public.payment_installments (due_date)
  WHERE status = 'pending';

-- ── security: server routes only ──────────────────────────────────────────────
ALTER TABLE public.student_record_checks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.fee_correction_reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.fee_reminder_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Service role manages student_record_checks" ON public.student_record_checks;
CREATE POLICY "Service role manages student_record_checks"
  ON public.student_record_checks FOR ALL TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Service role manages fee_correction_reports" ON public.fee_correction_reports;
CREATE POLICY "Service role manages fee_correction_reports"
  ON public.fee_correction_reports FOR ALL TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Service role manages fee_reminder_log" ON public.fee_reminder_log;
CREATE POLICY "Service role manages fee_reminder_log"
  ON public.fee_reminder_log FOR ALL TO service_role USING (true) WITH CHECK (true);

REVOKE ALL ON public.student_record_checks FROM anon, authenticated;
REVOKE ALL ON public.fee_correction_reports FROM anon, authenticated;
REVOKE ALL ON public.fee_reminder_log FROM anon, authenticated;
GRANT ALL ON public.student_record_checks TO service_role;
GRANT ALL ON public.fee_correction_reports TO service_role;
GRANT ALL ON public.fee_reminder_log TO service_role;

NOTIFY pgrst, 'reload schema';
