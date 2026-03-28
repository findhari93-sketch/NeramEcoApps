// @ts-nocheck
export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@neram/database';
import { addMemberToTeam } from '@neram/auth';
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

// POST /api/teams/add-member - Add student to a Microsoft Teams team
export async function POST(request: NextRequest) {
  try {
    const auth = await verifyToken(request);
    if (!auth) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { teams_class_team_id } = body;

    if (!teams_class_team_id) {
      return NextResponse.json(
        { success: false, reason: 'missing_team_id' },
        { status: 400 }
      );
    }

    const supabase = createAdminClient();

    // Get student's ms_teams_email from student_profiles
    const { data: studentProfile } = await supabase
      .from('student_profiles')
      .select('ms_teams_email')
      .eq('user_id', auth.userId)
      .maybeSingle();

    if (!studentProfile?.ms_teams_email) {
      return NextResponse.json({
        success: false,
        reason: 'no_ms_account',
      });
    }

    // Call Graph API to add member to team
    const result = await addMemberToTeam(teams_class_team_id, studentProfile.ms_teams_email);

    if (result.success) {
      // Update student_onboarding_progress for the join_teams_class step
      await supabase
        .from('student_onboarding_progress')
        .update({
          auto_add_attempted: true,
          auto_add_result: 'success',
        })
        .eq('user_id', auth.userId)
        .eq('step_key', 'join_teams_class');

      return NextResponse.json({ success: true, reason: result.reason });
    }

    // On failure, still record the attempt
    await supabase
      .from('student_onboarding_progress')
      .update({
        auto_add_attempted: true,
        auto_add_result: result.reason || 'failed',
      })
      .eq('user_id', auth.userId)
      .eq('step_key', 'join_teams_class');

    // Provide fallback URL for manual join
    return NextResponse.json({
      success: false,
      reason: result.reason,
      fallbackUrl: `https://teams.microsoft.com/l/team/${teams_class_team_id}`,
    });
  } catch (error) {
    console.error('Error adding member to Teams:', error);
    return NextResponse.json(
      { error: 'Failed to add member to Teams' },
      { status: 500 }
    );
  }
}
