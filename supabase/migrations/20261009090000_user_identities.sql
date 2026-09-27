-- ============================================================================
-- user_identities: every sign-in identity a person has used, one row each.
--
-- Why: users has ONE firebase_uid column. A person who signs in with Google and,
-- separately, with phone OTP has TWO Firebase uids. The old resolver overwrote
-- users.firebase_uid on each sign-in (phone match, then email match), so the
-- column flip-flopped and a phone-first sign-up minted a second row.
--
-- users.firebase_uid / users.ms_oid stay as the "primary" identity (RLS policies
-- and ~every query read them). This table is the lookup of ALL identities, so a
-- second uid resolves to the same person without overwriting the first.
--
-- Not a restructure: no column moves, nothing repoints. merge_user_records picks
-- user_id up automatically through _user_ref_columns (FK to users).
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.user_identities (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  provider      text NOT NULL CHECK (provider IN ('firebase', 'microsoft')),
  provider_uid  text NOT NULL,
  email         text,
  phone         text,
  created_at    timestamptz NOT NULL DEFAULT now(),
  last_used_at  timestamptz,
  CONSTRAINT user_identities_provider_uid_key UNIQUE (provider, provider_uid)
);

CREATE INDEX IF NOT EXISTS idx_user_identities_user ON public.user_identities (user_id);

COMMENT ON TABLE public.user_identities IS
  'Every sign-in identity (Firebase uid, Microsoft oid) a person has used. users.firebase_uid/ms_oid remain the primary; resolveIdentity() reads this first.';

-- Service role only. The apps read and write it through the admin client.
ALTER TABLE public.user_identities ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.user_identities FROM anon, authenticated;

-- Backfill from the primary columns. Parent sessions use a synthetic
-- 'parent:<uuid>' ms_oid and are not Microsoft identities.
INSERT INTO public.user_identities (user_id, provider, provider_uid, email, phone, last_used_at)
SELECT id, 'firebase', firebase_uid, email, phone, last_login_at
FROM public.users
WHERE firebase_uid IS NOT NULL AND firebase_uid <> ''
ON CONFLICT (provider, provider_uid) DO NOTHING;

INSERT INTO public.user_identities (user_id, provider, provider_uid, email, last_used_at)
SELECT id, 'microsoft', ms_oid, COALESCE(linked_classroom_email, email), nexus_last_login_at
FROM public.users
WHERE ms_oid IS NOT NULL AND ms_oid <> '' AND ms_oid NOT LIKE 'parent:%'
ON CONFLICT (provider, provider_uid) DO NOTHING;

NOTIFY pgrst, 'reload schema';
