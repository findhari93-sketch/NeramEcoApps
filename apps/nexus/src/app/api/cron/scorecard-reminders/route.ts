import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdminClient, filterTrackedStudentIds } from '@neram/database';
import { assertCronRequest } from '@/lib/cron-auth';
import { sendNudge } from '@/lib/nudge-delivery';

/**
 * GET /api/cron/scorecard-reminders
 * Called daily (by Vercel Cron or external scheduler)
 * Finds NATA attempts where:
 *   - state = 'completed'
 *   - exam_completed_at <= now() - 7 days
 *   - scorecard_reminder_sent = false
 * Creates a notification for each student and marks scorecard_reminder_sent = true
 */
export async function GET(request: NextRequest) {
  const unauthorized = assertCronRequest(request);
  if (unauthorized) return unauthorized;

  try {
    const supabase = getSupabaseAdminClient() as any;

    // Find attempts needing reminders (NATA only - 7 day window)
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

    const { data: attempts, error } = await supabase
      .from('nexus_student_exam_attempts')
      .select('id, student_id, classroom_id, exam_type, phase, attempt_number')
      .eq('state', 'completed')
      .eq('scorecard_reminder_sent', false)
      .eq('exam_type', 'nata')
      .lte('exam_completed_at', sevenDaysAgo.toISOString());

    if (error) throw error;
    if (!attempts || attempts.length === 0) {
      return NextResponse.json({ message: 'No reminders to send', count: 0 });
    }

    // This cron is driven entirely off exam attempts and has never checked
    // enrolment, so without this guard it is the one reminder path that would
    // keep messaging a dormant student. Their attempt is still marked handled
    // below, so they do not accumulate a backlog of chasing to receive the day
    // they come back.
    const { kept } = await filterTrackedStudentIds(
      attempts.map((a: any) => a.student_id),
    );
    const reachable = new Set(kept);

    // Create notifications for each attempt
    // Check if user_notifications table exists, if not just mark as sent
    let notificationCount = 0;
    let skippedDormant = 0;
    for (const attempt of attempts) {
      if (!reachable.has(attempt.student_id)) {
        skippedDormant++;
        await supabase
          .from('nexus_student_exam_attempts')
          .update({ scorecard_reminder_sent: true, updated_at: new Date().toISOString() })
          .eq('id', attempt.id);
        continue;
      }
      // Through the one door. This used to insert a `type` column that does not
      // exist, the error was returned rather than thrown, and every one of these
      // reminders was lost while still being counted as sent.
      const { results } = await sendNudge({
        studentIds: [attempt.student_id],
        respectDormancy: false, // already filtered above
        subject: 'Upload your NATA scorecard, {firstName}',
        plain: `Your NATA ${attempt.phase === 'phase_1' ? 'Phase 1' : 'Phase 2'} Attempt ${attempt.attempt_number} scorecard should be available now. Please upload it.`,
        eventType: 'scorecard_reminder',
        metadata: {
          exam_type: attempt.exam_type,
          phase: attempt.phase,
          attempt_number: attempt.attempt_number,
          attempt_id: attempt.id,
        },
        source: { kind: 'scorecard_reminder', refId: attempt.id },
      });
      // Only a reminder that reached somebody counts, and only then is it marked
      // handled; a failed one is tried again tomorrow.
      if (!results[0]?.ok) continue;
      notificationCount++;

      // Mark reminder as sent
      await supabase
        .from('nexus_student_exam_attempts')
        .update({ scorecard_reminder_sent: true, updated_at: new Date().toISOString() })
        .eq('id', attempt.id);
    }

    return NextResponse.json({ message: `Sent ${notificationCount} reminders`, count: notificationCount });
  } catch (err) {
    console.error('Scorecard reminders error:', err);
    return NextResponse.json({ error: 'Failed to process reminders' }, { status: 500 });
  }
}
