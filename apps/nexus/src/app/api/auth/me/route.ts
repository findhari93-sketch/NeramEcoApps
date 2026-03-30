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

    // Check onboarding status across ALL enrolled classrooms
    // If ANY classroom is approved (or has onboarding_type='none'), the student passes the gate
    let onboardingStatus: string | null = null;
    if (nexusRole === 'student' && enrollments && enrollments.length > 0) {
      // Classrooms with onboarding_type='none' auto-approve (e.g. Revit college students)
      const hasNoOnboardingClassroom = enrollments.some(
        (e: any) => e.classroom?.onboarding_type === 'none'
      );

      if (hasNoOnboardingClassroom) {
        onboardingStatus = 'approved';
      } else {
        const classroomIds = enrollments
          .map((e: any) => e.classroom?.id)
          .filter(Boolean);

        if (classroomIds.length > 0) {
          const { data: onboardings } = await supabase
            .from('nexus_student_onboarding')
            .select('status')
            .eq('student_id', user.id)
            .in('classroom_id', classroomIds);

          if (onboardings && onboardings.length > 0) {
            const statuses = onboardings.map((o: any) => o.status);
            if (statuses.includes('approved')) {
              onboardingStatus = 'approved';
            } else if (statuses.includes('submitted')) {
              onboardingStatus = 'submitted';
            } else if (statuses.includes('in_progress')) {
              onboardingStatus = 'in_progress';
            } else {
              onboardingStatus = statuses[0];
            }
          }
        }
      }

      // Fallback: if no approved status found from current enrollments,
      // check if student has ANY approved onboarding across all classrooms.
      // Identity documents are student-level, not classroom-specific,
      // so a prior approval should carry over when students transfer classrooms.
      if (onboardingStatus !== 'approved') {
        const { data: anyApproved } = await supabase
          .from('nexus_student_onboarding')
          .select('status')
          .eq('student_id', user.id)
          .eq('status', 'approved')
          .limit(1);

        if (anyApproved && anyApproved.length > 0) {
          onboardingStatus = 'approved';
        }
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
