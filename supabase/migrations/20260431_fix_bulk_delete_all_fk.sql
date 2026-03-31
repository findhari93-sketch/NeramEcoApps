-- Fix admin_bulk_delete_users RPC to handle ALL FK constraints
-- Many tables were added after the original RPC (20260312) and were never included,
-- causing "violates foreign key constraint" errors when deleting students from admin.
--
-- This version dynamically covers every FK reference to users, lead_profiles,
-- and student_profiles as of 2026-03-31.

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

  -- =====================================================
  -- PHASE 1: Delete student/user-owned data (NOT NULL FK)
  -- =====================================================

  -- --- Nexus: Document vault ---
  DELETE FROM nexus_document_audit_log WHERE student_id = ANY(user_ids) OR performed_by = ANY(user_ids);
  DELETE FROM nexus_student_documents WHERE student_id = ANY(user_ids) OR uploaded_by = ANY(user_ids);

  -- --- Nexus: Onboarding ---
  DELETE FROM nexus_student_onboarding WHERE student_id = ANY(user_ids);
  DELETE FROM nexus_student_entry_progress WHERE student_id = ANY(user_ids);

  -- --- Nexus: Enrollments ---
  DELETE FROM nexus_enrollment_history WHERE user_id = ANY(user_ids);
  DELETE FROM nexus_enrollments WHERE user_id = ANY(user_ids);

  -- --- Nexus: Attendance & Classes ---
  DELETE FROM nexus_attendance WHERE student_id = ANY(user_ids);
  DELETE FROM nexus_class_reviews WHERE student_id = ANY(user_ids);
  DELETE FROM nexus_class_rsvp WHERE student_id = ANY(user_ids);

  -- --- Nexus: Drawing submissions ---
  DELETE FROM nexus_drawing_assignment_submissions WHERE student_id = ANY(user_ids);
  DELETE FROM nexus_drawing_submissions WHERE student_id = ANY(user_ids);

  -- --- Nexus: Questions & Tests ---
  DELETE FROM nexus_question_submissions WHERE student_id = ANY(user_ids);
  DELETE FROM nexus_test_attempts WHERE student_id = ANY(user_ids);

  -- --- Nexus: Checklists ---
  DELETE FROM nexus_student_checklist_progress WHERE student_id = ANY(user_ids);

  -- --- Nexus: Exam tracking ---
  DELETE FROM nexus_student_exam_attempts WHERE student_id = ANY(user_ids);
  DELETE FROM nexus_student_exam_plans WHERE student_id = ANY(user_ids);
  DELETE FROM nexus_student_exam_registrations WHERE student_id = ANY(user_ids);

  -- --- Nexus: Parent links ---
  DELETE FROM nexus_parent_invite_codes WHERE student_id = ANY(user_ids);
  DELETE FROM nexus_parent_links WHERE student_user_id = ANY(user_ids) OR parent_user_id = ANY(user_ids);

  -- --- Nexus: Teams & Timetable ---
  DELETE FROM nexus_teams_sync_log WHERE user_id = ANY(user_ids);
  DELETE FROM nexus_timetable_notifications WHERE user_id = ANY(user_ids);

  -- --- Nexus: Foundation module progress ---
  DELETE FROM nexus_foundation_issue_activity WHERE actor_id = ANY(user_ids) OR target_user_id = ANY(user_ids);
  DELETE FROM nexus_foundation_issues WHERE student_id = ANY(user_ids);
  DELETE FROM nexus_foundation_student_progress WHERE student_id = ANY(user_ids);
  DELETE FROM nexus_foundation_quiz_attempts WHERE student_id = ANY(user_ids);
  DELETE FROM nexus_foundation_watch_sessions WHERE student_id = ANY(user_ids);
  DELETE FROM nexus_foundation_reactions WHERE student_id = ANY(user_ids);
  DELETE FROM nexus_foundation_student_notes WHERE student_id = ANY(user_ids);

  -- --- Nexus: Module progress ---
  DELETE FROM nexus_module_item_issues WHERE student_id = ANY(user_ids);
  DELETE FROM nexus_module_item_reactions WHERE student_id = ANY(user_ids);
  DELETE FROM nexus_module_student_progress WHERE student_id = ANY(user_ids);
  DELETE FROM nexus_module_quiz_attempts WHERE student_id = ANY(user_ids);
  DELETE FROM nexus_module_student_notes WHERE student_id = ANY(user_ids);
  DELETE FROM nexus_student_module_item_progress WHERE student_id = ANY(user_ids);
  DELETE FROM nexus_student_topic_progress WHERE student_id = ANY(user_ids);

  -- --- Nexus: Question Bank ---
  DELETE FROM nexus_qb_student_attempts WHERE student_id = ANY(user_ids);
  DELETE FROM nexus_qb_study_marks WHERE student_id = ANY(user_ids);
  DELETE FROM nexus_qb_saved_presets WHERE student_id = ANY(user_ids);
  DELETE FROM nexus_qb_question_reports WHERE student_id = ANY(user_ids);

  -- --- Nexus: Exam Recall ---
  DELETE FROM nexus_exam_recall_checkpoints WHERE user_id = ANY(user_ids);
  DELETE FROM nexus_exam_recall_comments WHERE user_id = ANY(user_ids);
  DELETE FROM nexus_exam_recall_confirms WHERE user_id = ANY(user_ids);
  DELETE FROM nexus_exam_recall_tips WHERE user_id = ANY(user_ids);
  DELETE FROM nexus_exam_recall_topic_dumps WHERE user_id = ANY(user_ids);
  DELETE FROM nexus_exam_recall_uploads WHERE user_id = ANY(user_ids);
  DELETE FROM nexus_exam_recall_vouches WHERE user_id = ANY(user_ids);

  -- --- Library ---
  DELETE FROM library_bookmarks WHERE student_id = ANY(user_ids);
  DELETE FROM library_engagement_daily WHERE student_id = ANY(user_ids);
  DELETE FROM library_search_log WHERE student_id = ANY(user_ids);
  DELETE FROM library_student_streaks WHERE student_id = ANY(user_ids);
  DELETE FROM library_watch_history WHERE student_id = ANY(user_ids);
  DELETE FROM library_watch_sessions WHERE student_id = ANY(user_ids);

  -- --- Classroom access ---
  DELETE FROM classroom_access_requests WHERE user_id = ANY(user_ids);

  -- --- User device & session tables ---
  DELETE FROM user_device_sessions WHERE user_id = ANY(user_ids);
  DELETE FROM user_error_logs WHERE user_id = ANY(user_ids);
  DELETE FROM device_activity_logs WHERE user_id = ANY(user_ids);
  DELETE FROM student_registered_devices WHERE user_id = ANY(user_ids);
  DELETE FROM device_swap_requests WHERE user_id = ANY(user_ids);

  -- --- User exam & QB stats ---
  DELETE FROM user_exam_attempts WHERE user_id = ANY(user_ids);
  DELETE FROM user_exam_profiles WHERE user_id = ANY(user_ids);
  DELETE FROM user_exam_session_preferences WHERE user_id = ANY(user_ids);
  DELETE FROM user_qb_stats WHERE user_id = ANY(user_ids);

  -- --- Notifications ---
  DELETE FROM user_notifications WHERE user_id = ANY(user_ids);

  -- --- Community / Q&A ---
  DELETE FROM comment_likes WHERE user_id = ANY(user_ids);
  DELETE FROM comment_votes WHERE user_id = ANY(user_ids);
  DELETE FROM improvement_votes WHERE user_id = ANY(user_ids);
  DELETE FROM question_change_requests WHERE user_id = ANY(user_ids);
  DELETE FROM question_comments WHERE user_id = ANY(user_ids);
  DELETE FROM question_improvements WHERE user_id = ANY(user_ids);
  DELETE FROM question_likes WHERE user_id = ANY(user_ids);
  DELETE FROM question_posts WHERE user_id = ANY(user_ids);
  DELETE FROM question_sessions WHERE user_id = ANY(user_ids);
  DELETE FROM question_votes WHERE user_id = ANY(user_ids);

  -- --- Reviews ---
  DELETE FROM review_campaign_students WHERE student_id = ANY(user_ids);

  -- --- Support ---
  DELETE FROM support_ticket_comments WHERE user_id = ANY(user_ids);
  DELETE FROM support_tickets WHERE user_id = ANY(user_ids);

  -- --- Misc user tables ---
  DELETE FROM app_feedback WHERE user_id = ANY(user_ids);
  DELETE FROM chatbot_conversations WHERE user_id = ANY(user_ids);
  DELETE FROM student_credentials WHERE user_id = ANY(user_ids);
  DELETE FROM score_calculations WHERE user_id = ANY(user_ids);
  DELETE FROM prediction_logs WHERE user_id = ANY(user_ids);
  DELETE FROM user_rewards WHERE user_id = ANY(user_ids);

  -- =====================================================
  -- PHASE 2: Original tables (from previous RPC version)
  -- =====================================================

  -- Payment installments (FK to lead_profiles)
  DELETE FROM payment_installments pi
  WHERE pi.lead_profile_id = ANY(v_lead_profile_ids);
  GET DIAGNOSTICS v_deleted_installments = ROW_COUNT;

  -- Scholarship applications (FK to lead_profiles)
  DELETE FROM scholarship_applications sa
  WHERE sa.lead_profile_id = ANY(v_lead_profile_ids) OR sa.user_id = ANY(user_ids);
  GET DIAGNOSTICS v_deleted_scholarships = ROW_COUNT;

  -- Post enrollment details (FK to student_profiles AND users)
  DELETE FROM post_enrollment_details ped
  WHERE ped.student_profile_id = ANY(v_student_profile_ids) OR ped.user_id = ANY(user_ids);

  -- Cashback claims
  DELETE FROM cashback_claims cc
  WHERE cc.user_id = ANY(user_ids);
  GET DIAGNOSTICS v_deleted_cashback_claims = ROW_COUNT;

  -- Application documents
  DELETE FROM application_documents ad
  WHERE ad.user_id = ANY(user_ids);
  GET DIAGNOSTICS v_deleted_documents = ROW_COUNT;

  -- Onboarding responses
  DELETE FROM onboarding_responses obr
  WHERE obr.user_id = ANY(user_ids);
  GET DIAGNOSTICS v_deleted_onboarding_responses = ROW_COUNT;

  -- Onboarding sessions
  DELETE FROM onboarding_sessions obs
  WHERE obs.user_id = ANY(user_ids);
  GET DIAGNOSTICS v_deleted_onboarding_sessions = ROW_COUNT;

  -- Student onboarding progress
  DELETE FROM student_onboarding_progress sop
  WHERE sop.user_id = ANY(user_ids) OR sop.student_profile_id = ANY(v_student_profile_ids);

  -- Payments (cover all FK paths)
  DELETE FROM payments p
  WHERE p.user_id = ANY(user_ids)
     OR p.lead_profile_id = ANY(v_lead_profile_ids)
     OR p.student_profile_id = ANY(v_student_profile_ids);
  GET DIAGNOSTICS v_deleted_payments = ROW_COUNT;

  -- Demo class registrations
  DELETE FROM demo_class_registrations dcr
  WHERE dcr.user_id = ANY(user_ids) OR dcr.lead_profile_id = ANY(v_lead_profile_ids);
  GET DIAGNOSTICS v_deleted_demo_registrations = ROW_COUNT;

  -- Callback requests (FK to both users and lead_profiles)
  DELETE FROM callback_requests cr
  WHERE cr.user_id = ANY(user_ids) OR cr.lead_profile_id = ANY(v_lead_profile_ids);

  -- Center visit bookings
  DELETE FROM center_visit_bookings cvb
  WHERE cvb.user_id = ANY(user_ids);

  -- Email logs
  DELETE FROM email_logs el
  WHERE el.user_id = ANY(user_ids);

  -- Tool usage logs
  DELETE FROM tool_usage_logs tul
  WHERE tul.user_id = ANY(user_ids);

  -- =====================================================
  -- PHASE 3: Clean up lead_profile FK blockers
  -- =====================================================

  -- Application deletions (lead_profile_id is NOT NULL — must delete)
  DELETE FROM application_deletions adl
  WHERE adl.lead_profile_id = ANY(v_lead_profile_ids);

  -- Coupons referencing lead profiles (nullable — set null)
  UPDATE coupons c SET lead_profile_id = NULL
  WHERE c.lead_profile_id = ANY(v_lead_profile_ids);

  -- Refund requests referencing lead profiles
  DELETE FROM refund_requests rr
  WHERE rr.lead_profile_id = ANY(v_lead_profile_ids) OR rr.user_id = ANY(user_ids);

  -- Direct enrollment links referencing student/lead profiles
  UPDATE direct_enrollment_links del SET lead_profile_id = NULL, student_profile_id = NULL
  WHERE del.lead_profile_id = ANY(v_lead_profile_ids) OR del.student_profile_id = ANY(v_student_profile_ids);

  -- =====================================================
  -- PHASE 4: Delete profile tables
  -- =====================================================

  -- Student profiles
  DELETE FROM student_profiles sp
  WHERE sp.user_id = ANY(user_ids);
  GET DIAGNOSTICS v_deleted_student_profiles = ROW_COUNT;

  -- Lead profiles (including soft-deleted ones)
  DELETE FROM lead_profiles lp
  WHERE lp.user_id = ANY(user_ids);
  GET DIAGNOSTICS v_deleted_lead_profiles = ROW_COUNT;

  -- Admin notes
  DELETE FROM admin_user_notes aun
  WHERE aun.user_id = ANY(user_ids);
  GET DIAGNOSTICS v_deleted_admin_notes = ROW_COUNT;

  -- Profile history
  DELETE FROM user_profile_history uph
  WHERE uph.user_id = ANY(user_ids);
  GET DIAGNOSTICS v_deleted_profile_history = ROW_COUNT;

  -- User avatars
  DELETE FROM user_avatars ua
  WHERE ua.user_id = ANY(user_ids);

  -- YouTube subscription coupons
  DELETE FROM youtube_subscription_coupons ysc
  WHERE ysc.user_id = ANY(user_ids);

  -- =====================================================
  -- PHASE 5: Nullify nullable admin-reference columns
  -- (These are columns where the deleted user was an admin/reviewer/creator,
  --  not the owner. We nullify instead of deleting the parent record.)
  -- =====================================================

  -- Original nullifications
  UPDATE application_deletions adl2 SET deleted_by = NULL WHERE adl2.deleted_by = ANY(user_ids);
  UPDATE application_deletions adl3 SET restored_by = NULL WHERE adl3.restored_by = ANY(user_ids);
  DELETE FROM callback_attempts ca WHERE ca.admin_id = ANY(user_ids);
  DELETE FROM direct_enrollment_links del2 WHERE del2.created_by = ANY(user_ids);
  UPDATE admin_notifications an SET read_by = NULL WHERE an.read_by = ANY(user_ids);
  UPDATE coupons c2 SET created_by = NULL WHERE c2.created_by = ANY(user_ids);
  UPDATE demo_class_slots dcs SET created_by = NULL WHERE dcs.created_by = ANY(user_ids);
  UPDATE demo_class_slots dcs2 SET instructor_id = NULL WHERE dcs2.instructor_id = ANY(user_ids);
  UPDATE direct_enrollment_links del3 SET used_by = NULL WHERE del3.used_by = ANY(user_ids);
  UPDATE lead_profiles lp2 SET contacted_by = NULL WHERE lp2.contacted_by = ANY(user_ids);
  UPDATE lead_profiles lp3 SET reviewed_by = NULL WHERE lp3.reviewed_by = ANY(user_ids);
  UPDATE lead_profiles lp4 SET scholarship_opened_by = NULL WHERE lp4.scholarship_opened_by = ANY(user_ids);
  UPDATE site_settings ss SET updated_by = NULL WHERE ss.updated_by = ANY(user_ids);
  UPDATE demo_class_registrations dcr2 SET approved_by = NULL WHERE dcr2.approved_by = ANY(user_ids);
  UPDATE demo_class_registrations dcr3 SET attendance_marked_by = NULL WHERE dcr3.attendance_marked_by = ANY(user_ids);
  UPDATE application_documents ad2 SET verified_by = NULL WHERE ad2.verified_by = ANY(user_ids);
  UPDATE scholarship_applications sa2 SET verified_by = NULL WHERE sa2.verified_by = ANY(user_ids);
  UPDATE scholarship_applications sa3 SET revision_requested_by = NULL WHERE sa3.revision_requested_by = ANY(user_ids);
  UPDATE notification_recipients nrec SET added_by = NULL WHERE nrec.added_by = ANY(user_ids);
  UPDATE refund_requests rr2 SET reviewed_by = NULL WHERE rr2.reviewed_by = ANY(user_ids);
  UPDATE payments p2 SET verified_by = NULL WHERE p2.verified_by = ANY(user_ids);

  -- New nullifications for nexus tables
  UPDATE nexus_classrooms nc SET created_by = NULL WHERE nc.created_by = ANY(user_ids);
  UPDATE nexus_student_documents nsd SET verified_by = NULL WHERE nsd.verified_by = ANY(user_ids);
  UPDATE nexus_student_documents nsd2 SET deleted_by = NULL WHERE nsd2.deleted_by = ANY(user_ids);
  UPDATE nexus_student_onboarding nso SET reviewed_by = NULL WHERE nso.reviewed_by = ANY(user_ids);
  UPDATE nexus_enrollments ne SET removed_by = NULL WHERE ne.removed_by = ANY(user_ids);
  UPDATE nexus_enrollment_history neh SET performed_by = NULL WHERE neh.performed_by = ANY(user_ids);
  UPDATE nexus_drawing_assignments nda SET assigned_by = NULL WHERE nda.assigned_by = ANY(user_ids);
  UPDATE nexus_drawing_submissions nds SET evaluated_by = NULL WHERE nds.evaluated_by = ANY(user_ids);
  UPDATE nexus_resources nr SET created_by = NULL WHERE nr.created_by = ANY(user_ids);
  UPDATE nexus_tests nt SET created_by = NULL WHERE nt.created_by = ANY(user_ids);
  UPDATE nexus_tests nt2 SET created_by_student = NULL WHERE nt2.created_by_student = ANY(user_ids);
  UPDATE nexus_verified_questions nvq SET created_by = NULL WHERE nvq.created_by = ANY(user_ids);
  UPDATE nexus_parent_invite_codes npic SET created_by = NULL WHERE npic.created_by = ANY(user_ids);
  UPDATE nexus_scheduled_classes nsc SET teacher_id = NULL WHERE nsc.teacher_id = ANY(user_ids);
  UPDATE nexus_settings ns SET updated_by = NULL WHERE ns.updated_by = ANY(user_ids);
  UPDATE nexus_foundation_chapters nfc SET created_by = NULL WHERE nfc.created_by = ANY(user_ids);
  UPDATE nexus_foundation_issues nfi SET assigned_to = NULL WHERE nfi.assigned_to = ANY(user_ids);
  UPDATE nexus_foundation_issues nfi2 SET assigned_by = NULL WHERE nfi2.assigned_by = ANY(user_ids);
  UPDATE nexus_foundation_issues nfi3 SET resolved_by = NULL WHERE nfi3.resolved_by = ANY(user_ids);
  UPDATE nexus_modules nm SET created_by = NULL WHERE nm.created_by = ANY(user_ids);
  UPDATE nexus_module_item_issues nmii SET assigned_to = NULL WHERE nmii.assigned_to = ANY(user_ids);
  UPDATE nexus_checklists ncl SET created_by = NULL WHERE ncl.created_by = ANY(user_ids);
  UPDATE nexus_checklist_classrooms ncc SET assigned_by = NULL WHERE ncc.assigned_by = ANY(user_ids);
  UPDATE nexus_classroom_holidays nch SET created_by = NULL WHERE nch.created_by = ANY(user_ids);
  UPDATE nexus_audio_tracks nat SET created_by = NULL WHERE nat.created_by = ANY(user_ids);
  UPDATE nexus_exam_broadcasts neb SET sent_by = NULL WHERE neb.sent_by = ANY(user_ids);
  UPDATE nexus_exam_dates ned SET created_by = NULL WHERE ned.created_by = ANY(user_ids);
  UPDATE nexus_qb_questions nqq SET created_by = NULL WHERE nqq.created_by = ANY(user_ids);
  UPDATE nexus_qb_question_reports nqr SET resolved_by = NULL WHERE nqr.resolved_by = ANY(user_ids);
  UPDATE nexus_qb_original_papers nqop SET uploaded_by = NULL WHERE nqop.uploaded_by = ANY(user_ids);
  UPDATE nexus_qb_classroom_links nqcl SET enabled_by = NULL WHERE nqcl.enabled_by = ANY(user_ids);
  UPDATE nexus_exam_recall_threads nert SET created_by = NULL WHERE nert.created_by = ANY(user_ids);
  UPDATE nexus_exam_recall_drawings nerd SET created_by = NULL WHERE nerd.created_by = ANY(user_ids);
  UPDATE nexus_exam_recall_variants nerv SET linked_by = NULL WHERE nerv.linked_by = ANY(user_ids);
  UPDATE nexus_exam_recall_versions nerve SET author_id = NULL WHERE nerve.author_id = ANY(user_ids);
  UPDATE nexus_exam_recall_versions nerve2 SET reviewed_by = NULL WHERE nerve2.reviewed_by = ANY(user_ids);
  UPDATE nexus_document_templates ndt SET created_by = NULL WHERE ndt.created_by = ANY(user_ids);

  -- New nullifications for library tables
  UPDATE library_collections lc SET created_by = NULL WHERE lc.created_by = ANY(user_ids);
  UPDATE library_videos lv SET reviewed_by = NULL WHERE lv.reviewed_by = ANY(user_ids);
  UPDATE library_sync_log lsl SET run_by = NULL WHERE lsl.run_by = ANY(user_ids);

  -- New nullifications for other tables
  UPDATE app_settings aps SET updated_by = NULL WHERE aps.updated_by = ANY(user_ids);
  UPDATE classroom_access_requests car SET reviewed_by = NULL WHERE car.reviewed_by = ANY(user_ids);
  UPDATE course_group_links cgl SET updated_by = NULL WHERE cgl.updated_by = ANY(user_ids);
  UPDATE device_swap_requests dsr SET reviewed_by = NULL WHERE dsr.reviewed_by = ANY(user_ids);
  UPDATE expense_assignments ea SET created_by = NULL WHERE ea.created_by = ANY(user_ids);
  UPDATE financial_transactions ft SET created_by = NULL WHERE ft.created_by = ANY(user_ids);
  UPDATE review_campaigns rc SET created_by = NULL WHERE rc.created_by = ANY(user_ids);
  UPDATE student_credentials sc SET published_by = NULL WHERE sc.published_by = ANY(user_ids);
  UPDATE support_tickets st SET assigned_to = NULL WHERE st.assigned_to = ANY(user_ids);
  UPDATE support_tickets st2 SET resolved_by = NULL WHERE st2.resolved_by = ANY(user_ids);
  UPDATE users u SET linked_classroom_by = NULL WHERE u.linked_classroom_by = ANY(user_ids);

  -- =====================================================
  -- PHASE 6: Delete users
  -- =====================================================

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
