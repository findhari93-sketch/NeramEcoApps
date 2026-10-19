-- ============================================================================
-- merge_user_records v4: family merges, and every merge can be undone.
--
-- 1. p_relation says who the folded-in record was:
--      'self'     the same person (today's behaviour: the survivor's blanks are
--                 filled from the folded-in record);
--      'parent'   a parent's lead folded into their child: the child's own
--                 fields are never overwritten; the parent's phone, email and
--                 name land in user_contacts as relation 'parent';
--      'unknown'  an unnamed record ("User") on a family number: like 'parent',
--                 saved as relation 'unknown'.
--    In every mode the folded-in record's other numbers and emails are kept in
--    user_contacts, and its Firebase / Microsoft sign-ins are recorded in
--    user_identities for the survivor, so whoever signs in with them later lands
--    on the one family record instead of creating a new lead.
--
-- 2. Undo. user_merge_log now keeps what is needed to reverse the merge:
--      loser_row       the whole users row,
--      winner_before   the survivor's row before, winner_after the row after,
--      moved           for every repointed column, the keys of the rows moved,
--      deduped         the whole rows deleted because they clashed on a unique
--                      key (and the folded-in alumni / student profile rows),
--      added_identities  user_identities rows this merge created.
--    unmerge_user_records(log_id) puts it all back within 30 days. A survivor
--    column is only restored if nobody changed it since the merge.
--
-- _merge_dedupe_unique keeps its logic (20260910110000) and now RETURNS the rows
-- it deleted, as jsonb, so the merge can keep them. PERFORM callers are
-- unaffected.
-- ============================================================================

ALTER TABLE public.user_merge_log
  ADD COLUMN IF NOT EXISTS relation          text NOT NULL DEFAULT 'self',
  ADD COLUMN IF NOT EXISTS merged_via        text NOT NULL DEFAULT 'staff',
  ADD COLUMN IF NOT EXISTS candidate_id      uuid,
  ADD COLUMN IF NOT EXISTS evidence          jsonb,
  ADD COLUMN IF NOT EXISTS winner_before     jsonb,
  ADD COLUMN IF NOT EXISTS winner_after      jsonb,
  ADD COLUMN IF NOT EXISTS loser_row         jsonb,
  ADD COLUMN IF NOT EXISTS moved             jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS deduped           jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS added_identities  jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS undone_at         timestamptz,
  ADD COLUMN IF NOT EXISTS undone_by         uuid,
  ADD COLUMN IF NOT EXISTS undo_note         text;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'user_merge_log_relation_check') THEN
    ALTER TABLE public.user_merge_log
      ADD CONSTRAINT user_merge_log_relation_check CHECK (relation IN ('self', 'parent', 'unknown'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'user_merge_log_merged_via_check') THEN
    ALTER TABLE public.user_merge_log
      ADD CONSTRAINT user_merge_log_merged_via_check CHECK (merged_via IN ('staff', 'auto', 'signin'));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_user_merge_log_auto
  ON public.user_merge_log (merged_at DESC) WHERE merged_via = 'auto';

-- The queue learns why a pair matched, who the other record probably is, and
-- whether it may merge without a person. Filled by detection v2 (next migration).
ALTER TABLE public.user_duplicate_candidates
  ADD COLUMN IF NOT EXISTS evidence        jsonb,
  ADD COLUMN IF NOT EXISTS relation_guess  text,
  ADD COLUMN IF NOT EXISTS auto_ok         boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS blocked_reason  text,
  ADD COLUMN IF NOT EXISTS resolution      text,
  ADD COLUMN IF NOT EXISTS merge_log_id    uuid;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'user_duplicate_candidates_relation_guess_check') THEN
    ALTER TABLE public.user_duplicate_candidates
      ADD CONSTRAINT user_duplicate_candidates_relation_guess_check
      CHECK (relation_guess IS NULL OR relation_guess IN ('self', 'parent', 'unknown'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'user_duplicate_candidates_resolution_check') THEN
    ALTER TABLE public.user_duplicate_candidates
      ADD CONSTRAINT user_duplicate_candidates_resolution_check
      CHECK (resolution IS NULL OR resolution IN ('auto', 'staff'));
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------

-- Primary-key column names of a public table, or NULL when it has none.
CREATE OR REPLACE FUNCTION public._merge_pk_cols(p_tbl text)
RETURNS text[]
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  SELECT array_agg(a.attname::text ORDER BY a.attnum)
    FROM pg_catalog.pg_index i
    JOIN pg_catalog.pg_attribute a ON a.attrelid = i.indrelid AND a.attnum = ANY (i.indkey)
   WHERE i.indrelid = ('public.' || p_tbl)::regclass
     AND i.indisprimary;
$$;

-- Insertable column list of a public table (no generated or dropped columns).
CREATE OR REPLACE FUNCTION public._merge_insert_cols(p_tbl text)
RETURNS text
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  SELECT string_agg(quote_ident(a.attname), ', ' ORDER BY a.attnum)
    FROM pg_catalog.pg_attribute a
   WHERE a.attrelid = ('public.' || p_tbl)::regclass
     AND a.attnum > 0
     AND NOT a.attisdropped
     AND a.attgenerated = '';
$$;

-- Put whole rows back into a table. Returns how many went in. Strict mode lets a
-- unique clash raise instead of skipping the row.
CREATE OR REPLACE FUNCTION public._merge_reinsert(p_tbl text, p_rows jsonb, p_strict boolean DEFAULT false)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  cols text := public._merge_insert_cols(p_tbl);
  n int;
BEGIN
  IF p_rows IS NULL OR jsonb_array_length(p_rows) = 0 THEN
    RETURN 0;
  END IF;
  EXECUTE format(
    'INSERT INTO public.%I (%s) OVERRIDING SYSTEM VALUE SELECT %s FROM jsonb_populate_recordset(NULL::public.%I, $1)%s',
    p_tbl, cols, cols, p_tbl, CASE WHEN p_strict THEN '' ELSE ' ON CONFLICT DO NOTHING' END)
    USING p_rows;
  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN n;
END;
$$;

-- Repoint one column from p_old to p_new and return the keys of the moved rows:
-- the primary-key columns of each row, or the whole row when the table has no
-- primary key. After the update the keys still name exactly those rows.
CREATE OR REPLACE FUNCTION public._merge_move(p_tbl text, p_col text, p_new uuid, p_old uuid, OUT moved_rows int, OUT keys jsonb)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  pk text[] := public._merge_pk_cols(p_tbl);
BEGIN
  IF pk IS NOT NULL THEN
    EXECUTE format(
      'WITH u AS (UPDATE public.%I t SET %I = $1 WHERE %I = $2 RETURNING t.*)
       SELECT count(*)::int,
              COALESCE(jsonb_agg((SELECT jsonb_object_agg(e.key, e.value) FROM jsonb_each(to_jsonb(u)) e WHERE e.key = ANY ($3))), ''[]''::jsonb)
         FROM u',
      p_tbl, p_col, p_col)
      INTO moved_rows, keys
      USING p_new, p_old, pk;
  ELSE
    EXECUTE format(
      'WITH u AS (UPDATE public.%I t SET %I = $1 WHERE %I = $2 RETURNING t.*)
       SELECT count(*)::int, COALESCE(jsonb_agg(to_jsonb(u)), ''[]''::jsonb) FROM u',
      p_tbl, p_col, p_col)
      INTO moved_rows, keys
      USING p_new, p_old;
  END IF;
END;
$$;

-- _merge_dedupe_unique, same rules as 20260910110000, now returning the rows it
-- deleted. The return type changes, so the old function is dropped first;
-- merge_user_records calls it by name at run time, nothing else binds to it.
DROP FUNCTION IF EXISTS public._merge_dedupe_unique(text, text, uuid, uuid);

CREATE FUNCTION public._merge_dedupe_unique(
  p_tbl text,
  p_refcol text,
  p_winner uuid,
  p_loser uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  idx record;
  k int;
  keynum int;
  colname text;
  colexpr text;
  eq text;
  pred text;
  scope_lo text;
  scope_wi text;
  covers_ref boolean;
  unsafe boolean;
  gone jsonb;
  all_gone jsonb := '[]'::jsonb;
BEGIN
  FOR idx IN
    SELECT i.indexrelid,
           i.indkey,
           i.indnkeyatts,
           COALESCE((to_jsonb(i) ->> 'indnullsnotdistinct')::boolean, false) AS nulls_not_distinct,
           pg_catalog.pg_get_expr(i.indpred, i.indrelid) AS idxpred
    FROM pg_catalog.pg_index i
    WHERE i.indrelid = ('public.' || p_tbl)::regclass
      AND i.indisunique
  LOOP
    pred := '';
    covers_ref := false;
    unsafe := false;
    eq := CASE WHEN idx.nulls_not_distinct THEN 'IS NOT DISTINCT FROM' ELSE '=' END;

    FOR k IN 0 .. idx.indnkeyatts - 1 LOOP
      keynum := idx.indkey[k];
      IF keynum <> 0 THEN
        SELECT a.attname INTO colname
        FROM pg_catalog.pg_attribute a
        WHERE a.attrelid = ('public.' || p_tbl)::regclass AND a.attnum = keynum;

        IF colname = p_refcol THEN
          covers_ref := true;
        ELSE
          pred := pred || format(' AND wi.%I %s lo.%I', colname, eq, colname);
        END IF;
      ELSE
        colexpr := pg_catalog.pg_get_indexdef(idx.indexrelid, k + 1, true);
        IF colexpr ~* ('\m' || p_refcol || '\M') THEN
          unsafe := true;
          EXIT;
        END IF;
        pred := pred || format(
          ' AND (SELECT %s FROM (SELECT wi.*) AS wi_e) %s (SELECT %s FROM (SELECT lo.*) AS lo_e)',
          colexpr, eq, colexpr);
      END IF;
    END LOOP;

    IF unsafe OR NOT covers_ref THEN
      CONTINUE;
    END IF;

    IF idx.idxpred IS NULL THEN
      scope_lo := '';
      scope_wi := '';
    ELSE
      scope_lo := format(' AND EXISTS (SELECT 1 FROM (SELECT lo.*) AS lo_row WHERE %s)', idx.idxpred);
      scope_wi := format(' AND EXISTS (SELECT 1 FROM (SELECT wi.*) AS wi_row WHERE %s)', idx.idxpred);
    END IF;

    EXECUTE format(
      'WITH d AS (DELETE FROM public.%I lo WHERE lo.%I = $2%s AND EXISTS (SELECT 1 FROM public.%I wi WHERE wi.%I = $1%s%s) RETURNING lo.*)
       SELECT COALESCE(jsonb_agg(to_jsonb(d)), ''[]''::jsonb) FROM d',
      p_tbl, p_refcol, scope_lo, p_tbl, p_refcol, pred, scope_wi)
      INTO gone
      USING p_winner, p_loser;
    all_gone := all_gone || gone;
  END LOOP;

  RETURN all_gone;
END;
$$;

-- ---------------------------------------------------------------------------
-- merge_user_records v4
-- ---------------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.merge_user_records(uuid, uuid, uuid);

CREATE OR REPLACE FUNCTION public.merge_user_records(
  winner_id uuid,
  loser_id uuid,
  admin_id uuid DEFAULT NULL::uuid,
  p_relation text DEFAULT 'self',
  p_via text DEFAULT 'staff',
  p_evidence jsonb DEFAULT NULL,
  p_candidate_id uuid DEFAULT NULL
)
 RETURNS TABLE(ref_table text, ref_column text, repointed_rows integer)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  w users%ROWTYPE;
  l users%ROWTYPE;
  col record;
  mv record;
  gone jsonb;
  total int := 0;
  v_snapshot jsonb;
  repointed_list jsonb := '[]'::jsonb;
  moved_list jsonb := '[]'::jsonb;
  deduped_list jsonb := '[]'::jsonb;
  added_ids jsonb := '[]'::jsonb;
  new_id uuid;
  wp_id uuid;
  lp_id uuid;
  loser_profile jsonb;
  log_id uuid;
  is_family boolean := p_relation IN ('parent', 'unknown');
  contact_name text;
BEGIN
  IF winner_id = loser_id THEN
    RAISE EXCEPTION 'winner_id and loser_id must differ';
  END IF;
  IF p_relation NOT IN ('self', 'parent', 'unknown') THEN
    RAISE EXCEPTION 'relation must be self, parent or unknown (got %)', p_relation;
  END IF;
  IF p_via NOT IN ('staff', 'auto', 'signin') THEN
    RAISE EXCEPTION 'via must be staff, auto or signin (got %)', p_via;
  END IF;

  SELECT * INTO w FROM users WHERE id = winner_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'winner % not found', winner_id; END IF;
  SELECT * INTO l FROM users WHERE id = loser_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'loser % not found (already merged?)', loser_id; END IF;
  IF w.ms_oid IS NOT NULL AND l.ms_oid IS NOT NULL AND w.ms_oid <> l.ms_oid THEN
    RAISE EXCEPTION 'two different Microsoft accounts are two people; merge refused';
  END IF;

  -- The log row first, so contacts and identities written below can point at it.
  INSERT INTO user_merge_log (winner_id, loser_id, loser_snapshot, merged_by, relation, merged_via,
                              evidence, candidate_id, winner_before, loser_row)
  VALUES (winner_id, loser_id, '{}'::jsonb, admin_id, p_relation, p_via,
          p_evidence, p_candidate_id, to_jsonb(w), to_jsonb(l))
  RETURNING id INTO log_id;

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
      WITH d AS (DELETE FROM alumni_profiles WHERE user_id = loser_id RETURNING *)
      SELECT COALESCE(jsonb_agg(to_jsonb(d)), '[]'::jsonb) INTO gone FROM d;
      IF jsonb_array_length(gone) > 0 THEN
        deduped_list := deduped_list || jsonb_build_object('table', 'alumni_profiles', 'rows', gone);
      END IF;
    END IF;
  END IF;

  -- Both people have a student profile: move what points at the loser's profile
  -- to the survivor's, then drop the loser's profile (kept for undo).
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
      gone := _merge_dedupe_unique(col.table_name, col.column_name, wp_id, lp_id);
      IF jsonb_array_length(gone) > 0 THEN
        deduped_list := deduped_list || jsonb_build_object('table', col.table_name, 'rows', gone);
      END IF;

      SELECT * INTO mv FROM _merge_move(col.table_name, col.column_name, wp_id, lp_id);
      IF mv.moved_rows > 0 THEN
        ref_table := col.table_name; ref_column := col.column_name; repointed_rows := mv.moved_rows;
        total := total + mv.moved_rows;
        repointed_list := repointed_list || jsonb_build_object('table', col.table_name, 'column', col.column_name, 'rows', mv.moved_rows);
        moved_list := moved_list || jsonb_build_object('table', col.table_name, 'column', col.column_name,
                                                       'from', lp_id, 'to', wp_id, 'keys', mv.keys);
        RETURN NEXT;
      END IF;
    END LOOP;

    DELETE FROM student_profiles WHERE id = lp_id;
  END IF;

  FOR col IN SELECT table_name, column_name FROM _user_ref_columns LOOP
    gone := _merge_dedupe_unique(col.table_name, col.column_name, winner_id, loser_id);
    IF jsonb_array_length(gone) > 0 THEN
      deduped_list := deduped_list || jsonb_build_object('table', col.table_name, 'rows', gone);
    END IF;

    SELECT * INTO mv FROM _merge_move(col.table_name, col.column_name, winner_id, loser_id);
    IF mv.moved_rows > 0 THEN
      ref_table := col.table_name; ref_column := col.column_name; repointed_rows := mv.moved_rows;
      total := total + mv.moved_rows;
      repointed_list := repointed_list || jsonb_build_object('table', col.table_name, 'column', col.column_name, 'rows', mv.moved_rows);
      moved_list := moved_list || jsonb_build_object('table', col.table_name, 'column', col.column_name,
                                                     'from', loser_id, 'to', winner_id, 'keys', mv.keys);
      RETURN NEXT;
    END IF;
  END LOOP;

  -- The folded-in record's sign-ins resolve to the survivor from now on.
  IF l.firebase_uid IS NOT NULL AND NOT EXISTS (
       SELECT 1 FROM user_identities WHERE provider = 'firebase' AND provider_uid = l.firebase_uid) THEN
    INSERT INTO user_identities (user_id, provider, provider_uid, email, phone)
    VALUES (winner_id, 'firebase', l.firebase_uid, l.email, l.phone)
    RETURNING id INTO new_id;
    added_ids := added_ids || to_jsonb(new_id);
  END IF;
  IF l.ms_oid IS NOT NULL AND NOT EXISTS (
       SELECT 1 FROM user_identities WHERE provider = 'microsoft' AND provider_uid = l.ms_oid) THEN
    INSERT INTO user_identities (user_id, provider, provider_uid, email, phone)
    VALUES (winner_id, 'microsoft', l.ms_oid, l.email, l.phone)
    RETURNING id INTO new_id;
    added_ids := added_ids || to_jsonb(new_id);
  END IF;

  -- Keep the folded-in record's numbers and emails reachable on the survivor.
  contact_name := NULLIF(NULLIF(btrim(coalesce(l.name, '')), ''), 'User');
  IF l.phone_key IS NOT NULL AND l.phone_key IS DISTINCT FROM w.phone_key
     AND (is_family OR w.phone_key IS NOT NULL) THEN
    INSERT INTO user_contacts (user_id, kind, value, value_key, relation, name, source, verified, merge_log_id)
    VALUES (winner_id, 'phone', l.phone, l.phone_key, p_relation, contact_name, 'merge', coalesce(l.phone_verified, false), log_id)
    ON CONFLICT (user_id, kind, value_key) DO NOTHING;
  END IF;
  v_snapshot := jsonb_build_object(
    'id', l.id, 'email', l.email, 'ms_oid', l.ms_oid,
    'firebase_uid', l.firebase_uid, 'google_id', l.google_id,
    'merged_at', now(), 'merged_by', admin_id, 'relation', p_relation
  );

  UPDATE user_merge_log SET
    loser_snapshot = v_snapshot || jsonb_build_object(
      'name', l.name, 'phone', l.phone, 'user_type', l.user_type, 'created_at', l.created_at
    ) || CASE WHEN loser_profile IS NULL THEN '{}'::jsonb ELSE jsonb_build_object('student_profile', loser_profile) END,
    repointed = repointed_list,
    moved = moved_list,
    deduped = deduped_list,
    added_identities = added_ids
  WHERE id = log_id;

  -- Close the pair. Other open pairs that named the folded-in record now name the
  -- survivor, and wait for a person: their evidence was about the other row.
  UPDATE user_duplicate_candidates
     SET status = 'merged', resolved_by = admin_id, resolved_at = now(),
         resolution = CASE WHEN p_via = 'auto' THEN 'auto' ELSE 'staff' END,
         merge_log_id = log_id
   WHERE status = 'open'
     AND ((user_a = winner_id AND user_b = loser_id) OR (user_a = loser_id AND user_b = winner_id));

  DELETE FROM user_duplicate_candidates c
   WHERE c.status = 'open'
     AND (c.user_a = loser_id OR c.user_b = loser_id)
     AND EXISTS (
       SELECT 1 FROM user_duplicate_candidates d
        WHERE d.user_a = LEAST(CASE WHEN c.user_a = loser_id THEN winner_id ELSE c.user_a END, CASE WHEN c.user_b = loser_id THEN winner_id ELSE c.user_b END)
          AND d.user_b = GREATEST(CASE WHEN c.user_a = loser_id THEN winner_id ELSE c.user_a END, CASE WHEN c.user_b = loser_id THEN winner_id ELSE c.user_b END)
     );
  UPDATE user_duplicate_candidates
     SET user_a = LEAST(CASE WHEN user_a = loser_id THEN winner_id ELSE user_a END, CASE WHEN user_b = loser_id THEN winner_id ELSE user_b END),
         user_b = GREATEST(CASE WHEN user_a = loser_id THEN winner_id ELSE user_a END, CASE WHEN user_b = loser_id THEN winner_id ELSE user_b END),
         auto_ok = false,
         blocked_reason = 'recheck'
   WHERE status = 'open' AND (user_a = loser_id OR user_b = loser_id);
  DELETE FROM user_duplicate_candidates WHERE user_a = user_b;

  DELETE FROM users WHERE id = loser_id;

  IF is_family THEN
    -- The child's record stays the child's. Only the parent's history moved.
    UPDATE users SET
      metadata   = COALESCE(w.metadata, '{}'::jsonb)
                     || jsonb_build_object('merged_from',
                          COALESCE(w.metadata->'merged_from', '[]'::jsonb) || jsonb_build_array(v_snapshot)),
      updated_at = now()
    WHERE id = winner_id;
  ELSE
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
      name          = CASE WHEN NULLIF(btrim(coalesce(w.name, '')), '') IS NULL OR w.name = 'User'
                           THEN COALESCE(NULLIF(NULLIF(btrim(coalesce(l.name, '')), ''), 'User'), w.name)
                           ELSE w.name END,
      avatar_url    = COALESCE(w.avatar_url, l.avatar_url),
      academic_year = COALESCE(w.academic_year, l.academic_year),
      is_alumni     = (w.is_alumni OR l.is_alumni),
      metadata      = COALESCE(w.metadata, '{}'::jsonb)
                        || jsonb_build_object('merged_from',
                             COALESCE(w.metadata->'merged_from', '[]'::jsonb) || jsonb_build_array(v_snapshot)),
      updated_at    = now()
    WHERE id = winner_id;
  END IF;

  -- Emails of the folded-in record that did not end up on the kept record.
  INSERT INTO user_contacts (user_id, kind, value, value_key, relation, name, source, verified, merge_log_id)
  SELECT winner_id, 'email', e, lower(e), p_relation, contact_name, 'merge', false, log_id
    FROM unnest(ARRAY[l.email, l.personal_email]) AS e, users u
   WHERE u.id = winner_id
     AND e IS NOT NULL
     AND lower(e) IS DISTINCT FROM lower(u.email)
     AND lower(e) IS DISTINCT FROM lower(u.personal_email)
  ON CONFLICT (user_id, kind, value_key) DO NOTHING;

  UPDATE user_merge_log m SET winner_after = (SELECT to_jsonb(u) FROM users u WHERE u.id = m.winner_id)
   WHERE m.id = log_id;

  RAISE NOTICE 'merge_user_records: % rows repointed from % to % (%)', total, loser_id, winner_id, p_relation;

  ref_table := 'users'; ref_column := 'identity'; repointed_rows := 1;
  RETURN NEXT;
  ref_table := 'user_merge_log'; ref_column := log_id::text; repointed_rows := 0;
  RETURN NEXT;
  RETURN;
END;
$function$;

-- ---------------------------------------------------------------------------
-- unmerge_user_records: reverse a merge from its log row, within 30 days.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.unmerge_user_records(p_log_id uuid, p_admin uuid DEFAULT NULL, p_note text DEFAULT NULL)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  m user_merge_log%ROWTYPE;
  cur jsonb;
  patch jsonb := '{}'::jsonb;
  k text;
  cols text;
  item jsonb;
  keys jsonb[];
  n int;
  skip_cols text[] := ARRAY['id', 'created_at', 'updated_at'];
  lp jsonb;
BEGIN
  SELECT * INTO m FROM user_merge_log WHERE id = p_log_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'undo: merge % not found', p_log_id; END IF;
  IF m.undone_at IS NOT NULL THEN RAISE EXCEPTION 'undo: this merge was already undone'; END IF;
  IF m.loser_row IS NULL OR m.winner_before IS NULL OR m.winner_after IS NULL THEN
    RAISE EXCEPTION 'undo: this merge was made before undo existed and cannot be reversed';
  END IF;
  IF m.merged_at < now() - interval '30 days' THEN
    RAISE EXCEPTION 'undo: merges can only be undone within 30 days';
  END IF;
  IF EXISTS (SELECT 1 FROM users WHERE id = m.loser_id) THEN
    RAISE EXCEPTION 'undo: the folded-in record already exists again';
  END IF;
  SELECT to_jsonb(u) INTO cur FROM users u WHERE u.id = m.winner_id FOR UPDATE;
  IF cur IS NULL THEN
    RAISE EXCEPTION 'undo: the kept record no longer exists (merged again or deleted)';
  END IF;

  -- 1. The kept record: undo only what the merge changed and nobody touched since.
  FOR k IN SELECT jsonb_object_keys(m.winner_after) LOOP
    CONTINUE WHEN k = ANY (skip_cols);
    IF (cur -> k) IS NOT DISTINCT FROM (m.winner_after -> k)
       AND (m.winner_before -> k) IS DISTINCT FROM (m.winner_after -> k) THEN
      patch := patch || jsonb_build_object(k, m.winner_before -> k);
    END IF;
  END LOOP;
  IF patch <> '{}'::jsonb THEN
    SELECT string_agg(format('%I = r.%I', key, key), ', ') INTO cols
      FROM jsonb_object_keys(patch) AS key
     WHERE key IN (SELECT a.attname FROM pg_attribute a
                    WHERE a.attrelid = 'public.users'::regclass AND a.attnum > 0
                      AND NOT a.attisdropped AND a.attgenerated = '');
    IF cols IS NOT NULL THEN
      EXECUTE format('UPDATE users u SET %s FROM jsonb_populate_record(NULL::users, $1) r WHERE u.id = $2', cols)
        USING cur || patch, m.winner_id;
    END IF;
  END IF;

  -- 2. The folded-in record comes back with its own id.
  BEGIN
    n := _merge_reinsert('users', jsonb_build_array(m.loser_row), true);
  EXCEPTION WHEN unique_violation THEN
    RAISE EXCEPTION 'undo: another record now uses this record''s login, email or phone (%)', SQLERRM;
  END;
  IF n <> 1 THEN
    RAISE EXCEPTION 'undo: could not restore the folded-in record';
  END IF;

  -- 3. Its student profile, if the merge dropped one.
  lp := m.loser_snapshot -> 'student_profile';
  IF lp IS NOT NULL THEN
    PERFORM _merge_reinsert('student_profiles', jsonb_build_array(lp));
  END IF;

  -- 4. Rows that were deleted because they clashed with the kept record's rows.
  FOR item IN SELECT * FROM jsonb_array_elements(m.deduped) LOOP
    PERFORM _merge_reinsert(item ->> 'table', item -> 'rows');
  END LOOP;

  -- 5. Every moved row goes back, newest move first.
  FOR item IN SELECT e FROM jsonb_array_elements(m.moved) WITH ORDINALITY AS t(e, i) ORDER BY i DESC LOOP
    SELECT array_agg(x) INTO keys FROM jsonb_array_elements(item -> 'keys') AS x;
    CONTINUE WHEN keys IS NULL;
    EXECUTE format('UPDATE public.%I t SET %I = $1 WHERE %I = $2 AND to_jsonb(t) @> ANY ($3)',
                   item ->> 'table', item ->> 'column', item ->> 'column')
      USING (item ->> 'from')::uuid, (item ->> 'to')::uuid, keys;
  END LOOP;

  -- 6. What the merge added for the kept record.
  DELETE FROM user_contacts WHERE merge_log_id = m.id;
  DELETE FROM user_identities
   WHERE id IN (SELECT (x #>> '{}')::uuid FROM jsonb_array_elements(m.added_identities) AS x);

  -- 7. The pair waits for a person, and the nightly run will not merge it again.
  UPDATE user_duplicate_candidates
     SET status = 'open', resolved_by = NULL, resolved_at = NULL, resolution = NULL,
         merge_log_id = NULL, auto_ok = false, blocked_reason = 'undone',
         note = left(coalesce(p_note, 'Merge undone'), 500)
   WHERE user_a = LEAST(m.winner_id, m.loser_id) AND user_b = GREATEST(m.winner_id, m.loser_id);
  IF NOT FOUND THEN
    INSERT INTO user_duplicate_candidates (user_a, user_b, reason, confidence, status, detected_by, auto_ok, blocked_reason, note)
    VALUES (LEAST(m.winner_id, m.loser_id), GREATEST(m.winner_id, m.loser_id), 'staff', 'likely', 'open', 'staff',
            false, 'undone', left(coalesce(p_note, 'Merge undone'), 500))
    ON CONFLICT (user_a, user_b) DO NOTHING;
  END IF;

  UPDATE user_merge_log SET undone_at = now(), undone_by = p_admin, undo_note = p_note WHERE id = m.id;
  RETURN m.loser_id;
END;
$function$;

REVOKE ALL ON FUNCTION public.merge_user_records(uuid, uuid, uuid, text, text, jsonb, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.merge_user_records(uuid, uuid, uuid, text, text, jsonb, uuid) TO service_role;
REVOKE ALL ON FUNCTION public.unmerge_user_records(uuid, uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.unmerge_user_records(uuid, uuid, text) TO service_role;
REVOKE ALL ON FUNCTION public._merge_dedupe_unique(text, text, uuid, uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public._merge_reinsert(text, jsonb, boolean) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public._merge_move(text, text, uuid, uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public._merge_pk_cols(text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public._merge_insert_cols(text) FROM PUBLIC, anon, authenticated;

NOTIFY pgrst, 'reload schema';
