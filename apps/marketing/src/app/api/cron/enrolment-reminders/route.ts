export const dynamic = 'force-dynamic';
export const maxDuration = 60;

import { NextResponse } from 'next/server';
import { createAdminClient } from '@neram/database';
import { runEnrolmentReminders } from '@neram/database/enrolment-reminders';

/**
 * Daily at 03:30 UTC, 09:00 IST (apps/marketing/vercel.json): nudge students
 * with an unpaid enrolment link (day 1, day 3, two days before it closes) and
 * close links that have expired. Protected by CRON_SECRET like the other crons.
 */
export async function GET(request: Request) {
  const authHeader = request.headers.get('authorization');
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  try {
    const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || new URL(request.url).origin;
    const result = await runEnrolmentReminders(createAdminClient(), { siteUrl });
    return NextResponse.json({ ok: true, ...result });
  } catch (error: any) {
    console.error('[cron/enrolment-reminders] failed:', error?.message);
    return NextResponse.json({ ok: false, error: error?.message || 'failed' }, { status: 500 });
  }
}
