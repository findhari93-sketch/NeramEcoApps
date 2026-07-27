import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdminClient } from '@neram/database';
import { capabilityMap, resolveStaffRole, type StaffRole } from '@/lib/staff-capabilities';

/**
 * Delete an existing test user so the same stable email can be reused with a
 * pristine state on every run (instead of minting a new `${Date.now()}` account
 * each time, which otherwise accumulates forever). Clears the foreign-key
 * references that would otherwise block the delete (test content the account
 * created, onboarding it reviewed, and any lead/coupon it owns), then deletes
 * the user — CASCADE handles enrollments, submissions, progress, profiles, etc.
 */
async function resetTestUser(supabase: ReturnType<typeof getSupabaseAdminClient>, userId: string): Promise<void> {
  // Loosely typed for the dynamic table loop and null updates below (test-only cleanup).
  const db = supabase as unknown as {
    from: (table: string) => {
      delete: () => { eq: (c: string, v: string) => Promise<unknown>; in: (c: string, v: string[]) => Promise<unknown> };
      update: (vals: Record<string, unknown>) => { eq: (c: string, v: string) => Promise<unknown>; in: (c: string, v: string[]) => Promise<unknown> };
      select: (cols: string) => { eq: (c: string, v: string) => Promise<{ data: Array<{ id: string }> | null }>; in: (c: string, v: string[]) => Promise<{ data: Array<{ id: string }> | null }> };
    };
  };

  // Test content created by this account (NO ACTION FKs -> must clear first).
  for (const table of ['nexus_verified_questions', 'nexus_tests', 'nexus_resources', 'nexus_checklists', 'nexus_modules']) {
    await db.from(table).delete().eq('created_by', userId);
  }
  // Onboarding rows of OTHER students this account reviewed (nullable reviewer ref).
  await db.from('nexus_student_onboarding').update({ reviewed_by: null }).eq('reviewed_by', userId);
  // Shared E2E classroom this account may have created (nullable, keep the classroom).
  await db.from('nexus_classrooms').update({ created_by: null }).eq('created_by', userId);
  // Lead <-> coupon circular ref: detach then delete this account's test coupons.
  const { data: leads } = await db.from('lead_profiles').select('id').eq('user_id', userId);
  const leadIds = (leads || []).map((l) => l.id);
  if (leadIds.length) {
    const { data: coupons } = await db.from('coupons').select('id').in('lead_profile_id', leadIds);
    const couponIds = (coupons || []).map((c) => c.id);
    if (couponIds.length) {
      await db.from('lead_profiles').update({ admin_coupon_id: null }).in('admin_coupon_id', couponIds);
      await db.from('coupons').delete().in('lead_profile_id', leadIds);
    }
  }
  await db.from('users').delete().eq('id', userId);
}

/**
 * POST /api/auth/test-login
 *
 * Test-only endpoint for E2E testing. Generates a test token that bypasses
 * Microsoft Graph API verification in non-production environments.
 *
 * Pass `reset: true` to delete any existing user with this email first, so a
 * stable per-scenario email always yields a fresh account (no throwaway
 * `${Date.now()}` accounts piling up).
 *
 * Returns the same shape as /api/auth/me so tests can reuse the response.
 */
export async function POST(request: NextRequest) {
  // Block in production
  if (process.env.NODE_ENV === 'production') {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  try {
    const body = await request.json().catch(() => ({}));
    const { email, role, reset, staffRole: requestedStaffRole, canTeach: requestedCanTeach } = body as {
      email?: string;
      role?: 'teacher' | 'student' | 'parent';
      reset?: boolean;
      staffRole?: StaffRole;
      canTeach?: boolean;
    };

    if (!email) {
      return NextResponse.json({ error: 'email is required' }, { status: 400 });
    }

    // Which Nexus authority tier this test account gets.
    //
    // Default for role:'teacher' is MANAGER, not 'teacher', on purpose. Before
    // the tier split a Nexus "teacher" could do everything an admin could
    // (schedule classes, manage enrolments, delete batches), and the existing
    // specs were written against that. `manager` is the tier that preserves
    // those powers, so pre-existing tests keep passing untouched. A spec that
    // wants the restricted external tier asks for it explicitly:
    //   { role: 'teacher', staffRole: 'teacher' }
    const effectiveStaffRole: StaffRole | null =
      requestedStaffRole ??
      (role === 'teacher' || role === undefined ? 'manager' : null);

    const supabase = getSupabaseAdminClient();

    // Find existing user by email
    let { data: user } = await supabase
      .from('users')
      .select('*')
      .eq('email', email)
      .single();

    // Reset: wipe the existing account so the recreate below starts clean.
    if (reset && user) {
      await resetTestUser(supabase, user.id);
      user = null;
    }

    // Auto-create test user if not found
    if (!user) {
      const testRole = role || 'teacher';
      const { data: newUser, error: createError } = await supabase
        .from('users')
        .insert({
          name: `Test ${testRole.charAt(0).toUpperCase() + testRole.slice(1)}`,
          email,
          ms_oid: `test-oid-${Date.now()}`,
          user_type: testRole === 'parent' ? 'student' : testRole,
          staff_role: effectiveStaffRole,
          can_teach: requestedCanTeach !== false,
          status: 'active',
          email_verified: true,
          phone_verified: false,
          preferred_language: 'en',
        })
        .select()
        .single();

      if (createError) {
        console.error('Failed to create test user:', createError);
        return NextResponse.json({ error: 'Failed to create test user', details: createError.message }, { status: 500 });
      }
      user = newUser;
    }

    if (!user) {
      return NextResponse.json({ error: 'User creation failed' }, { status: 500 });
    }

    // Re-apply the requested tier to an account that already existed. Test
    // accounts are reused across specs (stable emails, not `${Date.now()}`), so
    // without this a spec asking for the restricted 'teacher' tier would inherit
    // whatever tier the previous spec left behind.
    if (
      effectiveStaffRole !== null &&
      (user.staff_role !== effectiveStaffRole || user.can_teach !== (requestedCanTeach !== false))
    ) {
      const { data: retiered } = await supabase
        .from('users')
        .update({ staff_role: effectiveStaffRole, can_teach: requestedCanTeach !== false })
        .eq('id', user.id)
        .select()
        .single();
      if (retiered) user = retiered;
    }

    // Ensure the user has at least one classroom enrollment
    let { data: enrollments } = await supabase
      .from('nexus_enrollments')
      .select('*, classroom:nexus_classrooms(*)')
      .eq('user_id', user.id)
      .eq('is_active', true);

    // If no enrollments, create a test classroom and enrollment
    if (!enrollments || enrollments.length === 0) {
      // Find or create test classroom
      let { data: testClassroom } = await supabase
        .from('nexus_classrooms')
        .select('*')
        .eq('name', 'E2E Test Classroom')
        .single();

      if (!testClassroom) {
        const { data: newClassroom, error: classroomError } = await supabase
          .from('nexus_classrooms')
          .insert({
            name: 'E2E Test Classroom',
            type: 'nata',
            description: 'Auto-created for E2E testing',
            is_active: true,
            created_by: user.id,
          })
          .select()
          .single();

        if (classroomError) {
          console.error('Failed to create test classroom:', classroomError);
          return NextResponse.json({ error: 'Failed to create test classroom', details: classroomError.message }, { status: 500 });
        }
        testClassroom = newClassroom;
      }

      if (testClassroom) {
        const enrollRole = role === 'parent' ? 'student' : (role || 'teacher');
        await supabase
          .from('nexus_enrollments')
          .upsert({
            user_id: user.id,
            classroom_id: testClassroom.id,
            role: enrollRole,
            is_active: true,
          }, { onConflict: 'user_id,classroom_id' });

        // Re-fetch enrollments
        const { data: refreshed } = await supabase
          .from('nexus_enrollments')
          .select('*, classroom:nexus_classrooms(*)')
          .eq('user_id', user.id)
          .eq('is_active', true);
        enrollments = refreshed;
      }
    }

    // Determine the staff tier and nexus role the same way /api/auth/me does, so
    // a test session is indistinguishable from a real one. The 'parent' override
    // stays because parent E2E tests need nexusRole='parent' to match RoleGuard.
    const staffRole: StaffRole | null =
      role === 'parent'
        ? null
        : resolveStaffRole(user) ??
          (enrollments?.some((e: any) => e.role === 'teacher') ? 'teacher' : null);

    const canTeach = user.can_teach !== false;

    const nexusRole = role === 'parent'
      ? 'parent'
      : staffRole === 'admin'
        ? 'admin'
        : staffRole
          ? 'teacher'
          : 'student';

    // Generate test token: test_<base64(email)>
    const testToken = `test_${Buffer.from(email).toString('base64')}`;

    return NextResponse.json({
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        phone: user.phone,
        avatar_url: user.avatar_url,
        user_type: user.user_type,
      },
      nexusRole,
      staffRole,
      canTeach,
      capabilities: capabilityMap(staffRole, canTeach),
      classrooms: (enrollments || []).map((e: any) => ({
        ...e.classroom,
        enrollmentRole: e.role,
      })),
      testToken,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Test login failed';
    console.error('Test login error:', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
