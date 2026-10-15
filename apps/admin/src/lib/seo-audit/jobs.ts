/**
 * The audit's jobs, each recorded as a seo_audit_runs row. Used by both crons
 * and the "Run now" menu, so they all answer the same way.
 *
 * Daily (one invocation, 300s): pull search data, resubmit sitemaps that
 * changed or that Google stopped reading, refresh the URL set, inspect
 * up to 400 URLs, crawl the pages not crawled this week, then analyze.
 * Weekly: analyze, then the email digest.
 * Recheck ("Check my fixes"): only the pages behind open or waiting issues.
 *
 * Search and inspection need Search Console; the crawl and the rules do not,
 * so they run (and find real issues) before the key is set.
 */
import { readSeoEnv } from './config';
import { createGscClient } from './gsc/client';
import { runSearchIngest } from './ingest-search';
import { runInspect } from './inspect';
import { runCrawl } from './crawl';
import { runAnalyze, urlsToRecheck } from './analyze';
import { sendSeoDigest } from './digest';
import { refreshUrlSet } from './urls';
import { runSitemapSubmit } from './sitemap-submit';
import { db, finishRun, lastRunCounts, recordNotConnected, selectAll, startRun } from './store';
import type { FindingRow, RunKind, RunTrigger } from './types';

/** How much of a 300s function the jobs may use, keeping room to write results. */
const BUDGET_MS = 270_000;

async function recorded<T extends Record<string, unknown>>(client: any, kind: RunKind, trigger: RunTrigger, fn: () => Promise<T>) {
  const id = await startRun(client, kind, trigger);
  try {
    const counts = await fn();
    const partial = Number((counts as any).errors) > 0 || Number((counts as any).remaining) > 0 || ((counts as any).errorsList?.length ?? 0) > 0;
    await finishRun(client, id, partial ? 'partial' : 'ok', counts);
    return { kind, status: partial ? 'partial' : 'ok', ...counts };
  } catch (e) {
    const message = e instanceof Error ? e.message : 'unknown error';
    console.error(`[seo-audit] ${kind} failed:`, message);
    await finishRun(client, id, 'failed', {}, message);
    return { kind, status: 'failed', error: message };
  }
}

/** `only` scopes crawl and inspect to those URLs and skips the sitemap refresh ("Check my fixes"). */
export async function runJob(kind: RunKind, trigger: RunTrigger, opts: { deadline?: number; force?: boolean; only?: string[] } = {}) {
  const client = db();
  const { env, missing } = readSeoEnv();
  const deadline = opts.deadline ?? Date.now() + BUDGET_MS;

  switch (kind) {
    case 'search':
    case 'inspect':
    case 'sitemaps': {
      if (!env.serviceAccount) {
        await recordNotConnected(client, kind, trigger, missing);
        return { kind, status: 'not_connected', missing };
      }
      const gsc = createGscClient({ siteUrl: env.siteUrl, serviceAccount: env.serviceAccount });
      if (kind === 'search') return recorded(client, kind, trigger, () => runSearchIngest({ gsc, client, deadline }));
      if (kind === 'sitemaps') {
        return recorded(client, kind, trigger, async () => {
          const prev = await lastRunCounts(client, 'sitemaps');
          return runSitemapSubmit({ gsc, origins: env.origins, prevHashes: (prev?.hashes as Record<string, string>) ?? {} });
        });
      }
      return recorded(client, kind, trigger, async () => {
        if (opts.only) return { ...(await runInspect({ gsc, client, deadline, only: opts.only })), scope: 'fixes' };
        const urls = await refreshUrlSet({ client, origins: env.origins });
        const res = await runInspect({ gsc, client, deadline });
        return { ...res, sitemapUrls: urls.sitemapUrls, errorsList: urls.errors };
      });
    }
    case 'crawl':
      return recorded(client, kind, trigger, async () => {
        if (opts.only) return { ...(await runCrawl({ client, deadline, only: opts.only })), scope: 'fixes' };
        const urls = await refreshUrlSet({ client, origins: env.origins });
        const res = await runCrawl({ client, deadline, force: opts.force });
        return { ...res, sitemapUrls: urls.sitemapUrls, dropped: urls.dropped, addedFromSearch: urls.addedFromSearch, errorsList: urls.errors };
      });
    case 'analyze':
      return recorded(client, kind, trigger, () => runAnalyze({ client, origins: env.origins }));
    case 'digest':
      return recorded(client, kind, trigger, () => sendSeoDigest({ client, to: env.digestTo }));
  }
}

/** The daily cron: every step gets a share of the 270s, in order. */
export async function runDaily(trigger: RunTrigger) {
  const start = Date.now();
  const at = (s: number) => start + s * 1000;
  const search = await runJob('search', trigger, { deadline: at(40) });
  const sitemaps = await runJob('sitemaps', trigger);
  const inspect = await runJob('inspect', trigger, { deadline: at(160) });
  const crawl = await runJob('crawl', trigger, { deadline: at(240) });
  const analyze = await runJob('analyze', trigger);
  return { search, sitemaps, inspect, crawl, analyze };
}

/**
 * "Check my fixes", after a fix is live: re-crawl every page with an open or
 * waiting issue, re-inspect the ones with an indexing issue, then rebuild the
 * list. Our-side fixes close straight away; Google-side ones move to waiting.
 */
export async function runRecheck(trigger: RunTrigger) {
  const client = db();
  const start = Date.now();
  const findings = await selectAll<Pick<FindingRow, 'url' | 'category' | 'status'>>((from, to) =>
    client.from('seo_findings').select('url, category, status').in('status', ['open', 'waiting']).not('url', 'is', null).order('url').range(from, to),
  );
  const { all, indexing } = urlsToRecheck(findings);
  const crawl = all.length ? await runJob('crawl', trigger, { only: all, deadline: start + 150_000 }) : null;
  const inspect = indexing.length ? await runJob('inspect', trigger, { only: indexing, deadline: start + 230_000 }) : null;
  const analyze = await runJob('analyze', trigger);
  return { checked: all.length, crawl, inspect, analyze };
}

export async function runWeekly(trigger: RunTrigger) {
  const analyze = await runJob('analyze', trigger);
  const digest = await runJob('digest', trigger);
  return { analyze, digest };
}
