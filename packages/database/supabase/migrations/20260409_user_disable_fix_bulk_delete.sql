-- Add is_disabled support to users table
-- And fix admin_bulk_delete_users function which incorrectly references
-- "nexus_drawing_assignment_submissions" (table does not exist; actual table is "drawing_submissions")

-- 1. Add disable columns to users table
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS is_disabled BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS disabled_at TIMESTAMPTZ DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS disabled_by TEXT DEFAULT NULL;

-- 2. Recreate admin_bulk_delete_users with corrected table references
-- Must DROP first because the return type is changing (adding deleted_drawing_submissions)
DROP FUNCTION IF EXISTS admin_bulk_delete_users(UUID[], TEXT);

CREATE FUNCTION admin_bulk_delete_users(
  user_ids UUID[],
  admin_id TEXT
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
  deleted_profile_history INT,
  deleted_drawing_submissions INT
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
  v_deleted_drawing_submissions INT := 0;
BEGIN
  -- Delete payment installments (FK to payments)
  DELETE FROM payment_installments WHERE payment_id IN (
    SELECT id FROM payments WHERE user_id = ANY(user_ids)
  );
  GET DIAGNOSTICS v_deleted_installments = ROW_COUNT;

  -- Delete payments
  DELETE FROM payments WHERE user_id = ANY(user_ids);
  GET DIAGNOSTICS v_deleted_payments = ROW_COUNT;

  -- Delete onboarding responses (FK to onboarding_sessions)
  DELETE FROM onboarding_responses WHERE session_id IN (
    SELECT id FROM onboarding_sessions WHERE user_id = ANY(user_ids)
  );
  GET DIAGNOSTICS v_deleted_onboarding_responses = ROW_COUNT;

  -- Delete onboarding sessions
  DELETE FROM onboarding_sessions WHERE user_id = ANY(user_ids);
  GET DIAGNOSTICS v_deleted_onboarding_sessions = ROW_COUNT;

  -- Delete demo class registrations
  DELETE FROM demo_class_registrations WHERE user_id = ANY(user_ids);
  GET DIAGNOSTICS v_deleted_demo_registrations = ROW_COUNT;

  -- Delete scholarship applications
  DELETE FROM scholarship_applications WHERE user_id = ANY(user_ids);
  GET DIAGNOSTICS v_deleted_scholarships = ROW_COUNT;

  -- Delete cashback claims
  DELETE FROM cashback_claims WHERE user_id = ANY(user_ids);
  GET DIAGNOSTICS v_deleted_cashback_claims = ROW_COUNT;

  -- Delete application documents
  DELETE FROM application_documents WHERE user_id = ANY(user_ids);
  GET DIAGNOSTICS v_deleted_documents = ROW_COUNT;

  -- Delete drawing submissions (actual table name; student_id references users.id)
  DELETE FROM drawing_submissions WHERE student_id = ANY(user_ids);
  GET DIAGNOSTICS v_deleted_drawing_submissions = ROW_COUNT;

  -- Delete lead profiles
  DELETE FROM lead_profiles WHERE user_id = ANY(user_ids);
  GET DIAGNOSTICS v_deleted_lead_profiles = ROW_COUNT;

  -- Delete student profiles
  DELETE FROM student_profiles WHERE user_id = ANY(user_ids);
  GET DIAGNOSTICS v_deleted_student_profiles = ROW_COUNT;

  -- Delete admin notes
  DELETE FROM admin_user_notes WHERE user_id = ANY(user_ids);
  GET DIAGNOSTICS v_deleted_admin_notes = ROW_COUNT;

  -- Delete profile history
  DELETE FROM user_profile_history WHERE user_id = ANY(user_ids);
  GET DIAGNOSTICS v_deleted_profile_history = ROW_COUNT;

  -- Finally delete users
  DELETE FROM users WHERE id = ANY(user_ids);
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
    v_deleted_profile_history,
    v_deleted_drawing_submissions;
END;
$$;
