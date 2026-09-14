import { NextRequest, NextResponse } from 'next/server';
import { verifyMsToken } from '@/lib/ms-verify';
import { getSupabaseAdminClient } from '@neram/database';
import { sendNudge } from '@/lib/nudge-delivery';

/**
 * POST /api/exam-schedule/remind
 * Teacher sends reminder to students who haven't submitted exam dates.
 * Body: { student_ids: string[], classroom_id: string }
 */
export async function POST(request: NextRequest) {
  try {
    const msUser = await verifyMsToken(request.headers.get('Authorization'));
    const supabase = getSupabaseAdminClient();
    const db = supabase as any;

    const { data: user } = await supabase
      .from('users')
      .select('id')
      .eq('ms_oid', msUser.oid)
      .single();

    if (!user) return NextResponse.json({ error: 'User not found' }, { status: 404 });

    // Teacher check
    const { data: teacher } = await db
      .from('nexus_enrollments')
      .select('id')
      .eq('user_id', user.id)
      .eq('role', 'teacher')
      .eq('is_active', true)
      .limit(1)
      .single();

    if (!teacher) return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });

    const body = await request.json();
    const { student_ids, classroom_id } = body;

    if (!classroom_id) {
      return NextResponse.json({ error: 'Missing classroom_id' }, { status: 400 });
    }

    // Create broadcast record
    const { data: broadcast, error: broadcastError } = await db
      .from('nexus_exam_broadcasts')
      .insert({
        classroom_id,
        exam_type: 'nata',
        broadcast_type: 'registration_reminder',
        message: 'Please submit your NATA exam date, city, and session.',
        sent_by: user.id,
      })
      .select()
      .single();

    if (broadcastError) throw broadcastError;

    // Determine target students
    let targetIds = student_ids || [];

    if (targetIds.length === 0) {
      // Get all students who haven't submitted
      const { data: allStudents } = await db
        .from('nexus_enrollments')
        .select('user_id')
        .eq('classroom_id', classroom_id)
        .eq('role', 'student')
        .eq('is_active', true);

      const allStudentIds = (allStudents || []).map((s: any) => s.user_id);

      if (allStudentIds.length > 0) {
        const { data: submitted } = await db
          .from('nexus_student_exam_attempts')
          .select('student_id')
          .eq('classroom_id', classroom_id)
          .eq('exam_type', 'nata')
          .not('exam_date_id', 'is', null)
          .in('student_id', allStudentIds);

        const submittedIds = new Set((submitted || []).map((s: any) => s.student_id));
        targetIds = allStudentIds.filter((id: string) => !submittedIds.has(id));
      }
    }

    // Through the one door. This used to insert a `type` column that does not
    // exist; the error was never checked, so no student ever got this reminder.
    let counts = null;
    if (targetIds.length > 0) {
      ({ counts } = await sendNudge({
        studentIds: targetIds,
        // A teacher who picked students by hand can see who they picked.
        respectDormancy: !(student_ids && student_ids.length),
        subject: 'Submit your NATA exam date, {firstName}',
        plain: 'Please submit your NATA exam date, city and session on the Exam Schedule page.',
        eventType: 'exam_date_reminder',
        metadata: { broadcast_id: broadcast.id, classroom_id },
        source: { kind: 'exam_date_reminder', refId: broadcast.id },
      }));
    }

    return NextResponse.json({
      broadcast,
      reminded_count: counts ? counts.total - counts.failed : 0,
      delivery: counts,
    }, { status: 201 });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to send reminders';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
