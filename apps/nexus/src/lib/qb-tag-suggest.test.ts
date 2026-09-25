import { describe, it, expect } from 'vitest';
import {
  buildTagMatchers,
  chunkOrFilters,
  confidenceFor,
  ilikePatternFor,
  matchTerms,
  normalizeForMatch,
  questionMatchText,
  suggestTags,
} from './qb-tag-suggest';

const DICT = {
  islamic_architecture: ['mosque', 'minar', 'qutub minar', 'taj mahal', 'mughal', "humayun's tomb", 'indo islamic'],
  general_architecture_knowledge: ['dome', 'arch'],
  indus_valley_civilization: ['mohenjo daro', 'harappa'],
};

const matchers = buildTagMatchers(DICT);
const byslug = (slug: string) => matchers.find((m) => m.slug === slug)!;

describe('normalizeForMatch', () => {
  it('lower-cases, strips accents and turns punctuation into single spaces', () => {
    expect(normalizeForMatch("Humayun’s  Tomb, (Delhi)")).toBe('humayun s tomb delhi');
    expect(normalizeForMatch('Indo-Islamic')).toBe('indo islamic');
    expect(normalizeForMatch('Façade')).toBe('facade');
    expect(normalizeForMatch(null)).toBe('');
  });
});

describe('matchTerms: whole words only', () => {
  it('does not match "dome" inside "domestic"', () => {
    expect(matchTerms(normalizeForMatch('A domestic building'), byslug('general_architecture_knowledge'))).toEqual([]);
  });

  it('does not match "minar" inside "Charminar"', () => {
    expect(matchTerms(normalizeForMatch('Where is the Charminar?'), byslug('islamic_architecture'))).toEqual([]);
  });

  it('does not match "arch" inside "architecture" or "search"', () => {
    expect(
      matchTerms(normalizeForMatch('History of architecture: search the archive'), byslug('general_architecture_knowledge')),
    ).toEqual([]);
  });

  it('accepts a plural s or es on the phrase', () => {
    expect(matchTerms(normalizeForMatch('Mosques of Delhi'), byslug('islamic_architecture'))).toEqual(['mosque']);
    expect(matchTerms(normalizeForMatch('Pointed arches'), byslug('general_architecture_knowledge'))).toEqual(['arch']);
  });

  it('is case-insensitive and punctuation-insensitive for multi-word phrases', () => {
    expect(matchTerms(normalizeForMatch("HUMAYUN'S TOMB was built"), byslug('islamic_architecture'))).toEqual([
      'humayun s tomb',
    ]);
    expect(matchTerms(normalizeForMatch('Indo-Islamic style'), byslug('islamic_architecture'))).toEqual(['indo islamic']);
  });

  it('prefers the longer phrase and does not count the shorter one inside it', () => {
    expect(matchTerms(normalizeForMatch('The Qutub Minar is tall'), byslug('islamic_architecture'))).toEqual([
      'qutub minar',
    ]);
  });

  it('still counts a shorter phrase that appears on its own elsewhere', () => {
    expect(
      matchTerms(normalizeForMatch('The Qutub Minar is a minar in Delhi'), byslug('islamic_architecture')),
    ).toEqual(['qutub minar', 'minar']);
  });

  it('reports each distinct phrase once however often it appears', () => {
    expect(
      matchTerms(normalizeForMatch('Taj Mahal, the Taj Mahal and again the Taj Mahal'), byslug('islamic_architecture')),
    ).toEqual(['taj mahal']);
  });

  it('can be called repeatedly on the same matcher (global regex state is reset)', () => {
    const m = byslug('islamic_architecture');
    expect(matchTerms('a mosque', m)).toEqual(['mosque']);
    expect(matchTerms('a mosque', m)).toEqual(['mosque']);
  });
});

describe('confidence', () => {
  it('is high for two or more distinct phrases, low for one', () => {
    expect(confidenceFor(0)).toBe('low');
    expect(confidenceFor(1)).toBe('low');
    expect(confidenceFor(2)).toBe('high');
    expect(confidenceFor(5)).toBe('high');
  });
});

describe('suggestTags', () => {
  it('reads the options as well as the stem', () => {
    const result = suggestTags('Which of these was built by Shah Jahan?', [
      { id: 'a', text: 'Taj Mahal' },
      { id: 'b', text: 'A Mughal mosque' },
      { id: 'c', text: 'Harappa' },
    ], matchers);
    const islamic = result.find((r) => r.slug === 'islamic_architecture');
    expect(islamic).toEqual({ slug: 'islamic_architecture', terms: ['taj mahal', 'mughal', 'mosque'], confidence: 'high' });
    expect(result.find((r) => r.slug === 'indus_valley_civilization')).toEqual({
      slug: 'indus_valley_civilization',
      terms: ['harappa'],
      confidence: 'low',
    });
  });

  it('leaves out tags with no match and handles empty input', () => {
    expect(suggestTags('Find the value of x', [{ id: 'a', text: '2' }], matchers)).toEqual([]);
    expect(suggestTags(null, null, matchers)).toEqual([]);
  });

  it('ignores options that are not text', () => {
    expect(questionMatchText('Stem', [{ id: 'a', image_url: 'x' }, null, 3, 'plain option'])).toBe('stem plain option');
  });

  it('skips a tag whose dictionary is empty', () => {
    const empty = buildTagMatchers({ nothing: [] });
    expect(empty[0].regex).toBeNull();
    expect(suggestTags('anything at all', null, empty)).toEqual([]);
  });

  it('does not break on regex characters in an alias', () => {
    const odd = buildTagMatchers({ odd: ['c++ (plus)', 'a.b'] });
    expect(suggestTags('We used a.b here', null, odd)).toEqual([{ slug: 'odd', terms: ['a b'], confidence: 'low' }]);
  });
});

describe('ilikePatternFor', () => {
  it('joins the words with % so hyphens and glued forms still match', () => {
    expect(ilikePatternFor('mohenjo daro')).toBe('%mohenjo%daro%');
    expect(ilikePatternFor("Humayun's tomb")).toBe('%humayun%s%tomb%');
  });

  it('returns an empty string for a phrase with no letters', () => {
    expect(ilikePatternFor('---')).toBe('');
  });
});

describe('chunkOrFilters', () => {
  it('builds or() clauses and splits them under the length budget', () => {
    const patterns = Array.from({ length: 50 }, (_, i) => `%term${i}%`);
    const groups = chunkOrFilters('search_doc_norm', patterns, 200);
    expect(groups.length).toBeGreaterThan(1);
    for (const g of groups) expect(g.length).toBeLessThanOrEqual(200);
    const all = groups.join(',').split(',');
    expect(all).toHaveLength(50);
    expect(all[0]).toBe('search_doc_norm.ilike.%term0%');
  });

  it('drops empty patterns', () => {
    expect(chunkOrFilters('c', ['', '%a%'])).toEqual(['c.ilike.%a%']);
  });
});
