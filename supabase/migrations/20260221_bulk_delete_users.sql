-- Bulk Delete Users Function
-- Atomically deletes users and all related data in correct FK dependency order.
-- Returns deletion counts per table.

CREATE OR REPLACE FUNCTION admin_bulk_delete_users(
  user_ids UUID[],
  admin_id UUID
)
RETURNS TABLE(
  deleted_users INT,
  deleted_lead_profiles INT,
  deleted_student_profiles INT,
  deleted_demo_registrations INT,
  deleted_payments INT,
  deleted_onboarding_sessions INT,
  deleted_onboarding_responses INT,
  deleted_documents INT,
  deleted_scholarships INT,
  deleted_installments INT,
  deleted_cashback_claims INT,
  deleted_admin_notes INT,
  deleted_profile_history INT
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_deleted_users INT := 0;
  v_deleted_lead_profiles INT := 0;
  v_deleted_student_profiles INT := 0;
  v_deleted_demo_registrations INT := 0;
  v_deleted_payments INT := 0;
  v_deleted_onboarding_sessions INT := 0;
  v_deleted_onboarding_responses INT := 0;
  v_deleted_documents INT := 0;
  v_deleted_scholarships INT := 0;
  v_deleted_installments INT := 0;
  v_deleted_cashback_claims INT := 0;
  v_deleted_admin_notes INT := 0;
  v_deleted_profile_history INT := 0;
  v_lead_profile_ids UUID[];
  v_student_profile_ids UUID[];
BEGIN
  -- Collect lead_profile IDs (needed for installments & scholarships)
  SELECT COALESCE(ARRAY_AGG(id), '{}') INTO v_lead_profile_ids
  FROM lead_profiles
  WHERE user_id = ANY(user_ids);

  -- Collect student_profile IDs (needed for post_enrollment_details)
  SELECT COALESCE(ARRAY_AGG(id), '{}') INTO v_student_profile_ids
  FROM student_profiles
  WHERE user_id = ANY(user_ids);

  -- Delete children first, then parents

  -- 1. Payment installments (FK to lead_profiles)
  DELETE FROM payment_installments
  WHERE lead_profile_id = ANY(v_lead_profile_ids);
  GET DIAGNOSTICS v_deleted_installments = ROW_COUNT;

  -- 2. Scholarship applications (FK to lead_profiles)
  DELETE FROM scholarship_applications
  WHERE lead_profile_id = ANY(v_lead_profile_ids);
  GET DIAGNOSTICS v_deleted_scholarships = ROW_COUNT;

  -- 3. Post enrollment details (FK to student_profiles)
  DELETE FROM post_enrollment_details
  WHERE student_profile_id = ANY(v_student_profile_ids);

  -- 4. Cashback claims
  DELETE FROM cashback_claims
  WHERE user_id = ANY(user_ids);
  GET DIAGNOSTICS v_deleted_cashback_claims = ROW_COUNT;

  -- 5. Application documents
  DELETE FROM application_documents
  WHERE user_id = ANY(user_ids);
  GET DIAGNOSTICS v_deleted_documents = ROW_COUNT;

  -- 6. Onboarding responses
  DELETE FROM onboarding_responses
  WHERE user_id = ANY(user_ids);
  GET DIAGNOSTICS v_deleted_onboarding_responses = ROW_COUNT;

  -- 7. Onboarding sessions
  DELETE FROM onboarding_sessions
  WHERE user_id = ANY(user_ids);
  GET DIAGNOSTICS v_deleted_onboarding_sessions = ROW_COUNT;

  -- 8. Payments
  DELETE FROM payments
  WHERE user_id = ANY(user_ids);
  GET DIAGNOSTICS v_deleted_payments = ROW_COUNT;

  -- 9. Demo class registrations (ON DELETE SET NULL, so explicit delete)
  DELETE FROM demo_class_registrations
  WHERE user_id = ANY(user_ids);
  GET DIAGNOSTICS v_deleted_demo_registrations = ROW_COUNT;

  -- 10. Callback requests
  DELETE FROM callback_requests
  WHERE user_id = ANY(user_ids);

  -- 11. Center visit bookings
  DELETE FROM center_visit_bookings
  WHERE user_id = ANY(user_ids);

  -- 12. Email logs
  DELETE FROM email_logs
  WHERE user_id = ANY(user_ids);

  -- 13. Tool usage logs
  DELETE FROM tool_usage_logs
  WHERE user_id = ANY(user_ids);

  -- 14. Student profiles
  DELETE FROM student_profiles
  WHERE user_id = ANY(user_ids);
  GET DIAGNOSTICS v_deleted_student_profiles = ROW_COUNT;

  -- 15. Lead profiles (including soft-deleted ones)
  DELETE FROM lead_profiles
  WHERE user_id = ANY(user_ids);
  GET DIAGNOSTICS v_deleted_lead_profiles = ROW_COUNT;

  -- 16. Admin notes
  DELETE FROM admin_user_notes
  WHERE user_id = ANY(user_ids);
  GET DIAGNOSTICS v_deleted_admin_notes = ROW_COUNT;

  -- 17. Profile history
  DELETE FROM user_profile_history
  WHERE user_id = ANY(user_ids);
  GET DIAGNOSTICS v_deleted_profile_history = ROW_COUNT;

  -- 18. User avatars
  DELETE FROM user_avatars
  WHERE user_id = ANY(user_ids);

  -- 19. YouTube subscription coupons
  DELETE FROM youtube_subscription_coupons
  WHERE user_id = ANY(user_ids);

  -- 20. Nullify admin-reference columns that may point to these users
  UPDATE application_deletions SET deleted_by = NULL WHERE deleted_by = ANY(user_ids);
  UPDATE application_deletions SET restored_by = NULL WHERE restored_by = ANY(user_ids);

  -- 21. Finally delete users
  DELETE FROM users
  WHERE id = ANY(user_ids);
  GET DIAGNOSTICS v_deleted_users = ROW_COUNT;

  RETURN QUERY SELECT
    v_deleted_users,
    v_deleted_lead_profiles,
    v_deleted_student_profiles,
    v_deleted_demo_registrations,
    v_deleted_payments,
    v_deleted_onboarding_sessions,
    v_deleted_onboarding_responses,
    v_deleted_documents,
    v_deleted_scholarships,
    v_deleted_installments,
    v_deleted_cashback_claims,
    v_deleted_admin_notes,
    v_deleted_profile_history;
END;
$$;

-- Only service_role (admin API) can execute this
GRANT EXECUTE ON FUNCTION admin_bulk_delete_users(UUID[], UUID) TO service_role;
