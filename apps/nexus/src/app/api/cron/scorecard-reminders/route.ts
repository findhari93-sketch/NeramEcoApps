import { NextResponse } from 'next/server';
import { getSupabaseAdminClient } from '@neram/database';

/**
 * GET /api/cron/scorecard-reminders
 * Called daily (by Vercel Cron or external scheduler)
 * Finds NATA attempts where:
 *   - state = 'completed'
 *   - exam_completed_at <= now() - 7 days
 *   - scorecard_reminder_sent = false
 * Creates a notification for each student and marks scorecard_reminder_sent = true
 */
export async function GET() {
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

    // Create notifications for each attempt
    // Check if user_notifications table exists, if not just mark as sent
    let notificationCount = 0;
    for (const attempt of attempts) {
      // Try to insert notification (table may or may not exist)
      try {
        await supabase.from('user_notifications').insert({
          user_id: attempt.student_id,
          type: 'scorecard_reminder',
          title: 'Upload Your NATA Scorecard',
          message: `Your NATA ${attempt.phase === 'phase_1' ? 'Phase 1' : 'Phase 2'} Attempt ${attempt.attempt_number} scorecard should be available now. Please upload it.`,
          metadata: {
            exam_type: attempt.exam_type,
            phase: attempt.phase,
            attempt_number: attempt.attempt_number,
            attempt_id: attempt.id,
          },
          is_read: false,
        });
        notificationCount++;
      } catch {
        // user_notifications table may not exist yet, just skip
        console.warn('Could not create notification, table may not exist');
      }

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
