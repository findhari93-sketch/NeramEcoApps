// @ts-nocheck
export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient, getStudentOnboardingProgressByUserId } from '@neram/database';
import { getAuth } from 'firebase-admin/auth';
import { initializeApp, getApps, cert } from 'firebase-admin/app';

if (!getApps().length) {
  try {
    initializeApp({
      credential: cert({
        projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || process.env.FIREBASE_PROJECT_ID,
        clientEmail: process.env.FIREBASE_ADMIN_CLIENT_EMAIL || process.env.FIREBASE_CLIENT_EMAIL,
        privateKey: (process.env.FIREBASE_ADMIN_PRIVATE_KEY || process.env.FIREBASE_PRIVATE_KEY)?.replace(/\\n/g, '\n'),
      }),
    });
  } catch {}
}

async function verifyToken(request: NextRequest): Promise<{ userId: string } | null> {
  const authHeader = request.headers.get('Authorization');
  if (!authHeader?.startsWith('Bearer ')) return null;

  try {
    const decodedToken = await getAuth().verifyIdToken(authHeader.substring(7));
    const supabase = createAdminClient();
    const { data: user } = await supabase
      .from('users')
      .select('id')
      .eq('firebase_uid', decodedToken.uid)
      .single();

    return user ? { userId: user.id } : null;
  } catch {
    return null;
  }
}

// GET /api/onboarding-steps - Get current student's onboarding progress, course group links, and nexus status
export async function GET(request: NextRequest) {
  try {
    const auth = await verifyToken(request);
    if (!auth) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const supabase = createAdminClient();

    // 1. Fetch onboarding steps (existing)
    const progress = await getStudentOnboardingProgressByUserId(auth.userId, supabase);

    // 2. Get student's course_id from student_profiles
    const { data: studentProfile } = await supabase
      .from('student_profiles')
      .select('course_id')
      .eq('user_id', auth.userId)
      .maybeSingle();

    // 3. Fetch course group links if student has a course
    let courseGroupLinks = null;
    if (studentProfile?.course_id) {
      const { data: links } = await supabase
        .from('course_group_links')
        .select('*')
        .eq('course_id', studentProfile.course_id)
        .maybeSingle();
      courseGroupLinks = links || null;
    }

    // 3b. Fetch Teams team IDs from nexus_enrollments → nexus_classrooms
    // This is the primary source for Teams auto-add (course_group_links is fallback)
    let nexusTeamIds: { classroomId: string; classroomName: string; msTeamId: string }[] = [];
    {
      const { data: enrollments } = await supabase
        .from('nexus_enrollments')
        .select('classroom_id, classroom:nexus_classrooms(id, name, ms_team_id)')
        .eq('user_id', auth.userId)
        .eq('is_active', true);

      if (enrollments) {
        nexusTeamIds = enrollments
          .filter((e: any) => e.classroom?.ms_team_id)
          .map((e: any) => ({
            classroomId: e.classroom.id,
            classroomName: e.classroom.name,
            msTeamId: e.classroom.ms_team_id,
          }));
      }
    }

    // 4. Fetch nexus onboarding status
    const { data: nexusOnboarding } = await supabase
      .from('nexus_student_onboarding')
      .select('status')
      .eq('student_id', auth.userId)
      .maybeSingle();

    const nexusStatus = nexusOnboarding?.status || 'not_started';

    return NextResponse.json({
      success: true,
      data: progress,
      courseGroupLinks,
      nexusTeamIds,
      nexusStatus,
    });
  } catch (error) {
    console.error('Error fetching onboarding progress:', error);
    return NextResponse.json(
      { error: 'Failed to fetch onboarding progress' },
      { status: 500 }
    );
  }
}
