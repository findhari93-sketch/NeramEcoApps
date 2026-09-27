-- ============================================================================
-- Where a person came from, kept on the person.
--
-- Attribution (UTM, gclid, referral, landing page) reached lead_profiles and the
-- request tables, never users, so a Google sign-up who never filled the form had
-- no source at all. register-user now records, once, on account creation:
--   anonymous_id    the neram_anon_id cookie, linking pre-signup events
--   first_touch     the sanitised attribution cookie payload
--   first_touch_at  when it was recorded
-- Written only when empty; later campaigns do not overwrite the first touch.
-- ============================================================================

ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS anonymous_id text,
  ADD COLUMN IF NOT EXISTS first_touch jsonb,
  ADD COLUMN IF NOT EXISTS first_touch_at timestamptz;

CREATE INDEX IF NOT EXISTS idx_users_anonymous_id
  ON public.users (anonymous_id) WHERE anonymous_id IS NOT NULL;

NOTIFY pgrst, 'reload schema';
