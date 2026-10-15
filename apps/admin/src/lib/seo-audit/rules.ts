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
import { cityForName, getCity } from '@neram/geo';
import { AI_CRAWLERS, isAllowed, parseRobots } from './robots';
import { cycleYear, seasonFor, SEASON_LEAD_DAYS } from './seasons';
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

/** normUrl, plus http and www folded into https on the bare host: they 301 there, so they are one page. */
export function foldUrl(u: string): string {
  return normUrl(u).replace(/^http:\/\//, 'https://').replace(/^https:\/\/www\./, 'https://');
}

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

export type CityIntent = 'nata' | 'jee' | 'exam-centre';

/** Words that are never a city, so "nata coaching near me" does not match a town called "Near". */
const NOT_CITY = new Set(['nata', 'jee', 'main', 'paper', 'coaching', 'classes', 'class', 'centre', 'center', 'centres', 'centers', 'near', 'best', 'online', 'offline', 'exam', 'test', 'institute', 'academy', 'tuition', 'architecture', 'arch', 'barch', 'india', 'top', 'fees', 'fee', 'list', 'with', 'from', 'neram', 'drawing', 'preparation', 'college', 'colleges', 'city', 'cities', 'the', 'and', 'for']);

/** The city and intent of a search like "nata coaching in madurai" or "nata exam centre patna". */
export function cityIntent(query: string): { city: string; state: string; intent: CityIntent } | null {
  const q = query.toLowerCase();
  if (!/\b(nata|jee|b\.?\s?arch|architecture)\b/.test(q)) return null;
  let intent: CityIntent | null = null;
  if (/\b(exam|test)\s+(centre|center|centres|centers|city|cities)\b/.test(q)) intent = 'exam-centre';
  else if (/\b(coaching|classes|class|tuition|institute|academy|centre|center)\b/.test(q)) intent = /\bjee\b/.test(q) ? 'jee' : 'nata';
  if (!intent) return null;
  const words = q.replace(/[^a-z\s]/g, ' ').split(/\s+/).filter((w) => w.length >= 3 && !NOT_CITY.has(w));
  const india = (name: string) => {
    const slug = cityForName(name);
    const c = slug ? getCity(slug) : undefined;
    return c && c.kind === 'india' ? { city: c.slug, state: c.stateSlug, intent: intent as CityIntent } : null;
  };
  // Two-word names first ("navi mumbai"), then single words.
  for (let i = 0; i < words.length - 1; i++) {
    const hit = india(`${words[i]} ${words[i + 1]}`);
    if (hit) return hit;
  }
  for (const w of words) {
    const hit = india(w);
    if (hit) return hit;
  }
  return null;
}

/** The page that answers a city search. Kept in step with exam-config.ts (marketing) and geo-pages.ts (app). */
export function cityPageUrl(intent: CityIntent, city: string, state: string): string {
  if (intent === 'exam-centre') return `https://app.neramclasses.com/tools/nata/exam-centers/${state}/${city}`;
  if (intent === 'jee') return `https://neramclasses.com/coaching/jee-paper-2-coaching/jee-paper-2-coaching-in-${city}`;
  return `https://neramclasses.com/coaching/nata-coaching/nata-coaching-centers-in-${city}`;
}

/**
 * Google's last read had a canonical pointing elsewhere, but the page we serve
 * today names itself. The old canonical is fixed; Google has not re-crawled.
 */
export function staleCanonical(r: UrlStatus): boolean {
  return !!r.user_canonical && normUrl(r.user_canonical) !== normUrl(r.url) && !!r.canonical && normUrl(r.canonical) === normUrl(r.url);
}

/** Fixed on our side, only Google's last look still shows the problem. Asking for a re-crawl is what closes it. */
export function waitingOnGoogle(r: UrlStatus): boolean {
  return staleCanonical(r) || r.page_fetch_state === 'NOT_FOUND' || r.page_fetch_state === 'REDIRECT_ERROR';
}

const onDate = (iso: string | null) => {
  if (!iso || Number.isNaN(Date.parse(iso))) return '';
  return ` on ${new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Asia/Kolkata' })}`;
};

/** Why a page is on the "ask Google" list, in plain words. */
export function askGoogleReason(r: UrlStatus): string {
  const seen = onDate(r.last_crawl_time);
  if (staleCanonical(r)) return `Google last read an old canonical${seen}. Ours is fixed, so ask for a re-crawl.`;
  if (r.page_fetch_state === 'NOT_FOUND') return `Google last saw a 404${seen}. The page works now.`;
  if (r.page_fetch_state === 'REDIRECT_ERROR') return `Google last saw a redirect${seen}. The page loads now.`;
  const cov = (r.coverage_state ?? '').toLowerCase();
  if (cov.startsWith('url is unknown')) return 'Google has never seen this page.';
  if (cov.startsWith('discovered')) return 'Google knows about it but has not crawled it yet.';
  if (cov.startsWith('crawled')) return `Google crawled it${seen} but chose not to index it.`;
  return r.coverage_state || 'Not indexed yet.';
}

export type AskGoogleItem = UrlStatus & { reason: string; waiting: boolean };

/**
 * Today's "ask Google" list: sitemap pages Google has not indexed (or never saw)
 * that work on our side, most valuable first. Requesting indexing is a manual
 * click in Search Console (the API cannot do it, about 10 a day), so the list is
 * short and skips pages requested in the last 14 days. Pages already fixed on our
 * side and only waiting for a re-crawl go first: a request is exactly what they need.
 */
export function pickAskGoogle(urls: UrlStatus[], pages28: PageWindow[], now: Date, n = 10): AskGoogleItem[] {
  const imp = new Map(pages28.map((p) => [normUrl(p.page), p.impressions]));
  const t = now.getTime();
  const depth = (u: string) => pathOf(u).split('/').filter(Boolean).length;
  return urls
    .filter((r) => r.expected_index && r.inspected_at && r.verdict !== 'PASS' && r.crawled_at && r.http_status === 200 && !isNoindex(r))
    .filter((r) => !r.index_requested_at || t - Date.parse(r.index_requested_at) > 14 * 86_400_000)
    .map((r) => ({ ...r, reason: askGoogleReason(r), waiting: waitingOnGoogle(r) }))
    .sort(
      (a, b) =>
        Number(b.waiting) - Number(a.waiting) ||
        (imp.get(normUrl(b.url)) ?? 0) - (imp.get(normUrl(a.url)) ?? 0) ||
        depth(a.url) - depth(b.url) ||
        (b.sitemap_lastmod ?? '').localeCompare(a.sitemap_lastmod ?? ''),
    )
    .slice(0, n);
}

export function runRules(input: RuleInput): Finding[] {
  const out: Finding[] = [];
  const add = (rule_id: string, category: FindingCategory, severity: Severity, url: string | null, title: string, detail: Record<string, unknown>, substance: string, subject?: string) =>
    out.push({ fingerprint: `${rule_id}|${subject ?? url ?? ''}`, rule_id, category, severity, url, title, detail, substance });
  const wait = (rule_id: string, category: FindingCategory, severity: Severity, url: string, title: string, detail: Record<string, unknown>, substance: string) =>
    out.push({ fingerprint: `${rule_id}|${url}`, rule_id, category, severity, url, title, detail, substance, waiting: true });

  const pages28 = new Map<string, PageWindow>(input.pages28.map((p) => [normUrl(p.page), p]));
  const traffic = (url: string) => pages28.get(normUrl(url)) ?? { page: url, clicks: 0, impressions: 0, avg_position: 0 };
  const now = input.now ?? new Date();
  const robotsByOrigin = new Map(input.sites.filter((s) => s.robotsStatus === 200 && s.robotsTxt !== null).map((s) => [s.origin, parseRobots(s.robotsTxt as string)]));
  const sitemapUrls = new Set(input.urls.filter((r) => r.expected_index).map((r) => normUrl(r.url)));

  // ── Indexing ────────────────────────────────────────────────────────────
  for (const r of input.urls) {
    const { clicks, impressions } = traffic(r.url);
    const status = r.http_status;
    const fetchState = r.page_fetch_state;
    const serverError = (status !== null && status >= 500) || fetchState === 'SERVER_ERROR';
    const gone = status === 404 || status === 410 || fetchState === 'NOT_FOUND' || fetchState === 'SOFT_404';
    const redirected = (status !== null && status >= 300 && status < 400) || !!r.redirect_to || fetchState === 'REDIRECT_ERROR';
    const noindex = isNoindex(r);
    // Our crawl is the truth for what we serve today. When only Google's last look still
    // shows a problem we have already fixed, the finding waits for Google to re-crawl.
    const weServeOk = !!r.crawled_at && status === 200 && !r.redirect_to;

    if (serverError) {
      add('I1', 'indexing', 'critical', r.url, 'Server error (5xx)', { http_status: status, page_fetch_state: fetchState, crawl_error: r.crawl_error, clicks28: clicks }, 'I1');
      continue;
    }

    if (r.expected_index) {
      if (gone) {
        const soft = fetchState === 'SOFT_404' && status === 200;
        if (!soft && weServeOk) {
          wait('I2', 'indexing', 'high', r.url, 'Google last saw a 404, the page works now: waiting for a re-crawl', { http_status: status, page_fetch_state: fetchState, last_crawl_time: r.last_crawl_time, sitemap: r.sitemap }, 'I2:gone');
        } else {
          add('I2', 'indexing', 'high', r.url, soft ? 'In the sitemap, but Google sees an empty page (soft 404)' : 'In the sitemap, but the page is not found (404)', { http_status: status, page_fetch_state: fetchState, sitemap: r.sitemap }, `I2:${soft ? 'soft' : 'gone'}`);
        }
        continue;
      }
      if (redirected) {
        if (weServeOk) wait('I2', 'indexing', 'high', r.url, 'Google last saw a redirect, the page loads now: waiting for a re-crawl', { http_status: status, page_fetch_state: fetchState, last_crawl_time: r.last_crawl_time, sitemap: r.sitemap }, 'I2:redirect:');
        else add('I2', 'indexing', 'high', r.url, 'In the sitemap, but the page redirects', { http_status: status, redirect_to: r.redirect_to, sitemap: r.sitemap }, `I2:redirect:${r.redirect_to ?? ''}`);
        continue;
      }
      if (noindex) {
        add('I3', 'indexing', 'high', r.url, 'In the sitemap, but marked noindex', { robots_meta: r.robots_meta, x_robots_tag: r.x_robots_tag, indexing_state: r.indexing_state, sitemap: r.sitemap }, 'I3');
        continue;
      }
      if (r.robots_txt_state === 'DISALLOWED') {
        const groups = robotsByOrigin.get(originOf(r.url));
        if (groups && isAllowed(groups, 'Googlebot', pathOf(r.url) || '/')) {
          wait('I7', 'indexing', 'high', r.url, 'Google last read a robots.txt that blocked it, ours allows it now: waiting for a re-crawl', { sitemap: r.sitemap, last_crawl_time: r.last_crawl_time }, 'I7');
        } else {
          add('I7', 'indexing', 'high', r.url, 'In the sitemap, but robots.txt blocks it', { sitemap: r.sitemap }, 'I7');
        }
        continue;
      }
      // Google read an older canonical than the one we serve (ours names the page itself now).
      const stale = staleCanonical(r);
      if (r.verdict && r.verdict !== 'PASS') {
        if (clicks >= 3) {
          add('I6', 'indexing', 'critical', r.url, 'Page with search traffic is no longer indexed', { coverage_state: r.coverage_state, clicks28: clicks, last_crawl_time: r.last_crawl_time }, `I6:${r.coverage_state ?? ''}`);
        } else if (!stale) {
          // A stale canonical explains the "not indexed" on its own: I5 below waits for the re-crawl.
          add('I4', 'indexing', 'medium', r.url, `Not indexed: ${r.coverage_state || 'reason unknown'}`, { coverage_state: r.coverage_state, verdict: r.verdict, last_crawl_time: r.last_crawl_time, word_count: r.word_count }, `I4:${r.coverage_state ?? ''}`);
        }
      }
      if (r.google_canonical && r.user_canonical && normUrl(r.google_canonical) !== normUrl(r.user_canonical)) {
        if (stale) wait('I5', 'indexing', 'medium', r.url, 'Google read an older canonical, ours is correct now: waiting for a re-crawl', { google_canonical: r.google_canonical, user_canonical: r.user_canonical, canonical_now: r.canonical }, `I5:${normUrl(r.google_canonical)}`);
        else add('I5', 'indexing', 'medium', r.url, 'Google chose a different main URL than ours', { google_canonical: r.google_canonical, user_canonical: r.user_canonical }, `I5:${normUrl(r.google_canonical)}`);
      } else if (stale && !r.google_canonical) {
        // "Alternate page with proper canonical tag": Google kept no canonical of its own, only our old one.
        wait('I5', 'indexing', 'medium', r.url, 'Google read an older canonical, ours is correct now: waiting for a re-crawl', { user_canonical: r.user_canonical, canonical_now: r.canonical, last_crawl_time: r.last_crawl_time }, 'I5:stale');
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

  // P4 cannibalisation and P5 demand we do not rank for, both by query. http and www
  // copies 301 to the bare host, so they are folded into one page first.
  const byQuery = new Map<string, QueryPageWindow[]>();
  for (const q of input.queries28) byQuery.set(q.query, [...(byQuery.get(q.query) ?? []), q]);
  const gaps: Array<{ query: string; impressions: number; best: number; page: string }> = [];
  for (const [query, raw] of byQuery) {
    const folded = new Map<string, QueryPageWindow>();
    for (const r of raw) {
      const key = foldUrl(r.page);
      const prev = folded.get(key);
      if (!prev) folded.set(key, { ...r, page: key });
      else {
        const impressions = prev.impressions + r.impressions;
        folded.set(key, { ...prev, clicks: prev.clicks + r.clicks, impressions, avg_position: impressions ? (prev.avg_position * prev.impressions + r.avg_position * r.impressions) / impressions : prev.avg_position });
      }
    }
    const rows = [...folded.values()];
    const total = rows.reduce((s, r) => s + r.impressions, 0);
    const competing = rows.filter((r) => r.impressions / total >= 0.2).sort((a, b) => b.impressions - a.impressions);
    // A brand search ("neram classes") showing the home page and one more page is a good result.
    if (total >= 100 && competing.length >= 2 && !/neram/i.test(query)) {
      add('P4', 'performance', 'medium', normUrl(competing[0].page), `${competing.length} of our pages compete for "${query}"`, { query, impressions28: total, pages: competing.map((r) => ({ page: r.page, impressions: r.impressions, position: Math.round(r.avg_position * 10) / 10 })) }, `P4:${competing.map((r) => normUrl(r.page)).sort().join(',')}`, query);
    }
    const best = rows.reduce((b, r) => (r.avg_position < b.avg_position ? r : b), rows[0]);
    // Spread: a big search split thinly over many of our pages, none of them on page one.
    // Google cannot tell which page is ours for it ("nata coaching" over 80 pages).
    if (total >= 200 && competing.length < 2 && rows.length >= 5 && best.avg_position > 10 && !/neram/i.test(query)) {
      const top = [...rows].sort((a, b) => b.impressions - a.impressions).slice(0, 8);
      add('P4', 'performance', 'medium', normUrl(top[0].page), `"${query}" is spread over ${rows.length} of our pages, none on page one`, { query, impressions28: total, spread: rows.length, pages: top.map((r) => ({ page: r.page, impressions: r.impressions, position: Math.round(r.avg_position * 10) / 10 })) }, `P4:spread:${rows.length >= 20 ? '20+' : rows.length}`, `spread:${query}`);
    }
    if (total >= 50 && best.avg_position > 20) gaps.push({ query, impressions: total, best: best.avg_position, page: best.page });
  }
  for (const g of gaps.sort((a, b) => b.impressions - a.impressions).slice(0, 25)) {
    add('P5', 'performance', 'info', normUrl(g.page), `People search "${g.query}" but we rank below 20`, { query: g.query, impressions28: g.impressions, best_position: Math.round(g.best * 10) / 10 }, 'P5', g.query);
  }

  // P6 city demand: people search coaching or exam centres in a city whose page we hold
  // back (noindex, so not in a sitemap). Real local facts are what let the gate index it.
  const cityDemand = new Map<string, { city: string; state: string; intent: CityIntent; page: string; impressions: number; queries: Array<{ query: string; impressions: number; position: number }> }>();
  for (const [query, rows] of byQuery) {
    const hit = cityIntent(query);
    if (!hit) continue;
    const page = cityPageUrl(hit.intent, hit.city, hit.state);
    if (sitemapUrls.has(normUrl(page))) continue;
    const impressions = rows.reduce((s, r) => s + r.impressions, 0);
    const best = rows.reduce((b, r) => (r.avg_position < b.avg_position ? r : b), rows[0]);
    const key = `${hit.intent}:${hit.city}`;
    const cur = cityDemand.get(key) ?? { city: hit.city, state: hit.state, intent: hit.intent, page, impressions: 0, queries: [] };
    cur.impressions += impressions;
    cur.queries.push({ query, impressions, position: Math.round(best.avg_position * 10) / 10 });
    cityDemand.set(key, cur);
  }
  for (const d of [...cityDemand.values()].filter((d) => d.impressions >= 20).sort((a, b) => b.impressions - a.impressions).slice(0, 30)) {
    const name = getCity(d.city)?.name ?? d.city;
    const what = d.intent === 'exam-centre' ? 'a NATA exam centre' : d.intent === 'jee' ? 'JEE Paper 2 coaching' : 'NATA coaching';
    add('P6', 'performance', 'medium', d.page, `${d.impressions} searches for ${what} in ${name}, but our ${name} page is held back`, { city: d.city, state: d.state, intent: d.intent, impressions28: d.impressions, queries: d.queries.sort((a, b) => b.impressions - a.impressions).slice(0, 5) }, 'P6', `city:${d.intent}:${d.city}`);
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

  // ── Season: pages must name the coming cycle before its searches start ──
  // A year in the URL (/nata-2026) needs a sibling page for the new year; a page
  // without one (/counseling/tnea-barch) needs the new year in its title.
  const hubs = new Map<string, { season: string; want: number; year: number; hub: string; next: string; pages: string[] }>();
  for (const r of live) {
    const path = pathOf(r.url);
    const season = seasonFor(path);
    if (!season) continue;
    const want = cycleYear(season, now);
    if (!want) continue;
    const inUrl = path.match(/^(\/(?:(?:ta|hi|kn|ml)\/)?[a-z0-9-]+-)(20\d{2})(?=\/|$)/);
    if (inUrl) {
      const year = Number(inUrl[2]);
      if (year >= want) continue;
      const hub = `${originOf(r.url)}${inUrl[1]}${year}`;
      const next = `${originOf(r.url)}${inUrl[1]}${want}`;
      if (sitemapUrls.has(normUrl(next))) continue;
      const cur = hubs.get(hub) ?? { season: season.label, want, year, hub, next, pages: [] };
      cur.pages.push(path);
      hubs.set(hub, cur);
      continue;
    }
    const years = (r.title || '').match(/\b20\d{2}\b/g)?.map(Number).filter((y) => y >= want - 3) ?? [];
    if (years.length && !years.includes(want) && Math.max(...years) < want) {
      add('S1', 'performance', 'high', r.url, `Still says ${Math.max(...years)}: ${season.label} ${want} searches start soon`, { season: season.label, cycle: want, title: r.title, lead_days: SEASON_LEAD_DAYS }, `S1:${want}`);
    }
  }
  for (const h of hubs.values()) {
    add('S1', 'performance', 'high', h.hub, `No ${h.season} ${h.want} page yet: ${h.season} ${h.want} searches start soon`, { season: h.season, cycle: h.want, current_year: h.year, new_url: h.next, pages: h.pages.sort().slice(0, 40) }, `S1:${h.want}`);
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
