-- 20261016090000_lead_profiles_applicant_fields_and_fee.sql
--
-- The apply form has collected email, phone, date of birth, gender and a parent
-- phone since 2026-04, and the create_lead_profile RPC (20260217115613) has an
-- explicit column list that silently dropped every one of them, plus gclid,
-- wbraid, form_step_completed and detected_location. This replaces the RPC
-- with the full list and adds the columns the self-service fee path needs.
--
-- gclid/wbraid were added by packages/database/supabase/migrations/
-- 20260521120000_attribution_fields.sql, a folder CI never pushes; production
-- got them by hand. The IF NOT EXISTS below makes this file safe on both.

ALTER TABLE lead_profiles
  ADD COLUMN IF NOT EXISTS email TEXT,
  ADD COLUMN IF NOT EXISTS phone TEXT,
  ADD COLUMN IF NOT EXISTS gclid TEXT,
  ADD COLUMN IF NOT EXISTS wbraid TEXT,
  ADD COLUMN IF NOT EXISTS fee_structure_id UUID REFERENCES fee_structures(id),
  ADD COLUMN IF NOT EXISTS fee_source TEXT;

ALTER TABLE lead_profiles DROP CONSTRAINT IF EXISTS lead_profiles_fee_source_check;
ALTER TABLE lead_profiles
  ADD CONSTRAINT lead_profiles_fee_source_check
  CHECK (fee_source IS NULL OR fee_source IN ('standard', 'admin', 'link'));

COMMENT ON COLUMN lead_profiles.fee_source IS
  'Where final_fee came from: standard (fee_structures snapshot at order time), admin (approval screen), link (direct enrolment link). NULL until a fee is set.';

-- Backfill: every lead with a fee today got it from an admin or a direct link.
UPDATE lead_profiles SET fee_source = 'link'
  WHERE fee_source IS NULL AND source = 'direct_link' AND final_fee IS NOT NULL;
UPDATE lead_profiles SET fee_source = 'admin'
  WHERE fee_source IS NULL AND final_fee IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_lead_profiles_fee_structure ON lead_profiles(fee_structure_id)
  WHERE fee_structure_id IS NOT NULL;

CREATE OR REPLACE FUNCTION public.create_lead_profile(payload jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  result lead_profiles%ROWTYPE;
BEGIN
  INSERT INTO lead_profiles (
    user_id,
    first_name,
    father_name,
    email,
    phone,
    parent_phone,
    date_of_birth,
    gender,
    country,
    city,
    state,
    district,
    pincode,
    address,
    latitude,
    longitude,
    location_source,
    detected_location,
    applicant_category,
    academic_data,
    caste_category,
    target_exam_year,
    interest_course,
    selected_course_id,
    selected_center_id,
    hybrid_learning_accepted,
    learning_mode,
    school_type,
    fee_structure_id,
    fee_source,
    status,
    phone_verified,
    phone_verified_at,
    source,
    utm_source,
    utm_medium,
    utm_campaign,
    referral_code,
    gclid,
    wbraid,
    form_step_completed
  )
  VALUES (
    (payload->>'user_id')::uuid,
    NULLIF(payload->>'first_name', ''),
    payload->>'father_name',
    NULLIF(payload->>'email', ''),
    NULLIF(payload->>'phone', ''),
    NULLIF(payload->>'parent_phone', ''),
    CASE WHEN payload->>'date_of_birth' ~ '^\d{4}-\d{2}-\d{2}$'
         THEN (payload->>'date_of_birth')::date ELSE NULL END,
    CASE WHEN payload->>'gender' IN ('male', 'female', 'other')
         THEN payload->>'gender' ELSE NULL END,
    COALESCE(payload->>'country', 'IN'),
    payload->>'city',
    payload->>'state',
    payload->>'district',
    payload->>'pincode',
    payload->>'address',
    (payload->>'latitude')::numeric,
    (payload->>'longitude')::numeric,
    payload->>'location_source',
    CASE WHEN jsonb_typeof(payload->'detected_location') = 'object'
         THEN payload->'detected_location' ELSE NULL END,
    (payload->>'applicant_category')::applicant_category,
    COALESCE(payload->'academic_data', '{}'::jsonb),
    payload->>'caste_category',
    (payload->>'target_exam_year')::integer,
    (payload->>'interest_course')::course_type,
    NULLIF(payload->>'selected_course_id', '')::uuid,
    NULLIF(payload->>'selected_center_id', '')::uuid,
    COALESCE((payload->>'hybrid_learning_accepted')::boolean, false),
    COALESCE((payload->>'learning_mode')::learning_mode, 'hybrid'),
    CASE WHEN payload->>'school_type' IS NOT NULL AND payload->>'school_type' != ''
         THEN (payload->>'school_type')::school_type
         ELSE NULL END,
    NULLIF(payload->>'fee_structure_id', '')::uuid,
    CASE WHEN payload->>'fee_source' IN ('standard', 'admin', 'link')
         THEN payload->>'fee_source' ELSE NULL END,
    COALESCE((payload->>'status')::application_status, 'draft'),
    COALESCE((payload->>'phone_verified')::boolean, false),
    (payload->>'phone_verified_at')::timestamptz,
    COALESCE((payload->>'source')::application_source, 'website_form'),
    payload->>'utm_source',
    payload->>'utm_medium',
    payload->>'utm_campaign',
    payload->>'referral_code',
    NULLIF(payload->>'gclid', ''),
    NULLIF(payload->>'wbraid', ''),
    COALESCE((payload->>'form_step_completed')::integer, 0)
  )
  RETURNING * INTO result;

  RETURN to_jsonb(result);
END;
$$;

GRANT EXECUTE ON FUNCTION public.create_lead_profile(jsonb) TO service_role;
REVOKE EXECUTE ON FUNCTION public.create_lead_profile(jsonb) FROM anon, authenticated;

NOTIFY pgrst, 'reload schema';
