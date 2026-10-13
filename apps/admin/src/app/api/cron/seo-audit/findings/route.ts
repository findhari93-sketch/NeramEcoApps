export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/**
 * GET /api/cron/seo-audit/findings
 *
 * The open SEO Health findings for the weekly Claude Code fix job
 * (.github/workflows/seo-autofix.yml), split into what it may fix in code
 * (`autofix`) and what goes to the "needs you" list in its pull request.
 *
 * Read only. Lives under /api/cron/ so the staff-token middleware lets it
 * through; it checks its own secret, SEO_EXPORT_TOKEN, and refuses every call
 * when that is unset (fails closed). The token can read findings, nothing else.
 */
import { NextResponse } from 'next/server';
import { RULES } from '@/lib/seo-audit/rule-guide';
import { db, selectAll } from '@/lib/seo-audit/store';

const ORDER: Record<string, number> = { critical: 0, high: 1, medium: 2, info: 3 };
/** Per rule, so one noisy rule cannot crowd the rest out of a week's work. */
const PER_RULE = 40;

export async function GET(request: Request) {
  // Trimmed: a value pasted into `vercel env add` often carries a trailing newline.
  const secret = process.env.SEO_EXPORT_TOKEN?.trim();
  if (!secret || request.headers.get('authorization') !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const client = db();
  const rows = await selectAll<any>((a, b) =>
    client.from('seo_findings').select('id, rule_id, category, severity, url, title, detail, first_seen').eq('status', 'open').order('id').range(a, b),
  );
  rows.sort((x, y) => ORDER[x.severity] - ORDER[y.severity] || (x.first_seen < y.first_seen ? -1 : 1));

  const perRule = new Map<string, number>();
  const pick = (r: any) => {
    const n = perRule.get(r.rule_id) ?? 0;
    perRule.set(r.rule_id, n + 1);
    return n < PER_RULE;
  };
  const shape = (r: any) => ({ ...r, rule: RULES[r.rule_id]?.name ?? r.rule_id, how_to_fix: RULES[r.rule_id]?.fix ?? null });

  // Info-level findings wait until the more serious ones are done.
  const autofix = rows.filter((r) => RULES[r.rule_id]?.autofix && r.severity !== 'info').filter(pick).map(shape);
  const needsYou = rows.filter((r) => !RULES[r.rule_id]?.autofix && r.severity !== 'info').slice(0, 60).map(shape);

  return NextResponse.json({
    generated_at: new Date().toISOString(),
    counts: { open: rows.length, autofix: autofix.length, needs_you: needsYou.length },
    autofix,
    needs_you: needsYou,
  });
}
