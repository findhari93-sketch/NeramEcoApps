-- Merge two duplicate `users` rows into one.
--
-- Context: a student can end up with two rows, an @neramclasses.com row (often
-- ms_oid NULL) and a personal-Gmail row that holds the real ms_oid. We merge them
-- keeping the @neramclasses.com address as the primary identity and the Gmail in
-- users.personal_email, then hard-delete the loser.
--
-- CRITICAL design note: ~200 columns hold a user id WITHOUT a foreign key to
-- users (payments.user_id, lead_profiles.user_id, drawing_submissions.student_id,
-- most nexus_* student_id, the *_by actor columns, ...). A pg_constraint-only
-- repoint would silently orphan all of them. So we repoint by VALUE MATCH across
-- every uuid (and text user-ref) column: `WHERE col = loser_id` only ever touches
-- rows that literally hold the loser's globally-unique id, which is collision-safe
-- across FK and non-FK columns alike.

-- ---------------------------------------------------------------------------
-- Helper: before repointing a column that participates in a UNIQUE/PK index,
-- delete the loser rows that would collide with an existing winner row on the
-- FULL key (so a composite unique like (student_id, module_id) is respected and
-- a legitimately-distinct loser row is never wrongly dropped).
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION _merge_dedupe_unique(
  p_tbl text,
  p_refcol text,
  p_winner uuid,
  p_loser uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  idx record;
  keycols text[];
  othercols text[];
  pred text;
  oc text;
BEGIN
  FOR idx IN
    SELECT i.indexrelid, i.indkey
    FROM pg_catalog.pg_index i
    WHERE i.indrelid = ('public.' || p_tbl)::regclass
      AND i.indisunique
  LOOP
    SELECT array_agg(a.attname ORDER BY k.ord)
      INTO keycols
    FROM unnest(string_to_array(idx.indkey::text, ' ')::int[]) WITH ORDINALITY AS k(attnum, ord)
    JOIN pg_catalog.pg_attribute a
      ON a.attrelid = ('public.' || p_tbl)::regclass AND a.attnum = k.attnum;

    -- only indexes that include the user-ref column matter
    IF keycols IS NULL OR NOT (p_refcol = ANY(keycols)) THEN
      CONTINUE;
    END IF;

    othercols := array_remove(keycols, p_refcol);

    IF othercols IS NULL OR array_length(othercols, 1) IS NULL THEN
      -- unique on the ref column alone (1:1 satellite): drop loser's row if winner has one
      EXECUTE format(
        'DELETE FROM public.%I lo WHERE lo.%I = $2 AND EXISTS (SELECT 1 FROM public.%I wi WHERE wi.%I = $1)',
        p_tbl, p_refcol, p_tbl, p_refcol)
        USING p_winner, p_loser;
    ELSE
      pred := '';
      FOREACH oc IN ARRAY othercols LOOP
        pred := pred || format(' AND wi.%I IS NOT DISTINCT FROM lo.%I', oc, oc);
      END LOOP;
      EXECUTE format(
        'DELETE FROM public.%I lo WHERE lo.%I = $2 AND EXISTS (SELECT 1 FROM public.%I wi WHERE wi.%I = $1 %s)',
        p_tbl, p_refcol, p_tbl, p_refcol, pred)
        USING p_winner, p_loser;
    END IF;
  END LOOP;
END;
$$;

-- ---------------------------------------------------------------------------
-- The set of (table, column) that can hold a user id. A column qualifies if it
-- is FK-constrained to users(id) OR its name follows the user-reference naming
-- conventions used in this schema. Restricting to these (vs every uuid column)
-- avoids touching unrelated PKs/FKs while still covering every real reference.
-- Restricted to data_type='uuid': FK-to-users columns are always uuid, and the
-- text actor columns (archived_by, content created_by, student_profiles.student_id
-- = a roll number, ...) are admin/content refs that never hold a student's id.
-- ---------------------------------------------------------------------------
-- Built from pg_catalog directly (NOT information_schema): on some hosted
-- connections information_schema views fail to resolve their internal pg_catalog
-- refs (e.g. "public.pg_proc does not exist") inside a SET search_path function.
CREATE OR REPLACE VIEW _user_ref_columns AS
SELECT cl.relname AS table_name, a.attname AS column_name
FROM pg_catalog.pg_attribute a
JOIN pg_catalog.pg_class cl ON cl.oid = a.attrelid
JOIN pg_catalog.pg_namespace ns ON ns.oid = cl.relnamespace
JOIN pg_catalog.pg_type ty ON ty.oid = a.atttypid
WHERE ns.nspname = 'public'
  AND cl.relkind IN ('r', 'p')   -- ordinary + partitioned tables (excludes views)
  AND a.attnum > 0
  AND NOT a.attisdropped
  AND cl.relname <> 'users'
  AND ty.typname = 'uuid'
  AND (
    -- FK to users(id)
    EXISTS (
      SELECT 1
      FROM pg_catalog.pg_constraint con
      WHERE con.contype = 'f'
        AND con.confrelid = 'public.users'::regclass
        AND con.conrelid = cl.oid
        AND a.attnum = ANY (con.conkey)
    )
    -- or a conventional user-reference column name
    OR a.attname = 'user_id'
    OR a.attname LIKE '%\_user\_id'
    OR a.attname = 'student_id'
    OR a.attname = 'impersonator_id'
    OR a.attname LIKE '%\_by'
  );

-- ---------------------------------------------------------------------------
-- Read-only preview: how many rows of each table reference the loser. Used by the
-- "Review & merge" dialog so the admin sees exactly what will move.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION preview_user_merge(loser_id uuid)
RETURNS TABLE(ref_table text, ref_column text, rows int)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  col record;
  n int;
BEGIN
  FOR col IN SELECT table_name, column_name FROM _user_ref_columns LOOP
    EXECUTE format('SELECT count(*) FROM public.%I WHERE %I = $1', col.table_name, col.column_name)
      INTO n USING loser_id;
    IF n > 0 THEN
      ref_table := col.table_name; ref_column := col.column_name; rows := n;
      RETURN NEXT;
    END IF;
  END LOOP;
  RETURN;
END;
$$;

-- ---------------------------------------------------------------------------
-- The merge. Atomic (a function body is one transaction: any error rolls back).
-- Returns one row per table whose references were repointed, plus a final
-- 'users' row for the identity consolidation.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION merge_user_records(
  winner_id uuid,
  loser_id uuid,
  admin_id uuid DEFAULT NULL
)
RETURNS TABLE(ref_table text, ref_column text, repointed_rows int)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  w users%ROWTYPE;
  l users%ROWTYPE;
  col record;
  n int;
  total int := 0;
  loser_snapshot jsonb;
BEGIN
  IF winner_id = loser_id THEN
    RAISE EXCEPTION 'winner_id and loser_id must differ';
  END IF;

  SELECT * INTO w FROM users WHERE id = winner_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'winner % not found', winner_id; END IF;
  SELECT * INTO l FROM users WHERE id = loser_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'loser % not found (already merged?)', loser_id; END IF;

  -- (1) Curated 1:1 satellites: fill winner's gaps from loser, then drop loser's
  --     row so the generic repoint below is a clean no-op for that table.
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

  -- (2) Generic value-match repoint across every user-reference column.
  FOR col IN SELECT table_name, column_name FROM _user_ref_columns LOOP
    -- pre-empt unique/composite collisions before repointing
    PERFORM _merge_dedupe_unique(col.table_name, col.column_name, winner_id, loser_id);

    EXECUTE format('UPDATE public.%I SET %I = $1 WHERE %I = $2', col.table_name, col.column_name, col.column_name)
      USING winner_id, loser_id;
    GET DIAGNOSTICS n = ROW_COUNT;

    IF n > 0 THEN
      ref_table := col.table_name; ref_column := col.column_name; repointed_rows := n;
      total := total + n;
      RETURN NEXT;
    END IF;
  END LOOP;

  -- (3) Consolidate identity. Delete the loser FIRST so its UNIQUE values
  --     (email/ms_oid/firebase_uid/google_id/username) are free, then update winner.
  loser_snapshot := jsonb_build_object(
    'id', l.id, 'email', l.email, 'ms_oid', l.ms_oid,
    'firebase_uid', l.firebase_uid, 'google_id', l.google_id,
    'merged_at', now(), 'merged_by', admin_id
  );

  DELETE FROM users WHERE id = loser_id;

  UPDATE users SET
    -- primary identity = the @neramclasses.com / @neram.co.in address if either side has one
    email = CASE
      WHEN w.email ILIKE '%@neramclasses.com' OR w.email ILIKE '%@neram.co.in' THEN w.email
      WHEN l.email ILIKE '%@neramclasses.com' OR l.email ILIKE '%@neram.co.in' THEN l.email
      ELSE COALESCE(w.email, l.email)
    END,
    -- gmail / non-neram address kept as the personal email
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
$$;
