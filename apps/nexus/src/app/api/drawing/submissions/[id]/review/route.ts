import { NextRequest, NextResponse } from 'next/server';
import { verifyMsToken } from '@/lib/ms-verify';
import { getSupabaseAdminClient } from '@neram/database';
import { saveDrawingReview, recordGamificationEvent } from '@neram/database/queries/nexus';

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const msUser = await verifyMsToken(request.headers.get('Authorization'));
    const { id } = await params;

    const supabase = getSupabaseAdminClient();
    const { data: user } = await supabase
      .from('users')
      .select('id, user_type')
      .eq('ms_oid', msUser.oid)
      .single();

    if (!user || !['teacher', 'admin'].includes(user.user_type)) {
      return NextResponse.json({ error: 'Not authorized' }, { status: 403 });
    }

    const body = await request.json();
    const { tutor_rating, tutor_feedback, reviewed_image_url, tutor_resources } = body;

    if (!tutor_rating || tutor_rating < 1 || tutor_rating > 5) {
      return NextResponse.json({ error: 'Rating must be between 1 and 5' }, { status: 400 });
    }

    const submission = await saveDrawingReview(id, {
      tutor_rating,
      tutor_feedback,
      reviewed_image_url,
      tutor_resources,
    });

    // Record gamification for student (non-critical)
    try {
      const { data: enrollment } = await supabase
        .from('nexus_enrollments')
        .select('classroom_id, batch_id')
        .eq('user_id', submission.student_id)
        .eq('role', 'student')
        .limit(1)
        .single();

      if (enrollment) {
        recordGamificationEvent({
          student_id: submission.student_id,
          classroom_id: (enrollment as any).classroom_id,
          batch_id: (enrollment as any).batch_id || null,
          event_type: 'drawing_reviewed',
          points: 3,
          source_id: `review_${submission.id}`,
          activity_type: 'drawing_reviewed',
          activity_title: 'Drawing reviewed by tutor',
          metadata: { submission_id: submission.id, rating: tutor_rating },
        }).catch(() => {});
      }
    } catch {
      // Non-critical
    }

    return NextResponse.json({ submission });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to save review';
    console.error('Drawing review PATCH error:', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
