// @ts-nocheck
export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdminClient } from '@neram/database';
import { getAppOnlyToken, addMemberToTeam, addMemberToGroupChat } from '@neram/auth';

/**
 * GET /api/students/sync-entra — Pull all student accounts from Azure AD,
 * compare with DB, and return who's missing from Nexus.
 */
export async function GET() {
  try {
    const token = await getAppOnlyToken();
    const supabase = getSupabaseAdminClient() as any;

    // 1. Fetch all users from Azure AD (paginated)
    let allAdUsers: any[] = [];
    let nextLink = 'https://graph.microsoft.com/v1.0/users?$select=id,displayName,userPrincipalName,mail,accountEnabled,assignedLicenses&$top=100';

    while (nextLink) {
      const res = await fetch(nextLink, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) {
        const err = await res.text().catch(() => '');
        throw new Error(`Graph API error: ${res.status} ${err}`);
      }
      const data = await res.json();
      allAdUsers = allAdUsers.concat(data.value || []);
      nextLink = data['@odata.nextLink'] || null;
    }

    // 2. Filter to student accounts only (exclude admin/teacher patterns)
    const staffPatterns = ['admin', 'teacher', 'hari', 'info@neramclasses.com', 'shanthi', 'paramesh', 'tamil'];
    const studentAccounts = allAdUsers.filter((u: any) => {
      if (!u.accountEnabled) return false;
      const email = (u.userPrincipalName || '').toLowerCase();
      // Exclude service accounts and staff
      if (staffPatterns.some((p) => email.includes(p.toLowerCase()))) return false;
      // Include neramclasses.com, nerasmclasses.onmicrosoft.com, neram.co.in accounts
      if (email.includes('neramclasses') || email.includes('nerasmclasses') || email.includes('neram.co.in')) return true;
      return false;
    });

    // 3. Get existing DB users with ms_oid
    const msOids = studentAccounts.map((u: any) => u.id);
    const { data: existingUsers } = await supabase
      .from('users')
      .select('id, ms_oid, email')
      .in('ms_oid', msOids.length > 0 ? msOids : ['__none__']);

    const existingOids = new Set((existingUsers || []).map((u: any) => u.ms_oid));

    // 4. Get nexus enrollment status
    const existingUserIds = (existingUsers || []).map((u: any) => u.id);
    const { data: enrollments } = await supabase
      .from('nexus_enrollments')
      .select('user_id, classroom_id, classroom:nexus_classrooms(name)')
      .in('user_id', existingUserIds.length > 0 ? existingUserIds : ['__none__'])
      .eq('is_active', true);

    const enrollmentMap = new Map<string, string[]>();
    for (const e of (enrollments || [])) {
      const classrooms = enrollmentMap.get(e.user_id) || [];
      classrooms.push(e.classroom?.name || 'Unknown');
      enrollmentMap.set(e.user_id, classrooms);
    }

    // 5. Check student_profiles
    const { data: profiles } = await supabase
      .from('student_profiles')
      .select('user_id')
      .in('user_id', existingUserIds.length > 0 ? existingUserIds : ['__none__']);

    const profileUserIds = new Set((profiles || []).map((p: any) => p.user_id));

    // Build the response
    const oidToUserId = new Map((existingUsers || []).map((u: any) => [u.ms_oid, u.id]));

    const students = studentAccounts.map((adUser: any) => {
      const dbUserId = oidToUserId.get(adUser.id);
      const classrooms = dbUserId ? enrollmentMap.get(dbUserId) || [] : [];
      return {
        msOid: adUser.id,
        email: adUser.userPrincipalName,
        name: adUser.displayName || adUser.userPrincipalName?.split('@')[0],
        inDatabase: existingOids.has(adUser.id),
        dbUserId: dbUserId || null,
        hasStudentProfile: dbUserId ? profileUserIds.has(dbUserId) : false,
        nexusClassrooms: classrooms,
        needsSetup: classrooms.length === 0,
      };
    });

    // Sort: needs setup first, then by name
    students.sort((a: any, b: any) => {
      if (a.needsSetup !== b.needsSetup) return a.needsSetup ? -1 : 1;
      return (a.name || '').localeCompare(b.name || '');
    });

    return NextResponse.json({
      success: true,
      students,
      summary: {
        totalInEntra: students.length,
        alreadyInNexus: students.filter((s: any) => !s.needsSetup).length,
        needsSetup: students.filter((s: any) => s.needsSetup).length,
      },
    });
  } catch (error: any) {
    console.error('Error syncing from Entra:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

/**
 * POST /api/students/sync-entra — Bulk enroll students from Entra into Nexus classrooms
 * Body: { students: [{ msOid, email, name, course: 'nata'|'jee_paper2'|'both' }] }
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { students: studentList } = body;

    if (!studentList || !Array.isArray(studentList) || studentList.length === 0) {
      return NextResponse.json({ error: 'students array is required' }, { status: 400 });
    }

    const supabase = getSupabaseAdminClient() as any;

    // Get classroom IDs
    const { data: classrooms } = await supabase
      .from('nexus_classrooms')
      .select('id, name, type, ms_team_id, ms_team_sync_enabled')
      .eq('is_active', true);

    const commonClassroom = classrooms?.find((c: any) => c.type === 'common');
    const nataClassroom = classrooms?.find((c: any) => c.type === 'nata');
    const jeeClassroom = classrooms?.find((c: any) => c.type === 'jee');

    // Get group chat config
    const { data: chatSetting } = await supabase
      .from('app_settings')
      .select('setting_value')
      .eq('setting_key', 'teams_group_chat')
      .maybeSingle();
    const groupChatConfig = chatSetting?.setting_value;

    // Auto-complete step keys
    const autoCompleteStepKeys = ['install_teams', 'install_authenticator', 'view_credentials', 'confirm_login_terms', 'delete_credentials'];
    const { data: stepDefs } = await supabase
      .from('onboarding_step_definitions')
      .select('id, step_key')
      .in('step_key', [...autoCompleteStepKeys, 'join_teams_class']);
    const stepDefMap = new Map((stepDefs || []).map((s: any) => [s.step_key, s.id]));

    const results: any[] = [];

    for (const student of studentList) {
      const result: any = { email: student.email, name: student.name, course: student.course, success: true, actions: [] };

      try {
        // 1. Find or create user in DB
        let userId: string;
        const { data: existingUser } = await supabase
          .from('users')
          .select('id')
          .eq('ms_oid', student.msOid)
          .maybeSingle();

        if (existingUser) {
          userId = existingUser.id;
          result.actions.push('user_exists');
        } else {
          const { data: newUser, error: userErr } = await supabase
            .from('users')
            .insert({
              name: student.name,
              email: student.email,
              ms_oid: student.msOid,
              user_type: 'student',
              status: 'active',
              email_verified: true,
            })
            .select()
            .single();

          if (userErr) throw new Error(`User creation failed: ${userErr.message}`);
          userId = newUser.id;
          result.actions.push('user_created');
        }

        // 2. Determine classrooms based on course
        const targetClassrooms: any[] = [];
        if (commonClassroom) targetClassrooms.push(commonClassroom);
        if (student.course === 'nata' || student.course === 'both') {
          if (nataClassroom) targetClassrooms.push(nataClassroom);
        }
        if (student.course === 'jee_paper2' || student.course === 'both') {
          if (jeeClassroom) targetClassrooms.push(jeeClassroom);
        }

        // 3. Create nexus enrollments
        for (const classroom of targetClassrooms) {
          const { error: enrollErr } = await supabase
            .from('nexus_enrollments')
            .upsert(
              { user_id: userId, classroom_id: classroom.id, role: 'student', is_active: true },
              { onConflict: 'user_id,classroom_id' }
            );
          if (!enrollErr) {
            result.actions.push(`enrolled_${classroom.name}`);
          }

          // Auto-add to Teams team
          if (classroom.ms_team_id && classroom.ms_team_sync_enabled) {
            try {
              const teamsResult = await addMemberToTeam(classroom.ms_team_id, student.email);
              result.actions.push(`teams_${classroom.name}_${teamsResult.success ? (teamsResult.reason || 'added') : 'failed'}`);
            } catch {}
          }

          // Create nexus_student_onboarding
          await supabase
            .from('nexus_student_onboarding')
            .upsert(
              { student_id: userId, classroom_id: classroom.id, status: 'in_progress' },
              { onConflict: 'student_id,classroom_id' }
            );
        }

        // 4. Add to group chat
        if (groupChatConfig?.chat_id && groupChatConfig.auto_add_enabled) {
          try {
            const chatResult = await addMemberToGroupChat(groupChatConfig.chat_id, student.email);
            result.actions.push(`group_chat_${chatResult.success ? (chatResult.reason || 'added') : 'failed'}`);
          } catch {}
        }

        // 5. Create student_profile
        const { data: existingProfile } = await supabase
          .from('student_profiles')
          .select('id')
          .eq('user_id', userId)
          .maybeSingle();

        let studentProfileId: string;
        if (existingProfile) {
          studentProfileId = existingProfile.id;
        } else {
          const { data: newProfile } = await supabase
            .from('student_profiles')
            .insert({
              user_id: userId,
              enrollment_date: new Date().toISOString().split('T')[0],
              ms_teams_email: student.email,
              payment_status: 'paid',
              total_fee: 0,
              fee_paid: 0,
              fee_due: 0,
            })
            .select()
            .single();
          studentProfileId = newProfile?.id;
          result.actions.push('profile_created');
        }

        // 6. Initialize onboarding + auto-complete steps
        if (studentProfileId) {
          try {
            await supabase.rpc('initialize_student_onboarding', {
              p_student_profile_id: studentProfileId,
              p_user_id: userId,
              p_enrollment_type: 'direct',
            });
          } catch {}

          const now = new Date().toISOString();
          for (const stepKey of autoCompleteStepKeys) {
            const stepDefId = stepDefMap.get(stepKey);
            if (stepDefId) {
              await supabase
                .from('student_onboarding_progress')
                .update({ is_completed: true, status: 'completed', completed_at: now, completed_by_type: 'admin' })
                .eq('student_profile_id', studentProfileId)
                .eq('step_definition_id', stepDefId);
            }
          }

          // Mark join_teams_class as complete (they're in Teams)
          const teamsStepId = stepDefMap.get('join_teams_class');
          if (teamsStepId) {
            await supabase
              .from('student_onboarding_progress')
              .update({ is_completed: true, status: 'completed', completed_at: now, completed_by_type: 'admin', auto_add_attempted: true, auto_add_result: 'success' })
              .eq('student_profile_id', studentProfileId)
              .eq('step_definition_id', teamsStepId);
          }

          result.actions.push('onboarding_initialized');
        }

      } catch (err: any) {
        result.success = false;
        result.error = err.message;
      }

      results.push(result);
    }

    const successCount = results.filter((r) => r.success).length;

    return NextResponse.json({
      success: true,
      summary: { total: studentList.length, success: successCount, failed: studentList.length - successCount },
      results,
    });
  } catch (error: any) {
    console.error('Error bulk enrolling from Entra:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
