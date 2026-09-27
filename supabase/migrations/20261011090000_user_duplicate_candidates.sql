-- ============================================================================
-- user_duplicate_candidates: pairs of rows that are probably one person.
--
-- A queue for a human, never an automatic merge (merge_user_records hard-deletes
-- the loser). Filled by:
--   * detect_user_duplicate_candidates(), a nightly SQL pass over strong keys
--     only (the same email in any casing or column, the same 10-digit phone, a
--     classroom email that names another row),
--   * the admin sweep's Microsoft directory pass (entra_upn),
--   * sign-in, when a phone OTP is refused because another row owns the phone.
--
-- user_a < user_b, one row per pair whatever its status, so a dismissed pair is
-- never proposed again. No foreign keys on the pair on purpose: merge_user_records
-- repoints every FK to users generically, which would scramble the pair; it
-- closes candidates itself (migration 20261009090200).
--
-- Deliberately NOT a signal: lead_profiles.parent_phone. Siblings share a
-- parent's number, so it would pair brothers and sisters.
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.user_duplicate_candidates (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_a       uuid NOT NULL,
  user_b       uuid NOT NULL,
  reason       text NOT NULL CHECK (reason IN (
                 'same_email', 'same_phone', 'classroom_email', 'enrollment_link_phone',
                 'entra_upn', 'phone_otp_conflict', 'application_form', 'staff')),
  confidence   text NOT NULL DEFAULT 'likely' CHECK (confidence IN ('strong', 'likely')),
  status       text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'merged', 'dismissed')),
  detected_by  text NOT NULL DEFAULT 'sweep' CHECK (detected_by IN ('sweep', 'signin', 'staff', 'import')),
  detected_at  timestamptz NOT NULL DEFAULT now(),
  resolved_by  uuid,
  resolved_at  timestamptz,
  note         text,
  CONSTRAINT user_duplicate_candidates_ordered CHECK (user_a < user_b),
  CONSTRAINT user_duplicate_candidates_pair_key UNIQUE (user_a, user_b)
);

CREATE INDEX IF NOT EXISTS idx_dup_candidates_open
  ON public.user_duplicate_candidates (detected_at DESC) WHERE status = 'open';
CREATE INDEX IF NOT EXISTS idx_dup_candidates_user_b ON public.user_duplicate_candidates (user_b);

ALTER TABLE public.user_duplicate_candidates ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.user_duplicate_candidates FROM anon, authenticated;

-- Pairs staff already rejected in the Nexus application-form flow stay rejected.
-- Guarded: that table exists on production but not on every environment.
DO $$
BEGIN
  IF to_regclass('public.nexus_application_form_dismissals') IS NOT NULL THEN
    INSERT INTO public.user_duplicate_candidates (user_a, user_b, reason, status, detected_by, resolved_by, resolved_at, note)
    SELECT LEAST(d.student_id, d.form_user_id), GREATEST(d.student_id, d.form_user_id),
           'application_form', 'dismissed', 'staff', d.dismissed_by, d.created_at,
           'Dismissed in the Nexus application-form link'
    FROM public.nexus_application_form_dismissals d
    WHERE d.student_id <> d.form_user_id
    ON CONFLICT (user_a, user_b) DO NOTHING;
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.detect_user_duplicate_candidates()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  added integer;
BEGIN
  WITH people AS (
    SELECT id, name, lower(email) AS email, lower(personal_email) AS personal_email,
           lower(linked_classroom_email) AS classroom_email,
           CASE WHEN length(regexp_replace(phone, '\D', '', 'g')) >= 10
                THEN right(regexp_replace(phone, '\D', '', 'g'), 10) END AS phone_key,
           ms_oid,
           lower(split_part(btrim(coalesce(name, '')), ' ', 1)) AS first_token
    FROM users
    WHERE user_type IN ('lead', 'student')
  ),
  pairs AS (
    SELECT a.id AS a, b.id AS b, 'same_email' AS reason
      FROM people a JOIN people b ON a.id < b.id
     WHERE a.email IS NOT NULL
       AND (a.email = b.email OR a.email = b.personal_email OR a.personal_email = b.email
            OR (a.personal_email IS NOT NULL AND a.personal_email = b.personal_email))
    UNION ALL
    SELECT a.id, b.id, 'classroom_email'
      FROM people a JOIN people b ON a.id <> b.id
     WHERE a.classroom_email IS NOT NULL AND a.classroom_email = b.email
    UNION ALL
    SELECT a.id, b.id, 'same_phone'
      FROM people a JOIN people b ON a.id < b.id
     WHERE a.phone_key IS NOT NULL AND a.phone_key = b.phone_key
    UNION ALL
    SELECT l.used_by, p.id, 'enrollment_link_phone'
      FROM direct_enrollment_links l
      JOIN people p ON p.phone_key = right(regexp_replace(l.student_phone, '\D', '', 'g'), 10)
     WHERE l.used_by IS NOT NULL AND l.used_by <> p.id
       AND length(regexp_replace(coalesce(l.student_phone, ''), '\D', '', 'g')) >= 10
  ),
  scored AS (
    SELECT DISTINCT ON (LEAST(p.a, p.b), GREATEST(p.a, p.b))
           LEAST(p.a, p.b) AS user_a, GREATEST(p.a, p.b) AS user_b, p.reason,
           CASE
             WHEN p.reason IN ('same_email', 'classroom_email') THEN 'strong'
             WHEN x.first_token = y.first_token AND x.first_token <> '' THEN 'strong'
             WHEN x.first_token IN ('', 'user') OR y.first_token IN ('', 'user') THEN 'strong'
             ELSE 'likely'
           END AS confidence
      FROM pairs p
      JOIN people x ON x.id = LEAST(p.a, p.b)
      JOIN people y ON y.id = GREATEST(p.a, p.b)
     -- Two different Microsoft accounts are two people; the merge refuses them.
     WHERE NOT (x.ms_oid IS NOT NULL AND y.ms_oid IS NOT NULL AND x.ms_oid <> y.ms_oid)
     ORDER BY LEAST(p.a, p.b), GREATEST(p.a, p.b),
              CASE p.reason WHEN 'same_email' THEN 1 WHEN 'classroom_email' THEN 2 WHEN 'same_phone' THEN 3 ELSE 4 END
  )
  INSERT INTO user_duplicate_candidates (user_a, user_b, reason, confidence, detected_by)
  SELECT user_a, user_b, reason, confidence, 'sweep' FROM scored
  ON CONFLICT (user_a, user_b) DO NOTHING;
  GET DIAGNOSTICS added = ROW_COUNT;

  -- A candidate whose row no longer exists (deleted outside a merge) is moot.
  DELETE FROM user_duplicate_candidates c
   WHERE c.status = 'open'
     AND (NOT EXISTS (SELECT 1 FROM users u WHERE u.id = c.user_a)
          OR NOT EXISTS (SELECT 1 FROM users u WHERE u.id = c.user_b));

  RETURN added;
END;
$$;

REVOKE ALL ON FUNCTION public.detect_user_duplicate_candidates() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.detect_user_duplicate_candidates() TO service_role;

SELECT public.detect_user_duplicate_candidates();

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    PERFORM cron.unschedule(jobid) FROM cron.job WHERE jobname = 'detect-user-duplicates';
    PERFORM cron.schedule('detect-user-duplicates', '30 21 * * *', 'SELECT public.detect_user_duplicate_candidates()');
  END IF;
END $$;

NOTIFY pgrst, 'reload schema';
