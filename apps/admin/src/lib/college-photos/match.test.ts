import { describe, expect, it } from 'vitest';
import {
  absoluteUrl,
  distinctiveTokens,
  inIndia,
  isAllowedLicense,
  isDue,
  isSameCollege,
  nameMatchScore,
  normalizeWebsite,
  photoPath,
  plainCredit,
  rankCandidates,
  statusFor,
  trustedWithoutJudge,
  yearFromWikidataTime,
} from './match';
import type { Candidate } from './types';

const spa = { name: 'School of Planning and Architecture, New Delhi', short_name: 'SPA Delhi', city: 'New Delhi', state: 'Delhi' };

describe('college matching', () => {
  it('keeps only the words that tell colleges apart', () => {
    expect(distinctiveTokens('Mohamed Sathak Engineering College')).toEqual(['mohamed', 'sathak']);
    expect(distinctiveTokens('Government College of Architecture')).toEqual([]);
  });

  it('scores the share of distinctive words present', () => {
    expect(nameMatchScore('Mohamed Sathak Engineering College', 'Mohamed Sathak A.J. College')).toBe(1);
    expect(nameMatchScore('Mohamed Sathak Engineering College', 'Kilakarai')).toBe(0);
  });

  it('accepts the right article and rejects a different college in the same city', () => {
    expect(isSameCollege(spa, 'School of Planning and Architecture, New Delhi', 'Architecture school in Delhi, India')).toBe(true);
    expect(isSameCollege(spa, 'School of Planning and Architecture, Vijayawada', 'Architecture school in Andhra Pradesh')).toBe(false);
    expect(
      isSameCollege(
        { name: 'PSG Institute of Architecture and Planning', short_name: 'PSG IAP', city: 'Coimbatore', state: 'Tamil Nadu' },
        'PSG Group',
        'Indian conglomerate',
      ),
    ).toBe(false);
  });

  it('needs the place as well as the name', () => {
    expect(isSameCollege({ ...spa, name: 'Sathyabama Institute', short_name: null }, 'Sathyabama Institute', 'University in Malaysia')).toBe(false);
  });

  it('handles names made only of generic words by requiring every word and the place', () => {
    const gca = { name: 'Government College of Architecture', short_name: null, city: 'Lucknow', state: 'Uttar Pradesh' };
    expect(isSameCollege(gca, 'Government College of Architecture, Lucknow')).toBe(true);
    expect(isSameCollege(gca, 'Government College of Architecture, Nagpur', 'College in Maharashtra')).toBe(false);
  });
});

describe('licences', () => {
  it.each(['CC BY-SA 4.0', 'CC BY 2.0', 'CC0', 'Public domain', 'PD-self', 'cc-by-sa-3.0'])('allows %s', (l) => {
    expect(isAllowedLicense(l)).toBe(true);
  });
  it.each(['CC BY-NC 2.0', 'CC BY-ND 4.0', 'CC BY-NC-SA 3.0', 'All rights reserved', '', undefined])('refuses %s', (l) => {
    expect(isAllowedLicense(l as string)).toBe(false);
  });
});

describe('credits and urls', () => {
  it('strips Commons HTML from the author', () => {
    expect(plainCredit('<a href="//commons.wikimedia.org/wiki/User:X">Ravi&nbsp;Kumar</a>')).toBe('Ravi Kumar');
    expect(plainCredit(null)).toBe('Wikimedia Commons');
  });
  it('resolves relative image paths and drops data: urls', () => {
    expect(absoluteUrl('/img/campus.jpg', 'https://abc.edu.in/home')).toBe('https://abc.edu.in/img/campus.jpg');
    expect(absoluteUrl('data:image/png;base64,xx', 'https://abc.edu.in')).toBeNull();
  });
  it('adds https to a bare website', () => {
    expect(normalizeWebsite('www.abc.edu.in')).toBe('https://www.abc.edu.in/');
    expect(normalizeWebsite('')).toBeNull();
  });
  it('names stored files for people and Google Images', () => {
    expect(photoPath('id1', 'PSG IAP!', 'cover', 36)).toBe('id1/psg-iap-campus-10.webp');
    expect(photoPath('id1', 'x', 'logo', 36)).toBe('id1/x-logo-10.webp');
  });
});

describe('wikidata values', () => {
  it('reads a year only when the value is year-precise', () => {
    expect(yearFromWikidataTime({ time: '+1941-00-00T00:00:00Z', precision: 9 })).toBe(1941);
    expect(yearFromWikidataTime({ time: '+1900-00-00T00:00:00Z', precision: 7 })).toBeUndefined();
  });
  it('keeps coordinates only inside India', () => {
    expect(inIndia(28.63, 77.24)).toBe(true);
    expect(inIndia(55.7, 37.6)).toBe(false);
  });
});

describe('ranking and trust', () => {
  const c = (o: Partial<Candidate>): Candidate => ({ kind: 'cover', url: 'https://x/a.jpg', pageUrl: '', credit: '', license: '', source: 'site', ...o });

  it('puts curated, wide, large photos first', () => {
    const ranked = rankCandidates([
      c({ url: 'https://s/1.jpg', source: 'site', width: 2000, height: 1000 }),
      c({ url: 'https://w/2.jpg', source: 'wikidata', width: 1600, height: 1000 }),
      c({ url: 'https://c/3.jpg', source: 'commons', width: 900, height: 600 }),
    ]);
    expect(ranked.map((r) => r.source)).toEqual(['wikidata', 'site', 'commons']);
  });

  it('dedupes the same file with different query strings', () => {
    expect(rankCandidates([c({ url: 'https://x/a.jpg?w=1' }), c({ url: 'https://x/a.jpg?w=2' })])).toHaveLength(1);
  });

  it('without the judge, trusts only the cover Wikidata chose', () => {
    expect(trustedWithoutJudge(c({ source: 'site' }))).toBe(false);
    expect(trustedWithoutJudge(c({ source: 'commons' }))).toBe(false);
    expect(trustedWithoutJudge(c({ source: 'wikidata' }))).toBe(true);
    expect(trustedWithoutJudge(c({ kind: 'logo', source: 'site', url: 'https://x/logo.png' }))).toBe(true);
  });
});

describe('queue', () => {
  const now = new Date('2026-10-10T00:00:00Z');
  it('takes pending colleges at once', () => {
    expect(isDue({ photo_status: 'pending', photo_checked_at: null, photo_attempts: 0 }, now)).toBe(true);
  });
  it('retries misses after 30 days, three times', () => {
    expect(isDue({ photo_status: 'not_found', photo_checked_at: '2026-09-20T00:00:00Z', photo_attempts: 1 }, now)).toBe(false);
    expect(isDue({ photo_status: 'not_found', photo_checked_at: '2026-09-01T00:00:00Z', photo_attempts: 1 }, now)).toBe(true);
    expect(isDue({ photo_status: 'partial', photo_checked_at: '2026-01-01T00:00:00Z', photo_attempts: 3 }, now)).toBe(false);
  });
  it('never takes found or manual colleges', () => {
    expect(isDue({ photo_status: 'manual', photo_checked_at: null, photo_attempts: 0 }, now)).toBe(false);
    expect(isDue({ photo_status: 'found', photo_checked_at: null, photo_attempts: 0 }, now)).toBe(false);
  });
  it('maps what was found to a status', () => {
    expect(statusFor(true, true)).toBe('found');
    expect(statusFor(true, false)).toBe('partial');
    expect(statusFor(false, false)).toBe('not_found');
  });
});
