import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdminClient } from '@neram/database';
import { assertCronRequest } from '@/lib/cron-auth';
import {
  getExpiredAutoCloseIssues,
  cleanupIssueScreenshots,
  CONFIRM_AUTO_CLOSE_DAYS,
  WAITING_AUTO_CLOSE_DAYS,
} from '@neram/database/queries/nexus';
import { notifyUser } from '@/lib/nudge-delivery';
import { studentIssuePath } from '@/lib/issue-link';
import { STUDENT_REOPEN_DAYS } from '@/lib/issue-status';

/**
 * Closes tickets whose student-turn clock has run out.
 *
 *   awaiting_confirmation  after CONFIRM_AUTO_CLOSE_DAYS  (silence reads as "fixed")
 *   waiting_on_student     after WAITING_AUTO_CLOSE_DAYS  (outcome: no_response)
 *
 * Each status sets its own auto_close_at, so one query finds both.
 */
export async function GET(request: NextRequest) {
  // Same check this route used to spell out inline, now shared with the other
  // cron routes so the rule lives in one place.
  const denied = assertCronRequest(request);
  if (denied) return denied;

  try {
    const supabase = getSupabaseAdminClient();
    const expiredIssues = await getExpiredAutoCloseIssues();

    let closed = 0;

    for (const issue of expiredIssues) {
      const wasWaiting = issue.status === 'waiting_on_student';
      const reason = wasWaiting
        ? `Closed after ${WAITING_AUTO_CLOSE_DAYS} days with no reply`
        : `Auto-closed after ${CONFIRM_AUTO_CLOSE_DAYS} days with no response`;

      const { error: closeError } = await supabase
        .from('nexus_foundation_issues')
        .update({
          status: 'closed',
          auto_close_at: null,
          // Only a waiting ticket needs an outcome written here. A confirmation
          // ticket already carries the one staff picked when resolving it, and
          // naming the column only when needed keeps the older path working on
          // a database without the lifecycle migration.
          ...(wasWaiting ? { resolution_code: 'no_response' } : {}),
          updated_at: new Date().toISOString(),
        } as never)
        .eq('id', issue.id)
        // Guard against a reply that landed between the read and this write:
        // a student who answered should not have their ticket closed on them.
        .eq('status', issue.status);
      if (closeError) {
        console.error(`auto-close: ${issue.ticket_number} was not closed`, closeError);
        continue;
      }

      await supabase.from('nexus_foundation_issue_activity').insert({
        issue_id: issue.id,
        actor_id: issue.student_id,
        action: 'auto_closed',
        old_status: issue.status,
        new_status: 'closed',
        reason,
        // The student is told this happened, so the row explaining it belongs
        // in the thread they can read.
        visible_to_student: true,
      });

      await cleanupIssueScreenshots(issue.id).catch(console.error);

      await notifyUser({
        user_id: issue.student_id,
        event_type: 'foundation_issue_closed',
        title: `${issue.ticket_number} is closed`,
        message: wasWaiting
          ? `Your ticket ${issue.ticket_number} closed because we did not hear back in ${WAITING_AUTO_CLOSE_DAYS} days. If it is still a problem, reopen it from My Issues within ${STUDENT_REOPEN_DAYS} days.`
          : `Your ticket ${issue.ticket_number} closed after ${CONFIRM_AUTO_CLOSE_DAYS} days. If it is still a problem, reopen it from My Issues within ${STUDENT_REOPEN_DAYS} days.`,
        metadata: {
          issue_id: issue.id,
          ticket_number: issue.ticket_number,
          href: studentIssuePath(issue.ticket_number),
        },
      }).catch(console.error);

      closed++;
    }

    return NextResponse.json({
      success: true,
      closed,
      message: `Auto-closed ${closed} expired tickets`,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Cron failed';
    console.error('Auto-close cron error:', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
