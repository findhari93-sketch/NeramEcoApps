-- _merge_dedupe_unique: compare unique keys the way the index itself does.
--
-- merge_user_records calls this helper before repointing each user-reference
-- column, to delete loser rows that would collide with a winner row on a unique
-- index. It built the collision key from pg_index.indkey alone and compared it
-- with IS NOT DISTINCT FROM, which deletes rows that could never actually clash:
--
--   1. PARTIAL unique indexes (a WHERE clause) were enforced as if total. On
--      2026-09-10 a student merge hit nexus_class_absences.uq_class_absences_one_active
--        (student_id, classroom_id) WHERE activated_on IS NOT NULL
--      which was read as "one absence per student per classroom", so every loser
--      absence in a classroom where the winner had any absence was deleted: 16
--      catch-up rows vanished silently (rebuilt by hand afterwards). The same shape
--      exists on nexus_test_attempts (one in_progress attempt per test), where it
--      would delete a loser's COMPLETED attempts on any test the winner had also
--      attempted, and on nexus_test_skip_reasons, nexus_test_access_requests,
--      student_registered_devices, user_avatars, nexus_parent_links,
--      classroom_access_requests and device_swap_requests.
--
--   2. EXPRESSION key parts (indkey 0) joined to no pg_attribute and fell out of
--      the key. question_sessions (question_id, user_id, exam_year,
--      COALESCE(session_label, '')) was therefore compared without the session
--      label, deleting sessions that differed only by label.
--
--   3. NULLs were treated as equal. A standard unique index treats NULLs as
--      distinct, so two rows with a NULL key part never clash, yet the loser's row
--      was deleted.
--
--   4. INCLUDE columns were treated as key columns (harmless but wrong).
--
-- The fix compares exactly what the index enforces:
--   - key columns only (indnkeyatts), with = unless the index is NULLS NOT DISTINCT;
--   - expression parts evaluated on each row and compared;
--   - a partial index scoped on BOTH sides, so only rows inside its WHERE clause
--     can collide;
--   - an expression that reads the user-reference column itself cannot be
--     compared ahead of the repoint (its value changes), so that index is left
--     to the repoint UPDATE: a real clash raises and merge_user_records, one
--     transaction, rolls back completely. Failing loudly beats deleting silently.
--
-- Signature, SECURITY DEFINER and search_path are unchanged, so merge_user_records
-- needs no change. This migration restores no data.

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
BEGIN
  FOR idx IN
    SELECT i.indexrelid,
           i.indkey,
           i.indnkeyatts,
           -- Read through jsonb so this also works on servers older than the
           -- NULLS NOT DISTINCT option (the key is simply absent there).
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

    -- Key columns only: INCLUDE columns take no part in uniqueness.
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
        -- Its value changes during the repoint, so it cannot be compared now.
        IF colexpr ~* ('\m' || p_refcol || '\M') THEN
          unsafe := true;
          EXIT;
        END IF;
        -- Unqualified column names in the expression bind to the one-row derived
        -- table built from the outer row, evaluating it for exactly that row.
        pred := pred || format(
          ' AND (SELECT %s FROM (SELECT wi.*) AS wi_e) %s (SELECT %s FROM (SELECT lo.*) AS lo_e)',
          colexpr, eq, colexpr);
      END IF;
    END LOOP;

    -- Only indexes that include the user-ref column as a plain key column matter.
    IF unsafe OR NOT covers_ref THEN
      CONTINUE;
    END IF;

    -- A partial index only constrains the rows its WHERE clause selects, so two
    -- rows collide only when BOTH fall inside it.
    IF idx.idxpred IS NULL THEN
      scope_lo := '';
      scope_wi := '';
    ELSE
      scope_lo := format(' AND EXISTS (SELECT 1 FROM (SELECT lo.*) AS lo_row WHERE %s)', idx.idxpred);
      scope_wi := format(' AND EXISTS (SELECT 1 FROM (SELECT wi.*) AS wi_row WHERE %s)', idx.idxpred);
    END IF;

    -- With no other key parts this is the 1:1 satellite case: drop the loser's row
    -- when the winner has one (inside the predicate, if there is one).
    EXECUTE format(
      'DELETE FROM public.%I lo WHERE lo.%I = $2%s AND EXISTS (SELECT 1 FROM public.%I wi WHERE wi.%I = $1%s%s)',
      p_tbl, p_refcol, scope_lo, p_tbl, p_refcol, pred, scope_wi)
      USING p_winner, p_loser;
  END LOOP;
END;
$$;

-- ---------------------------------------------------------------------------
-- Self-test. Runs inside this migration's transaction against a scratch table,
-- so the migration fails, and the function change rolls back with it, if any of
-- the bugs above ever returns. The scratch table is dropped on success.
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  w uuid := gen_random_uuid();
  l uuid := gen_random_uuid();
  room uuid := gen_random_uuid();
  module uuid := gen_random_uuid();
  left_over int;
BEGIN
  CREATE TABLE public._merge_dedupe_selftest (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    student_id uuid NOT NULL,
    classroom_id uuid NOT NULL,
    class_id uuid NOT NULL,
    tag text NOT NULL,
    module_id uuid,
    activated_on date
  );
  CREATE UNIQUE INDEX _merge_dedupe_selftest_class
    ON public._merge_dedupe_selftest (class_id, student_id);
  CREATE UNIQUE INDEX _merge_dedupe_selftest_one_active
    ON public._merge_dedupe_selftest (student_id, classroom_id) WHERE activated_on IS NOT NULL;
  CREATE UNIQUE INDEX _merge_dedupe_selftest_tag
    ON public._merge_dedupe_selftest (student_id, lower(tag));
  CREATE UNIQUE INDEX _merge_dedupe_selftest_module
    ON public._merge_dedupe_selftest (student_id, module_id);

  -- 1. Nothing collides. The winner has one inactive row; the loser has three
  --    inactive rows in the same classroom, on other classes, with other tags,
  --    and a NULL module like the winner. All three must survive: the partial
  --    index does not cover inactive rows, the tags differ, and NULLs are distinct.
  INSERT INTO public._merge_dedupe_selftest (student_id, classroom_id, class_id, tag)
    VALUES (w, room, gen_random_uuid(), 'winner');
  INSERT INTO public._merge_dedupe_selftest (student_id, classroom_id, class_id, tag)
    SELECT l, room, gen_random_uuid(), 'loser-' || g FROM generate_series(1, 3) AS g;

  PERFORM _merge_dedupe_unique('_merge_dedupe_selftest', 'student_id', w, l);
  SELECT count(*) INTO left_over FROM public._merge_dedupe_selftest WHERE student_id = l;
  IF left_over <> 3 THEN
    RAISE EXCEPTION 'dedupe deleted rows no index makes collide (% of 3 left)', left_over;
  END IF;

  -- 2. A real partial-index clash: both sides active in the same classroom.
  UPDATE public._merge_dedupe_selftest SET activated_on = current_date WHERE student_id = w;
  UPDATE public._merge_dedupe_selftest SET activated_on = current_date
    WHERE student_id = l AND tag = 'loser-1';

  PERFORM _merge_dedupe_unique('_merge_dedupe_selftest', 'student_id', w, l);
  SELECT count(*) INTO left_over FROM public._merge_dedupe_selftest WHERE student_id = l;
  IF left_over <> 2 THEN
    RAISE EXCEPTION 'dedupe missed a real partial-index clash (% of 2 left)', left_over;
  END IF;

  -- 3. A real expression clash: the same tag in a different case.
  INSERT INTO public._merge_dedupe_selftest (student_id, classroom_id, class_id, tag)
    VALUES (l, room, gen_random_uuid(), 'WINNER');

  PERFORM _merge_dedupe_unique('_merge_dedupe_selftest', 'student_id', w, l);
  SELECT count(*) INTO left_over FROM public._merge_dedupe_selftest WHERE student_id = l;
  IF left_over <> 2 THEN
    RAISE EXCEPTION 'dedupe missed a real expression-index clash (% of 2 left)', left_over;
  END IF;

  -- 4. A real total-index clash on a non-NULL key part.
  UPDATE public._merge_dedupe_selftest SET module_id = module WHERE student_id = w;
  INSERT INTO public._merge_dedupe_selftest (student_id, classroom_id, class_id, tag, module_id)
    VALUES (l, room, gen_random_uuid(), 'loser-module', module);

  PERFORM _merge_dedupe_unique('_merge_dedupe_selftest', 'student_id', w, l);
  SELECT count(*) INTO left_over FROM public._merge_dedupe_selftest WHERE student_id = l;
  IF left_over <> 2 THEN
    RAISE EXCEPTION 'dedupe missed a real total-index clash (% of 2 left)', left_over;
  END IF;

  DROP TABLE public._merge_dedupe_selftest;
END $$;
