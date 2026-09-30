-- ============================================================================
-- Exam season on every person, and exact counts for the admin People page.
--
-- The /crm page counted people by downloading rows and counting them in
-- JavaScript, so every number stopped at PostgREST's 1,000-row limit, and it had
-- no way to show "people writing the 2027 exam": on prod (2026-09-28) only 261
-- of 1,840 current people had a batch or a stated exam year.
--
--   exam_year          the exam this person is preparing for:
--                        1. their batch       (academic_year '2026-27' -> 2027)
--                        2. the year they gave (lead_profiles.target_exam_year,
--                                               else user_exam_profiles.planning_year)
--                        3. their sign-up date: a season runs 1 July to 30 June
--                           (India time), so a sign-up on 30 June 2026 counts
--                           as the 2026 exam and one on 1 July 2026 as 2027
--   exam_year_source   batch | stated | signup (signup means estimated)
--
-- Both columns are appended at the end, so CREATE OR REPLACE keeps the
-- dependent views (user_journey_view, crm_follow_ups, crm_conversion_monthly).
-- The body is 20261010090100 unchanged apart from the lines marked ADDED.
-- TypeScript mirror: deriveExamYear in packages/database/src/utils/lifecycle-rules.ts.
--
-- crm_people_breakdown() returns grouped counts (a few hundred rows at most) so
-- the page can show exact season, activity and stage numbers in one call.
-- ============================================================================

CREATE OR REPLACE VIEW public.user_lifecycle_view
WITH (security_invoker = true) AS
SELECT
  -- ── user_journey_view columns, same names and order ──────────────────────
  u.id,
  u.name,
  u.first_name,
  u.last_name,
  u.email,
  u.phone,
  u.avatar_url,
  u.user_type,
  u.status,
  u.phone_verified,
  u.email_verified,
  u.created_at,
  u.updated_at,
  u.last_login_at,
  u.preferred_language,
  u.linked_classroom_email,
  u.is_disabled,
  u.lifecycle_status,
  u.archived_at,
  u.archived_by,
  u.archived_reason,
  u.academic_year,
  u.exam_status,
  lp.id AS lead_profile_id,
  lp.application_number,
  lp.status AS application_status,
  lp.applicant_category,
  lp.interest_course,
  lp.selected_center_id,
  lp.learning_mode,
  lp.city,
  lp.state,
  lp.country,
  lp.pincode,
  lp.admin_notes,
  lp.reviewed_by,
  lp.reviewed_at,
  lp.assigned_fee,
  lp.final_fee,
  lp.payment_scheme,
  lp.form_step_completed,
  lp.created_at AS application_created_at,
  lp.contacted_status,
  lp.target_exam_year,
  COALESCE(demo.registration_count, 0) AS demo_registration_count,
  COALESCE(demo.has_demo_registration, false) AS has_demo_registration,
  demo.latest_demo_status,
  COALESCE(demo.demo_attended, false) AS demo_attended,
  COALESCE(demo.demo_survey_completed, false) AS demo_survey_completed,
  COALESCE(pay.total_paid, 0::numeric) AS total_paid,
  pay.latest_payment_status AS payment_status,
  COALESCE(pay.has_pending_payment, false) AS has_pending_payment,
  COALESCE(pay.payment_count, 0) AS payment_count,
  sp.id AS student_profile_id,
  sp.enrollment_date,
  sp.batch_id,
  sp.course_id AS student_course_id,
  os.status AS onboarding_status,
  os.completed_at AS onboarding_completed_at,
  COALESCE(os.questions_answered, 0) AS onboarding_questions_answered,
  CASE
    WHEN sp.id IS NOT NULL THEN 'enrolled'
    WHEN pay.total_paid > 0 AND pay.latest_payment_status = 'paid'::payment_status THEN 'payment_complete'
    WHEN lp.status = 'approved'::application_status THEN 'admin_approved'
    WHEN lp.status = ANY (ARRAY['submitted'::application_status, 'under_review'::application_status, 'pending_verification'::application_status]) THEN 'application_submitted'
    WHEN demo.has_attended = true THEN 'demo_attended'
    WHEN demo.registration_count > 0 THEN 'demo_requested'
    WHEN u.phone_verified = true THEN 'phone_verified'
    ELSE 'new_lead'
  END AS pipeline_stage,

  -- ── identity ─────────────────────────────────────────────────────────────
  (u.firebase_uid IS NOT NULL OR EXISTS (
     SELECT 1 FROM user_identities ui WHERE ui.user_id = u.id AND ui.provider = 'firebase'
  )) AS has_firebase,
  (u.ms_oid IS NOT NULL AND u.ms_oid NOT LIKE 'parent:%') AS has_microsoft,
  u.personal_email,
  u.first_touch,

  -- ── the four dimensions ──────────────────────────────────────────────────
  CASE WHEN u.is_disabled THEN 'deactivated' ELSE 'active' END AS account_status,

  CASE
    WHEN u.is_alumni THEN 'alumni'
    WHEN u.lifecycle_status = 'archived' THEN 'archived'
    WHEN enr.classroom_id IS NOT NULL AND enr.participation_status = 'dormant' AND enr.dormant_source = 'staff' THEN 'paused'
    WHEN enr.classroom_id IS NOT NULL AND u.nexus_entered_at IS NOT NULL THEN 'active_student'
    WHEN enr.classroom_id IS NOT NULL OR sp.id IS NOT NULL
         OR lp.status = ANY (ARRAY['enrolled'::application_status, 'partial_payment'::application_status]) THEN 'enrolled'
    WHEN lp.status = ANY (ARRAY['submitted'::application_status, 'under_review'::application_status, 'pending_verification'::application_status, 'approved'::application_status]) THEN 'applicant'
    WHEN lp.id IS NOT NULL OR u.phone_verified OR COALESCE(demo.registration_count, 0) > 0 THEN 'lead'
    ELSE 'prospect'
  END AS lifecycle_stage,

  CASE
    WHEN sp.id IS NOT NULL THEN 'enrolled'
    WHEN pay.total_paid > 0 AND pay.latest_payment_status = 'paid'::payment_status THEN 'payment_complete'
    WHEN lp.status = 'approved'::application_status THEN 'admin_approved'
    WHEN lp.status = ANY (ARRAY['submitted'::application_status, 'under_review'::application_status, 'pending_verification'::application_status]) THEN 'application_submitted'
    WHEN demo.has_attended = true THEN 'demo_attended'
    WHEN demo.registration_count > 0 THEN 'demo_requested'
    WHEN u.phone_verified = true THEN 'phone_verified'
    ELSE 'new_lead'
  END AS crm_stage,

  CASE
    WHEN u.created_at > now() - interval '7 days' THEN 'new'
    WHEN u.last_meaningful_activity_at >= now() - interval '7 days' THEN 'engaged'
    WHEN u.last_meaningful_activity_at >= now() - interval '30 days' THEN 'low'
    WHEN u.last_meaningful_activity_at >= now() - interval '90 days' THEN 'inactive'
    ELSE 'dormant'
  END AS engagement,
  u.last_meaningful_activity_at,
  u.last_meaningful_activity_source,

  -- ── learner ──────────────────────────────────────────────────────────────
  u.student_program AS preparation_goal,
  ARRAY(
    SELECT DISTINCT x FROM unnest(ARRAY[
      CASE WHEN lp.interest_course IN ('nata', 'both') THEN 'NATA' END,
      CASE WHEN lp.interest_course IN ('jee_paper2', 'both') THEN 'JEE' END,
      CASE WHEN uep.nata_status IN ('attempted', 'applied_waiting', 'planning_to_apply') THEN 'NATA' END
    ]) AS x WHERE x IS NOT NULL ORDER BY x
  ) AS target_exams,
  COALESCE(lp.target_exam_year, uep.planning_year) AS target_year,
  enr.current_standard,
  ARRAY_REMOVE(ARRAY[
    CASE WHEN u.name IS NULL OR btrim(u.name) = '' OR u.name = 'User' THEN 'name' END,
    CASE WHEN u.phone IS NULL THEN 'phone' WHEN NOT u.phone_verified THEN 'phone_verified' END,
    CASE WHEN u.email IS NULL THEN 'email' END,
    CASE WHEN lp.city IS NULL THEN 'city' END,
    CASE WHEN COALESCE(lp.target_exam_year, uep.planning_year) IS NULL AND u.academic_year IS NULL THEN 'target_year' END,
    CASE WHEN lp.interest_course IS NULL AND uep.nata_status IS NULL THEN 'target_exam' END
  ], NULL) AS profile_missing,

  -- ── access (Nexus) ───────────────────────────────────────────────────────
  CASE
    WHEN u.is_disabled THEN 'none'
    WHEN u.is_alumni THEN 'alumni'
    WHEN enr.classroom_id IS NULL THEN 'none'
    WHEN u.nexus_entered_at IS NULL THEN 'not_started'
    ELSE 'enrolled'
  END AS nexus_access,
  enr.classroom_id AS nexus_classroom_id,
  enr.classroom_name AS nexus_classroom_name,
  enr.participation_status,
  enr.dormant_source,
  u.nexus_last_login_at,
  u.is_alumni,
  u.student_program,

  -- ── exam season (ADDED 20261018090000) ───────────────────────────────────
  COALESCE(
    CASE WHEN u.academic_year ~ '^\d{4}-\d{2}$' THEN split_part(u.academic_year, '-', 1)::int + 1 END,
    COALESCE(lp.target_exam_year, uep.planning_year),
    EXTRACT(YEAR FROM u.created_at AT TIME ZONE 'Asia/Kolkata')::int
      + CASE WHEN EXTRACT(MONTH FROM u.created_at AT TIME ZONE 'Asia/Kolkata') >= 7 THEN 1 ELSE 0 END
  ) AS exam_year,
  CASE
    WHEN u.academic_year ~ '^\d{4}-\d{2}$' THEN 'batch'
    WHEN COALESCE(lp.target_exam_year, uep.planning_year) IS NOT NULL THEN 'stated'
    ELSE 'signup'
  END AS exam_year_source

FROM users u
LEFT JOIN LATERAL (
  SELECT l.*
  FROM lead_profiles l
  WHERE l.user_id = u.id AND l.deleted_at IS NULL
  ORDER BY l.created_at DESC
  LIMIT 1
) lp ON true
LEFT JOIN student_profiles sp ON sp.user_id = u.id
LEFT JOIN LATERAL (
  SELECT count(*)::integer AS registration_count,
         true AS has_demo_registration,
         (SELECT dcr2.status FROM demo_class_registrations dcr2
           WHERE dcr2.user_id = u.id ORDER BY dcr2.created_at DESC LIMIT 1) AS latest_demo_status,
         bool_or(dcr.attended = true) AS has_attended,
         bool_or(dcr.attended = true) AS demo_attended,
         bool_or(dcr.survey_completed = true) AS demo_survey_completed
  FROM demo_class_registrations dcr
  WHERE dcr.user_id = u.id
  HAVING count(*) > 0
) demo ON true
LEFT JOIN LATERAL (
  SELECT sum(CASE WHEN p.status = 'paid'::payment_status THEN p.amount ELSE 0::numeric END) AS total_paid,
         (SELECT p2.status FROM payments p2 WHERE p2.user_id = u.id ORDER BY p2.created_at DESC LIMIT 1) AS latest_payment_status,
         bool_or(p.status = 'pending'::payment_status) AS has_pending_payment,
         count(*)::integer AS payment_count
  FROM payments p
  WHERE p.user_id = u.id
  HAVING count(*) > 0
) pay ON true
LEFT JOIN onboarding_sessions os ON os.user_id = u.id
LEFT JOIN user_exam_profiles uep ON uep.user_id = u.id
LEFT JOIN LATERAL (
  SELECT e.classroom_id, c.name AS classroom_name, e.participation_status, e.dormant_source, e.current_standard
  FROM nexus_enrollments e
  JOIN nexus_classrooms c ON c.id = e.classroom_id
  WHERE e.user_id = u.id AND e.role = 'student' AND e.is_active AND c.is_archived IS NOT TRUE
  ORDER BY e.enrolled_at DESC
  LIMIT 1
) enr ON true
WHERE u.user_type = ANY (ARRAY['lead'::user_type, 'student'::user_type]);

-- user_journey_view is SELECT * over the view above; re-run it so the new
-- columns reach it too (the * was expanded when it was created).
CREATE OR REPLACE VIEW public.user_journey_view
WITH (security_invoker = true) AS
SELECT * FROM public.user_lifecycle_view WHERE has_firebase;

CREATE OR REPLACE FUNCTION public.crm_people_breakdown(
  p_identity text DEFAULT 'all',
  p_contacted text DEFAULT NULL
)
RETURNS TABLE (
  lifecycle_status text,
  exam_year integer,
  exam_year_source text,
  lifecycle_stage text,
  engagement text,
  n integer
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT v.lifecycle_status::text, v.exam_year, v.exam_year_source, v.lifecycle_stage, v.engagement, count(*)::int
    FROM user_lifecycle_view v
   WHERE CASE COALESCE(p_identity, 'all')
           WHEN 'firebase'  THEN v.has_firebase
           WHEN 'microsoft' THEN v.has_microsoft AND NOT v.has_firebase
           ELSE true
         END
     AND (p_contacted IS NULL OR v.contacted_status::text = p_contacted)
   GROUP BY 1, 2, 3, 4, 5;
$$;

COMMENT ON FUNCTION public.crm_people_breakdown(text, text) IS
  'Grouped counts over user_lifecycle_view for the admin People page: lifecycle_status x exam_year x exam_year_source x lifecycle_stage x engagement.';

-- Supabase grants EXECUTE to anon and authenticated directly, so revoke by name.
REVOKE ALL ON FUNCTION public.crm_people_breakdown(text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.crm_people_breakdown(text, text) TO service_role;

-- Self-test: the breakdown covers every row, and every row has an exam year.
DO $$
DECLARE
  total int;
  summed int;
  missing int;
BEGIN
  SELECT count(*) INTO total FROM public.user_lifecycle_view;
  SELECT COALESCE(sum(n), 0) INTO summed FROM public.crm_people_breakdown('all', NULL);
  SELECT count(*) INTO missing FROM public.user_lifecycle_view WHERE exam_year IS NULL;
  IF total <> summed THEN
    RAISE EXCEPTION 'crm_people_breakdown sums to % but the view has % rows', summed, total;
  END IF;
  IF missing > 0 THEN
    RAISE EXCEPTION '% rows have no exam_year', missing;
  END IF;
END $$;

NOTIFY pgrst, 'reload schema';
