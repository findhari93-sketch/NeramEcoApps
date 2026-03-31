import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdminClient } from '@neram/database';
import {
  getExpiredAwaitingIssues,
  cleanupIssueScreenshots,
} from '@neram/database/queries/nexus';
import { createUserNotification } from '@neram/database/queries';

export async function GET(request: NextRequest) {
  const authHeader = request.headers.get('Authorization');
  const cronSecret = process.env.CRON_SECRET;

  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const supabase = getSupabaseAdminClient();
    const expiredIssues = await getExpiredAwaitingIssues();

    let closed = 0;

    for (const issue of expiredIssues) {
      await supabase
        .from('nexus_foundation_issues')
        .update({
          status: 'closed',
          auto_close_at: null,
          updated_at: new Date().toISOString(),
        })
        .eq('id', issue.id);

      await supabase.from('nexus_foundation_issue_activity').insert({
        issue_id: issue.id,
        actor_id: issue.student_id,
        action: 'auto_closed',
        old_status: 'awaiting_confirmation',
        new_status: 'closed',
        reason: 'Auto-closed after 3 days with no response',
      });

      await cleanupIssueScreenshots(issue.id).catch(console.error);

      await createUserNotification({
        user_id: issue.student_id,
        event_type: 'foundation_issue_closed',
        title: 'Issue Auto-Closed',
        message: `Your issue ${issue.ticket_number} was auto-closed after 3 days. Reopen it from My Issues if needed.`,
        metadata: { issue_id: issue.id, ticket_number: issue.ticket_number },
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
