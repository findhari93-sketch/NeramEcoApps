// @ts-nocheck
export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdminClient, getDefaultClassroom, reconcileMsIdentity } from '@neram/database';
import { getAppOnlyToken, addStudentToClassroomTeams, getUserProfile } from '@neram/auth';

/**
 * GET /api/students/sync-entra — Pull all student accounts from Azure AD,
 * compare with DB, and return who's missing from Nexus.
 */
export async function GET() {
  try {
    const token = await getAppOnlyToken();
    const supabase = getSupabaseAdminClient() as any;

    // 1. Fetch all users from Azure AD (paginated, with 30s timeout per page)
    let allAdUsers: any[] = [];
    let nextLink = 'https://graph.microsoft.com/v1.0/users?$select=id,displayName,userPrincipalName,mail,otherMails,mobilePhone,accountEnabled,assignedLicenses&$top=100';

    while (nextLink) {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 30_000);
      try {
        const res = await fetch(nextLink, {
          headers: { Authorization: `Bearer ${token}` },
          signal: controller.signal,
        });
        if (!res.ok) {
          const err = await res.text().catch(() => '');
          throw new Error(`Graph API error: ${res.status} ${err}`);
        }
        const data = await res.json();
        allAdUsers = allAdUsers.concat(data.value || []);
        nextLink = data['@odata.nextLink'] || null;
      } finally {
        clearTimeout(timeoutId);
      }
    }

    // 2. Filter to student accounts only (exclude admin/teacher patterns)
    // NOTE: These staff patterns are hardcoded. In the future, this should be moved
    // to a configurable app_settings entry (e.g., 'entra_staff_email_patterns') so that
    // new staff accounts don't require a code change to be excluded from student sync.
    const staffPatterns = ['admin', 'teacher', 'hari', 'info@neramclasses.com', 'shanthi', 'paramesh', 'tamil'];
    // Shared/service mailboxes (noreply@, support@, etc.) live in the same tenant but
    // are not people. Matched on the local part (before @) so they are never surfaced
    // as students to enroll. See the noreply@/support@ cleanup, 2026-06-28.
    const serviceLocalParts = new Set([
      'noreply', 'no-reply', 'donotreply', 'do-not-reply', 'support', 'info', 'contact',
      'hello', 'office', 'accounts', 'billing', 'help', 'mail', 'team', 'postmaster',
      'webmaster', 'hr', 'careers', 'jobs', 'enquiry', 'enquiries', 'noreply-neram',
    ]);
    const studentAccounts = allAdUsers.filter((u: any) => {
      if (!u.accountEnabled) return false;
      const email = (u.userPrincipalName || '').toLowerCase();
      // Exclude service/shared mailboxes by their local part
      if (serviceLocalParts.has(email.split('@')[0])) return false;
      // Exclude staff
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

    // Suggested existing-row match for accounts NOT yet linked by ms_oid. Uses the
    // SAME reconciler the POST applies (dry-run, no writes), so the admin sees the
    // exact link that will happen: this Entra account attaches to the student's
    // existing Google row instead of creating a duplicate @neramclasses.com shell.
    // Bounded so a large unmatched set can't blow up the request.
    const adById = new Map(studentAccounts.map((u: any) => [u.id, u]));
    const SUGGEST_CAP = 100;
    let suggested = 0;
    for (const s of students) {
      if (s.inDatabase || suggested >= SUGGEST_CAP) continue;
      const ad: any = adById.get(s.msOid);
      const phoneHints = ad ? [ad.mobilePhone, ...(ad.businessPhones || [])] : [];
      const emailHints = ad ? (ad.otherMails || []) : [];
      const match = await reconcileMsIdentity(supabase, {
        msOid: s.msOid,
        upn: s.email,
        phoneHints,
        emailHints,
        dryRun: true,
      }).catch(() => null);
      suggested++;
      if (match && match.user) {
        s.suggestedMatch = {
          id: match.user.id,
          name: match.user.name,
          email: match.user.email,
          personalEmail: match.user.personal_email || null,
          matchedBy: match.action.replace('linked_by_', ''),
        };
      }
    }

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

    // Single-classroom mode: everyone enrolls into the one active classroom
    // (type='common'). The Team + group-chat sync is handled per-student by the
    // shared addStudentToClassroomTeams helper below.
    const defaultClassroom = await getDefaultClassroom(supabase);
    if (!defaultClassroom) {
      return NextResponse.json({ error: 'No active classroom configured' }, { status: 400 });
    }

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
        // Split display name into first_name
        const nameParts = (student.name || '').trim().split(/\s+/);
        const firstName = nameParts[0] || student.email?.split('@')[0] || '';

        // 1. Find, LINK, or create the user. The admin picker may pass an explicit
        //    linkUserId (the existing Google row the admin chose to attach this
        //    Entra account to); honour it directly. Otherwise reconcile against
        //    existing rows by ms_oid → classroom email → email → phone → personal
        //    email, pulling phone/otherMails from Graph so a pre-existing Google
        //    row is linked instead of spawning a duplicate @neramclasses.com shell.
        let userId: string;
        if (student.linkUserId) {
          const { data: linkRow } = await supabase
            .from('users')
            .select('id, ms_oid, linked_classroom_email')
            .eq('id', student.linkUserId)
            .maybeSingle();
          if (!linkRow) throw new Error(`linkUserId ${student.linkUserId} not found`);
          if (linkRow.ms_oid && linkRow.ms_oid !== student.msOid) {
            throw new Error('Chosen student already has a different Microsoft account linked');
          }
          const updates: Record<string, unknown> = { ms_oid: student.msOid };
          if (!linkRow.linked_classroom_email) {
            updates.linked_classroom_email = student.email;
            updates.linked_classroom_at = new Date().toISOString();
          }
          await supabase.from('users').update(updates).eq('id', linkRow.id);
          userId = linkRow.id;
          result.actions.push('user_linked_manual');
        } else {
          const profile = await getUserProfile(student.msOid).catch(() => null);
          const phoneHints = profile ? [profile.mobilePhone, ...(profile.businessPhones || [])] : [];
          const emailHints = profile ? (profile.otherMails || []) : [];
          const reconciled = await reconcileMsIdentity(supabase, {
            msOid: student.msOid,
            upn: student.email,
            name: student.name,
            phoneHints,
            emailHints,
            createDefaults: { first_name: firstName },
          });
          userId = reconciled.user.id;
          result.actions.push(
            reconciled.action === 'created'
              ? 'user_created'
              : reconciled.linked
                ? `user_linked_${reconciled.action.replace('linked_by_', '')}`
                : 'user_exists'
          );
        }

        // Backfill name/first_name on a matched/linked row when first_name is missing.
        await supabase
          .from('users')
          .update({ name: student.name || undefined, first_name: firstName || undefined })
          .eq('id', userId)
          .is('first_name', null);

        // 2. Enroll into the single default classroom (idempotent).
        const { error: enrollErr } = await supabase
          .from('nexus_enrollments')
          .upsert(
            { user_id: userId, classroom_id: defaultClassroom.id, role: 'student', is_active: true },
            { onConflict: 'user_id,classroom_id' }
          );
        if (!enrollErr) {
          result.actions.push(`enrolled_${defaultClassroom.name}`);
        }

        // 3. Add to the classroom's linked Team + the global group chat (best-effort).
        const sync = await addStudentToClassroomTeams(supabase, {
          classroomId: defaultClassroom.id,
          userId,
          upn: student.email,
          source: 'sync_entra',
        });
        if (sync.team) {
          result.actions.push(`teams_${sync.team.success ? (sync.team.reason || 'added') : 'failed'}`);
        }
        if (sync.groupChat) {
          result.actions.push(`group_chat_${sync.groupChat.success ? (sync.groupChat.reason || 'added') : 'failed'}`);
        }

        // 4. Track onboarding for the classroom.
        await supabase
          .from('nexus_student_onboarding')
          .upsert(
            { student_id: userId, classroom_id: defaultClassroom.id, status: 'in_progress' },
            { onConflict: 'student_id,classroom_id' }
          );

        // 5. Create/update student_profile. Course-specific classroom linkage is
        // retired in single-classroom mode, so course_id stays null.
        const { data: existingProfile } = await supabase
          .from('student_profiles')
          .select('id')
          .eq('user_id', userId)
          .maybeSingle();

        let studentProfileId: string | null;
        if (existingProfile) {
          studentProfileId = existingProfile.id;
          // Update missing fields on existing profile
          await supabase
            .from('student_profiles')
            .update({
              ms_teams_email: student.email,
              course_id: null,
            })
            .eq('id', existingProfile.id);
        } else {
          const { data: newProfile, error: profileErr } = await supabase
            .from('student_profiles')
            .insert({
              user_id: userId,
              enrollment_date: new Date().toISOString().split('T')[0],
              ms_teams_email: student.email,
              course_id: null,
              payment_status: 'paid',
              total_fee: 0,
              fee_paid: 0,
              fee_due: 0,
            })
            .select()
            .single();

          if (profileErr || !newProfile) {
            console.warn(`[sync-entra] Failed to create student_profile for user ${userId}:`, profileErr?.message);
            result.actions.push('profile_creation_failed');
            studentProfileId = null;
          } else {
            studentProfileId = newProfile.id;
            result.actions.push('profile_created');
          }
        }

        // 5b. Create lead_profile for tracking (interest_course, source)
        // source enum: 'website_form' | 'app' | 'referral' | 'manual' | 'direct_link'
        if (studentProfileId) {
          await supabase
            .from('lead_profiles')
            .insert({
              user_id: userId,
              source: 'manual',
              status: 'enrolled',
              interest_course: student.course === 'jee_paper2' ? 'jee_paper2' : student.course === 'both' ? 'both' : 'nata',
              first_name: firstName,
            })
            .then(() => {})
            .catch(() => {}); // Non-blocking — lead_profile is for record-keeping
        }

        // 6. Initialize onboarding + auto-complete steps
        if (studentProfileId) {
          try {
            await supabase.rpc('initialize_student_onboarding', {
              p_student_profile_id: studentProfileId,
              p_user_id: userId,
              p_enrollment_type: 'direct',
            });
          } catch (initErr) {
            console.warn(`[sync-entra] Failed to initialize onboarding for profile ${studentProfileId}:`, initErr);
          }

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
