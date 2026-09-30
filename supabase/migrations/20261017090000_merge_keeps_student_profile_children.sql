-- ============================================================================
-- merge_user_records: keep the loser's student-profile children.
--
-- When both records had a student profile, the merge deleted the loser's
-- student_profiles row. payments.student_profile_id has no ON DELETE action, so
-- any loser with a payment made the whole merge fail (23503, seen on prod
-- 2026-09-28 in the Duplicates queue). Without a payment it was worse: the
-- delete cascaded away post_enrollment_details, student_onboarding_progress and
-- student_credentials with no trace.
--
-- The function below is the live definition from 20261009090200 with one
-- change, marked CHANGED: rows that reference the loser's profile are repointed
-- to the survivor's profile before the delete, and the loser's profile is kept
-- in user_merge_log.loser_snapshot.student_profile. Signature, return shape and
-- grants are unchanged.
-- ============================================================================

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
  wp_id uuid;
  lp_id uuid;
  loser_profile jsonb;
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

  -- CHANGED: both people have a student profile. The loser's profile used to be
  -- deleted outright, which failed on payments.student_profile_id (no cascade)
  -- and would have cascaded away post_enrollment_details, onboarding progress
  -- and credentials. Every row that points at the loser's profile now moves to
  -- the survivor's profile first (the survivor's copy wins a unique clash), and
  -- the loser's profile is kept in user_merge_log.
  SELECT id INTO lp_id FROM student_profiles WHERE user_id = loser_id;
  SELECT id INTO wp_id FROM student_profiles WHERE user_id = winner_id;
  IF lp_id IS NOT NULL AND wp_id IS NOT NULL THEN
    SELECT to_jsonb(sp) INTO loser_profile FROM student_profiles sp WHERE sp.id = lp_id;

    FOR col IN
      SELECT c.conrelid::regclass::text AS table_name, a.attname::text AS column_name
        FROM pg_constraint c
        JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = c.conkey[1]
       WHERE c.contype = 'f'
         AND c.confrelid = 'public.student_profiles'::regclass
         AND array_length(c.conkey, 1) = 1
    LOOP
      PERFORM _merge_dedupe_unique(col.table_name, col.column_name, wp_id, lp_id);

      EXECUTE format('UPDATE public.%I SET %I = $1 WHERE %I = $2', col.table_name, col.column_name, col.column_name)
        USING wp_id, lp_id;
      GET DIAGNOSTICS n = ROW_COUNT;

      IF n > 0 THEN
        ref_table := col.table_name; ref_column := col.column_name; repointed_rows := n;
        total := total + n;
        repointed_list := repointed_list || jsonb_build_object('table', col.table_name, 'column', col.column_name, 'rows', n);
        RETURN NEXT;
      END IF;
    END LOOP;

    DELETE FROM student_profiles WHERE id = lp_id;
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
    ) || CASE WHEN loser_profile IS NULL THEN '{}'::jsonb ELSE jsonb_build_object('student_profile', loser_profile) END,
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
