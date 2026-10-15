export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 300;

/**
 * POST /api/seo-audit/run { kind } - run one job now from the SEO Health page.
 * kind: daily (everything the morning cron does), recheck ("Check my fixes":
 * only pages with open or waiting issues), search, sitemaps, inspect, crawl,
 * analyze, digest or indexing (send the ask-Google pages to the Indexing API now). A crawl from here re-crawls every page (force). Admins only.
 */
import { NextResponse } from 'next/server';
import { requireSeoAdmin, seoError } from '@/lib/seo-audit/guard';
import { runDaily, runJob, runRecheck } from '@/lib/seo-audit/jobs';
import type { RunKind } from '@/lib/seo-audit/types';

const KINDS: RunKind[] = ['search', 'sitemaps', 'inspect', 'crawl', 'analyze', 'digest', 'indexing'];

export async function POST(request: Request) {
  const guard = requireSeoAdmin(request);
  if (!guard.ok) return guard.response;
  try {
    const body = await request.json().catch(() => ({}));
    const kind = body.kind;
    if (kind === 'daily') return NextResponse.json(await runDaily('manual'));
    if (kind === 'recheck') return NextResponse.json(await runRecheck('manual'));
    if (!KINDS.includes(kind)) return NextResponse.json({ error: `kind must be daily, recheck or one of ${KINDS.join(', ')}` }, { status: 400 });
    // 240s for the job leaves room for the analyze below inside the 300s limit.
    const result = await runJob(kind, 'manual', { force: kind === 'crawl' && body.force === true, deadline: Date.now() + 240_000 });
    // A crawl or analyze is worth showing straight away, so re-run the rules after a crawl.
    if (kind === 'crawl' || kind === 'inspect' || kind === 'search') {
      const analyze = await runJob('analyze', 'manual');
      return NextResponse.json({ ...result, analyze });
    }
    return NextResponse.json(result);
  } catch (err) {
    return seoError(err, 'run');
  }
}
