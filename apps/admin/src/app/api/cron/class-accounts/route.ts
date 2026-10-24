export const dynamic = 'force-dynamic';
export const maxDuration = 300;

import { NextResponse } from 'next/server';
import { createAdminClient } from '@neram/database';
import { isAuthorizedCron } from '@/lib/marketing-ai/guard';
import { autoProvisionClassAccount, finishClassAccount } from '@/lib/class-account-auto';
import { classAccountCandidates } from '@/lib/class-account-candidates';

/** Students handled per run: each can take 20 seconds of Microsoft calls. */
const PER_RUN = 5;

/**
 * GET /api/cron/class-accounts (Vercel Cron, every 10 minutes). Fails closed
 * without CRON_SECRET.
 *
 * The safety net behind the student's setup page: someone who enrolled in the
 * last 30 days and has no class account gets one, and an account step that
 * failed is tried again. Enrolments younger than 3 minutes are left to the page.
 * Then made accounts with a failed later step (mostly the Class Team on a brand
 * new account) are finished, so staff never have to press Retry for it.
 */
export async function GET(request: Request) {
  if (!isAuthorizedCron(request)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const sb: any = createAdminClient();
  try {
    const { make, finish } = await classAccountCandidates(sb, Date.now());
    const work = [
      ...make.map((userId) => ({ userId, run: autoProvisionClassAccount })),
      ...finish.filter((id) => !make.includes(id)).map((userId) => ({ userId, run: finishClassAccount })),
    ];
    const results: Array<{ userId: string; status: string }> = [];
    for (const { userId, run } of work.slice(0, PER_RUN)) {
      const result = await run(sb, userId).catch((e: any) => ({ status: 'failed', message: e?.message }) as const);
      if (result.status === 'failed') console.error(`[cron/class-accounts] ${userId}: ${result.message}`);
      results.push({ userId, status: result.status });
    }
    return NextResponse.json({ success: true, candidates: work.length, results });
  } catch (error: any) {
    console.error('[cron/class-accounts] failed:', error?.message);
    return NextResponse.json({ error: error?.message || 'failed' }, { status: 500 });
  }
}
