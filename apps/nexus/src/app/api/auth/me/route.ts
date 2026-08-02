import { NextRequest, NextResponse } from 'next/server';
import { verifyMsToken } from '@/lib/ms-verify';
import { getSupabaseAdminClient, reconcileMsIdentity, getNexusSetting, getCurrentBatch } from '@neram/database';
import { getUserProfile } from '@neram/auth';
import { FEATURE_FLAGS_KEY, resolveFlags, type FlagMap } from '@/lib/feature-flags';
import {
  capabilityMap,
  resolveStaffRole,
  type CapabilityMap,
  type StaffRole,
} from '@/lib/staff-capabilities';
import {
  DEFAULT_PHOTO_GATE,
  PHOTO_GATE_FEATURE,
  shouldBlockForPhoto,
  toPhotoStatus,
  type PhotoGateState,
} from '@/lib/photo-gate';
import { listParentChildren, getChildClassrooms } from '@/lib/parent-auth';
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
    // The one route every signed-in identity hits, parents included: it has a
    // dedicated parent branch below.
    const msUser = await verifyMsToken(authHeader, { allowParent: true });

    const supabase = getSupabaseAdminClient();

    // Fast path: an already-linked Microsoft account (the vast majority of logins).
    let { data: user } = await supabase
      .from('users')
      .select('*')
      .eq('ms_oid', msUser.oid)
      .maybeSingle();

    // A parent token whose users row has vanished must stop here. Falling
    // through to reconcileMsIdentity would try to match a synthetic
    // 'parent:<uuid>' ms_oid against real students and could mint a shell
    // @neramclasses.com account for someone who is not a student at all.
    if (!user && msUser.parentUserId) {
      return NextResponse.json({ error: 'Parent account is no longer valid' }, { status: 404 });
    }

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

    // ── Parent branch ────────────────────────────────────────────────────
    // Gated on msUser.parentUserId (set only by the par_ branch of
    // verifyMsToken), NOT on user.user_type. A mis-set user_type on a
    // Microsoft-authenticated row must never be able to yield the parent
    // payload; only holding a parent session token can.
    if (msUser.parentUserId) {
      const children = await listParentChildren(msUser.parentUserId);

      // Surfaced so the client can show the parent their own login ID and can
      // route to /parent/set-password. verifyMsToken has already confirmed the
      // row is active, so this read is for display only.
      const { data: parentCredential } = await supabase
        .from('nexus_parent_credentials')
        .select('login_id, must_change_password')
        .eq('parent_user_id', msUser.parentUserId)
        .maybeSingle();

      // The CHILD's classrooms, resolved by the shared helper that applies the
      // same is_active/is_archived filter and current-year-first sort as the
      // student path below. This is what makes RoleGuard's classrooms.length
      // check pass: a parent can never hold a nexus_enrollments row of their
      // own, because that table's CHECK allows only 'teacher' and 'student'.
      const classroomMap = await getChildClassrooms(children.map((c) => c.id));
      const seen = new Set<string>();
      const classrooms = children
        .map((c) => classroomMap.get(c.id))
        .filter((c): c is NonNullable<typeof c> => {
          if (!c || seen.has(c.id)) return false;
          seen.add(c.id);
          return true;
        });

      const [parentFlags, parentWindow] = await Promise.allSettled([
        getNexusSetting(FEATURE_FLAGS_KEY),
        getNexusSetting(TIMETABLE_WINDOW_KEY),
      ]);

      return NextResponse.json({
        user: {
          id: user.id,
          name: user.name,
          email: user.email,
          phone: user.phone,
          avatar_url: user.avatar_url,
          user_type: 'parent',
        },
        nexusRole: 'parent',
        staffRole: null,
        canTeach: false,
        // The all-false map. Any staff action that leaks into a shared component
        // stays hidden even if that component forgets to check the role.
        capabilities: capabilityMap(null) satisfies CapabilityMap,
        classrooms,
        children,
        activeChildId: children[0]?.id ?? null,
        featureFlags: resolveFlags(
          parentFlags.status === 'fulfilled' ? ((parentFlags.value?.value as FlagMap) || {}) : {}
        ),
        timetableWindow:
          parentWindow.status === 'fulfilled'
            ? parseWindow(parentWindow.value?.value)
            : cloneDefaultWindow(),
        // Hard-coded rather than computed. shouldBlockForPhoto already returns
        // false for non-students, but pinning it here means no future flag
        // change can full-screen-block a parent over their child's photo.
        photoGate: DEFAULT_PHOTO_GATE,
        parent: {
          loginId: parentCredential?.login_id ?? null,
          mustChangePassword: parentCredential?.must_change_password ?? false,
        },
      });
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

    // Everything left to do needs only `user.id`, and nothing here reads anything
    // another line here produces, so it all goes at once.
    //
    // These used to run one after another: write the login stamp, then read the
    // enrolments, then resolve the current batch, then read two settings rows. Four
    // serial waits on the one request that blocks the entire app from painting, on
    // every single load. Running them together makes the whole tail cost one round
    // trip instead of four.
    //
    // The login-stamp write stays awaited rather than fired and forgotten: a
    // serverless instance may be frozen the moment the response is sent, which would
    // silently drop it. Awaiting it alongside the reads costs nothing, because it is
    // no longer in anyone's way.
    const [, enrollmentsResult, currentBatchCode, settingsResults] = await Promise.all([
      Object.keys(updates).length > 0
        ? supabase.from('users').update(updates).eq('id', user.id)
        : Promise.resolve(null),

      // Fetch enrolled classrooms with role
      supabase
        .from('nexus_enrollments')
        .select('*, classroom:nexus_classrooms(*)')
        .eq('user_id', user.id)
        .eq('is_active', true),

      getCurrentBatch(supabase)
        .then((b) => b.code as string | null)
        .catch(() => null),

      // Both settings are fetched together so the timetable's evening window costs
      // no extra round trip on top of the flags read. Neither may break auth, so
      // each falls back to its own default independently.
      Promise.allSettled([
        getNexusSetting(FEATURE_FLAGS_KEY),
        getNexusSetting(TIMETABLE_WINDOW_KEY),
      ]),
    ]);

    if (updates.name) user = { ...user, name: updates.name };
    if (updates.linked_classroom_email) {
      user = { ...user, linked_classroom_email: updates.linked_classroom_email };
    }

    const enrollments = enrollmentsResult.data;

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
    activeEnrollments.sort((a: any, b: any) => {
      const ay = a.classroom?.academic_year || '';
      const by = b.classroom?.academic_year || '';
      if (currentBatchCode) {
        if (ay === currentBatchCode && by !== currentBatchCode) return -1;
        if (by === currentBatchCode && ay !== currentBatchCode) return 1;
      }
      return by.localeCompare(ay); // newest year first, null/blank years last
    });

    // Determine the effective Nexus staff tier.
    //
    // staff_role is the authority column (migration 20260727100000);
    // resolveStaffRole falls back to user_type when it is null so a row the
    // backfill has not reached keeps exactly the authority it had before.
    //
    // The enrollment fallback below is preserved from the original derivation:
    // someone whose user_type is neither admin nor teacher but who holds an
    // active teacher enrollment still counts as a teacher. Without mapping that
    // case onto a staff tier they would pass RoleGuard into /teacher/** and then
    // fail every capability check, which is worse than being kept out.
    const staffRole: StaffRole | null =
      resolveStaffRole(user) ??
      (activeEnrollments.some((e: any) => e.role === 'teacher') ? 'teacher' : null);

    const canTeach = (user as any).can_teach !== false;

    // nexusRole stays the coarse route-group role the client already understands
    // (RoleGuard, the (teacher)/(student) layouts, isAdmin). A manager maps to
    // 'teacher' on purpose: it keeps them inside the staff area while hiding the
    // admin-only panel, which is exactly the intended tier. Fine-grained
    // decisions must use `capabilities`, not nexusRole.
    const nexusRole =
      staffRole === 'admin' ? 'admin' : staffRole ? 'teacher' : 'student';

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
    // Read above, alongside the enrolments, rather than after them.
    const [flagsResult, windowResult] = settingsResults;

    const featureFlags: FlagMap = resolveFlags(
      flagsResult.status === 'fulfilled' ? ((flagsResult.value?.value as FlagMap) || {}) : {},
    );

    const timetableWindow: TimetableWindow =
      windowResult.status === 'fulfilled'
        ? parseWindow(windowResult.value?.value)
        : cloneDefaultWindow();

    // Mandatory face-visible profile photo (students only).
    //
    // Returned as a field in the 200 payload rather than as a 403 like the
    // alumni gate above, for two reasons. First, "pending is allowed in" means
    // the server is no longer making a binary access decision, so a 403 would
    // be dishonest: this IS a valid, enrolled user. Second, the blocker screen
    // has to upload a photo, which needs a live auth context, and the 403 path
    // deliberately nulls out user/nexusRole/classrooms on the client.
    //
    // Costs zero extra reads: photo_status rides the select('*') on users above,
    // and the kill switch rides the feature-flags read we just did.
    const photoStatus = toPhotoStatus(user.photo_status);
    const photoGate: PhotoGateState = {
      status: photoStatus,
      reason: photoStatus === 'rejected' ? user.photo_rejection_reason || null : null,
      required: shouldBlockForPhoto({
        flagEnabled: featureFlags[PHOTO_GATE_FEATURE] === true,
        nexusRole,
        impersonating: !!msUser.impersonatorUserId,
        classroomCount: activeEnrollments.length,
        photoStatus,
      }),
      // Also rides the select('*'). Only true when the approved photo really did
      // reach the Microsoft account, so the profile screen never claims a Teams
      // sync that silently failed.
      microsoftSynced:
        photoStatus === 'approved' && (user as any).photo_ms_sync_status === 'synced',
    };

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
      // The authority tier and its fully resolved capability map. The client uses
      // `capabilities` to hide what this person cannot do; every server route
      // re-checks independently, so this payload is a UI convenience and never
      // the enforcement point.
      staffRole,
      canTeach,
      capabilities: capabilityMap(staffRole, canTeach) satisfies CapabilityMap,
      classrooms: activeEnrollments.map((e: any) => ({
        ...e.classroom,
        enrollmentRole: e.role,
      })),
      featureFlags,
      timetableWindow,
      photoGate,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Authentication failed';
    console.error('Auth error:', message);
    return NextResponse.json({ error: message }, { status: 401 });
  }
}
