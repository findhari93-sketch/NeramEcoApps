import { NextRequest, NextResponse } from 'next/server';
import { verifyMsToken } from '@/lib/ms-verify';
import { getSupabaseAdminClient } from '@neram/database';

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

    // Find user by Microsoft OID
    let { data: user, error } = await supabase
      .from('users')
      .select('*')
      .eq('ms_oid', msUser.oid)
      .single();

    if (error && error.code === 'PGRST116') {
      // User not found by ms_oid. Try to link to an existing CRM user by email.
      // Matches either the primary email OR the linked_classroom_email the
      // admin pre-set, and uses ILIKE so the lookup is case-insensitive
      // (Azure UPN casing does not always match the case stored in DB, e.g.
      // MS returns "Sanjeevraj_Ramesh@..." while DB has "sanjeevraj_ramesh@...").
      // _ and % must be escaped because emails commonly contain underscores
      // (e.g. firstname_lastname@neramclasses.com) which would otherwise act
      // as single-char wildcards in ILIKE.
      const safeEmail = msUser.email
        .replace(/\\/g, '\\\\')
        .replace(/[%_]/g, '\\$&');
      const { data: emailUser } = await supabase
        .from('users')
        .select('*')
        .or(`email.ilike.${safeEmail},linked_classroom_email.ilike.${safeEmail}`)
        .maybeSingle();

      if (emailUser) {
        // Link Microsoft identity to the existing user, and record the classroom
        // email if it wasn't already set, so future logins (or admin tools)
        // have an explicit link recorded.
        const updates: Record<string, unknown> = { ms_oid: msUser.oid };
        if (!emailUser.linked_classroom_email) {
          updates.linked_classroom_email = msUser.email;
          updates.linked_classroom_at = new Date().toISOString();
        }
        await supabase.from('users').update(updates).eq('id', emailUser.id);
        user = { ...emailUser, ...updates };
      } else {
        // No match — auto-create as student (teachers are pre-set by admin)
        const { data: newUser, error: createError } = await supabase
          .from('users')
          .insert({
            name: msUser.name,
            email: msUser.email,
            ms_oid: msUser.oid,
            user_type: 'student',
            status: 'active',
            email_verified: true,
            phone_verified: false,
            preferred_language: 'en',
          })
          .select()
          .single();

        if (createError) {
          console.error('Failed to create user:', createError);
          return NextResponse.json({ error: 'Failed to create user' }, { status: 500 });
        }

        user = newUser;
      }
    } else if (error) {
      console.error('Database error:', error);
      return NextResponse.json({ error: 'Database error' }, { status: 500 });
    }

    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    // Sync name and update last login from Microsoft.
    // Don't overwrite users.email — students often sign up via Firebase with
    // a personal email first, then later log in with their @neramclasses.com
    // Microsoft account. The primary email stays as the original signup
    // identity; the MS classroom email is tracked separately in
    // linked_classroom_email so admins can tell the two apart.
    const updates: Record<string, string> = { last_login_at: new Date().toISOString() };
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

    await supabase
      .from('users')
      .update(updates)
      .eq('id', user.id);

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

    // Determine the effective Nexus role from user_type or enrollments
    const nexusRole = user.user_type === 'admin'
      ? 'admin'
      : user.user_type === 'teacher'
        ? 'teacher'
        : enrollments?.some((e: any) => e.role === 'teacher')
          ? 'teacher'
          : 'student';

    // Check onboarding status — single record per student
    let onboardingStatus: string | null = null;
    let profileComplete = true;

    if (nexusRole === 'student' && enrollments && enrollments.length > 0) {
      // Classrooms with onboarding_type='none' auto-approve
      const hasNoOnboardingClassroom = enrollments.some(
        (e: any) => e.classroom?.onboarding_type === 'none'
      );

      if (hasNoOnboardingClassroom) {
        onboardingStatus = 'approved';
      } else {
        const { data: onboarding } = await supabase
          .from('nexus_student_onboarding')
          .select('status')
          .eq('student_id', user.id)
          .maybeSingle();

        onboardingStatus = onboarding?.status || null;
      }

      // Check profile completeness (for the profile gate)
      if (onboardingStatus === 'approved') {
        profileComplete = !!(user.phone && user.date_of_birth && user.gender);
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
      classrooms: (enrollments || []).map((e: any) => ({
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
