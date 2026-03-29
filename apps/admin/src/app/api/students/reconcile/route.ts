// @ts-nocheck
export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdminClient } from '@neram/database';
import { addMemberToTeam, addMemberToGroupChat } from '@neram/auth';

/**
 * GET /api/students/reconcile — List legacy students who have nexus enrollments but no student_profile
 */
export async function GET() {
  try {
    const supabase = getSupabaseAdminClient() as any;

    // Find users with nexus_enrollments but no student_profiles
    const { data: legacyStudents, error } = await supabase
      .from('users')
      .select(`
        id, email, first_name, name, ms_oid, firebase_uid, user_type,
        nexus_enrollments!nexus_enrollments_user_id_fkey!inner(classroom_id, batch_id, is_active, classroom:nexus_classrooms(id, name, type, ms_team_id))
      `)
      .eq('nexus_enrollments.is_active', true)
      .not('ms_oid', 'is', null);

    if (error) throw error;

    // Filter to those without student_profiles
    const userIds = (legacyStudents || []).map((u: any) => u.id);
    const { data: existingProfiles } = await supabase
      .from('student_profiles')
      .select('user_id')
      .in('user_id', userIds.length > 0 ? userIds : ['__none__']);

    const profileUserIds = new Set((existingProfiles || []).map((p: any) => p.user_id));

    const legacy = (legacyStudents || [])
      .filter((u: any) => !profileUserIds.has(u.id))
      .map((u: any) => ({
        userId: u.id,
        email: u.email,
        name: u.first_name || u.name || u.email?.split('@')[0] || 'Unknown',
        msOid: u.ms_oid,
        hasFirebase: !!u.firebase_uid,
        classrooms: (u.nexus_enrollments || []).map((e: any) => ({
          id: e.classroom?.id,
          name: e.classroom?.name,
          type: e.classroom?.type,
          msTeamId: e.classroom?.ms_team_id,
        })),
      }));

    return NextResponse.json({ success: true, students: legacy, count: legacy.length });
  } catch (error: any) {
    console.error('Error fetching legacy students:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

/**
 * POST /api/students/reconcile — Reconcile selected legacy students
 * Creates student_profiles, initializes onboarding, auto-completes known steps,
 * verifies Teams membership, creates nexus_student_onboarding records.
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { userIds } = body;

    if (!userIds || !Array.isArray(userIds) || userIds.length === 0) {
      return NextResponse.json({ error: 'userIds array is required' }, { status: 400 });
    }

    const supabase = getSupabaseAdminClient() as any;

    // Steps to auto-complete for legacy students
    const autoCompleteStepKeys = [
      'install_teams',
      'install_authenticator',
      'view_credentials',
      'confirm_login_terms',
    ];

    // Get step definition IDs for auto-complete steps
    const { data: stepDefs } = await supabase
      .from('onboarding_step_definitions')
      .select('id, step_key')
      .in('step_key', [...autoCompleteStepKeys, 'join_teams_class', 'delete_credentials']);

    const stepDefMap = new Map((stepDefs || []).map((s: any) => [s.step_key, s.id]));

    // Get group chat config
    const { data: chatSetting } = await supabase
      .from('app_settings')
      .select('setting_value')
      .eq('setting_key', 'teams_group_chat')
      .maybeSingle();
    const groupChatConfig = chatSetting?.setting_value;

    const results: any[] = [];

    for (const userId of userIds) {
      const result: any = { userId, success: true, steps: {} };

      try {
        // 1. Get user info
        const { data: user } = await supabase
          .from('users')
          .select('id, email, first_name, name, ms_oid')
          .eq('id', userId)
          .single();

        if (!user) {
          result.success = false;
          result.error = 'User not found';
          results.push(result);
          continue;
        }

        // 2. Check if student_profile already exists
        const { data: existingProfile } = await supabase
          .from('student_profiles')
          .select('id')
          .eq('user_id', userId)
          .maybeSingle();

        let studentProfileId: string;

        if (existingProfile) {
          studentProfileId = existingProfile.id;
          result.steps.profile = 'already_exists';
        } else {
          // Get earliest enrollment date
          const { data: enrollments } = await supabase
            .from('nexus_enrollments')
            .select('created_at')
            .eq('user_id', userId)
            .eq('is_active', true)
            .order('created_at', { ascending: true })
            .limit(1);

          const enrollmentDate = enrollments?.[0]?.created_at
            ? new Date(enrollments[0].created_at).toISOString().split('T')[0]
            : new Date().toISOString().split('T')[0];

          // Create student_profile (use upsert to handle race conditions where
          // another request may have created the profile between the check and insert)
          const { data: newProfile, error: profileErr } = await supabase
            .from('student_profiles')
            .upsert({
              user_id: userId,
              enrollment_date: enrollmentDate,
              ms_teams_email: user.email,
              payment_status: 'paid',
              total_fee: 0,
              fee_paid: 0,
              fee_due: 0,
            }, { onConflict: 'user_id' })
            .select()
            .single();

          if (profileErr) {
            result.success = false;
            result.error = `Profile creation failed: ${profileErr.message}`;
            results.push(result);
            continue;
          }

          studentProfileId = newProfile.id;
          result.steps.profile = 'created';
          result.studentProfileId = studentProfileId;
        }

        // 3. Initialize onboarding progress (idempotent)
        try {
          await supabase.rpc('initialize_student_onboarding', {
            p_student_profile_id: studentProfileId,
            p_user_id: userId,
            p_enrollment_type: 'direct',
          });
          result.steps.onboarding_init = 'done';
        } catch (initErr: any) {
          result.steps.onboarding_init = `error: ${initErr.message}`;
        }

        // 4. Auto-complete known steps
        const now = new Date().toISOString();
        for (const stepKey of autoCompleteStepKeys) {
          const stepDefId = stepDefMap.get(stepKey);
          if (!stepDefId) continue;

          const { error: markErr } = await supabase
            .from('student_onboarding_progress')
            .update({
              is_completed: true,
              status: 'completed',
              completed_at: now,
              completed_by_type: 'admin',
            })
            .eq('student_profile_id', studentProfileId)
            .eq('step_definition_id', stepDefId);

          result.steps[stepKey] = markErr ? `error: ${markErr.message}` : 'auto_completed';
        }

        // 5. Skip delete_credentials step (mark complete since no vault entry)
        const deleteStepId = stepDefMap.get('delete_credentials');
        if (deleteStepId) {
          await supabase
            .from('student_onboarding_progress')
            .update({ is_completed: true, status: 'completed', completed_at: now, completed_by_type: 'admin' })
            .eq('student_profile_id', studentProfileId)
            .eq('step_definition_id', deleteStepId);
          result.steps.delete_credentials = 'auto_completed';
        }

        // 6. Check Teams membership and add if missing
        const { data: enrolledClassrooms } = await supabase
          .from('nexus_enrollments')
          .select('classroom_id, classroom:nexus_classrooms(ms_team_id, ms_team_sync_enabled, name)')
          .eq('user_id', userId)
          .eq('is_active', true);

        let allTeamsOk = true;
        for (const enrollment of (enrolledClassrooms || [])) {
          const classroom = enrollment.classroom;
          if (classroom?.ms_team_id && classroom.ms_team_sync_enabled && user.email) {
            try {
              const addResult = await addMemberToTeam(classroom.ms_team_id, user.email);
              result.steps[`teams_${classroom.name}`] = addResult.success
                ? (addResult.reason === 'already_member' ? 'already_member' : 'added')
                : `failed: ${addResult.reason}`;
              if (!addResult.success) allTeamsOk = false;
            } catch (teamsErr) {
              console.warn(`[reconcile] Failed to add user ${userId} to Teams team ${classroom.ms_team_id}:`, teamsErr);
              allTeamsOk = false;
            }
          }
        }

        // 7. Add to group chat if configured
        if (groupChatConfig?.chat_id && groupChatConfig.auto_add_enabled && user.email) {
          try {
            const chatResult = await addMemberToGroupChat(groupChatConfig.chat_id, user.email);
            result.steps.group_chat = chatResult.success
              ? (chatResult.reason === 'already_member' ? 'already_member' : 'added')
              : `failed: ${chatResult.reason}`;
          } catch (chatErr) {
            console.warn(`[reconcile] Failed to add user ${userId} to group chat:`, chatErr);
            result.steps.group_chat = 'error';
          }
        }

        // 8. Mark join_teams_class as complete if all Teams ok
        if (allTeamsOk) {
          const teamsStepId = stepDefMap.get('join_teams_class');
          if (teamsStepId) {
            await supabase
              .from('student_onboarding_progress')
              .update({
                is_completed: true,
                status: 'completed',
                completed_at: now,
                completed_by_type: 'admin',
                auto_add_attempted: true,
                auto_add_result: 'success',
              })
              .eq('student_profile_id', studentProfileId)
              .eq('step_definition_id', teamsStepId);
            result.steps.join_teams_class = 'auto_completed';
          }
        }

        // 9. Create nexus_student_onboarding records (in_progress — need identity docs)
        const classroomIds = (enrolledClassrooms || []).map((e: any) => e.classroom_id);
        for (const classroomId of classroomIds) {
          await supabase
            .from('nexus_student_onboarding')
            .upsert(
              { student_id: userId, classroom_id: classroomId, status: 'in_progress' },
              { onConflict: 'student_id,classroom_id' }
            );
        }
        result.steps.nexus_onboarding = 'in_progress';

      } catch (err: any) {
        result.success = false;
        result.error = err.message;
      }

      results.push(result);
    }

    const successCount = results.filter((r) => r.success).length;
    const failCount = results.filter((r) => !r.success).length;

    return NextResponse.json({
      success: true,
      summary: { total: userIds.length, success: successCount, failed: failCount },
      results,
    });
  } catch (error: any) {
    console.error('Error reconciling students:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
