export const dynamic = 'force-dynamic';
export const maxDuration = 60;

import { NextResponse } from 'next/server';
import { isAuthorizedCron } from '@/lib/marketing-ai/guard';
import { runFollowUpDigest } from '@/lib/follow-up-digest';

/** GET /api/cron/follow-up-digest (Vercel Cron, 03:30 UTC = 09:00 IST). Fails closed without CRON_SECRET. */
export async function GET(request: Request) {
  if (!isAuthorizedCron(request)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  try {
    const origin = process.env.NEXT_PUBLIC_ADMIN_URL || new URL(request.url).origin;
    return NextResponse.json({ success: true, ...(await runFollowUpDigest(new Date(), origin)) });
  } catch (error) {
    console.error('follow-up digest failed:', error);
    return NextResponse.json({ error: 'follow-up digest failed' }, { status: 500 });
  }
}
