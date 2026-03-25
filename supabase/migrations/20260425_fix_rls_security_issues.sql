-- ============================================================
-- Fix RLS Security Issues (flagged by Supabase linter)
-- Applied to staging and production on 2026-03-25
-- ============================================================

-- Category A: Enable RLS on tables that already have policies but RLS was not enabled
ALTER TABLE public.batches ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.coupons ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.email_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.email_templates ENABLE ROW LEVEL SECURITY;

-- Category B: Enable RLS + add service_role policy on tables missing both
ALTER TABLE public.nexus_module_item_reactions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Service role full access" ON public.nexus_module_item_reactions
  FOR ALL TO service_role USING (true) WITH CHECK (true);

ALTER TABLE public.nexus_module_item_issues ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Service role full access" ON public.nexus_module_item_issues
  FOR ALL TO service_role USING (true) WITH CHECK (true);

ALTER TABLE public.nexus_qb_question_reports ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Service role full access" ON public.nexus_qb_question_reports
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- Category C: Fix SECURITY DEFINER views -> SECURITY INVOKER

CREATE OR REPLACE VIEW public.allotment_year_summary
WITH (security_invoker = true) AS
SELECT counseling_system_id, year, count(*) AS total_entries
FROM allotment_list_entries
GROUP BY counseling_system_id, year;

CREATE OR REPLACE VIEW public.rank_list_year_summary
WITH (security_invoker = true) AS
SELECT counseling_system_id, year, count(*) AS total_entries
FROM rank_list_entries
GROUP BY counseling_system_id, year;

CREATE OR REPLACE VIEW public.nata_current_centers
WITH (security_invoker = true) AS
SELECT id, state, city_brochure, brochure_ref, latitude, longitude,
    city_population_tier, probable_center_1, center_1_address, center_1_evidence,
    probable_center_2, center_2_address, center_2_evidence, confidence,
    is_new_2025, was_in_2024, tcs_ion_confirmed, has_barch_college, notes,
    year, created_at, updated_at, created_by, updated_by
FROM nata_exam_centers
WHERE year = (SELECT max(year) FROM nata_exam_centers);

CREATE OR REPLACE VIEW public.nata_centers_yoy
WITH (security_invoker = true) AS
SELECT c.state, c.city_brochure, c.year, c.probable_center_1, c.confidence,
    c.is_new_2025 AS is_new_this_year,
    CASE WHEN p.id IS NOT NULL THEN true ELSE false END AS existed_previous_year,
    p.probable_center_1 AS previous_year_center
FROM nata_exam_centers c
LEFT JOIN nata_exam_centers p ON c.city_brochure = p.city_brochure
    AND c.state = p.state AND p.year = (c.year - 1);

CREATE OR REPLACE VIEW public.nata_state_summary
WITH (security_invoker = true) AS
SELECT state, year,
    count(*) AS total_cities,
    count(*) FILTER (WHERE confidence = 'HIGH') AS high_confidence,
    count(*) FILTER (WHERE confidence = 'MEDIUM') AS medium_confidence,
    count(*) FILTER (WHERE confidence = 'LOW') AS low_confidence,
    count(*) FILTER (WHERE tcs_ion_confirmed) AS tcs_confirmed,
    count(*) FILTER (WHERE has_barch_college) AS with_barch_colleges
FROM nata_exam_centers
GROUP BY state, year
ORDER BY state, year;

CREATE OR REPLACE VIEW public.user_journey_view
WITH (security_invoker = true) AS
SELECT u.id, u.name, u.first_name, u.last_name, u.email, u.phone, u.avatar_url,
    u.user_type, u.status, u.phone_verified, u.email_verified, u.created_at, u.updated_at,
    u.last_login_at, u.preferred_language, u.linked_classroom_email,
    lp.id AS lead_profile_id, lp.application_number, lp.status AS application_status,
    lp.applicant_category, lp.interest_course, lp.selected_center_id, lp.learning_mode,
    lp.city, lp.state, lp.country, lp.pincode, lp.admin_notes, lp.reviewed_by, lp.reviewed_at,
    lp.assigned_fee, lp.final_fee, lp.payment_scheme, lp.form_step_completed,
    lp.created_at AS application_created_at, lp.contacted_status,
    COALESCE(demo.registration_count, 0) AS demo_registration_count,
    COALESCE(demo.has_demo_registration, false) AS has_demo_registration,
    demo.latest_demo_status,
    COALESCE(demo.demo_attended, false) AS demo_attended,
    COALESCE(demo.demo_survey_completed, false) AS demo_survey_completed,
    COALESCE(pay.total_paid, 0::numeric) AS total_paid,
    pay.latest_payment_status AS payment_status,
    COALESCE(pay.has_pending_payment, false) AS has_pending_payment,
    COALESCE(pay.payment_count, 0) AS payment_count,
    sp.id AS student_profile_id, sp.enrollment_date, sp.batch_id,
    sp.course_id AS student_course_id,
    os.status AS onboarding_status, os.completed_at AS onboarding_completed_at,
    COALESCE(os.questions_answered, 0) AS onboarding_questions_answered,
    CASE
        WHEN sp.id IS NOT NULL THEN 'enrolled'
        WHEN pay.total_paid > 0::numeric AND pay.latest_payment_status = 'paid'::payment_status THEN 'payment_complete'
        WHEN lp.status = 'approved'::application_status THEN 'admin_approved'
        WHEN lp.status = ANY (ARRAY['submitted'::application_status, 'under_review'::application_status, 'pending_verification'::application_status]) THEN 'application_submitted'
        WHEN demo.has_attended = true THEN 'demo_attended'
        WHEN demo.registration_count > 0 THEN 'demo_requested'
        WHEN u.phone_verified = true THEN 'phone_verified'
        ELSE 'new_lead'
    END AS pipeline_stage
FROM users u
LEFT JOIN LATERAL (
    SELECT * FROM lead_profiles
    WHERE lead_profiles.user_id = u.id AND lead_profiles.deleted_at IS NULL
    ORDER BY lead_profiles.created_at DESC LIMIT 1
) lp ON true
LEFT JOIN student_profiles sp ON sp.user_id = u.id
LEFT JOIN LATERAL (
    SELECT count(*)::integer AS registration_count,
        true AS has_demo_registration,
        (SELECT dcr2.status FROM demo_class_registrations dcr2 WHERE dcr2.user_id = u.id ORDER BY dcr2.created_at DESC LIMIT 1) AS latest_demo_status,
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
WHERE u.user_type = ANY (ARRAY['lead'::user_type, 'student'::user_type])
    AND u.firebase_uid IS NOT NULL;
