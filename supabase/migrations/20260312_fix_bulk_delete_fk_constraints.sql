-- Fix admin_bulk_delete_users RPC to handle all NO ACTION FK constraints
-- that were blocking deletion of student/user records.
--
-- Root cause: Several tables reference lead_profiles, student_profiles, and users
-- with ON DELETE NO ACTION but were not cleaned up before the parent row deletion.
-- Also fixed: column reference "admin_id" ambiguity (function param vs table column)
-- by table-qualifying all column references with aliases.

CREATE OR REPLACE FUNCTION public.admin_bulk_delete_users(user_ids uuid[], admin_id uuid)
 RETURNS TABLE(deleted_users integer, deleted_lead_profiles integer, deleted_student_profiles integer, deleted_demo_registrations integer, deleted_payments integer, deleted_onboarding_sessions integer, deleted_onboarding_responses integer, deleted_documents integer, deleted_scholarships integer, deleted_installments integer, deleted_cashback_claims integer, deleted_admin_notes integer, deleted_profile_history integer)
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
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
  -- Collect lead_profile IDs
  SELECT COALESCE(ARRAY_AGG(lp.id), '{}') INTO v_lead_profile_ids
  FROM lead_profiles lp
  WHERE lp.user_id = ANY(user_ids);

  -- Collect student_profile IDs
  SELECT COALESCE(ARRAY_AGG(sp.id), '{}') INTO v_student_profile_ids
  FROM student_profiles sp
  WHERE sp.user_id = ANY(user_ids);

  -- Delete children first, then parents

  -- 1. Payment installments (FK to lead_profiles)
  DELETE FROM payment_installments pi
  WHERE pi.lead_profile_id = ANY(v_lead_profile_ids);
  GET DIAGNOSTICS v_deleted_installments = ROW_COUNT;

  -- 2. Scholarship applications (FK to lead_profiles)
  DELETE FROM scholarship_applications sa
  WHERE sa.lead_profile_id = ANY(v_lead_profile_ids);
  GET DIAGNOSTICS v_deleted_scholarships = ROW_COUNT;

  -- 3. Post enrollment details (FK to student_profiles AND users)
  DELETE FROM post_enrollment_details ped
  WHERE ped.student_profile_id = ANY(v_student_profile_ids) OR ped.user_id = ANY(user_ids);

  -- 4. Cashback claims
  DELETE FROM cashback_claims cc
  WHERE cc.user_id = ANY(user_ids);
  GET DIAGNOSTICS v_deleted_cashback_claims = ROW_COUNT;

  -- 5. Application documents
  DELETE FROM application_documents ad
  WHERE ad.user_id = ANY(user_ids);
  GET DIAGNOSTICS v_deleted_documents = ROW_COUNT;

  -- 6. Onboarding responses
  DELETE FROM onboarding_responses obr
  WHERE obr.user_id = ANY(user_ids);
  GET DIAGNOSTICS v_deleted_onboarding_responses = ROW_COUNT;

  -- 7. Onboarding sessions
  DELETE FROM onboarding_sessions obs
  WHERE obs.user_id = ANY(user_ids);
  GET DIAGNOSTICS v_deleted_onboarding_sessions = ROW_COUNT;

  -- 8. Payments (cover all FK paths)
  DELETE FROM payments p
  WHERE p.user_id = ANY(user_ids)
     OR p.lead_profile_id = ANY(v_lead_profile_ids)
     OR p.student_profile_id = ANY(v_student_profile_ids);
  GET DIAGNOSTICS v_deleted_payments = ROW_COUNT;

  -- 9. Demo class registrations
  DELETE FROM demo_class_registrations dcr
  WHERE dcr.user_id = ANY(user_ids) OR dcr.lead_profile_id = ANY(v_lead_profile_ids);
  GET DIAGNOSTICS v_deleted_demo_registrations = ROW_COUNT;

  -- 10. Callback requests (FK to both users and lead_profiles)
  DELETE FROM callback_requests cr
  WHERE cr.user_id = ANY(user_ids) OR cr.lead_profile_id = ANY(v_lead_profile_ids);

  -- 11. Center visit bookings
  DELETE FROM center_visit_bookings cvb
  WHERE cvb.user_id = ANY(user_ids);

  -- 12. Email logs
  DELETE FROM email_logs el
  WHERE el.user_id = ANY(user_ids);

  -- 13. Tool usage logs
  DELETE FROM tool_usage_logs tul
  WHERE tul.user_id = ANY(user_ids);

  -- 14. Student onboarding progress
  DELETE FROM student_onboarding_progress sop
  WHERE sop.user_id = ANY(user_ids) OR sop.student_profile_id = ANY(v_student_profile_ids);

  -- ===== Clean up lead_profile FK blockers (NO ACTION constraints) =====

  -- 14a. Application deletions (lead_profile_id is NOT NULL — must delete)
  DELETE FROM application_deletions adl
  WHERE adl.lead_profile_id = ANY(v_lead_profile_ids);

  -- 14b. Coupons referencing lead profiles (nullable — set null)
  UPDATE coupons c SET lead_profile_id = NULL
  WHERE c.lead_profile_id = ANY(v_lead_profile_ids);

  -- 14c. Refund requests referencing lead profiles
  DELETE FROM refund_requests rr
  WHERE rr.lead_profile_id = ANY(v_lead_profile_ids) OR rr.user_id = ANY(user_ids);

  -- 14d. Direct enrollment links referencing student/lead profiles
  UPDATE direct_enrollment_links del SET lead_profile_id = NULL, student_profile_id = NULL
  WHERE del.lead_profile_id = ANY(v_lead_profile_ids) OR del.student_profile_id = ANY(v_student_profile_ids);

  -- 15. Student profiles
  DELETE FROM student_profiles sp
  WHERE sp.user_id = ANY(user_ids);
  GET DIAGNOSTICS v_deleted_student_profiles = ROW_COUNT;

  -- 16. Lead profiles (including soft-deleted ones)
  DELETE FROM lead_profiles lp
  WHERE lp.user_id = ANY(user_ids);
  GET DIAGNOSTICS v_deleted_lead_profiles = ROW_COUNT;

  -- 17. Admin notes
  DELETE FROM admin_user_notes aun
  WHERE aun.user_id = ANY(user_ids);
  GET DIAGNOSTICS v_deleted_admin_notes = ROW_COUNT;

  -- 18. Profile history
  DELETE FROM user_profile_history uph
  WHERE uph.user_id = ANY(user_ids);
  GET DIAGNOSTICS v_deleted_profile_history = ROW_COUNT;

  -- 19. User avatars
  DELETE FROM user_avatars ua
  WHERE ua.user_id = ANY(user_ids);

  -- 20. YouTube subscription coupons
  DELETE FROM youtube_subscription_coupons ysc
  WHERE ysc.user_id = ANY(user_ids);

  -- ===== Clean up users FK blockers (NO ACTION constraints) =====

  -- 21a. Nullify application_deletions admin references
  UPDATE application_deletions adl2 SET deleted_by = NULL WHERE adl2.deleted_by = ANY(user_ids);
  UPDATE application_deletions adl3 SET restored_by = NULL WHERE adl3.restored_by = ANY(user_ids);

  -- 21b. Delete callback_attempts (admin_id column is NOT NULL — qualify to avoid ambiguity)
  DELETE FROM callback_attempts ca WHERE ca.admin_id = ANY(user_ids);

  -- 21c. Delete direct_enrollment_links where created_by matches (NOT NULL column)
  DELETE FROM direct_enrollment_links del2 WHERE del2.created_by = ANY(user_ids);

  -- 21d. Nullify nullable admin-reference columns across all tables
  UPDATE admin_notifications an SET read_by = NULL WHERE an.read_by = ANY(user_ids);
  UPDATE coupons c2 SET created_by = NULL WHERE c2.created_by = ANY(user_ids);
  UPDATE demo_class_slots dcs SET created_by = NULL WHERE dcs.created_by = ANY(user_ids);
  UPDATE demo_class_slots dcs2 SET instructor_id = NULL WHERE dcs2.instructor_id = ANY(user_ids);
  UPDATE direct_enrollment_links del3 SET used_by = NULL WHERE del3.used_by = ANY(user_ids);
  UPDATE lead_profiles lp2 SET contacted_by = NULL WHERE lp2.contacted_by = ANY(user_ids);
  UPDATE lead_profiles lp3 SET reviewed_by = NULL WHERE lp3.reviewed_by = ANY(user_ids);
  UPDATE lead_profiles lp4 SET scholarship_opened_by = NULL WHERE lp4.scholarship_opened_by = ANY(user_ids);
  UPDATE nexus_classrooms nc SET created_by = NULL WHERE nc.created_by = ANY(user_ids);
  UPDATE nexus_drawing_assignments nda SET assigned_by = NULL WHERE nda.assigned_by = ANY(user_ids);
  UPDATE nexus_drawing_submissions nds SET evaluated_by = NULL WHERE nds.evaluated_by = ANY(user_ids);
  UPDATE nexus_parent_invite_codes npic SET created_by = NULL WHERE npic.created_by = ANY(user_ids);
  UPDATE nexus_resources nr SET created_by = NULL WHERE nr.created_by = ANY(user_ids);
  UPDATE nexus_student_documents nsd SET verified_by = NULL WHERE nsd.verified_by = ANY(user_ids);
  UPDATE nexus_tests nt SET created_by = NULL WHERE nt.created_by = ANY(user_ids);
  UPDATE nexus_verified_questions nvq SET created_by = NULL WHERE nvq.created_by = ANY(user_ids);
  UPDATE notification_recipients nrec SET added_by = NULL WHERE nrec.added_by = ANY(user_ids);
  UPDATE refund_requests rr2 SET reviewed_by = NULL WHERE rr2.reviewed_by = ANY(user_ids);
  UPDATE site_settings ss SET updated_by = NULL WHERE ss.updated_by = ANY(user_ids);
  UPDATE demo_class_registrations dcr2 SET approved_by = NULL WHERE dcr2.approved_by = ANY(user_ids);
  UPDATE demo_class_registrations dcr3 SET attendance_marked_by = NULL WHERE dcr3.attendance_marked_by = ANY(user_ids);
  UPDATE application_documents ad2 SET verified_by = NULL WHERE ad2.verified_by = ANY(user_ids);
  UPDATE scholarship_applications sa2 SET verified_by = NULL WHERE sa2.verified_by = ANY(user_ids);
  UPDATE scholarship_applications sa3 SET revision_requested_by = NULL WHERE sa3.revision_requested_by = ANY(user_ids);

  -- 22. Finally delete users
  DELETE FROM users u
  WHERE u.id = ANY(user_ids);
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
$function$;
