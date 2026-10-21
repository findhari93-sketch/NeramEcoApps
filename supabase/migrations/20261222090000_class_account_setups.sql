-- Class accounts made when staff verify an enrolment payment, and the batch
-- WhatsApp group students join from the setup guide.
--
-- class_account_setups: one row per student. Each step (Microsoft account,
-- license, link to the Neram record, year classroom, its Team, welcome email)
-- is saved as it finishes, so Retry resumes where a run stopped. No password is
-- ever stored: the start password is derived from the first name, and Microsoft
-- forces a change at the first sign-in. student_ticks holds what the student
-- confirmed in the guide ("I've joined the WhatsApp group").

CREATE TABLE IF NOT EXISTS public.class_account_setups (
  user_id UUID PRIMARY KEY REFERENCES public.users(id) ON DELETE CASCADE,
  upn TEXT NOT NULL,
  ms_oid TEXT,
  password_mode TEXT NOT NULL DEFAULT 'start' CHECK (password_mode IN ('start', 'random')),
  steps JSONB NOT NULL DEFAULT '{}'::jsonb,
  account_created_at TIMESTAMPTZ,
  -- Staff reset the password back to the start one: the guide shows it again.
  password_reset_at TIMESTAMPTZ,
  -- First seen changed by the student, so the guide stops showing the start password.
  password_changed_at TIMESTAMPTZ,
  student_ticks JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS class_account_setups_upn_key ON public.class_account_setups (lower(upn));

-- Service role only: no policies, so anon and signed-in clients read nothing.
ALTER TABLE public.class_account_setups ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE public.class_account_setups IS
  'Class account provisioning per enrolled student (Admin verify), resumable steps. Never holds a password.';

-- One WhatsApp group per exam batch (NATA/JEE 2027 = 2026-27). The setup guide
-- reads the batch of the student's classroom first, then users.academic_year.
ALTER TABLE public.academic_batches ADD COLUMN IF NOT EXISTS whatsapp_group_url TEXT;

COMMENT ON COLUMN public.academic_batches.whatsapp_group_url IS
  'The batch WhatsApp group invite (https://chat.whatsapp.com/...). Edited in Admin > Exam Batches.';

-- student_credentials held plain-text passwords behind a USING (true) policy, so
-- any client with the anon key could read them. Every reader is a server route
-- on the service role, which bypasses RLS, so dropping the policy closes it.
DROP POLICY IF EXISTS "Admin full access to student_credentials" ON public.student_credentials;
