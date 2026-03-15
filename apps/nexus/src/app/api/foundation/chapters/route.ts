import { NextRequest, NextResponse } from 'next/server';
import { verifyMsToken } from '@/lib/ms-verify';
import { getSupabaseAdminClient } from '@neram/database';
import {
  getFoundationChapters,
  getFoundationChaptersWithProgress,
} from '@neram/database/queries/nexus';

/**
 * GET /api/foundation/chapters
 *
 * Returns all published foundation chapters.
 * For students: includes progress and unlock status.
 * For teachers/parents: includes chapter list only (use /dashboard for student progress).
 */
export async function GET(request: NextRequest) {
  try {
    const msUser = await verifyMsToken(request.headers.get('Authorization'));
    const supabase = getSupabaseAdminClient();

    const { data: user } = await supabase
      .from('users')
      .select('id, user_type')
      .eq('ms_oid', msUser.oid)
      .single();

    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    // For students, include progress with unlock logic
    const studentId = request.nextUrl.searchParams.get('student_id');

    if (studentId) {
      // Teacher/parent viewing a specific student's progress
      const chapters = await getFoundationChaptersWithProgress(studentId);
      return NextResponse.json({ chapters });
    }

    // Default: current user's progress (student view)
    const chapters = await getFoundationChaptersWithProgress(user.id);
    return NextResponse.json({ chapters });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to load chapters';
    console.error('Foundation chapters GET error:', message);
    return NextResponse.json({ error: message }, { status: 401 });
  }
}
