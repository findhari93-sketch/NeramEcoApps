import { NextRequest, NextResponse } from 'next/server';
import { verifyMsToken } from '@/lib/ms-verify';
import { getSupabaseAdminClient } from '@neram/database';
import {
  getPendingOnboardingReviews,
  getAllOnboardingRecords,
  approveOnboarding,
  rejectOnboarding,
} from '@neram/database/queries/nexus';

/**
 * GET /api/onboarding/review?classroom=<id>&status=submitted
 * List onboarding records for review (teacher/admin only)
 */
export async function GET(request: NextRequest) {
  try {
    const msUser = await verifyMsToken(request.headers.get('Authorization'));
    const supabase = getSupabaseAdminClient();

    // Verify teacher/admin
    const { data: user } = await supabase
      .from('users')
      .select('id, user_type')
      .eq('ms_oid', msUser.oid)
      .single();

    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    const classroomId = request.nextUrl.searchParams.get('classroom');
    if (!classroomId) {
      return NextResponse.json({ error: 'classroom param required' }, { status: 400 });
    }

    // Verify enrollment as teacher/admin
    const db = supabase as any;
    const { data: enrollment } = await db
      .from('nexus_enrollments')
      .select('role')
      .eq('user_id', user.id)
      .eq('classroom_id', classroomId)
      .eq('is_active', true)
      .in('role', ['teacher', 'admin'])
      .single();

    if (!enrollment && user.user_type !== 'admin') {
      return NextResponse.json({ error: 'Not authorized' }, { status: 403 });
    }

    const statusFilter = request.nextUrl.searchParams.get('status') as any;
    const records = statusFilter === 'submitted'
      ? await getPendingOnboardingReviews(classroomId)
      : await getAllOnboardingRecords(classroomId, statusFilter || undefined);

    // For each record, get their uploaded identity docs
    const enriched = await Promise.all(
      records.map(async (record) => {
        const { data: docs } = await db
          .from('nexus_student_documents')
          .select('id, title, file_url, file_type, status, template_id, sharepoint_web_url')
          .eq('student_id', record.student_id)
          .eq('classroom_id', classroomId)
          .eq('is_current', true)
          .eq('is_deleted', false);

        return { ...record, documents: docs || [] };
      })
    );

    return NextResponse.json({ reviews: enriched });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to list reviews';
    console.error('Review GET error:', message);
    return NextResponse.json({ error: message }, { status: 401 });
  }
}

/**
 * POST /api/onboarding/review
 * Approve or reject a student's onboarding
 * Body: { student_id, classroom_id, action: 'approve' | 'reject', reason? }
 */
export async function POST(request: NextRequest) {
  try {
    const msUser = await verifyMsToken(request.headers.get('Authorization'));
    const supabase = getSupabaseAdminClient();

    const { data: reviewer } = await supabase
      .from('users')
      .select('id, user_type')
      .eq('ms_oid', msUser.oid)
      .single();

    if (!reviewer) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    const body = await request.json();
    const { student_id, classroom_id, action, reason } = body;

    if (!student_id || !classroom_id || !action) {
      return NextResponse.json({ error: 'student_id, classroom_id, action required' }, { status: 400 });
    }

    // Verify reviewer is teacher/admin in this classroom
    const db = supabase as any;
    const { data: enrollment } = await db
      .from('nexus_enrollments')
      .select('role')
      .eq('user_id', reviewer.id)
      .eq('classroom_id', classroom_id)
      .eq('is_active', true)
      .in('role', ['teacher', 'admin'])
      .single();

    if (!enrollment && reviewer.user_type !== 'admin') {
      return NextResponse.json({ error: 'Not authorized to review' }, { status: 403 });
    }

    let result;
    if (action === 'approve') {
      result = await approveOnboarding(student_id, classroom_id, reviewer.id);
    } else if (action === 'reject') {
      if (!reason) {
        return NextResponse.json({ error: 'Rejection reason required' }, { status: 400 });
      }
      result = await rejectOnboarding(student_id, classroom_id, reviewer.id, reason);
    } else {
      return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
    }

    return NextResponse.json({ onboarding: result });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to process review';
    console.error('Review POST error:', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
