-- ============================================================================
-- user_merge_log: a durable record of every merge.
--
-- merge_user_records hard-deletes the loser. Until now the only trace was a
-- jsonb snapshot appended to the winner's users.metadata.merged_from, which a
-- later profile edit can overwrite and which no screen reads. This table is the
-- audit the User 360 timeline and the Duplicates queue read.
--
-- merge_user_records below is the live definition (identical on staging and
-- production, md5 85cbc2e9d19c68b0234735e2224c37d5 on 2026-09-25) with three
-- additions, marked ADDED:
--   1. the per-table repoint counts are collected,
--   2. a user_merge_log row is written in the same transaction,
--   3. any open duplicate candidate for the pair is closed as merged.
-- Signature and return shape are unchanged, so every caller keeps working.
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.user_merge_log (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  winner_id       uuid NOT NULL,
  loser_id        uuid NOT NULL,
  loser_snapshot  jsonb NOT NULL,
  repointed       jsonb NOT NULL DEFAULT '[]'::jsonb,
  merged_by       uuid,
  merged_at       timestamptz NOT NULL DEFAULT now()
);

-- winner_id is deliberately not a foreign key: a later merge may delete the
-- winner too, and the log must outlive both rows.
CREATE INDEX IF NOT EXISTS idx_user_merge_log_winner ON public.user_merge_log (winner_id, merged_at DESC);
CREATE INDEX IF NOT EXISTS idx_user_merge_log_loser ON public.user_merge_log (loser_id);

ALTER TABLE public.user_merge_log ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.user_merge_log FROM anon, authenticated;

CREATE OR REPLACE FUNCTION public.merge_user_records(winner_id uuid, loser_id uuid, admin_id uuid DEFAULT NULL::uuid)
 RETURNS TABLE(ref_table text, ref_column text, repointed_rows integer)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  w users%ROWTYPE;
  l users%ROWTYPE;
  col record;
  n int;
  total int := 0;
  loser_snapshot jsonb;
  repointed_list jsonb := '[]'::jsonb;  -- ADDED
BEGIN
  IF winner_id = loser_id THEN
    RAISE EXCEPTION 'winner_id and loser_id must differ';
  END IF;

  SELECT * INTO w FROM users WHERE id = winner_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'winner % not found', winner_id; END IF;
  SELECT * INTO l FROM users WHERE id = loser_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'loser % not found (already merged?)', loser_id; END IF;

  IF EXISTS (SELECT 1 FROM alumni_profiles WHERE user_id = loser_id) THEN
    IF EXISTS (SELECT 1 FROM alumni_profiles WHERE user_id = winner_id) THEN
      UPDATE alumni_profiles wp SET
        college_id              = COALESCE(wp.college_id, lp.college_id),
        college_name            = COALESCE(wp.college_name, lp.college_name),
        course_branch           = COALESCE(wp.course_branch, lp.course_branch),
        college_start_year      = COALESCE(wp.college_start_year, lp.college_start_year),
        expected_graduation_year= COALESCE(wp.expected_graduation_year, lp.expected_graduation_year),
        college_status          = COALESCE(wp.college_status, lp.college_status),
        linkedin_url            = COALESCE(wp.linkedin_url, lp.linkedin_url),
        instagram_url           = COALESCE(wp.instagram_url, lp.instagram_url),
        portfolio_url           = COALESCE(wp.portfolio_url, lp.portfolio_url),
        bio                     = COALESCE(wp.bio, lp.bio)
      FROM alumni_profiles lp
      WHERE wp.user_id = winner_id AND lp.user_id = loser_id;
      DELETE FROM alumni_profiles WHERE user_id = loser_id;
    END IF;
  END IF;

  IF EXISTS (SELECT 1 FROM student_profiles WHERE user_id = loser_id)
     AND EXISTS (SELECT 1 FROM student_profiles WHERE user_id = winner_id) THEN
    DELETE FROM student_profiles WHERE user_id = loser_id;
  END IF;

  FOR col IN SELECT table_name, column_name FROM _user_ref_columns LOOP
    PERFORM _merge_dedupe_unique(col.table_name, col.column_name, winner_id, loser_id);

    EXECUTE format('UPDATE public.%I SET %I = $1 WHERE %I = $2', col.table_name, col.column_name, col.column_name)
      USING winner_id, loser_id;
    GET DIAGNOSTICS n = ROW_COUNT;

    IF n > 0 THEN
      ref_table := col.table_name; ref_column := col.column_name; repointed_rows := n;
      total := total + n;
      repointed_list := repointed_list || jsonb_build_object('table', col.table_name, 'column', col.column_name, 'rows', n);  -- ADDED
      RETURN NEXT;
    END IF;
  END LOOP;

  loser_snapshot := jsonb_build_object(
    'id', l.id, 'email', l.email, 'ms_oid', l.ms_oid,
    'firebase_uid', l.firebase_uid, 'google_id', l.google_id,
    'merged_at', now(), 'merged_by', admin_id
  );

  -- ADDED: the durable record, before the loser row disappears.
  INSERT INTO user_merge_log (winner_id, loser_id, loser_snapshot, repointed, merged_by)
  VALUES (
    winner_id,
    loser_id,
    loser_snapshot || jsonb_build_object(
      'name', l.name, 'phone', l.phone, 'user_type', l.user_type, 'created_at', l.created_at
    ),
    repointed_list,
    admin_id
  );

  -- ADDED: close any duplicate candidate for this pair (table arrives with the
  -- duplicates queue; guarded so this migration does not depend on it).
  IF to_regclass('public.user_duplicate_candidates') IS NOT NULL THEN
    EXECUTE $q$
      UPDATE user_duplicate_candidates
         SET status = 'merged', resolved_by = $3, resolved_at = now()
       WHERE status = 'open'
         AND ((user_a = $1 AND user_b = $2) OR (user_a = $2 AND user_b = $1))
    $q$ USING winner_id, loser_id, admin_id;
    -- Candidates that pointed at the loser now point at the survivor.
    EXECUTE $q$
      DELETE FROM user_duplicate_candidates c
       WHERE c.status = 'open'
         AND (c.user_a = $2 OR c.user_b = $2)
         AND EXISTS (
           SELECT 1 FROM user_duplicate_candidates d
            WHERE d.user_a = LEAST(CASE WHEN c.user_a = $2 THEN $1 ELSE c.user_a END, CASE WHEN c.user_b = $2 THEN $1 ELSE c.user_b END)
              AND d.user_b = GREATEST(CASE WHEN c.user_a = $2 THEN $1 ELSE c.user_a END, CASE WHEN c.user_b = $2 THEN $1 ELSE c.user_b END)
         )
    $q$ USING winner_id, loser_id;
    EXECUTE $q$
      UPDATE user_duplicate_candidates
         SET user_a = LEAST(CASE WHEN user_a = $2 THEN $1 ELSE user_a END, CASE WHEN user_b = $2 THEN $1 ELSE user_b END),
             user_b = GREATEST(CASE WHEN user_a = $2 THEN $1 ELSE user_a END, CASE WHEN user_b = $2 THEN $1 ELSE user_b END)
       WHERE status = 'open' AND (user_a = $2 OR user_b = $2)
    $q$ USING winner_id, loser_id;
    EXECUTE $q$
      DELETE FROM user_duplicate_candidates WHERE user_a = user_b
    $q$;
  END IF;

  DELETE FROM users WHERE id = loser_id;

  UPDATE users SET
    email = CASE
      WHEN w.email ILIKE '%@neramclasses.com' OR w.email ILIKE '%@neram.co.in' THEN w.email
      WHEN l.email ILIKE '%@neramclasses.com' OR l.email ILIKE '%@neram.co.in' THEN l.email
      ELSE COALESCE(w.email, l.email)
    END,
    personal_email = COALESCE(
      w.personal_email,
      CASE WHEN l.email IS NOT NULL AND l.email NOT ILIKE '%@neramclasses.com' AND l.email NOT ILIKE '%@neram.co.in' THEN l.email END,
      CASE WHEN w.email IS NOT NULL AND w.email NOT ILIKE '%@neramclasses.com' AND w.email NOT ILIKE '%@neram.co.in' THEN w.email END
    ),
    ms_oid        = COALESCE(w.ms_oid, l.ms_oid),
    firebase_uid  = COALESCE(w.firebase_uid, l.firebase_uid),
    google_id     = COALESCE(w.google_id, l.google_id),
    username      = COALESCE(w.username, l.username),
    phone         = COALESCE(w.phone, l.phone),
    date_of_birth = COALESCE(w.date_of_birth, l.date_of_birth),
    gender        = COALESCE(w.gender, l.gender),
    first_name    = COALESCE(w.first_name, l.first_name),
    last_name     = COALESCE(w.last_name, l.last_name),
    name          = COALESCE(NULLIF(w.name, ''), NULLIF(l.name, ''), w.name),
    avatar_url    = COALESCE(w.avatar_url, l.avatar_url),
    academic_year = COALESCE(w.academic_year, l.academic_year),
    is_alumni     = (w.is_alumni OR l.is_alumni),
    metadata      = COALESCE(w.metadata, '{}'::jsonb)
                      || jsonb_build_object('merged_from',
                           COALESCE(w.metadata->'merged_from', '[]'::jsonb) || jsonb_build_array(loser_snapshot)),
    updated_at    = now()
  WHERE id = winner_id;

  RAISE NOTICE 'merge_user_records: % rows repointed from % to %', total, loser_id, winner_id;

  ref_table := 'users'; ref_column := 'identity'; repointed_rows := 1;
  RETURN NEXT;
  RETURN;
END;
$function$;

-- Same grants the function had: callable by the service role only.
REVOKE ALL ON FUNCTION public.merge_user_records(uuid, uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.merge_user_records(uuid, uuid, uuid) TO service_role;

NOTIFY pgrst, 'reload schema';
