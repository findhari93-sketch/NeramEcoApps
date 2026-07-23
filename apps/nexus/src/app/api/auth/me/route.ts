import { NextRequest, NextResponse } from 'next/server';
import { verifyMsToken } from '@/lib/ms-verify';
import { getSupabaseAdminClient, reconcileMsIdentity, getNexusSetting, getCurrentBatch } from '@neram/database';
import { getUserProfile } from '@neram/auth';
import { FEATURE_FLAGS_KEY, resolveFlags, type FlagMap } from '@/lib/feature-flags';
import {
  TIMETABLE_WINDOW_KEY,
  parseWindow,
  cloneDefaultWindow,
  type TimetableWindow,
} from '@/lib/timetable-window';

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
    // Nexus-specific login signal. last_login_at is cross-app (also written by
    // the Tools app and at signup), so it can't tell admins who has actually
    // opened Nexus. These two columns are written ONLY here (never on
    // impersonation), so nexus_first_login_at != null == "opened Nexus at least
    // once" and nexus_last_login_at == "last opened Nexus".
    if (!msUser.impersonatorUserId) {
      updates.nexus_last_login_at = updates.last_login_at;
      if (!user.nexus_first_login_at) {
        updates.nexus_first_login_at = updates.last_login_at;
      }
    }
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

    // Only surface enrollments whose classroom is still live. A classroom drops
    // out of the student's view when it is disabled (is_active=false, hard
    // kill-switch) OR archived (is_archived=true, year-end lifecycle: last year's
    // cohort classroom is kept in the DB for staff but hidden from students).
    // Use a JS filter (not an !inner embed, which would silently drop rows with a
    // missing classroom).
    const activeEnrollments = (enrollments || []).filter(
      (e: any) => e.classroom && e.classroom.is_active !== false && e.classroom.is_archived !== true
    );

    // Order so the current academic-year classroom is first. The client picks
    // classrooms[0] when no saved selection matches, so a student who persisted
    // across a rollover (and whose old classroom is now archived + filtered out)
    // defaults to the current year. Archived cohorts are already excluded above.
    let currentBatchCode: string | null = null;
    try {
      currentBatchCode = (await getCurrentBatch(supabase)).code;
    } catch {
      currentBatchCode = null;
    }
    activeEnrollments.sort((a: any, b: any) => {
      const ay = a.classroom?.academic_year || '';
      const by = b.classroom?.academic_year || '';
      if (currentBatchCode) {
        if (ay === currentBatchCode && by !== currentBatchCode) return -1;
        if (by === currentBatchCode && ay !== currentBatchCode) return 1;
      }
      return by.localeCompare(ay); // newest year first, null/blank years last
    });

    // Determine the effective Nexus role from user_type or enrollments
    const nexusRole = user.user_type === 'admin'
      ? 'admin'
      : user.user_type === 'teacher'
        ? 'teacher'
        : activeEnrollments.some((e: any) => e.role === 'teacher')
          ? 'teacher'
          : 'student';

    // Access is governed solely by classroom membership. A student who is not
    // enrolled in any active classroom falls through to the client-side
    // RoleGuard, which shows the "contact admin on Teams" welcome screen
    // (NoClassroomWelcome). Being added to the classroom is what grants access;
    // there is no separate onboarding wizard or per-student access flag.

    // Feature flags: a single global settings row of admin overrides, merged
    // with registry defaults into a full resolved map. This drives which menu
    // items and pages are available (student features default off; staff on).
    // One cheap read on an already-dynamic route. Never let a settings error
    // break auth — fall back to registry defaults.
    // Both settings are fetched together so the timetable's evening window costs
    // no extra round trip on top of the flags read. Neither may break auth, so
    // each falls back to its own default independently.
    const [flagsResult, windowResult] = await Promise.allSettled([
      getNexusSetting(FEATURE_FLAGS_KEY),
      getNexusSetting(TIMETABLE_WINDOW_KEY),
    ]);

    const featureFlags: FlagMap = resolveFlags(
      flagsResult.status === 'fulfilled' ? ((flagsResult.value?.value as FlagMap) || {}) : {},
    );

    const timetableWindow: TimetableWindow =
      windowResult.status === 'fulfilled'
        ? parseWindow(windowResult.value?.value)
        : cloneDefaultWindow();

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
      classrooms: activeEnrollments.map((e: any) => ({
        ...e.classroom,
        enrollmentRole: e.role,
      })),
      featureFlags,
      timetableWindow,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Authentication failed';
    console.error('Auth error:', message);
    return NextResponse.json({ error: message }, { status: 401 });
  }
}
