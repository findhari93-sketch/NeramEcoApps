import { describe, expect, it } from 'vitest';
import { hashUrls, sitemapsToSubmit } from './sitemap-submit';

const NOW = new Date('2026-10-13T03:00:00Z');
const APP = 'https://app.neramclasses.com/sitemap.xml';
const MAIN = 'https://neramclasses.com/sitemap.xml';
const state = (url: string, hash = 'h1', pages = 10) => ({ url, hash, pages });

describe('sitemapsToSubmit', () => {
  it('submits a sitemap Google stopped reading (the app sitemap, unread since March)', () => {
    const known = [{ path: APP, lastSubmitted: '2026-02-28T00:00:00Z', lastDownloaded: '2026-03-02T00:00:00Z' }];
    expect(sitemapsToSubmit([state(APP)], known, { [APP]: 'h1' }, NOW)).toEqual([{ url: APP, reason: 'not read by Google for 225 days' }]);
  });

  it('submits when pages were added or removed since yesterday', () => {
    const known = [{ path: MAIN, lastSubmitted: '2026-03-12T00:00:00Z', lastDownloaded: '2026-10-12T00:00:00Z' }];
    expect(sitemapsToSubmit([state(MAIN, 'h2')], known, { [MAIN]: 'h1' }, NOW)).toEqual([{ url: MAIN, reason: 'pages added or removed' }]);
    expect(sitemapsToSubmit([state(MAIN, 'h1')], known, { [MAIN]: 'h1' }, NOW)).toEqual([]);
  });

  it('submits one Search Console does not list', () => {
    expect(sitemapsToSubmit([state(APP)], [], {}, NOW)).toEqual([{ url: APP, reason: 'not submitted in Search Console' }]);
  });

  it('never resubmits within a day, or a sitemap that could not be read', () => {
    const known = [{ path: APP, lastSubmitted: '2026-10-12T20:00:00Z', lastDownloaded: '2026-03-02T00:00:00Z' }];
    expect(sitemapsToSubmit([state(APP, 'h2')], known, { [APP]: 'h1' }, NOW)).toEqual([]);
    expect(sitemapsToSubmit([state(APP, 'h1', 0)], [], {}, NOW)).toEqual([]);
  });

  it('a first run with no saved hashes only acts on staleness', () => {
    const known = [{ path: MAIN, lastSubmitted: '2026-03-12T00:00:00Z', lastDownloaded: '2026-10-10T00:00:00Z' }];
    expect(sitemapsToSubmit([state(MAIN)], known, {}, NOW)).toEqual([]);
  });
});

describe('hashUrls', () => {
  it('ignores order and changes with the set', () => {
    expect(hashUrls(['b', 'a'])).toBe(hashUrls(['a', 'b']));
    expect(hashUrls(['a'])).not.toBe(hashUrls(['a', 'b']));
  });
});
