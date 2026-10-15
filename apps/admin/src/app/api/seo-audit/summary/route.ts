export const dynamic = 'force-dynamic';

/**
 * GET /api/seo-audit/summary - SEO Health overview: connection state, the last
 * run of each job, index coverage of our sitemap pages, open findings by
 * severity and category, 28-day search totals against the 28 days before, and
 * today's short list of pages to ask Google to index.
 * Admins only.
 */
import { NextResponse } from 'next/server';
import { readSeoEnv } from '@/lib/seo-audit/config';
import { requireSeoAdmin, seoError } from '@/lib/seo-audit/guard';
import { pickAskGoogle } from '@/lib/seo-audit/rules';
import { db, latestSearchDate, loadUrlStatus, pageWindow, selectAll, shiftDate } from '@/lib/seo-audit/store';

const KINDS = ['search', 'sitemaps', 'inspect', 'crawl', 'analyze', 'digest'] as const;
const AEO_RULES = ['A1', 'A2', 'A3', 'A4'];

function totals(rows: Array<{ clicks: number; impressions: number; avg_position: number }>) {
  const clicks = rows.reduce((s, r) => s + r.clicks, 0);
  const impressions = rows.reduce((s, r) => s + r.impressions, 0);
  const weighted = rows.reduce((s, r) => s + r.avg_position * r.impressions, 0);
  return { clicks, impressions, position: impressions ? weighted / impressions : null };
}

export async function GET(request: Request) {
  const guard = requireSeoAdmin(request);
  if (!guard.ok) return guard.response;
  try {
    const client = db();
    const { env, missing } = readSeoEnv();

    const runs = await Promise.all(
      KINDS.map(async (kind) => {
        const { data } = await client
          .from('seo_audit_runs')
          .select('kind, status, trigger, started_at, finished_at, counts, error')
          .eq('kind', kind)
          .order('started_at', { ascending: false })
          .limit(1);
        return data?.[0] ?? { kind, status: null };
      }),
    );

    const urls = await loadUrlStatus(client);
    const expected = urls.filter((u) => u.expected_index);
    const coverage = {
      expected: expected.length,
      inspected: expected.filter((u) => u.inspected_at).length,
      indexed: expected.filter((u) => u.verdict === 'PASS').length,
      crawled: expected.filter((u) => u.crawled_at).length,
      tracked: urls.length,
    };

    const [findings, waiting] = await Promise.all([
      selectAll<any>((a, b) => client.from('seo_findings').select('id, severity, category, rule_id').eq('status', 'open').order('id').range(a, b)),
      client.from('seo_findings').select('id', { count: 'exact', head: true }).eq('status', 'waiting'),
    ]);
    const bySeverity: Record<string, number> = { critical: 0, high: 0, medium: 0, info: 0 };
    const byCategory: Record<string, number> = { indexing: 0, performance: 0, onsite: 0, aeo: 0 };
    for (const f of findings) {
      bySeverity[f.severity] = (bySeverity[f.severity] ?? 0) + 1;
      byCategory[f.category] = (byCategory[f.category] ?? 0) + 1;
    }
    const aeoOpen = new Set(findings.filter((f) => AEO_RULES.includes(f.rule_id)).map((f) => f.rule_id));

    const end = await latestSearchDate(client);
    let search = null;
    let pages28: Awaited<ReturnType<typeof pageWindow>> = [];
    if (end) {
      const [now28, prev28, trend] = await Promise.all([
        pageWindow(client, shiftDate(end, -27), end),
        pageWindow(client, shiftDate(end, -55), shiftDate(end, -28)),
        client.rpc('seo_daily_totals', { p_from: shiftDate(end, -89), p_to: end }),
      ]);
      pages28 = now28;
      search = {
        end,
        now: totals(now28),
        prev: totals(prev28),
        trend: (trend.data ?? []).map((r: any) => ({ date: r.date, clicks: Number(r.clicks), impressions: Number(r.impressions) })),
      };
    }

    return NextResponse.json({
      connection: { connected: missing.length === 0, missing, siteUrl: env.siteUrl, accountEmail: env.accountEmail, origins: env.origins, digest: env.digestTo.length > 0 },
      runs,
      coverage,
      findings: { total: findings.length, issues: findings.length - bySeverity.info, waiting: waiting.count ?? 0, bySeverity, byCategory },
      askGoogle: pickAskGoogle(urls, pages28, new Date()).map((u) => ({ url: u.url, coverage_state: u.coverage_state, reason: u.reason, waiting: u.waiting, last_crawl_time: u.last_crawl_time })),
      aeo: { checks: AEO_RULES.length, passing: AEO_RULES.length - aeoOpen.size },
      search,
    });
  } catch (err) {
    return seoError(err, 'summary');
  }
}
