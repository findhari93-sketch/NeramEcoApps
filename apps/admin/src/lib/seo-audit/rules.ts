/**
 * The SEO/AEO rules. Pure: URL status rows, search totals and robots/llms text
 * in, findings out. Unit-tested in rules.test.ts.
 *
 * Noindex is judged only on URLs we put in a sitemap. Pages the location gate
 * holds back, and non-English copies, are noindex on purpose and are not in
 * any sitemap, so they never raise an alarm (I8 is info for the few that still
 * get impressions).
 *
 * Rule ids are stable: staff ignore findings by them and the docs list them.
 */
import { AI_CRAWLERS, isAllowed, parseRobots } from './robots';
import type { Finding, FindingCategory, PageWindow, QueryPageWindow, RuleInput, Severity, UrlStatus } from './types';

/** Lower-case host, no hash, no trailing slash (except the root). Used to join our URLs with Google's. */
export function normUrl(u: string): string {
  try {
    const url = new URL(u);
    url.hash = '';
    url.host = url.host.toLowerCase();
    let s = url.toString();
    if (url.pathname !== '/' && s.endsWith('/') && !url.search) s = s.slice(0, -1);
    return s;
  } catch {
    return u.trim();
  }
}

const pathOf = (u: string) => {
  try {
    return new URL(u).pathname;
  } catch {
    return u;
  }
};

const originOf = (u: string) => {
  try {
    return new URL(u).origin;
  } catch {
    return '';
  }
};

/** Noindex as it is now: our crawler when it has seen the page, else Google's last look. */
export function isNoindex(r: UrlStatus): boolean {
  if (r.crawled_at && r.http_status === 200) return /noindex/i.test(r.robots_meta || '') || /noindex/i.test(r.x_robots_tag || '');
  return r.indexing_state === 'BLOCKED_BY_META_TAG' || r.indexing_state === 'BLOCKED_BY_HTTP_HEADER';
}

/** Rough organic CTR by position (industry curves); P2 flags pages at half of this or less. */
export function expectedCtr(position: number): number {
  const curve = [0.28, 0.15, 0.1, 0.07, 0.05, 0.04, 0.03, 0.025, 0.02, 0.018];
  const i = Math.max(1, Math.round(position)) - 1;
  return i < curve.length ? curve[i] : 0.01;
}

/** The page-specific schema each kind of page should carry (site-wide Organization schema does not count). */
export function expectedSchema(url: string): { label: string; anyOf: string[] } | null {
  const segs = pathOf(url)
    .replace(/^\/(ta|hi|kn|ml)(?=\/|$)/, '')
    .split('/')
    .filter(Boolean);
  if (segs[0] === 'coaching' && segs.length >= 2) return { label: 'FAQPage', anyOf: ['FAQPage'] };
  if (segs.length === 1 && /^((nata|aat|pgeta)-\d{4}|jee-paper-2-preparation)$/.test(segs[0])) return { label: 'FAQPage', anyOf: ['FAQPage'] };
  if (segs[0] === 'blog' && segs.length === 2) return { label: 'Article', anyOf: ['Article', 'BlogPosting', 'NewsArticle'] };
  if (segs[0] === 'colleges' && segs.length === 3 && !['rankings', 'fees', 'compare'].includes(segs[1])) return { label: 'CollegeOrUniversity', anyOf: ['CollegeOrUniversity'] };
  return null;
}

/** House rule: no em dashes or double dashes in anything a visitor reads. */
const DASHES = /—|--|&mdash;/;

const SEVERITY_ORDER: Record<Severity, number> = { critical: 0, high: 1, medium: 2, info: 3 };

export function runRules(input: RuleInput): Finding[] {
  const out: Finding[] = [];
  const add = (rule_id: string, category: FindingCategory, severity: Severity, url: string | null, title: string, detail: Record<string, unknown>, substance: string, subject?: string) =>
    out.push({ fingerprint: `${rule_id}|${subject ?? url ?? ''}`, rule_id, category, severity, url, title, detail, substance });

  const pages28 = new Map<string, PageWindow>(input.pages28.map((p) => [normUrl(p.page), p]));
  const traffic = (url: string) => pages28.get(normUrl(url)) ?? { page: url, clicks: 0, impressions: 0, avg_position: 0 };

  // ── Indexing ────────────────────────────────────────────────────────────
  for (const r of input.urls) {
    const { clicks, impressions } = traffic(r.url);
    const status = r.http_status;
    const fetchState = r.page_fetch_state;
    const serverError = (status !== null && status >= 500) || fetchState === 'SERVER_ERROR';
    const gone = status === 404 || status === 410 || fetchState === 'NOT_FOUND' || fetchState === 'SOFT_404';
    const redirected = (status !== null && status >= 300 && status < 400) || !!r.redirect_to || fetchState === 'REDIRECT_ERROR';
    const noindex = isNoindex(r);

    if (serverError) {
      add('I1', 'indexing', 'critical', r.url, 'Server error (5xx)', { http_status: status, page_fetch_state: fetchState, crawl_error: r.crawl_error, clicks28: clicks }, 'I1');
      continue;
    }

    if (r.expected_index) {
      if (gone) {
        const soft = fetchState === 'SOFT_404' && status === 200;
        add('I2', 'indexing', 'high', r.url, soft ? 'In the sitemap, but Google sees an empty page (soft 404)' : 'In the sitemap, but the page is not found (404)', { http_status: status, page_fetch_state: fetchState, sitemap: r.sitemap }, `I2:${soft ? 'soft' : 'gone'}`);
        continue;
      }
      if (redirected) {
        add('I2', 'indexing', 'high', r.url, 'In the sitemap, but the page redirects', { http_status: status, redirect_to: r.redirect_to, sitemap: r.sitemap }, `I2:redirect:${r.redirect_to ?? ''}`);
        continue;
      }
      if (noindex) {
        add('I3', 'indexing', 'high', r.url, 'In the sitemap, but marked noindex', { robots_meta: r.robots_meta, x_robots_tag: r.x_robots_tag, indexing_state: r.indexing_state, sitemap: r.sitemap }, 'I3');
        continue;
      }
      if (r.robots_txt_state === 'DISALLOWED') {
        add('I7', 'indexing', 'high', r.url, 'In the sitemap, but robots.txt blocks it', { sitemap: r.sitemap }, 'I7');
        continue;
      }
      if (r.verdict && r.verdict !== 'PASS') {
        if (clicks >= 3) {
          add('I6', 'indexing', 'critical', r.url, 'Page with search traffic is no longer indexed', { coverage_state: r.coverage_state, clicks28: clicks, last_crawl_time: r.last_crawl_time }, `I6:${r.coverage_state ?? ''}`);
        } else {
          add('I4', 'indexing', 'medium', r.url, `Not indexed: ${r.coverage_state || 'reason unknown'}`, { coverage_state: r.coverage_state, verdict: r.verdict, last_crawl_time: r.last_crawl_time, word_count: r.word_count }, `I4:${r.coverage_state ?? ''}`);
        }
      }
      if (r.google_canonical && r.user_canonical && normUrl(r.google_canonical) !== normUrl(r.user_canonical)) {
        add('I5', 'indexing', 'medium', r.url, 'Google chose a different main URL than ours', { google_canonical: r.google_canonical, user_canonical: r.user_canonical }, `I5:${normUrl(r.google_canonical)}`);
      }
    } else {
      // Known from search data or pasted from a Search Console export.
      if (gone && (clicks > 0 || impressions >= 50 || r.source === 'import')) {
        const traffic = clicks > 0 || impressions >= 50;
        add('I2', 'indexing', traffic ? 'high' : 'medium', r.url, traffic ? 'Old URL still gets search traffic but is not found (404): add a redirect' : 'Not found (404)', { http_status: status, page_fetch_state: fetchState, clicks28: clicks, impressions28: impressions, source: r.source }, 'I2:gone');
      } else if (noindex && impressions >= 20) {
        add('I8', 'indexing', 'info', r.url, 'Noindex page still shows in search: check the noindex is intended', { impressions28: impressions, robots_meta: r.robots_meta, x_robots_tag: r.x_robots_tag }, 'I8');
      }
    }
  }

  // ── Performance ─────────────────────────────────────────────────────────
  // P1 striking distance: queries on page 1 to 2 where a better title or section could reach the top 3.
  const striking = new Map<string, QueryPageWindow[]>();
  for (const q of input.queries28) {
    if (q.impressions >= 30 && q.avg_position >= 4.5 && q.avg_position <= 20) {
      const key = normUrl(q.page);
      striking.set(key, [...(striking.get(key) ?? []), q]);
    }
  }
  for (const [page, qs] of striking) {
    const impressions = qs.reduce((s, q) => s + q.impressions, 0);
    if (impressions < 100) continue;
    const top = [...qs].sort((a, b) => b.impressions - a.impressions).slice(0, 5);
    add('P1', 'performance', 'medium', page, `Close to the top for ${qs.length} ${qs.length === 1 ? 'search' : 'searches'}`, { impressions28: impressions, queries: top.map((q) => ({ query: q.query, impressions: q.impressions, clicks: q.clicks, position: Math.round(q.avg_position * 10) / 10 })) }, 'P1');
  }

  // P2 low CTR for its position: the title and description are not earning the click.
  for (const p of input.pages28) {
    if (p.impressions < 200 || p.avg_position > 10 || p.avg_position <= 0) continue;
    const ctr = p.clicks / p.impressions;
    const expected = expectedCtr(p.avg_position);
    if (ctr < expected / 2) {
      add('P2', 'performance', 'medium', normUrl(p.page), 'Few clicks for its position: rewrite the title and description', { impressions28: p.impressions, clicks28: p.clicks, ctr: Math.round(ctr * 1000) / 10, expected_ctr: Math.round(expected * 1000) / 10, position: Math.round(p.avg_position * 10) / 10 }, 'P2');
    }
  }

  // P3 clicks fell 40% or more week on week.
  const last7 = new Map(input.pagesLast7.map((p) => [normUrl(p.page), p]));
  for (const prev of input.pagesPrev7) {
    if (prev.clicks < 10) continue;
    const now = last7.get(normUrl(prev.page));
    const nowClicks = now?.clicks ?? 0;
    if (nowClicks < prev.clicks * 0.6) {
      add('P3', 'performance', 'high', normUrl(prev.page), `Clicks fell ${Math.round((1 - nowClicks / prev.clicks) * 100)}% this week`, { clicks_last7: nowClicks, clicks_prev7: prev.clicks, position_last7: now ? Math.round(now.avg_position * 10) / 10 : null, position_prev7: Math.round(prev.avg_position * 10) / 10 }, 'P3');
    }
  }

  // P4 cannibalisation and P5 demand we do not rank for, both by query.
  const byQuery = new Map<string, QueryPageWindow[]>();
  for (const q of input.queries28) byQuery.set(q.query, [...(byQuery.get(q.query) ?? []), q]);
  const gaps: Array<{ query: string; impressions: number; best: number; page: string }> = [];
  for (const [query, rows] of byQuery) {
    const total = rows.reduce((s, r) => s + r.impressions, 0);
    const competing = rows.filter((r) => r.impressions / total >= 0.2).sort((a, b) => b.impressions - a.impressions);
    if (total >= 100 && competing.length >= 2) {
      add('P4', 'performance', 'medium', normUrl(competing[0].page), `${competing.length} of our pages compete for "${query}"`, { query, impressions28: total, pages: competing.map((r) => ({ page: r.page, impressions: r.impressions, position: Math.round(r.avg_position * 10) / 10 })) }, `P4:${competing.map((r) => normUrl(r.page)).sort().join(',')}`, query);
    }
    const best = rows.reduce((b, r) => (r.avg_position < b.avg_position ? r : b), rows[0]);
    if (total >= 50 && best.avg_position > 20) gaps.push({ query, impressions: total, best: best.avg_position, page: best.page });
  }
  for (const g of gaps.sort((a, b) => b.impressions - a.impressions).slice(0, 25)) {
    add('P5', 'performance', 'info', normUrl(g.page), `People search "${g.query}" but we rank below 20`, { query: g.query, impressions28: g.impressions, best_position: Math.round(g.best * 10) / 10 }, 'P5', g.query);
  }

  // ── On-site (our crawl of indexable sitemap pages) ──────────────────────
  const live = input.urls.filter((r) => r.expected_index && r.crawled_at && r.http_status === 200 && !isNoindex(r));
  const dupGroups = (field: 'title' | 'meta_description') => {
    const groups = new Map<string, string[]>();
    for (const r of live) {
      const v = (r[field] || '').trim().toLowerCase();
      if (v) groups.set(v, [...(groups.get(v) ?? []), r.url]);
    }
    return [...groups.entries()].filter(([, urls]) => urls.length > 1);
  };

  for (const r of live) {
    if (!r.title) add('O1', 'onsite', 'high', r.url, 'Page has no title', {}, 'O1:missing');
    else if (r.title.length > 65) add('O1', 'onsite', 'info', r.url, 'Title is long and may be cut off in results', { title: r.title, length: r.title.length }, 'O1:long');
    if (!r.meta_description) add('O2', 'onsite', 'medium', r.url, 'Page has no meta description', {}, 'O2:missing');
    if (!r.canonical) add('O3', 'onsite', 'medium', r.url, 'Page has no canonical link', {}, 'O3:missing');
    else if (normUrl(r.canonical) !== normUrl(r.url)) add('O3', 'onsite', 'high', r.url, 'Sitemap page names another URL as its canonical', { canonical: r.canonical }, `O3:${normUrl(r.canonical)}`);
    if (r.h1_count === 0) add('O4', 'onsite', 'medium', r.url, 'Page has no H1 heading', {}, 'O4:0');
    else if ((r.h1_count ?? 1) > 1) add('O4', 'onsite', 'info', r.url, `Page has ${r.h1_count} H1 headings`, { h1_count: r.h1_count }, 'O4:many');
    if ((r.jsonld_errors ?? 0) > 0) add('O5', 'onsite', 'high', r.url, 'Structured data (JSON-LD) does not parse', { blocks_failed: r.jsonld_errors }, 'O5');
    if (r.broken_links?.length) add('O6', 'onsite', 'medium', r.url, `${r.broken_links.length} broken internal ${r.broken_links.length === 1 ? 'link' : 'links'}`, { links: r.broken_links.slice(0, 20) }, `O6:${[...r.broken_links].sort().join(',')}`);
    if (DASHES.test(r.title || '') || DASHES.test(r.meta_description || '')) add('O7', 'onsite', 'info', r.url, 'Title or description uses an em dash or "--"', { title: r.title, meta_description: r.meta_description }, 'O7');
    if (r.word_count !== null && r.word_count < 250) add('O8', 'onsite', 'info', r.url, 'Thin page: under 250 words of copy', { word_count: r.word_count }, 'O8');
  }
  // Search Console's "Duplicate without user-selected canonical" is usually a URL outside our
  // sitemaps (a query-string or locale variant) with no canonical tag. Imported URLs are crawled too.
  for (const r of input.urls) {
    if (r.expected_index || !r.crawled_at || r.http_status !== 200 || isNoindex(r) || r.canonical) continue;
    add('O3', 'onsite', 'medium', r.url, 'Page has no canonical link, so Google picks one itself', { source: r.source }, 'O3:missing');
  }
  for (const [title, urls] of dupGroups('title')) {
    add('O1', 'onsite', 'medium', urls[0], `${urls.length} pages share one title`, { title, urls: urls.slice(0, 20) }, `O1:dup:${[...urls].sort().join(',')}`, `dup-title:${title}`);
  }
  for (const [desc, urls] of dupGroups('meta_description')) {
    add('O2', 'onsite', 'info', urls[0], `${urls.length} pages share one meta description`, { meta_description: desc, urls: urls.slice(0, 20) }, `O2:dup:${[...urls].sort().join(',')}`, `dup-desc:${desc.slice(0, 200)}`);
  }

  // ── AEO: can AI answer engines read us, and do they get the right pages ──
  for (const site of input.sites) {
    if (site.robotsStatus !== 200 || site.robotsTxt === null) {
      add('A1', 'aeo', 'high', `${site.origin}/robots.txt`, 'robots.txt is missing', { status: site.robotsStatus }, 'A1:missing', site.origin);
    } else {
      const groups = parseRobots(site.robotsTxt);
      const blocked = AI_CRAWLERS.filter((bot) => !isAllowed(groups, bot, '/'));
      if (blocked.length) add('A1', 'aeo', 'high', `${site.origin}/robots.txt`, `robots.txt blocks AI crawlers: ${blocked.join(', ')}`, { blocked }, `A1:${blocked.join(',')}`, site.origin);
    }

    if (site.llmsStatus !== 200 || !site.llmsTxt) {
      add('A2', 'aeo', 'medium', `${site.origin}/llms.txt`, 'llms.txt is missing', { status: site.llmsStatus }, 'A2:missing', site.origin);
    } else {
      const text = site.llmsTxt;
      const top = input.pages28
        .filter((p) => originOf(p.page) === site.origin && p.clicks > 0)
        .sort((a, b) => b.clicks - a.clicks)
        .slice(0, 15)
        .filter((p) => {
          const path = pathOf(p.page);
          return path !== '/' && !text.includes(normUrl(p.page)) && !text.includes(`(${path})`) && !text.includes(`${site.origin}${path}`);
        });
      if (top.length) add('A2', 'aeo', 'info', `${site.origin}/llms.txt`, `llms.txt leaves out ${top.length} of our most-clicked pages`, { pages: top.map((p) => ({ page: p.page, clicks28: p.clicks })) }, `A2:${top.map((p) => normUrl(p.page)).sort().join(',')}`, site.origin);
    }
  }

  for (const r of live) {
    const want = expectedSchema(r.url);
    if (want && !(r.jsonld_types ?? []).some((t) => want.anyOf.includes(t))) {
      add('A3', 'aeo', 'medium', r.url, `Missing ${want.label} structured data`, { expected: want.anyOf, found: r.jsonld_types ?? [] }, `A3:${want.label}`);
    }
    if (r.answer_first === false && traffic(r.url).impressions >= 100) {
      add('A4', 'aeo', 'info', r.url, 'No short answer under the H1 for AI answers to quote', { impressions28: traffic(r.url).impressions }, 'A4');
    }
  }

  return out.sort((a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity]);
}
