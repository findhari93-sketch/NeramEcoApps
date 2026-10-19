-- ============================================================================
-- detect_user_duplicate_candidates v2: say why, guess who, decide if it is safe.
--
-- v1 called a pair "strong" whenever one name was blank or "User", and kept no
-- record of what matched. On 2026-10-19 the queue showed Kaira Rohit as a strong
-- match for a nameless lead: staff had typed +91 98189 97315 on her enrolment
-- link, she enrolled from her own number, and that typed number belonged to the
-- lead. Nothing on the page said so.
--
-- Every candidate now carries:
--   evidence        what matched and where it came from (the typed link phone,
--                   the link's student name and date, the contact's relation...),
--   relation_guess  'self'    the same person (given names agree, same email,
--                             or the classroom email names the other record),
--                   'parent'  a parent's lead: the lead filled the form with its
--                             own name as the father, or the names differ,
--                   'unknown' one record has no real name,
--   auto_ok         the nightly run may merge it without a person,
--   blocked_reason  why not, in a code the Admin page turns into words.
--
-- Family policy (decided 2026-10-19): one record per family, so sales never
-- calls a family whose child already enrolled. A parent's lead is folded into
-- the child as a family merge (merge_user_records p_relation 'parent').
--
-- Guardrails, any one keeps the pair for a person:
--   shared_number     the number is on 3+ records (siblings, an office line),
--   staff_number      a teacher or admin uses the number,
--   two_students      both records are students (siblings share a parent's phone),
--   guardian_account  either record is a parent account or an existing parent
--                     link already ties them,
--   names_differ      different names and nothing says "family" (no enrolment
--                     link or form naming the number, no surname that is the
--                     parent's given name): could be a parent or a sibling,
--   undone            a person undid this merge; it never auto-merges again.
--
-- Also matches the new user_contacts (parent numbers, enrolment-link numbers).
-- Re-running refreshes evidence and guardrails on open pairs; merged and
-- dismissed pairs are never touched.
-- ============================================================================

ALTER TABLE public.user_duplicate_candidates DROP CONSTRAINT IF EXISTS user_duplicate_candidates_reason_check;
ALTER TABLE public.user_duplicate_candidates ADD CONSTRAINT user_duplicate_candidates_reason_check
  CHECK (reason IN ('same_email', 'same_phone', 'classroom_email', 'enrollment_link_phone', 'contact_phone',
                    'entra_upn', 'phone_otp_conflict', 'application_form', 'staff'));

ALTER TABLE public.user_duplicate_candidates DROP CONSTRAINT IF EXISTS user_duplicate_candidates_detected_by_check;
ALTER TABLE public.user_duplicate_candidates ADD CONSTRAINT user_duplicate_candidates_detected_by_check
  CHECK (detected_by IN ('sweep', 'signin', 'staff', 'import', 'enrolment'));

-- ---------------------------------------------------------------------------
-- Name helpers. Tokens are lower-case letter runs of 3+ characters, so initials
-- ("N", "Y.") and titles ("Er") drop out and the first token is the given name.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public._name_tokens(p text)
RETURNS text[]
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT COALESCE(array_agg(t ORDER BY ord), '{}'::text[])
    FROM regexp_split_to_table(lower(COALESCE(p, '')), '[^a-z]+') WITH ORDINALITY AS x(t, ord)
   WHERE length(t) >= 3 AND t <> 'user';
$$;

-- Same given name: equal, one a prefix of the other ("yuvega" / "yuvegasri", 5+
-- letters so "hari" does not swallow "haribabu"), or a spelling variant
-- ("gayatri" / "gayathri").
CREATE OR REPLACE FUNCTION public._given_names_agree(a text[], b text[])
RETURNS boolean
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT a[1] IS NOT NULL AND b[1] IS NOT NULL AND (
    a[1] = b[1]
    OR (length(a[1]) >= 5 AND length(b[1]) >= 5 AND (a[1] LIKE b[1] || '%' OR b[1] LIKE a[1] || '%'))
    OR similarity(a[1], b[1]) >= 0.5
  );
$$;

-- The parent's given name is the child's surname, as in Tamil naming
-- ("Rajasenthilkumar Raju" -> "Khrishyaa Rajasenthil", "N Suresh Murugan" ->
-- "Keerthana SureshMurugan"). Siblings share a surname, not this, so a sibling
-- lead does not pass.
CREATE OR REPLACE FUNCTION public._is_parent_name_of(parent text[], child text[])
RETURNS boolean
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT parent[1] IS NOT NULL AND length(parent[1]) >= 4 AND EXISTS (
    SELECT 1 FROM unnest(child[2:]) AS t
     WHERE t = parent[1]
        OR (length(t) >= 5 AND (t LIKE parent[1] || '%' OR parent[1] LIKE t || '%'))
  );
$$;

-- Self-test against the real pairs that started this (2026-10-19).
DO $$
BEGIN
  IF NOT _given_names_agree(_name_tokens('Pranav Shankar'), _name_tokens('Pranav'))
     OR NOT _given_names_agree(_name_tokens('Yuvegasri Kannan'), _name_tokens('Yuvega Kannan'))
     OR NOT _given_names_agree(_name_tokens('Gayatri Kanade'), _name_tokens('Gayathri Amit'))
     OR NOT _given_names_agree(_name_tokens('Lakshita Navin Prasad'), _name_tokens('Lakshita Navinprasad'))
     OR NOT _given_names_agree(_name_tokens('Madhuyazhini Karthikeyan'), _name_tokens('Madhuyazhini KL')) THEN
    RAISE EXCEPTION 'self-test: given names that agree were not matched';
  END IF;
  IF _given_names_agree(_name_tokens('Keerthana SureshMurugan'), _name_tokens('N Suresh Murugan'))
     OR _given_names_agree(_name_tokens('Iswarya Palaniappan'), _name_tokens('Er Pradeep'))
     OR _given_names_agree(_name_tokens('Khrishyaa Rajasenthil'), _name_tokens('Rajasenthilkumar Raju'))
     OR _given_names_agree(_name_tokens('sivaranjith senthilkumar'), _name_tokens('Kala V'))
     OR _given_names_agree(_name_tokens('Kaira Rohit'), _name_tokens('User'))
     OR _given_names_agree(_name_tokens('Hari Heera'), _name_tokens('haribabu Manoharan')) THEN
    RAISE EXCEPTION 'self-test: different given names were matched';
  END IF;
  IF NOT _is_parent_name_of(_name_tokens('Rajasenthilkumar Raju'), _name_tokens('Khrishyaa Rajasenthil'))
     OR NOT _is_parent_name_of(_name_tokens('N Suresh Murugan'), _name_tokens('Keerthana SureshMurugan')) THEN
    RAISE EXCEPTION 'self-test: a parent name was not recognised';
  END IF;
  IF _is_parent_name_of(_name_tokens('Karthik SureshMurugan'), _name_tokens('Keerthana SureshMurugan'))
     OR _is_parent_name_of(_name_tokens('Er Pradeep'), _name_tokens('Iswarya Palaniappan')) THEN
    RAISE EXCEPTION 'self-test: a sibling or stranger passed as a parent';
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- Detection. p_user_id limits the pass to pairs that involve one person, for
-- the checks right after a phone is verified or an enrolment completes.
-- ---------------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.detect_user_duplicate_candidates();

CREATE OR REPLACE FUNCTION public.detect_user_duplicate_candidates(p_user_id uuid DEFAULT NULL)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  added integer;
BEGIN
  CREATE TEMP TABLE _dup_people ON COMMIT DROP AS
  SELECT u.id, u.name, u.user_type::text AS user_type,
         lower(u.email) AS email, lower(u.personal_email) AS personal_email,
         lower(u.linked_classroom_email) AS classroom_email,
         u.phone, u.phone_key, u.ms_oid, u.created_at,
         _name_tokens(u.name) AS tokens,
         (SELECT _name_tokens(lp.father_name) FROM lead_profiles lp
           WHERE lp.user_id = u.id AND lp.deleted_at IS NULL
           ORDER BY lp.created_at DESC LIMIT 1) AS father_tokens,
         COALESCE(u.metadata->>'account_holder', '') = 'parent' AS is_parent_account,
         -- Its own application or demo booking: a prospect in its own right.
         (EXISTS (SELECT 1 FROM lead_profiles lp WHERE lp.user_id = u.id AND lp.deleted_at IS NULL)
          OR EXISTS (SELECT 1 FROM demo_class_registrations d WHERE d.user_id = u.id)) AS has_own_activity
    FROM users u
   WHERE u.user_type IN ('lead', 'student');

  CREATE TEMP TABLE _dup_pairs ON COMMIT DROP AS
  SELECT a.id AS a, b.id AS b, 'same_email' AS reason, 1 AS prio,
         jsonb_build_object('kind', 'email', 'value',
           CASE WHEN a.email IN (b.email, b.personal_email) THEN a.email ELSE a.personal_email END) AS evidence,
         false AS family_hint
    FROM _dup_people a JOIN _dup_people b ON a.id < b.id
   WHERE a.email IS NOT NULL
     AND (a.email = b.email OR a.email = b.personal_email OR a.personal_email = b.email
          OR (a.personal_email IS NOT NULL AND a.personal_email = b.personal_email))
  UNION ALL
  SELECT a.id, b.id, 'classroom_email', 2,
         jsonb_build_object('kind', 'classroom_email', 'value', a.classroom_email, 'holder', a.id), false
    FROM _dup_people a JOIN _dup_people b ON a.id <> b.id
   WHERE a.classroom_email IS NOT NULL AND a.classroom_email = b.email
  UNION ALL
  SELECT a.id, b.id, 'same_phone', 3,
         jsonb_build_object('kind', 'phone', 'value', a.phone_key, 'a_phone', a.phone, 'b_phone', b.phone), false
    FROM _dup_people a JOIN _dup_people b ON a.id < b.id
   WHERE a.phone_key IS NOT NULL AND a.phone_key = b.phone_key
  UNION ALL
  SELECT l.used_by, p.id, 'enrollment_link_phone', 4,
         jsonb_build_object('kind', 'link_phone', 'value', l.student_phone, 'link_id', l.id,
                            'link_name', l.student_name, 'link_created_at', l.created_at,
                            'typed_for', l.used_by, 'holder', p.id),
         true
    FROM direct_enrollment_links l
    JOIN _dup_people p ON p.phone_key = right(regexp_replace(l.student_phone, '\D', '', 'g'), 10)
   WHERE l.used_by IS NOT NULL AND l.used_by <> p.id
     AND length(regexp_replace(COALESCE(l.student_phone, ''), '\D', '', 'g')) >= 10
     AND EXISTS (SELECT 1 FROM _dup_people q WHERE q.id = l.used_by)
  UNION ALL
  SELECT c.user_id, p.id, 'contact_phone', 5,
         jsonb_build_object('kind', 'contact', 'value', c.value, 'relation', c.relation,
                            'source', c.source, 'contact_of', c.user_id, 'holder', p.id),
         c.source IN ('enrolment_link', 'lead_form') OR c.relation IN ('parent', 'guardian')
    FROM user_contacts c
    JOIN _dup_people p ON p.phone_key = c.value_key
   WHERE c.kind = 'phone' AND c.user_id <> p.id
     AND EXISTS (SELECT 1 FROM _dup_people q WHERE q.id = c.user_id);

  IF p_user_id IS NOT NULL THEN
    DELETE FROM _dup_pairs WHERE a <> p_user_id AND b <> p_user_id;
  END IF;

  -- Parent links staff already made (user_guardian_links arrives in its own
  -- migration and may not exist yet everywhere).
  CREATE TEMP TABLE _dup_guardians (g uuid, s uuid) ON COMMIT DROP;
  IF to_regclass('public.user_guardian_links') IS NOT NULL THEN
    EXECUTE 'INSERT INTO _dup_guardians SELECT guardian_user_id, student_user_id
               FROM public.user_guardian_links WHERE revoked_at IS NULL';
  END IF;
  INSERT INTO _dup_guardians
  SELECT parent_user_id, student_user_id FROM nexus_parent_links WHERE is_active AND revoked_at IS NULL;

  -- How many records (any type) each number reaches, and whether staff use it.
  CREATE TEMP TABLE _dup_numbers ON COMMIT DROP AS
  SELECT k AS phone_key, count(DISTINCT uid) AS holders,
         bool_or(is_staff) AS staff_uses
    FROM (
      SELECT u.phone_key AS k, u.id AS uid, u.user_type::text IN ('teacher', 'admin') AS is_staff
        FROM users u WHERE u.phone_key IS NOT NULL
      UNION ALL
      SELECT c.value_key, c.user_id, false FROM user_contacts c WHERE c.kind = 'phone'
    ) s
   GROUP BY k;

  CREATE TEMP TABLE _dup_scored ON COMMIT DROP AS
  WITH grouped AS (
    SELECT LEAST(p.a, p.b) AS user_a, GREATEST(p.a, p.b) AS user_b,
           (array_agg(p.reason ORDER BY p.prio))[1] AS reason,
           (array_agg(p.evidence ORDER BY p.prio))[1] AS evidence,
           bool_or(p.family_hint) AS family_hint,
           bool_or(p.reason IN ('same_email', 'classroom_email')) AS email_match,
           array_agg(DISTINCT COALESCE(
             right(regexp_replace(p.evidence->>'value', '\D', '', 'g'), 10), '')) AS numbers
      FROM _dup_pairs p
     GROUP BY 1, 2
  ),
  shaped AS (
    SELECT g.*, x.tokens AS ta, y.tokens AS tb, x.user_type AS type_a, y.user_type AS type_b,
           x.father_tokens AS fa, y.father_tokens AS fb,
           (x.is_parent_account OR y.is_parent_account) AS any_parent_account,
           (cardinality(x.tokens) = 0) AS a_unnamed, (cardinality(y.tokens) = 0) AS b_unnamed,
           x.ms_oid AS oid_a, y.ms_oid AS oid_b,
           ((x.user_type = 'lead' AND x.has_own_activity) OR (y.user_type = 'lead' AND y.has_own_activity)) AS lead_active
      FROM grouped g
      JOIN _dup_people x ON x.id = g.user_a
      JOIN _dup_people y ON y.id = g.user_b
  ),
  classified AS (
    SELECT s.*,
           CASE
             -- A lead whose own form names it as the father: a parent's account.
             WHEN (s.type_a = 'lead' AND s.ta[1] IS NOT NULL AND s.ta[1] = ANY (COALESCE(s.fa, '{}')))
               OR (s.type_b = 'lead' AND s.tb[1] IS NOT NULL AND s.tb[1] = ANY (COALESCE(s.fb, '{}')))
               THEN 'parent'
             WHEN s.email_match THEN 'self'
             WHEN _given_names_agree(s.ta, s.tb) THEN 'self'
             -- A nameless record next to another lead is that person before they
             -- gave a name; next to a student it may be anyone in the family.
             WHEN (s.a_unnamed OR s.b_unnamed) AND (s.type_a = 'lead' AND s.type_b = 'lead') THEN 'self'
             WHEN s.a_unnamed OR s.b_unnamed THEN 'unknown'
             ELSE 'parent'
           END AS relation_guess,
           (_is_parent_name_of(s.ta, s.tb) OR _is_parent_name_of(s.tb, s.ta)) AS parent_named
      FROM shaped s
  )
  SELECT c.user_a, c.user_b, c.reason, c.evidence, c.relation_guess,
         CASE WHEN c.relation_guess = 'self' AND (c.email_match OR _given_names_agree(c.ta, c.tb))
              THEN 'strong' ELSE 'likely' END AS confidence,
         CASE
           WHEN c.oid_a IS NOT NULL AND c.oid_b IS NOT NULL AND c.oid_a <> c.oid_b THEN 'two_microsoft'
           WHEN c.type_a = 'student' AND c.type_b = 'student' AND NOT c.email_match THEN 'two_students'
           WHEN c.any_parent_account
             OR EXISTS (SELECT 1 FROM _dup_guardians k
                         WHERE (k.g = c.user_a AND k.s = c.user_b) OR (k.g = c.user_b AND k.s = c.user_a))
             THEN 'guardian_account'
           WHEN EXISTS (SELECT 1 FROM _dup_numbers n WHERE n.phone_key = ANY (c.numbers) AND n.staff_uses)
             THEN 'staff_number'
           WHEN NOT c.email_match
                AND EXISTS (SELECT 1 FROM _dup_numbers n WHERE n.phone_key = ANY (c.numbers) AND n.holders >= 3)
             THEN 'shared_number'
           -- A parent needs a sign tied to the lead itself (its name is the
           -- child's surname, or its own form names it as the father), or only
           -- the family number tying it AND no application or demo of its own: a
           -- sibling who signed in on the family phone is a prospect, not a parent.
           WHEN c.relation_guess = 'parent'
                AND NOT (COALESCE(c.parent_named, false)
                         OR (c.type_a = 'lead' AND COALESCE(c.ta[1] = ANY (COALESCE(c.fa, '{}')), false))
                         OR (c.type_b = 'lead' AND COALESCE(c.tb[1] = ANY (COALESCE(c.fb, '{}')), false))
                         OR (c.family_hint AND NOT c.lead_active))
             THEN 'names_differ'
         END AS blocked_reason
    FROM classified c;

  -- Two different Microsoft accounts are two people: never proposed (as in v1).
  DELETE FROM _dup_scored WHERE blocked_reason = 'two_microsoft';

  INSERT INTO user_duplicate_candidates AS d
         (user_a, user_b, reason, confidence, detected_by, evidence, relation_guess, auto_ok, blocked_reason)
  SELECT user_a, user_b, reason, confidence, 'sweep', evidence, relation_guess,
         blocked_reason IS NULL, blocked_reason
    FROM _dup_scored
  ON CONFLICT (user_a, user_b) DO UPDATE SET
         reason         = EXCLUDED.reason,
         confidence     = EXCLUDED.confidence,
         evidence       = EXCLUDED.evidence,
         relation_guess = EXCLUDED.relation_guess,
         auto_ok        = EXCLUDED.auto_ok,
         blocked_reason = EXCLUDED.blocked_reason
   WHERE d.status = 'open' AND COALESCE(d.blocked_reason, '') <> 'undone';
  GET DIAGNOSTICS added = ROW_COUNT;

  -- A candidate whose row no longer exists (deleted outside a merge) is moot.
  DELETE FROM user_duplicate_candidates c
   WHERE c.status = 'open'
     AND (p_user_id IS NULL OR c.user_a = p_user_id OR c.user_b = p_user_id)
     AND (NOT EXISTS (SELECT 1 FROM users u WHERE u.id = c.user_a)
          OR NOT EXISTS (SELECT 1 FROM users u WHERE u.id = c.user_b));

  DROP TABLE IF EXISTS _dup_scored, _dup_numbers, _dup_guardians, _dup_pairs, _dup_people;
  RETURN added;
END;
$$;

REVOKE ALL ON FUNCTION public.detect_user_duplicate_candidates(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.detect_user_duplicate_candidates(uuid) TO service_role;
REVOKE ALL ON FUNCTION public._name_tokens(text) FROM anon, authenticated;
REVOKE ALL ON FUNCTION public._given_names_agree(text[], text[]) FROM anon, authenticated;
REVOKE ALL ON FUNCTION public._is_parent_name_of(text[], text[]) FROM anon, authenticated;

-- Fill evidence and guardrails on the pairs already in the queue.
SELECT public.detect_user_duplicate_candidates();

NOTIFY pgrst, 'reload schema';
