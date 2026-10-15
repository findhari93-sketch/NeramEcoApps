/**
 * The pure readers: HTML, robots.txt, sitemaps, the service-account JWT,
 * pasted imports, search rows and the inspection queue.
 */
import { createVerify, generateKeyPairSync } from 'crypto';
import { describe, expect, it } from 'vitest';
import { parseServiceAccount, readSeoEnv } from './config';
import { signServiceAccountJwt, GSC_SCOPE } from './gsc/auth';
import { parseHtml } from './html';
import { pickForInspection } from './inspect';
import { toRows } from './ingest-search';
import { brokenLinksFor, orderLinkChecks, pickForCrawl } from './crawl';
import { AI_CRAWLERS, isAllowed, parseRobots } from './robots';
import { parseSitemap } from './sitemaps';
import { extractUrls } from './urls';
import type { UrlStatus } from './types';

const PAGE = `<!doctype html><html><head>
<title>NATA Coaching in Chennai &amp; Tambaram</title>
<meta content="Learn NATA drawing" name="description">
<meta name="robots" content="index, follow">
<link rel="canonical" href="/coaching/chennai">
<script type="application/ld+json">{"@context":"https://schema.org","@graph":[{"@type":"Organization"},{"@type":"FAQPage","mainEntity":[{"@type":"Question"}]}]}</script>
<script type="application/ld+json">{"@type": broken</script>
</head><body><header><a href="/apply">Apply</a></header><main>
<h1>NATA coaching in Chennai</h1>
<p></p>
<p>Neram runs NATA classes in Tambaram every weekend, with drawing practice, mock tests and a teacher who reviews every sketch.</p>
<h1>Second heading</h1>
<a href="https://neramclasses.com/fees?x=1#top">Fees</a> <a href="https://other.com/x">Out</a> <a href="mailto:a@b.c">Mail</a> <a href="/cdn-cgi/l/email-protection#abc">Mail</a>
</main></body></html>`;

describe('parseHtml', () => {
  const s = parseHtml(PAGE, 'https://neramclasses.com/coaching/chennai');
  it('reads head tags whatever the attribute order', () => {
    expect(s.title).toBe('NATA Coaching in Chennai & Tambaram');
    expect(s.metaDescription).toBe('Learn NATA drawing');
    expect(s.robotsMeta).toBe('index, follow');
    expect(s.canonical).toBe('https://neramclasses.com/coaching/chennai');
  });
  it('collects JSON-LD types from @graph and counts blocks that do not parse', () => {
    expect(s.jsonldTypes).toEqual(['FAQPage', 'Organization', 'Question']);
    expect(s.jsonldErrors).toBe(1);
  });
  it('counts H1s, finds the answer paragraph and same-host links', () => {
    expect(s.h1Count).toBe(2);
    expect(s.answerFirst).toBe(true);
    expect(s.internalLinks.sort()).toEqual(['https://neramclasses.com/apply', 'https://neramclasses.com/fees']);
    expect(s.wordCount).toBeGreaterThan(20);
  });
});

describe('robots', () => {
  const live = `User-Agent: *\nAllow: /\nDisallow: /api/\nDisallow: /*.json$\n\nUser-Agent: GPTBot\nUser-Agent: ClaudeBot\nAllow: /\nDisallow: /api/\n`;
  it('reads groups that name several crawlers', () => {
    const g = parseRobots(live);
    expect(AI_CRAWLERS.every((bot) => isAllowed(g, bot, '/'))).toBe(true);
    expect(isAllowed(g, 'GPTBot', '/api/x')).toBe(false);
    expect(isAllowed(g, 'Googlebot', '/data.json')).toBe(false);
    expect(isAllowed(g, 'Googlebot', '/data.json/x')).toBe(true);
  });
  it('blocks a crawler disallowed from /', () => {
    expect(isAllowed(parseRobots('User-agent: GPTBot\nDisallow: /\n'), 'GPTBot', '/')).toBe(false);
    expect(isAllowed(parseRobots('User-agent: GPTBot\nDisallow:\n'), 'GPTBot', '/')).toBe(true);
  });
});

describe('parseSitemap', () => {
  it('reads an index and a urlset, ignoring image locs', () => {
    expect(parseSitemap('<sitemapindex><sitemap><loc>https://a.com/s.xml</loc></sitemap></sitemapindex>')).toEqual({ kind: 'index', entries: [{ loc: 'https://a.com/s.xml', lastmod: null }] });
    const u = parseSitemap('<urlset><url><loc>https://a.com/p?a=1&amp;b=2</loc><lastmod>2026-10-01</lastmod><image:image><image:loc>https://a.com/i.jpg</image:loc></image:image></url></urlset>');
    expect(u.entries).toEqual([{ loc: 'https://a.com/p?a=1&b=2', lastmod: '2026-10-01' }]);
  });
});

describe('service account', () => {
  const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048, privateKeyEncoding: { type: 'pkcs8', format: 'pem' }, publicKeyEncoding: { type: 'spki', format: 'pem' } });
  const sa = { client_email: 'seo-audit@neramclasses-ab480.iam.gserviceaccount.com', private_key: privateKey as string };

  it('signs a JWT Google will accept', () => {
    const jwt = signServiceAccountJwt(sa, GSC_SCOPE, 1_760_000_000);
    const [h, c, sig] = jwt.split('.');
    expect(JSON.parse(Buffer.from(h, 'base64url').toString())).toEqual({ alg: 'RS256', typ: 'JWT' });
    expect(JSON.parse(Buffer.from(c, 'base64url').toString())).toEqual({ iss: sa.client_email, scope: GSC_SCOPE, aud: 'https://oauth2.googleapis.com/token', iat: 1_760_000_000, exp: 1_760_003_600 });
    expect(createVerify('RSA-SHA256').update(`${h}.${c}`).verify(publicKey as string, Buffer.from(sig, 'base64url'))).toBe(true);
  });

  it('reads the key as base64 or raw JSON, and reports it missing', () => {
    const json = JSON.stringify(sa);
    expect(parseServiceAccount(json)?.client_email).toBe(sa.client_email);
    expect(parseServiceAccount(Buffer.from(json).toString('base64'))?.client_email).toBe(sa.client_email);
    expect(parseServiceAccount('not a key')).toBeNull();
    expect(readSeoEnv({}).missing).toEqual(['GSC_SERVICE_ACCOUNT_KEY']);
    expect(readSeoEnv({ GSC_SERVICE_ACCOUNT_KEY: 'junk' }).missing).toEqual(['GSC_SERVICE_ACCOUNT_KEY (unreadable)']);
    expect(readSeoEnv({}).env.siteUrl).toBe('sc-domain:neramclasses.com');
  });
});

describe('extractUrls', () => {
  it('keeps only our hosts from a pasted export', () => {
    const csv = 'URL,Last crawled\nhttps://neramclasses.com/a,2026-10-01\n"https://app.neramclasses.com/tools/x",2026-10-02\nhttps://evil.com/y,x\nhttps://www.neramclasses.com/b';
    expect(extractUrls(csv, ['https://neramclasses.com', 'https://app.neramclasses.com'])).toEqual([
      'https://neramclasses.com/a',
      'https://app.neramclasses.com/tools/x',
      'https://www.neramclasses.com/b',
    ]);
  });
});

describe('toRows', () => {
  it('maps page totals to query "" and query rows to their query', () => {
    expect(toRows([{ keys: ['2026-10-01', 'https://a.com/p', 'MOBILE'], clicks: 2, impressions: 10, ctr: 0.2, position: 3 }], false)[0]).toMatchObject({ query: '', device: 'MOBILE' });
    expect(toRows([{ keys: ['2026-10-01', 'https://a.com/p', 'nata', 'DESKTOP'], clicks: 1, impressions: 5, ctr: 0.2, position: 4 }], true)[0]).toMatchObject({ query: 'nata', device: 'DESKTOP' });
  });
});

const row = (url: string, over: Partial<UrlStatus> = {}) => ({ url, source: 'sitemap', expected_index: true, priority_inspect: false, inspected_at: null, crawled_at: null, ...over }) as UrlStatus;

describe('queues', () => {
  const now = new Date('2026-10-13T00:00:00Z');
  it('inspects priority, then open issues, then never-seen, then stale; skips fresh ones', () => {
    const rows = [
      row('https://n.com/stale', { inspected_at: '2026-10-01T00:00:00Z' }),
      row('https://n.com/fresh', { inspected_at: '2026-10-12T00:00:00Z' }),
      row('https://n.com/new'),
      row('https://n.com/issue', { inspected_at: '2026-10-11T00:00:00Z' }),
      row('https://n.com/pasted', { priority_inspect: true, source: 'import', expected_index: false }),
    ];
    expect(pickForInspection(rows, new Set(['https://n.com/issue']), 10, now)).toEqual(['https://n.com/pasted', 'https://n.com/issue', 'https://n.com/new', 'https://n.com/stale']);
    expect(pickForInspection(rows, new Set(), 2, now)).toHaveLength(2);
  });

  it('checks last run’s broken links first and rotates the rest daily', () => {
    const links = ['https://n.com/a', 'https://n.com/b', 'https://n.com/c', 'https://n.com/d'];
    const today = orderLinkChecks(links, new Set(['https://n.com/c']), now);
    expect(today[0]).toBe('https://n.com/c');
    expect(new Set(today)).toEqual(new Set(links));
    const tomorrow = orderLinkChecks(links, new Set(), new Date(now.getTime() + 86_400_000));
    expect(tomorrow[0]).not.toBe(orderLinkChecks(links, new Set(), now)[0]);
  });

  it('keeps a broken link that was not re-checked, drops one that is fixed or unlinked', () => {
    const known = new Map<string, number | null>([['https://n.com/fixed', 200], ['https://n.com/gone', 404]]);
    expect(brokenLinksFor(['https://n.com/gone', 'https://n.com/fixed', 'https://n.com/unchecked'], ['https://n.com/fixed', 'https://n.com/unchecked', 'https://n.com/unlinked'], known).sort()).toEqual([
      'https://n.com/gone',
      'https://n.com/unchecked',
    ]);
  });

  it('crawls pages not crawled this week, oldest first', () => {
    const rows = [row('https://n.com/recent', { crawled_at: '2026-10-10T00:00:00Z' }), row('https://n.com/old', { crawled_at: '2026-09-01T00:00:00Z' }), row('https://n.com/never')];
    expect(pickForCrawl(rows, now)).toEqual(['https://n.com/never', 'https://n.com/old']);
    expect(pickForCrawl(rows, now, true)).toHaveLength(3);
  });

  it('Check my fixes: crawls only the given pages, even ones crawled today', () => {
    const rows = [row('https://n.com/fixed', { crawled_at: '2026-10-12T23:00:00Z' }), row('https://n.com/other'), row('https://n.com/pasted', { expected_index: false, source: 'import' })];
    expect(pickForCrawl(rows, now, false, ['https://n.com/fixed/'])).toEqual(['https://n.com/fixed']);
    expect(pickForCrawl(rows, now, false, [])).toEqual([]);
  });

  it('Check my fixes: inspects only the given pages, ignoring freshness, within the budget', () => {
    const rows = [
      row('https://n.com/fresh', { inspected_at: '2026-10-12T23:00:00Z' }),
      row('https://n.com/older', { inspected_at: '2026-10-11T00:00:00Z' }),
      row('https://n.com/skip', { priority_inspect: true }),
    ];
    expect(pickForInspection(rows, new Set(), 10, now, ['https://n.com/fresh', 'https://n.com/older'])).toEqual(['https://n.com/older', 'https://n.com/fresh']);
    expect(pickForInspection(rows, new Set(), 1, now, ['https://n.com/fresh', 'https://n.com/older'])).toEqual(['https://n.com/older']);
  });
});
