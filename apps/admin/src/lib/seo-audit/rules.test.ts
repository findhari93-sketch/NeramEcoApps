import { describe, expect, it } from 'vitest';
import { cityIntent, cityPageUrl, expectedCtr, expectedSchema, isNoindex, normUrl, pickAskGoogle, runRules } from './rules';
import { cycleYear, SEASONS } from './seasons';
import type { RuleInput, UrlStatus } from './types';

const NOW = '2026-10-13T00:00:00.000Z';
const ROBOTS_OK = 'User-agent: *\nAllow: /\nDisallow: /api/\n';

function url(over: Partial<UrlStatus> & { url: string }): UrlStatus {
  return {
    source: 'sitemap',
    sitemap: '/sitemaps/core/sitemap.xml',
    sitemap_lastmod: null,
    expected_index: true,
    priority_inspect: false,
    verdict: 'PASS',
    coverage_state: 'Submitted and indexed',
    indexing_state: 'INDEXING_ALLOWED',
    robots_txt_state: 'ALLOWED',
    page_fetch_state: 'SUCCESSFUL',
    google_canonical: null,
    user_canonical: null,
    last_crawl_time: null,
    inspected_at: NOW,
    inspected_lastmod: null,
    inspect_error: null,
    http_status: 200,
    redirect_to: null,
    title: 'NATA Coaching in Chennai: Neram Classes',
    meta_description: 'A real description.',
    canonical: over.url,
    robots_meta: 'index, follow',
    x_robots_tag: null,
    h1_count: 1,
    jsonld_types: ['FAQPage'],
    jsonld_errors: 0,
    word_count: 900,
    answer_first: true,
    broken_links: [],
    crawled_at: NOW,
    crawl_error: null,
    ...over,
  };
}

function input(over: Partial<RuleInput> = {}): RuleInput {
  return {
    urls: [],
    pages28: [],
    pagesLast7: [],
    pagesPrev7: [],
    queries28: [],
    sites: [{ origin: 'https://neramclasses.com', robotsStatus: 200, robotsTxt: ROBOTS_OK, llmsStatus: 200, llmsTxt: '# Neram\n' }],
    ...over,
  };
}

const rules = (i: RuleInput) => runRules(i).map((f) => f.rule_id);

describe('normUrl', () => {
  it('drops the trailing slash and hash but keeps the root', () => {
    expect(normUrl('https://NeramClasses.com/coaching/#faq')).toBe('https://neramclasses.com/coaching');
    expect(normUrl('https://neramclasses.com/')).toBe('https://neramclasses.com/');
  });
});

describe('a healthy page', () => {
  it('raises nothing', () => {
    expect(runRules(input({ urls: [url({ url: 'https://neramclasses.com/coaching/nata-coaching-in-chennai' })] }))).toEqual([]);
  });
});

describe('indexing rules', () => {
  it('I1: a 5xx is critical wherever the URL came from', () => {
    const f = runRules(input({ urls: [url({ url: 'https://neramclasses.com/a', http_status: 503 }), url({ url: 'https://neramclasses.com/b', source: 'import', expected_index: false, page_fetch_state: 'SERVER_ERROR', crawled_at: null, http_status: null })] }));
    expect(f.filter((x) => x.rule_id === 'I1').map((x) => x.severity)).toEqual(['critical', 'critical']);
  });

  it('I2: a sitemap URL that redirects or 404s', () => {
    expect(rules(input({ urls: [url({ url: 'https://neramclasses.com/old', http_status: 301, redirect_to: 'https://neramclasses.com/new', title: null })] }))).toEqual(['I2']);
    expect(rules(input({ urls: [url({ url: 'https://neramclasses.com/gone', http_status: 404 })] }))).toEqual(['I2']);
  });

  it('I2: an old URL outside the sitemap only matters if it still gets traffic', () => {
    const gone = url({ url: 'https://neramclasses.com/old-post', source: 'search', expected_index: false, http_status: 404 });
    expect(rules(input({ urls: [gone] }))).toEqual([]);
    const f = runRules(input({ urls: [gone], pages28: [{ page: 'https://neramclasses.com/old-post', clicks: 4, impressions: 90, avg_position: 8 }] }));
    expect(f.filter((x) => x.category === 'indexing').map((x) => [x.rule_id, x.severity])).toEqual([['I2', 'high']]);
  });

  it('I3: noindex on a sitemap URL is high', () => {
    expect(rules(input({ urls: [url({ url: 'https://neramclasses.com/x', robots_meta: 'noindex, follow' })] }))).toEqual(['I3']);
  });

  it('does not flag a gate-held city page: noindex but not in any sitemap', () => {
    const held = url({ url: 'https://neramclasses.com/coaching/nata-coaching/nata-coaching-in-ooty', source: 'search', expected_index: false, robots_meta: 'noindex, follow' });
    expect(rules(input({ urls: [held] }))).toEqual([]);
  });

  it('I8: a noindex page that still gets impressions is info only', () => {
    const held = url({ url: 'https://neramclasses.com/ta/x', source: 'search', expected_index: false, robots_meta: 'noindex' });
    const f = runRules(input({ urls: [held], pages28: [{ page: held.url, clicks: 0, impressions: 40, avg_position: 30 }] }));
    expect(f.map((x) => [x.rule_id, x.severity])).toEqual([['I8', 'info']]);
  });

  it('I4 vs I6: not indexed, critical when the page had traffic', () => {
    const r = url({ url: 'https://neramclasses.com/y', verdict: 'NEUTRAL', coverage_state: 'Crawled - currently not indexed' });
    expect(runRules(input({ urls: [r] }))[0]).toMatchObject({ rule_id: 'I4', severity: 'medium', title: 'Not indexed: Crawled - currently not indexed' });
    expect(runRules(input({ urls: [r], pages28: [{ page: r.url, clicks: 5, impressions: 100, avg_position: 6 }] }))[0]).toMatchObject({ rule_id: 'I6', severity: 'critical' });
  });

  it('I5: Google chose another canonical', () => {
    const r = url({ url: 'https://neramclasses.com/z', google_canonical: 'https://neramclasses.com/other', user_canonical: 'https://neramclasses.com/z' });
    expect(rules(input({ urls: [r] }))).toEqual(['I5']);
  });

  it('I7: robots.txt blocks a sitemap URL', () => {
    expect(rules(input({ urls: [url({ url: 'https://neramclasses.com/b', robots_txt_state: 'DISALLOWED' })] }))).toEqual(['I7']);
  });

  it('trusts our fresh crawl over an older Google noindex', () => {
    const r = url({ url: 'https://neramclasses.com/fixed', indexing_state: 'BLOCKED_BY_META_TAG', robots_meta: 'index, follow' });
    expect(isNoindex(r)).toBe(false);
  });
});

describe('performance rules', () => {
  const page = 'https://neramclasses.com/nata-2026';

  it('P1: striking distance needs 100+ impressions across searches at position 5 to 20', () => {
    const q = (query: string, impressions: number, avg_position: number) => ({ query, page, clicks: 1, impressions, avg_position });
    expect(rules(input({ queries28: [q('nata exam date', 60, 7), q('nata 2026', 50, 12)] }))).toContain('P1');
    expect(rules(input({ queries28: [q('nata exam date', 60, 7)] }))).not.toContain('P1');
    expect(rules(input({ queries28: [q('nata exam date', 500, 2)] }))).not.toContain('P1');
  });

  it('P2: CTR under half of what its position earns', () => {
    expect(rules(input({ pages28: [{ page, clicks: 2, impressions: 400, avg_position: 3 }] }))).toContain('P2');
    expect(rules(input({ pages28: [{ page, clicks: 40, impressions: 400, avg_position: 3 }] }))).not.toContain('P2');
    expect(expectedCtr(1)).toBeGreaterThan(expectedCtr(5));
  });

  it('P3: clicks fall 40% week on week, with a minimum volume', () => {
    expect(rules(input({ pagesPrev7: [{ page, clicks: 20, impressions: 200, avg_position: 4 }], pagesLast7: [{ page, clicks: 10, impressions: 180, avg_position: 6 }] }))).toContain('P3');
    expect(rules(input({ pagesPrev7: [{ page, clicks: 5, impressions: 50, avg_position: 4 }], pagesLast7: [] }))).not.toContain('P3');
  });

  it('P4: two of our pages split one search', () => {
    const f = runRules(
      input({
        queries28: [
          { query: 'nata coaching chennai', page: 'https://neramclasses.com/a', clicks: 1, impressions: 80, avg_position: 9 },
          { query: 'nata coaching chennai', page: 'https://neramclasses.com/b', clicks: 1, impressions: 60, avg_position: 11 },
        ],
      }),
    );
    const p4 = f.find((x) => x.rule_id === 'P4');
    expect(p4?.url).toBe('https://neramclasses.com/a');
    expect(p4?.fingerprint).toBe('P4|nata coaching chennai');
  });

  it('P5: demand where our best page ranks below 20', () => {
    expect(rules(input({ queries28: [{ query: 'nata coaching in ooty', page, clicks: 0, impressions: 70, avg_position: 34 }] }))).toContain('P5');
  });
});

describe('on-site rules', () => {
  const base = 'https://neramclasses.com/p';
  it('flags missing title, description, canonical and H1, broken JSON-LD and links', () => {
    const r = url({ url: base, title: null, meta_description: '', canonical: null, h1_count: 0, jsonld_errors: 1, broken_links: ['https://neramclasses.com/nope'], jsonld_types: [] });
    expect(rules(input({ urls: [r] })).sort()).toEqual(['O1', 'O2', 'O3', 'O4', 'O5', 'O6']);
  });

  it('O3: a sitemap page that canonicalises elsewhere is high', () => {
    const f = runRules(input({ urls: [url({ url: base, canonical: 'https://neramclasses.com/q' })] }));
    expect(f.map((x) => [x.rule_id, x.severity])).toEqual([['O3', 'high']]);
  });

  it('O3: a pasted URL with no canonical (Duplicate without user-selected canonical)', () => {
    const f = runRules(input({ urls: [url({ url: `${base}?ref=x`, source: 'import', expected_index: false, canonical: null })] }));
    expect(f.map((x) => x.rule_id)).toEqual(['O3']);
  });

  it('O1 and O2: duplicates become one finding per group', () => {
    const a = url({ url: 'https://neramclasses.com/a', title: 'Same', meta_description: 'Same desc' });
    const b = url({ url: 'https://neramclasses.com/b', title: 'same', meta_description: 'Same desc' });
    const f = runRules(input({ urls: [a, b] }));
    expect(f.filter((x) => x.rule_id === 'O1')).toHaveLength(1);
    expect(f.filter((x) => x.rule_id === 'O2')).toHaveLength(1);
  });

  it('O7: em dashes and double dashes in titles (house rule)', () => {
    expect(rules(input({ urls: [url({ url: base, title: 'NATA — Coaching' })] }))).toContain('O7');
    expect(rules(input({ urls: [url({ url: base, meta_description: 'Learn -- fast' })] }))).toContain('O7');
  });

  it('O8: thin copy', () => {
    expect(rules(input({ urls: [url({ url: base, word_count: 120 })] }))).toContain('O8');
  });
});

describe('AEO rules', () => {
  it('A1: robots.txt blocking an AI crawler, or missing', () => {
    const blocked = runRules(input({ sites: [{ origin: 'https://neramclasses.com', robotsStatus: 200, robotsTxt: `${ROBOTS_OK}\nUser-agent: GPTBot\nUser-agent: ClaudeBot\nDisallow: /\n`, llmsStatus: 200, llmsTxt: 'x' }] }));
    expect(blocked.find((f) => f.rule_id === 'A1')?.detail).toEqual({ blocked: ['GPTBot', 'ClaudeBot'] });
    expect(rules(input({ sites: [{ origin: 'https://neramclasses.com', robotsStatus: 404, robotsTxt: null, llmsStatus: 200, llmsTxt: 'x' }] }))).toContain('A1');
  });

  it('A2: llms.txt missing, or leaving out our most-clicked pages', () => {
    expect(rules(input({ sites: [{ origin: 'https://neramclasses.com', robotsStatus: 200, robotsTxt: ROBOTS_OK, llmsStatus: 404, llmsTxt: null }] }))).toContain('A2');
    const pages28 = [
      { page: 'https://neramclasses.com/nata-2026', clicks: 30, impressions: 900, avg_position: 4 },
      { page: 'https://neramclasses.com/fees', clicks: 10, impressions: 200, avg_position: 3 },
    ];
    const sites = [{ origin: 'https://neramclasses.com', robotsStatus: 200, robotsTxt: ROBOTS_OK, llmsStatus: 200, llmsTxt: '- [Fees](https://neramclasses.com/fees)' }];
    const f = runRules(input({ pages28, sites })).find((x) => x.rule_id === 'A2');
    expect(f?.detail).toEqual({ pages: [{ page: 'https://neramclasses.com/nata-2026', clicks28: 30 }] });
  });

  it('A3: expected schema by page type', () => {
    expect(expectedSchema('https://neramclasses.com/ta/coaching/nata-coaching')?.label).toBe('FAQPage');
    expect(expectedSchema('https://neramclasses.com/colleges/tamil-nadu/some-college')?.label).toBe('CollegeOrUniversity');
    expect(expectedSchema('https://neramclasses.com/colleges/rankings/nirf')).toBeNull();
    expect(expectedSchema('https://neramclasses.com/blog/x')?.anyOf).toContain('BlogPosting');
    expect(rules(input({ urls: [url({ url: 'https://neramclasses.com/blog/x', jsonld_types: ['Organization'] })] }))).toEqual(['A3']);
  });

  it('A4: no short answer under the H1, on pages with demand only', () => {
    const r = url({ url: 'https://neramclasses.com/nata-hub', answer_first: false });
    expect(rules(input({ urls: [r] }))).toEqual([]);
    expect(rules(input({ urls: [r], pages28: [{ page: r.url, clicks: 0, impressions: 150, avg_position: 9 }] }))).toEqual(['A4']);
  });
});

describe('waiting for Google', () => {
  const find = (r: UrlStatus, extra: Partial<RuleInput> = {}) => runRules(input({ urls: [r], ...extra }));

  it('I2: Google saw a 404 but we serve 200 now', () => {
    const [f] = find(url({ url: 'https://neramclasses.com/blog/new-post', page_fetch_state: 'NOT_FOUND', verdict: 'FAIL' }));
    expect(f).toMatchObject({ rule_id: 'I2', waiting: true });
  });

  it('I2: a real 404 in our crawl stays open', () => {
    const [f] = find(url({ url: 'https://neramclasses.com/blog/gone', http_status: 404, page_fetch_state: 'NOT_FOUND' }));
    expect(f.rule_id).toBe('I2');
    expect(f.waiting).toBeUndefined();
  });

  it('I7: our robots.txt allows the URL now', () => {
    const [f] = find(url({ url: 'https://neramclasses.com/b', robots_txt_state: 'DISALLOWED' }));
    expect(f).toMatchObject({ rule_id: 'I7', waiting: true });
    const blocked = find(url({ url: 'https://neramclasses.com/api/x', robots_txt_state: 'DISALLOWED' }));
    expect(blocked[0].waiting).toBeUndefined();
  });

  it('I5: Google read an older canonical than the one we serve', () => {
    const stale = url({ url: 'https://app.neramclasses.com/tools/x', user_canonical: 'https://app.neramclasses.com/', google_canonical: 'https://app.neramclasses.com/tools/y' });
    expect(find(stale, { sites: [] })[0]).toMatchObject({ rule_id: 'I5', waiting: true });
    const real = url({ url: 'https://neramclasses.com/z', google_canonical: 'https://neramclasses.com/other', user_canonical: 'https://neramclasses.com/z' });
    expect(find(real)[0].waiting).toBeUndefined();
  });
});

describe('P4 host folding', () => {
  it('http and www copies of one page do not compete', () => {
    const q = (page: string, impressions: number) => ({ query: 'nata', page, clicks: 0, impressions, avg_position: 6 });
    expect(rules(input({ queries28: [q('https://www.neramclasses.com/', 80), q('http://www.neramclasses.com/', 40)] }))).not.toContain('P4');
  });

  it('brand searches are not cannibalisation', () => {
    const q = (page: string) => ({ query: 'neram classes', page, clicks: 10, impressions: 80, avg_position: 1.3 });
    expect(rules(input({ queries28: [q('https://neramclasses.com/'), q('https://neramclasses.com/fees')] }))).not.toContain('P4');
  });
});

describe('P6 city demand', () => {
  it('reads the city and intent from a search', () => {
    expect(cityIntent('nata coaching in madurai')).toMatchObject({ city: 'madurai', intent: 'nata' });
    expect(cityIntent('jee paper 2 coaching in patna')).toMatchObject({ city: 'patna', intent: 'jee' });
    expect(cityIntent('nata exam centre patna')).toMatchObject({ city: 'patna', intent: 'exam-centre' });
    expect(cityIntent('nata coaching near me')).toBeNull();
    expect(cityIntent('madurai weather')).toBeNull();
  });

  it('fires when the city page is held back, not when it is in a sitemap', () => {
    const queries28 = [{ query: 'nata coaching in patna', page: 'https://neramclasses.com/coaching/nata-coaching-in-bihar', clicks: 0, impressions: 91, avg_position: 8.3 }];
    const f = runRules(input({ queries28 })).find((x) => x.rule_id === 'P6');
    expect(f).toMatchObject({ url: cityPageUrl('nata', 'patna', 'bihar'), fingerprint: 'P6|city:nata:patna' });
    const indexed = url({ url: cityPageUrl('nata', 'patna', 'bihar') });
    expect(rules(input({ queries28, urls: [indexed] }))).not.toContain('P6');
  });

  it('needs 20 searches in 28 days', () => {
    const queries28 = [{ query: 'nata coaching in patna', page: 'https://neramclasses.com/', clicks: 0, impressions: 12, avg_position: 30 }];
    expect(rules(input({ queries28 }))).not.toContain('P6');
  });
});

describe('S1 season coming', () => {
  const oct = new Date('2026-10-15T00:00:00Z');
  const aug = new Date('2026-08-15T00:00:00Z');

  it('works out the cycle a season page should name', () => {
    const nata = SEASONS.find((s) => s.id === 'nata')!;
    const counselling = SEASONS.find((s) => s.id === 'counselling')!;
    expect(cycleYear(nata, oct)).toBe(2027);
    expect(cycleYear(nata, aug)).toBeNull();
    expect(cycleYear(counselling, oct)).toBeNull();
    expect(cycleYear(counselling, new Date('2027-02-15T00:00:00Z'))).toBe(2027);
    expect(cycleYear(counselling, new Date('2026-08-01T00:00:00Z'))).toBe(2026);
  });

  it('a year in the URL needs a page for the new year', () => {
    const pages = [url({ url: 'https://neramclasses.com/nata-2026', title: 'NATA 2026: Exam Date' }), url({ url: 'https://neramclasses.com/nata-2026/admit-card', title: 'NATA 2026 Admit Card' })];
    const s1 = runRules(input({ urls: pages, now: oct })).filter((f) => f.rule_id === 'S1');
    expect(s1).toHaveLength(1);
    expect(s1[0]).toMatchObject({ url: 'https://neramclasses.com/nata-2026', detail: { new_url: 'https://neramclasses.com/nata-2027', cycle: 2027 } });
    const withNext = [...pages, url({ url: 'https://neramclasses.com/nata-2027', title: 'NATA 2027: Exam Date' })];
    expect(rules(input({ urls: withNext, now: oct }))).not.toContain('S1');
    expect(rules(input({ urls: pages, now: aug }))).not.toContain('S1');
  });

  it('a page without a year in its URL needs the new year in its title', () => {
    const tnea = url({ url: 'https://neramclasses.com/counseling/tnea-barch', title: 'TNEA B.Arch 2026: Important Dates' });
    expect(rules(input({ urls: [tnea], now: new Date('2027-02-15T00:00:00Z') }))).toContain('S1');
    expect(rules(input({ urls: [tnea], now: oct }))).not.toContain('S1');
    const fresh = { ...tnea, title: 'TNEA B.Arch 2027: Important Dates' };
    expect(rules(input({ urls: [fresh], now: new Date('2027-02-15T00:00:00Z') }))).not.toContain('S1');
  });
});

describe('pickAskGoogle', () => {
  const now = new Date(NOW);
  const notIndexed = (u: string, over: Partial<UrlStatus> = {}) => url({ url: u, verdict: 'NEUTRAL', coverage_state: 'Discovered - currently not indexed', ...over });

  it('picks working, unindexed sitemap pages, most searched first, at most n', () => {
    const urls = [
      notIndexed('https://neramclasses.com/a/b/c'),
      notIndexed('https://neramclasses.com/hub'),
      notIndexed('https://neramclasses.com/popular/page'),
      url({ url: 'https://neramclasses.com/indexed' }),
      notIndexed('https://neramclasses.com/broken', { http_status: 500 }),
      notIndexed('https://neramclasses.com/asked', { index_requested_at: '2026-10-10T00:00:00.000Z' }),
    ];
    const picked = pickAskGoogle(urls, [{ page: 'https://neramclasses.com/popular/page', clicks: 0, impressions: 40, avg_position: 12 }], now, 2).map((r) => r.url);
    expect(picked).toEqual(['https://neramclasses.com/popular/page', 'https://neramclasses.com/hub']);
  });
});

describe('P4 spread', () => {
  it('flags a big search split thinly over many pages with none on page one', () => {
    const queries28 = Array.from({ length: 12 }, (_, i) => ({ query: 'nata coaching', page: `https://neramclasses.com/p${i}`, clicks: 0, impressions: 30 - i, avg_position: 15 + i }));
    const f = runRules(input({ queries28 })).find((x) => x.fingerprint === 'P4|spread:nata coaching');
    expect(f?.detail).toMatchObject({ spread: 12 });
    const onPageOne = queries28.map((q, i) => (i === 0 ? { ...q, avg_position: 4 } : q));
    expect(runRules(input({ queries28: onPageOne })).some((x) => x.fingerprint === 'P4|spread:nata coaching')).toBe(false);
  });
});
