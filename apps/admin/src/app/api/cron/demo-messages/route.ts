export const dynamic = 'force-dynamic';
export const maxDuration = 60;

import { NextResponse } from 'next/server';
import { isAuthorizedCron } from '@/lib/marketing-ai/guard';
import { demoMarketingOrigin, sendDueDemoMessages, sweepCancelledDemoEvents } from '@/lib/demo/server';
import { sendApplyDraftDemoNudges } from '@/lib/demo/draft-nudge';
import { queueFollowUpNudges } from '@/lib/follow-up-digest';
import { sweepDemoTeams } from '@/lib/demo/teams-sync';

/**
 * GET /api/cron/demo-messages (Vercel Cron, every 5 minutes; apps/admin/vercel.json)
 *
 * Sends due demo WhatsApp messages: day-of and 30-minute reminders, thank-yous,
 * and retries of failed sends; also cancels the Teams meeting of any demo a
 * student cancelled on the website. Also sends the one "book a free demo"
 * WhatsApp to unfinished applications (off unless APPLY_DRAFT_DEMO_NUDGE=on).
 * And reads Teams attendance and recordings for demos that ran this week.
 * Most runs find nothing.
 * Fails closed: a missing CRON_SECRET refuses the call.
 */
export async function GET(request: Request) {
  if (!isAuthorizedCron(request)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  try {
    const summary = await sendDueDemoMessages({ origin: demoMarketingOrigin(request.url) });
    const meetingsCancelled = await sweepCancelledDemoEvents();
    // A nudge failure must not fail the demo reminders above.
    const draftNudges = await sendApplyDraftDemoNudges().catch((err) => {
      console.error('apply draft demo nudges failed:', err);
      return { enabled: true, sent: 0, failed: 0, error: true };
    });
    const followUpNudges = await queueFollowUpNudges(new Date(), process.env.NEXT_PUBLIC_ADMIN_URL || new URL(request.url).origin).catch((err) => {
      console.error('follow-up nudges failed:', err);
      return 0;
    });
    // A Teams failure must not fail the reminders either.
    const teamsChecked = await sweepDemoTeams().catch((err) => {
      console.error('demo Teams sweep failed:', err);
      return 0;
    });
    return NextResponse.json({ success: true, ...summary, meetingsCancelled, draftNudges, followUpNudges, teamsChecked });
  } catch (error) {
    console.error('demo-messages cron failed:', error);
    return NextResponse.json({ error: 'demo-messages cron failed' }, { status: 500 });
  }
}
