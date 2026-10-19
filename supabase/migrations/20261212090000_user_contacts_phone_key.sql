-- ============================================================================
-- user_contacts + users.phone_key: find a family by any number it gave us.
--
-- Why: the account lookups compared phone strings exactly, so a student row
-- stored as '8682822310' (Nexus and staff write ten digits) was never found from
-- a Firebase token '+918682822310', and sign-in inserted a second row. 9 of the
-- 17 open Duplicates pairs on 2026-10-19 were exactly that shape.
--
--   users.phone_key   the last ten digits of users.phone, generated, indexed.
--                     Lookups match on this instead of guessing formats.
--   user_contacts     every other number or email a person is reachable on:
--                     a parent's number folded in by a family merge, the phone
--                     staff typed on an enrolment link, an older number of the
--                     same person. Lookups check it after users, so a parent who
--                     signs in with their own number lands on the student.
--
-- Backfill:
--   * the phone staff typed on a used enrolment link, when it is not the
--     student's own number (relation 'unknown', source 'enrolment_link');
--   * lead_profiles.parent_phone (relation 'parent').
-- ============================================================================

ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS phone_key text
  GENERATED ALWAYS AS (
    CASE WHEN length(regexp_replace(coalesce(phone, ''), '\D', '', 'g')) >= 10
         THEN right(regexp_replace(phone, '\D', '', 'g'), 10) END
  ) STORED;

CREATE INDEX IF NOT EXISTS idx_users_phone_key ON public.users (phone_key) WHERE phone_key IS NOT NULL;

COMMENT ON COLUMN public.users.phone_key IS
  'Last ten digits of phone. Match people on this, never on the raw phone string.';

CREATE TABLE IF NOT EXISTS public.user_contacts (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  kind          text NOT NULL CHECK (kind IN ('phone', 'email')),
  value         text NOT NULL,
  -- phone: last ten digits; email: lower-cased. What lookups compare.
  value_key     text NOT NULL,
  relation      text NOT NULL DEFAULT 'unknown' CHECK (relation IN ('self', 'parent', 'guardian', 'unknown')),
  name          text,
  source        text NOT NULL DEFAULT 'staff' CHECK (source IN ('merge', 'enrolment_link', 'lead_form', 'staff', 'otp')),
  verified      boolean NOT NULL DEFAULT false,
  merge_log_id  uuid,
  created_at    timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT user_contacts_one_per_person UNIQUE (user_id, kind, value_key)
);

CREATE INDEX IF NOT EXISTS idx_user_contacts_value_key ON public.user_contacts (kind, value_key);
CREATE INDEX IF NOT EXISTS idx_user_contacts_merge_log ON public.user_contacts (merge_log_id) WHERE merge_log_id IS NOT NULL;

ALTER TABLE public.user_contacts ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.user_contacts FROM anon, authenticated;
GRANT ALL ON public.user_contacts TO service_role;

COMMENT ON TABLE public.user_contacts IS
  'Extra phones and emails a person is reachable on (parent number, enrolment-link number, older numbers). Account lookups check it after users.';

-- The phone staff typed on an enrolment link, when the student enrolled on a
-- different number. Usually a parent's; we do not know, so 'unknown'.
INSERT INTO public.user_contacts (user_id, kind, value, value_key, relation, name, source, created_at)
SELECT DISTINCT ON (l.used_by, right(regexp_replace(l.student_phone, '\D', '', 'g'), 10))
       l.used_by, 'phone', btrim(l.student_phone),
       right(regexp_replace(l.student_phone, '\D', '', 'g'), 10),
       'unknown', NULL, 'enrolment_link', l.created_at
  FROM public.direct_enrollment_links l
  JOIN public.users u ON u.id = l.used_by
 WHERE l.used_by IS NOT NULL
   AND length(regexp_replace(coalesce(l.student_phone, ''), '\D', '', 'g')) >= 10
   AND right(regexp_replace(l.student_phone, '\D', '', 'g'), 10) IS DISTINCT FROM u.phone_key
 ORDER BY l.used_by, right(regexp_replace(l.student_phone, '\D', '', 'g'), 10), l.created_at
ON CONFLICT (user_id, kind, value_key) DO NOTHING;

-- The parent phone from the application form.
INSERT INTO public.user_contacts (user_id, kind, value, value_key, relation, name, source, created_at)
SELECT DISTINCT ON (lp.user_id, right(regexp_replace(lp.parent_phone, '\D', '', 'g'), 10))
       lp.user_id, 'phone', btrim(lp.parent_phone),
       right(regexp_replace(lp.parent_phone, '\D', '', 'g'), 10),
       'parent', NULLIF(btrim(coalesce(lp.father_name, '')), ''), 'lead_form', lp.created_at
  FROM public.lead_profiles lp
  JOIN public.users u ON u.id = lp.user_id
 WHERE lp.deleted_at IS NULL
   AND length(regexp_replace(coalesce(lp.parent_phone, ''), '\D', '', 'g')) >= 10
   AND right(regexp_replace(lp.parent_phone, '\D', '', 'g'), 10) IS DISTINCT FROM u.phone_key
 ORDER BY lp.user_id, right(regexp_replace(lp.parent_phone, '\D', '', 'g'), 10), lp.created_at
ON CONFLICT (user_id, kind, value_key) DO NOTHING;

NOTIFY pgrst, 'reload schema';
