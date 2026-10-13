export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 300;

/**
 * GET /api/cron/college-content
 *
 * Daily (apps/admin/vercel.json). Rewrites the FAQ section of every college
 * page whose facts changed since its FAQs were written, including colleges
 * added since yesterday (they have no facts hash yet). Staff-written or locked
 * FAQs are kept. Guarded by CRON_SECRET. `?limit=` caps the batch (default 10).
 */
import { NextResponse } from 'next/server';
import { getSupabaseAdminClient } from '@neram/database';
import { loadCollegesWithFacts, needsRewrite, writeCollegeFaqs, type ContentReport } from '@/lib/college-content/apply';

const DEFAULT_BATCH = 10;
const TIME_BUDGET_MS = 240_000;

export async function GET(request: Request) {
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret && request.headers.get('authorization') !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const limitParam = Number(new URL(request.url).searchParams.get('limit'));
  const limit = Number.isInteger(limitParam) && limitParam > 0 ? Math.min(limitParam, 30) : DEFAULT_BATCH;
  const started = Date.now();
  const supabase = getSupabaseAdminClient() as any;

  let all;
  try {
    all = await loadCollegesWithFacts(supabase);
  } catch (err) {
    console.error('[cron] college-content load failed:', (err as Error).message);
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }

  // New colleges first (never written), then the longest-unrefreshed.
  const due = all
    .filter(needsRewrite)
    .sort((a, b) => (a.row.faqs_generated_at ?? '').localeCompare(b.row.faqs_generated_at ?? ''))
    .slice(0, limit);

  const reports: ContentReport[] = [];
  const failed: { slug: string; error: string }[] = [];
  for (const c of due) {
    if (Date.now() - started > TIME_BUDGET_MS) break;
    try {
      const rep = await writeCollegeFaqs(supabase, c);
      reports.push(rep);
      // AI budget or cap reached: this college has template FAQs and stays queued; stop here.
      if (rep.aiUnavailable) break;
    } catch (err) {
      failed.push({ slug: c.row.slug, error: (err as Error).message });
    }
  }

  const summary = {
    stale: all.filter(needsRewrite).length,
    processed: reports.length,
    faqs: reports.reduce((n, r) => n + r.written, 0),
    ai: reports.reduce((n, r) => n + r.ai, 0),
    template: reports.reduce((n, r) => n + r.template, 0),
    failed,
    ms: Date.now() - started,
  };
  console.log('[cron] college-content', JSON.stringify(summary));
  return NextResponse.json({ success: true, ...summary, reports });
}
