/**
 * Runs the rules over everything we know and reconciles the findings list:
 *   new finding            -> open
 *   still firing           -> last_seen moves on (an ignored one stays ignored
 *                             unless its substance changed, then it reopens)
 *   fixed one fires again  -> open again
 *   open one stops firing  -> fixed, with resolved_at
 *   fixed on our side only -> waiting (Google has not re-crawled), then fixed
 */
import { createHash } from 'crypto';
import { normUrl, runRules } from './rules';
import { fetchSiteFiles } from './crawl';
import { db, loadUrlStatus, pageWindow, queryPageWindow, selectAll, shiftDate, upsertBatches, latestSearchDate, lastFinalDate } from './store';
import type { Finding, FindingRow, RuleInput } from './types';

const hash = (s: string) => createHash('sha1').update(s).digest('hex').slice(0, 16);

export interface ReconcileResult {
  rows: Record<string, unknown>[];
  created: number;
  reopened: number;
  resolved: number;
  stillIgnored: number;
}

/** Pure. `allowResolve` is false when the inputs were empty, so a failed fetch never clears the list. */
export function reconcile(existing: FindingRow[], fresh: Finding[], now: string, allowResolve = true): ReconcileResult {
  const byFp = new Map(existing.map((f) => [f.fingerprint, f]));
  const seen = new Set<string>();
  const rows: Record<string, unknown>[] = [];
  let created = 0;
  let reopened = 0;
  let resolved = 0;
  let stillIgnored = 0;

  const row = (base: Partial<FindingRow> & Pick<FindingRow, 'fingerprint'>) => ({
    fingerprint: base.fingerprint,
    rule_id: base.rule_id,
    category: base.category,
    severity: base.severity,
    url: base.url ?? null,
    title: base.title,
    detail: base.detail ?? {},
    detail_hash: base.detail_hash ?? null,
    status: base.status,
    first_seen: base.first_seen,
    last_seen: base.last_seen,
    resolved_at: base.resolved_at ?? null,
    ignored_by: base.ignored_by ?? null,
    ignore_note: base.ignore_note ?? null,
  });

  for (const f of fresh) {
    if (seen.has(f.fingerprint)) continue;
    seen.add(f.fingerprint);
    const h = hash(f.substance);
    const ex = byFp.get(f.fingerprint);
    const common = { fingerprint: f.fingerprint, rule_id: f.rule_id, category: f.category, severity: f.severity, url: f.url, title: f.title, detail: f.detail, detail_hash: h, last_seen: now };
    const live = f.waiting ? 'waiting' : 'open';
    if (!ex) {
      created += 1;
      rows.push(row({ ...common, status: live, first_seen: now }));
    } else if (ex.status === 'ignored' && ex.detail_hash === h) {
      stillIgnored += 1;
      rows.push(row({ ...common, status: 'ignored', first_seen: ex.first_seen, ignored_by: ex.ignored_by, ignore_note: ex.ignore_note }));
    } else {
      if (ex.status === 'fixed' || ex.status === 'ignored') reopened += 1;
      rows.push(row({ ...common, status: live, first_seen: ex.first_seen }));
    }
  }

  if (allowResolve) {
    for (const ex of existing) {
      if (seen.has(ex.fingerprint) || ex.status === 'fixed') continue;
      resolved += 1;
      rows.push(row({ ...ex, status: 'fixed', resolved_at: now }));
    }
  }

  return { rows, created, reopened, resolved, stillIgnored };
}

/**
 * "Check my fixes": the pages behind open and waiting findings, once each, and
 * the subset with an indexing finding (worth asking Google about again).
 */
export function urlsToRecheck(findings: Array<Pick<FindingRow, 'url' | 'category' | 'status'>>): { all: string[]; indexing: string[] } {
  const all = new Map<string, string>();
  const indexing = new Map<string, string>();
  for (const f of findings) {
    if (!f.url || (f.status !== 'open' && f.status !== 'waiting')) continue;
    const key = normUrl(f.url);
    if (!all.has(key)) all.set(key, f.url);
    if (f.category === 'indexing' && !indexing.has(key)) indexing.set(key, f.url);
  }
  return { all: [...all.values()], indexing: [...indexing.values()] };
}

/** Everything the rules read, loaded in one place. */
export async function loadRuleInput(client: any, origins: string[]): Promise<RuleInput> {
  const end = (await latestSearchDate(client)) ?? lastFinalDate();
  const [urls, pages28, pagesLast7, pagesPrev7, queries28, sites] = await Promise.all([
    loadUrlStatus(client),
    pageWindow(client, shiftDate(end, -27), end),
    pageWindow(client, shiftDate(end, -6), end),
    pageWindow(client, shiftDate(end, -13), shiftDate(end, -7)),
    queryPageWindow(client, shiftDate(end, -27), end, 10),
    Promise.all(origins.map((o) => fetchSiteFiles(o))),
  ]);
  return { urls, pages28, pagesLast7, pagesPrev7, queries28, sites };
}

export async function runAnalyze(opts: { client?: any; origins: string[]; now?: Date }) {
  const client = opts.client ?? db();
  const now = (opts.now ?? new Date()).toISOString();
  const input = await loadRuleInput(client, opts.origins);
  const fresh = runRules(input);
  const existing = await selectAll<FindingRow>((from, to) => client.from('seo_findings').select('*').order('fingerprint').range(from, to));
  const result = reconcile(existing, fresh, now, input.urls.length > 0);
  await upsertBatches(client, 'seo_findings', result.rows, 'fingerprint');
  return {
    urls: input.urls.length,
    findings: fresh.length,
    created: result.created,
    reopened: result.reopened,
    resolved: result.resolved,
    stillIgnored: result.stillIgnored,
    // Live issues after this run, as the page counts them (info is not an issue).
    open: result.rows.filter((r) => r.status === 'open' && r.severity !== 'info').length,
    waiting: result.rows.filter((r) => r.status === 'waiting').length,
  };
}
