export const dynamic = 'force-dynamic';
export const maxDuration = 300;

/**
 * GET  /api/marketing-ai/runs           the last 30 runs
 * POST /api/marketing-ai/runs { kind, from? }  run a job now: 'ingest' | 'analyze' | 'conversions' | 'audit' | 'weekly'
 *   'audit' is ingest then analyze, the on-demand account audit. Autopilot
 *   does not run on a manual audit; it only acts on the nightly schedule.
 *   'ingest' with from (YYYY-MM-DD, at most 400 days back) loads history
 *   since that day, for last season's benchmark and advice-only suggestions.
 * Admins only.
 */
import { NextRequest, NextResponse } from 'next/server';
import { requireAdminRole } from '@/lib/marketing-ai/guard';
import { errorResponse, readJson } from '@/lib/marketing-ai/http';
import { lastCompleteDayIST } from '@/lib/marketing-ai/metrics';
import { agentContext, historyFromError, runAnalyze, runConversions, runIngest, runWeekly } from '@/lib/marketing-ai/pipeline';
import { db, latestRuns } from '@/lib/marketing-ai/store';

export async function GET(request: NextRequest) {
  const guard = requireAdminRole(request);
  if (!guard.ok) return guard.response;
  try {
    return NextResponse.json(await latestRuns(db()));
  } catch (err) {
    return errorResponse(err, 'runs');
  }
}

export async function POST(request: NextRequest) {
  const guard = requireAdminRole(request);
  if (!guard.ok) return guard.response;
  try {
    const { kind, from } = await readJson(request);
    if (!['ingest', 'analyze', 'conversions', 'audit', 'weekly'].includes(kind)) {
      return NextResponse.json({ error: "kind must be 'ingest', 'analyze', 'conversions', 'audit' or 'weekly'" }, { status: 400 });
    }
    const endDate = lastCompleteDayIST();
    if (from !== undefined) {
      const bad = kind === 'ingest' ? historyFromError(from, endDate) : "from is only for kind 'ingest'";
      if (bad) return NextResponse.json({ error: bad }, { status: 400 });
    }
    const ctx = await agentContext();
    const t = { trigger: 'manual' as const, by: guard.adminId };
    const result: Record<string, unknown> = {};
    if (kind === 'ingest' || kind === 'audit') result.ingest = await runIngest(ctx, t, endDate, { from });
    if (kind === 'analyze' || kind === 'audit') result.analyze = await runAnalyze(ctx, t, { skipAutopilot: true });
    if (kind === 'conversions') result.conversions = await runConversions(ctx, t);
    if (kind === 'weekly') result.weekly = await runWeekly(ctx, t);
    return NextResponse.json(result);
  } catch (err) {
    return errorResponse(err, 'run');
  }
}
