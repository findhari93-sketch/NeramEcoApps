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
      // User not found by ms_oid — try email match before creating new user
      // This links existing enrollment users (Firebase) to their Microsoft identity
      const { data: emailUser } = await supabase
        .from('users')
        .select('*')
        .eq('email', msUser.email)
        .maybeSingle();

      if (emailUser) {
        // Found existing user by email — link Microsoft identity to them
        await supabase
          .from('users')
          .update({ ms_oid: msUser.oid })
          .eq('id', emailUser.id);
        user = { ...emailUser, ms_oid: msUser.oid };
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

    // Update last login
    await supabase
      .from('users')
      .update({ last_login_at: new Date().toISOString() })
      .eq('id', user.id);

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
        email: user.email,
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
