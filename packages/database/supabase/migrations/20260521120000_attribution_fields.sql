-- Attribution fields for Google Ads conversion tracking.
-- Adds gclid + wbraid to lead_profiles, and source + utm_* + gclid + wbraid
-- to callback_requests and nata_assistance_requests so phone-callback and
-- inline-form leads are no longer attribution-blind.

-- ── lead_profiles: add Google click identifiers ────────────────────────────
ALTER TABLE lead_profiles
  ADD COLUMN IF NOT EXISTS gclid text,
  ADD COLUMN IF NOT EXISTS wbraid text;

-- ── callback_requests: add source + utm + gclid + wbraid ───────────────────
ALTER TABLE callback_requests
  ADD COLUMN IF NOT EXISTS source text,
  ADD COLUMN IF NOT EXISTS utm_source text,
  ADD COLUMN IF NOT EXISTS utm_medium text,
  ADD COLUMN IF NOT EXISTS utm_campaign text,
  ADD COLUMN IF NOT EXISTS gclid text,
  ADD COLUMN IF NOT EXISTS wbraid text;

-- ── nata_assistance_requests: same attribution surface ────────────────────
ALTER TABLE nata_assistance_requests
  ADD COLUMN IF NOT EXISTS source text,
  ADD COLUMN IF NOT EXISTS utm_source text,
  ADD COLUMN IF NOT EXISTS utm_medium text,
  ADD COLUMN IF NOT EXISTS utm_campaign text,
  ADD COLUMN IF NOT EXISTS gclid text,
  ADD COLUMN IF NOT EXISTS wbraid text;

-- ── Replace create_lead_profile RPC to forward gclid + wbraid ─────────────
-- The RPC enumerates columns explicitly (see 20260217115613_create_application_rpc.sql),
-- so new columns must be added here or they will be silently dropped by the RPC path.
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
    father_name,
    country,
    city,
    state,
    district,
    pincode,
    address,
    latitude,
    longitude,
    location_source,
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
    status,
    phone_verified,
    phone_verified_at,
    source,
    utm_source,
    utm_medium,
    utm_campaign,
    referral_code,
    gclid,
    wbraid
  )
  VALUES (
    (payload->>'user_id')::uuid,
    payload->>'father_name',
    COALESCE(payload->>'country', 'IN'),
    payload->>'city',
    payload->>'state',
    payload->>'district',
    payload->>'pincode',
    payload->>'address',
    (payload->>'latitude')::numeric,
    (payload->>'longitude')::numeric,
    payload->>'location_source',
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
    COALESCE((payload->>'status')::application_status, 'draft'),
    COALESCE((payload->>'phone_verified')::boolean, false),
    (payload->>'phone_verified_at')::timestamptz,
    COALESCE((payload->>'source')::application_source, 'website_form'),
    payload->>'utm_source',
    payload->>'utm_medium',
    payload->>'utm_campaign',
    payload->>'referral_code',
    payload->>'gclid',
    payload->>'wbraid'
  )
  RETURNING * INTO result;

  RETURN to_jsonb(result);
END;
$$;

GRANT EXECUTE ON FUNCTION public.create_lead_profile(jsonb) TO service_role;
REVOKE EXECUTE ON FUNCTION public.create_lead_profile(jsonb) FROM anon, authenticated;
