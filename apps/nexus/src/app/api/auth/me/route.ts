import { NextRequest, NextResponse } from 'next/server';
import { verifyMsToken } from '@/lib/ms-verify';
import { getSupabaseAdminClient, reconcileMsIdentity } from '@neram/database';
import { getUserProfile } from '@neram/auth';

/**
 * GET /api/auth/me
 *
 * Validates the Microsoft access token, finds or creates the user in Supabase,
 * and returns the user with their role and enrolled classrooms.
 */
export async function GET(request: NextRequest) {
  try {
    const authHeader = request.headers.get('Authorization');
    const msUser = await verifyMsToken(authHeader);

    const supabase = getSupabaseAdminClient();

    // Fast path: an already-linked Microsoft account (the vast majority of logins).
    let { data: user } = await supabase
      .from('users')
      .select('*')
      .eq('ms_oid', msUser.oid)
      .maybeSingle();

    if (!user) {
      // First login / not yet linked. Reconcile against the student's existing
      // rows instead of minting a duplicate @neramclasses.com shell. The shared
      // reconciler matches by ms_oid → linked_classroom_email → email → phone →
      // personal email, so a student who first signed up via Google (Tools app)
      // gets their Microsoft identity ATTACHED to that Google row. Phone and
      // otherMails come from Graph (best-effort; null if app-only creds are
      // unavailable, in which case it degrades to the old email-based linking).
      const profile = await getUserProfile(msUser.oid).catch(() => null);
      const phoneHints = profile ? [profile.mobilePhone, ...(profile.businessPhones || [])] : [];
      const emailHints = profile ? (profile.otherMails || []) : [];
      const reconciled = await reconcileMsIdentity(supabase, {
        msOid: msUser.oid,
        upn: msUser.email,
        name: msUser.name,
        phoneHints,
        emailHints,
        createDefaults: { phone_verified: false, preferred_language: 'en' },
      });
      user = reconciled.user;
    }

    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    // Alumni gate: graduated students are fully locked out of Nexus. This is the
    // single chokepoint the whole UI depends on, so blocking here is enough (and
    // their Nexus enrollments are deactivated at graduation, so data routes are
    // empty too). A teacher/admin using "View as Student" is allowed through so
    // they can still inspect an alumnus's account for support.
    if (user.is_alumni && !msUser.impersonatorUserId) {
      return NextResponse.json(
        {
          error: 'alumni',
          message:
            "You've completed the program and are now a Neram alumnus. Your Nexus access has ended. Thank you, and all the best!",
        },
        { status: 403 }
      );
    }

    // Sync name and update last login from Microsoft.
    // Don't overwrite users.email — students often sign up via Firebase with
    // a personal email first, then later log in with their @neramclasses.com
    // Microsoft account. The primary email stays as the original signup
    // identity; the MS classroom email is tracked separately in
    // linked_classroom_email so admins can tell the two apart.
    // When impersonating ("View as Student"), don't bump the student's
    // last_login_at — the teacher/admin is viewing, not the student logging in.
    const updates: Record<string, string> = msUser.impersonatorUserId
      ? {}
      : { last_login_at: new Date().toISOString() };
    if (msUser.name && msUser.name !== user.name) updates.name = msUser.name;
    if (
      msUser.email &&
      msUser.email !== user.email &&
      msUser.email !== user.linked_classroom_email
    ) {
      updates.linked_classroom_email = msUser.email;
      if (!user.linked_classroom_at) {
        updates.linked_classroom_at = new Date().toISOString();
      }
    }

    if (Object.keys(updates).length > 0) {
      await supabase
        .from('users')
        .update(updates)
        .eq('id', user.id);
    }

    if (updates.name) user = { ...user, name: updates.name };
    if (updates.linked_classroom_email) {
      user = { ...user, linked_classroom_email: updates.linked_classroom_email };
    }

    // Fetch enrolled classrooms with role
    const { data: enrollments } = await supabase
      .from('nexus_enrollments')
      .select('*, classroom:nexus_classrooms(*)')
      .eq('user_id', user.id)
      .eq('is_active', true);

    // Only surface enrollments whose classroom is still active. Archiving a
    // classroom (is_active=false) must remove it from the switcher even if the
    // enrollment row is left active — the enrollment filter above does not cover
    // that. Use a JS filter (not an !inner embed, which would silently drop rows
    // with a missing classroom).
    const activeEnrollments = (enrollments || []).filter(
      (e: any) => e.classroom && e.classroom.is_active !== false
    );

    // Determine the effective Nexus role from user_type or enrollments
    const nexusRole = user.user_type === 'admin'
      ? 'admin'
      : user.user_type === 'teacher'
        ? 'teacher'
        : activeEnrollments.some((e: any) => e.role === 'teacher')
          ? 'teacher'
          : 'student';

    // Student access gate: during the 2026-27 rebuild Nexus is opened to
    // students one by one. A student who hasn't been granted access yet sees a
    // friendly "preparing your classroom" screen instead of the app. Mirrors
    // the alumni gate above. Teachers/admins always pass; a teacher/admin using
    // "View as Student" passes too, so they can preview the student experience.
    if (
      nexusRole === 'student' &&
      !user.nexus_access_enabled &&
      !msUser.impersonatorUserId
    ) {
      return NextResponse.json(
        {
          error: 'nexus_closed',
          message:
            "We're getting your Nexus classroom ready. You'll get access very soon. Thank you for your patience!",
        },
        { status: 403 }
      );
    }

    // Check onboarding status — single record per student
    let onboardingStatus: string | null = null;
    let profileComplete = true;

    if (nexusRole === 'student' && activeEnrollments.length > 0) {
      // Classrooms with onboarding_type='none' auto-approve
      const hasNoOnboardingClassroom = activeEnrollments.some(
        (e: any) => e.classroom?.onboarding_type === 'none'
      );

      if (hasNoOnboardingClassroom) {
        // Light onboarding: the classroom skips the in-app wizard entirely.
        // Details were already collected in the marketing application form, so
        // we don't gate on the in-app profile fields either. The student lands
        // straight on the dashboard and sees the one-time welcome orientation.
        onboardingStatus = 'approved';
        profileComplete = true;
      } else {
        const { data: onboarding } = await supabase
          .from('nexus_student_onboarding')
          .select('status')
          .eq('student_id', user.id)
          .maybeSingle();

        onboardingStatus = onboarding?.status || null;

        // Check profile completeness (for the profile gate)
        if (onboardingStatus === 'approved') {
          profileComplete = !!(user.phone && user.date_of_birth && user.gender);
        }
      }
    }

    return NextResponse.json({
      user: {
        id: user.id,
        name: user.name,
        email: msUser.email || user.email,
        phone: user.phone,
        avatar_url: user.avatar_url,
        user_type: user.user_type,
      },
      nexusRole,
      onboardingStatus,
      profileComplete,
      classrooms: activeEnrollments.map((e: any) => ({
        ...e.classroom,
        enrollmentRole: e.role,
      })),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Authentication failed';
    console.error('Auth error:', message);
    return NextResponse.json({ error: message }, { status: 401 });
  }
}
