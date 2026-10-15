export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/**
 * GET /api/cron/seo-audit/findings
 *
 * The open SEO Health findings for the twice-weekly Claude Code fix job
 * (.github/workflows/seo-autofix.yml), split into what it may fix in code
 * (`autofix`) and what goes to the "needs you" list in its pull request.
 *
 * Read only. Lives under /api/cron/ so the staff-token middleware lets it
 * through; it checks its own secret, SEO_EXPORT_TOKEN, and refuses every call
 * when that is unset (fails closed). The token can read findings, nothing else.
 */
import { NextResponse } from 'next/server';
import { RULES } from '@/lib/seo-audit/rule-guide';
import { normUrl } from '@/lib/seo-audit/rules';
import { db, latestSearchDate, lastFinalDate, pageWindow, selectAll, shiftDate } from '@/lib/seo-audit/store';

const ORDER: Record<string, number> = { critical: 0, high: 1, medium: 2, info: 3 };
/** Per rule, so one noisy rule cannot crowd the rest out of a run. */
const PER_RULE = 10;
/** One pull request stays reviewable in about ten minutes. */
const DEFAULT_LIMIT = 40;
const MAX_LIMIT = 60;
/** Info-level rules the job may still fix, after the serious ones (long titles, answer-first copy). */
const INFO_AUTOFIX = new Set(['O1', 'A4']);

export async function GET(request: Request) {
  // Trimmed: a value pasted into `vercel env add` often carries a trailing newline.
  const secret = process.env.SEO_EXPORT_TOKEN?.trim();
  if (!secret || request.headers.get('authorization') !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const asked = Number(new URL(request.url).searchParams.get('limit'));
  const limit = Number.isFinite(asked) && asked > 0 ? Math.min(asked, MAX_LIMIT) : DEFAULT_LIMIT;

  const client = db();
  const end = (await latestSearchDate(client)) ?? lastFinalDate();
  const [rows, pages28] = await Promise.all([
    selectAll<any>((a, b) => client.from('seo_findings').select('id, rule_id, category, severity, url, title, detail, first_seen').eq('status', 'open').order('id').range(a, b)),
    pageWindow(client, shiftDate(end, -27), end),
  ]);
  // Most severe first, then the pages people actually see in search, then hub pages (short paths).
  const impressions = new Map(pages28.map((p) => [normUrl(p.page), p.impressions]));
  const value = (r: any) => (r.url ? impressions.get(normUrl(r.url)) ?? 0 : 0);
  const depth = (r: any) => (r.url ? r.url.split('/').length : 99);
  rows.sort((x, y) => ORDER[x.severity] - ORDER[y.severity] || value(y) - value(x) || depth(x) - depth(y) || (x.first_seen < y.first_seen ? -1 : 1));

  const perRule = new Map<string, number>();
  const pick = (r: any) => {
    const n = perRule.get(r.rule_id) ?? 0;
    perRule.set(r.rule_id, n + 1);
    return n < PER_RULE;
  };
  const shape = (r: any) => ({ ...r, rule: RULES[r.rule_id]?.name ?? r.rule_id, how_to_fix: RULES[r.rule_id]?.fix ?? null });

  // Info-level findings come after the serious ones, and only for rules worth a code change.
  const fixable = (r: any) => RULES[r.rule_id]?.autofix && (r.severity !== 'info' || INFO_AUTOFIX.has(r.rule_id));
  const ordered = [...rows.filter((r) => r.severity !== 'info'), ...rows.filter((r) => r.severity === 'info')];
  const autofix = ordered.filter(fixable).filter(pick).slice(0, limit).map(shape);
  const needsYou = rows.filter((r) => !RULES[r.rule_id]?.autofix && r.severity !== 'info').slice(0, 60).map(shape);

  return NextResponse.json({
    generated_at: new Date().toISOString(),
    counts: { open: rows.length, autofix: autofix.length, needs_you: needsYou.length, limit },
    autofix,
    needs_you: needsYou,
  });
}
