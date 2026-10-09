export const dynamic = 'force-dynamic';
export const maxDuration = 60;

import { NextResponse } from 'next/server';
import { isAuthorizedCron } from '@/lib/marketing-ai/guard';
import { demoMarketingOrigin, sendDueDemoMessages, sweepCancelledDemoEvents } from '@/lib/demo/server';
import { sendApplyDraftDemoNudges } from '@/lib/demo/draft-nudge';

/**
 * GET /api/cron/demo-messages (Vercel Cron, every 5 minutes; apps/admin/vercel.json)
 *
 * Sends due demo WhatsApp messages: day-of and 30-minute reminders, thank-yous,
 * and retries of failed sends; also cancels the Teams meeting of any demo a
 * student cancelled on the website. Also sends the one "book a free demo"
 * WhatsApp to unfinished applications (off unless APPLY_DRAFT_DEMO_NUDGE=on).
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
    return NextResponse.json({ success: true, ...summary, meetingsCancelled, draftNudges });
  } catch (error) {
    console.error('demo-messages cron failed:', error);
    return NextResponse.json({ error: 'demo-messages cron failed' }, { status: 500 });
  }
}
