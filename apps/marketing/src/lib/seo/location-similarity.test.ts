import { describe, it, expect } from 'vitest';
import { FIXTURE_DATASETS } from './__fixtures__/geo-datasets';
import { allCityGates } from './location-pages';
import { MAX_SIMILARITY, cityPageText, closestPages, jaccard, shingles } from './location-similarity';

describe('shingles and jaccard', () => {
  it('scores identical text 1 and unrelated text 0', () => {
    const a = shingles('one two three four five six seven');
    expect(jaccard(a, a)).toBe(1);
    expect(jaccard(a, shingles('alpha beta gamma delta epsilon zeta'))).toBe(0);
  });

  it('ignores case and punctuation', () => {
    expect(jaccard(shingles('NATA coaching in Chennai, online.'), shingles('nata coaching in chennai online'))).toBe(1);
  });
});

describe('indexed city pages are not near-duplicates', () => {
  for (const exam of ['nata', 'jee-paper-2'] as const) {
    it(`${exam}: no two indexed pages share more than ${MAX_SIMILARITY * 100}% of their text`, () => {
      const pages = allCityGates(exam, FIXTURE_DATASETS)
        .filter((p) => p.gate.index)
        .map((p) => ({ slug: p.place.slug, text: cityPageText(p.facts) }));
      expect(pages.length).toBeGreaterThan(0);
      const tooClose = closestPages(pages).filter((r) => r.similarity > MAX_SIMILARITY);
      expect(tooClose).toEqual([]);
    });
  }
});
