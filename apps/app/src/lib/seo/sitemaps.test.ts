import { describe, it, expect } from 'vitest';
import { buildSitemapIndex, CHILD_SITEMAPS, parseSitemap, selectRecent } from './sitemaps';

describe('sitemap index', () => {
  it('lists every child sitemap and parses back as an index', () => {
    const xml = buildSitemapIndex('https://app.neramclasses.com', '2026-10-01T00:00:00.000Z');
    const parsed = parseSitemap(xml);
    expect(parsed.kind).toBe('index');
    expect(parsed.entries.map((e) => e.loc)).toEqual(CHILD_SITEMAPS.map((p) => `https://app.neramclasses.com${p}`));
  });
});

describe('parseSitemap', () => {
  it('reads a urlset with and without lastmod, decoding entities', () => {
    const xml = `<?xml version="1.0"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
      <url><loc>https://app.neramclasses.com/a</loc><lastmod>2026-09-30</lastmod></url>
      <url><loc>https://app.neramclasses.com/b?x=1&amp;y=2</loc></url>
    </urlset>`;
    expect(parseSitemap(xml)).toEqual({
      kind: 'urlset',
      entries: [
        { loc: 'https://app.neramclasses.com/a', lastmod: '2026-09-30' },
        { loc: 'https://app.neramclasses.com/b?x=1&y=2', lastmod: null },
      ],
    });
  });
});

describe('selectRecent', () => {
  const now = new Date('2026-10-02T12:00:00Z');
  it('keeps recent and undated URLs, drops old ones', () => {
    const urls = selectRecent(
      [
        { loc: 'new', lastmod: '2026-10-01' },
        { loc: 'old', lastmod: '2026-03-01' },
        { loc: 'undated', lastmod: null },
      ],
      2,
      now,
    );
    expect(urls).toEqual(['new', 'undated']);
  });
});
