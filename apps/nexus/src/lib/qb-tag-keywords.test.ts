import { describe, it, expect } from 'vitest';
import {
  ARCHITECTURE_SUBJECT_SLUGS,
  QB_TAG_KEYWORDS,
  keywordsForTag,
  mergeTagKeywords,
} from './qb-tag-keywords';
import { buildTagMatchers, suggestTags, normalizeForMatch } from './qb-tag-suggest';

/** Theme tags in the production registry on 2026-09-25. */
const THEME_SLUGS = [
  'indian_architecture',
  'islamic_architecture',
  'dravidian_architecture',
  'indo_aryan_architecture',
  'buddhist_architecture',
  'hindu_temple_architecture',
  'indus_valley_civilization',
  'architecture_around_the_world',
  'general_architecture_knowledge',
];

const matchers = buildTagMatchers(QB_TAG_KEYWORDS);
const slugsFor = (text: string, options: unknown = null) =>
  suggestTags(text, options, matchers).map((m) => m.slug);
const matchFor = (slug: string, text: string, options: unknown = null) =>
  suggestTags(text, options, matchers).find((m) => m.slug === slug);

describe('QB_TAG_KEYWORDS coverage', () => {
  it('has phrases for every theme tag and every architecture subject tag', () => {
    for (const slug of [...THEME_SLUGS, ...ARCHITECTURE_SUBJECT_SLUGS]) {
      expect(QB_TAG_KEYWORDS[slug], slug).toBeDefined();
      expect(QB_TAG_KEYWORDS[slug].length, slug).toBeGreaterThan(10);
    }
  });

  it('writes every phrase in the form the matcher uses (no phrase normalises to nothing)', () => {
    for (const [slug, phrases] of Object.entries(QB_TAG_KEYWORDS)) {
      for (const phrase of phrases) {
        expect(normalizeForMatch(phrase), `${slug}: "${phrase}"`).not.toBe('');
      }
    }
  });

  it('leaves out words that belong to other subjects', () => {
    const all = new Set(Object.values(QB_TAG_KEYWORDS).flat());
    for (const risky of ['column', 'pyramid', 'far', 'tomb', 'period', 'greek', 'roman', 'density', 'orientation']) {
      expect(all.has(risky), risky).toBe(false);
    }
  });
});

describe('real question texts from the bank', () => {
  it('suggests Islamic Architecture, with high confidence, for Mughal and Sultanate questions', () => {
    expect(matchFor('islamic_architecture', 'The Quwwat-ul-Islam Mosque and the initial phases of the Qutub Minar were significant constructions initiated by which Delhi Sultanate dynasty?')?.confidence).toBe('high');
    expect(matchFor('islamic_architecture', "What is 'Pietra Dura' as used in the Taj Mahal?")?.confidence).toBe('high');
    expect(matchFor('islamic_architecture', 'What is the Charbagh garden design principle used in Mughal gardens?')?.confidence).toBe('high');
    expect(matchFor('islamic_architecture', 'Moti Masjid, a white marble mosque by Aurangzeb for his personal use, is found within which larger complex?')?.confidence).toBe('high');
  });

  it('still suggests (low confidence) from a single clue', () => {
    expect(matchFor('islamic_architecture', 'How should Fatehpur Sikri be understood architecturally?')).toEqual({
      slug: 'islamic_architecture',
      terms: ['fatehpur sikri'],
      confidence: 'low',
    });
  });

  it('finds the answer in the options', () => {
    const m = matchFor('islamic_architecture', 'Which region includes these countries?', [
      { id: 'a', text: 'Timurid Central Asia' },
      { id: 'b', text: 'Ottoman Turkey' },
    ]);
    expect(m?.terms).toEqual(['timurid', 'ottoman']);
  });

  it('reads Dravidian, Indus and Buddhist questions', () => {
    expect(slugsFor('Which of these is a distinctive feature of the Meenakshi temple in Madurai?')).toEqual(
      expect.arrayContaining(['dravidian_architecture', 'hindu_temple_architecture', 'indian_architecture']),
    );
    expect(matchFor('indus_valley_civilization', 'What was the primary purpose of dividing cities into two parts in the Indus Valley Civilization?')).toBeDefined();
    expect(matchFor('buddhist_architecture', 'The harmika sits above the anda of the Great Stupa at Sanchi')?.confidence).toBe('high');
  });

  it('does not tag drawing, maths or aptitude questions as architecture themes', () => {
    const drawing = slugsFor('When drawing a cylinder below eye level, which part of the elliptical surfaces has a larger minor axis?');
    expect(drawing).toEqual([]);
    const math = slugsFor('Find the determinant of the matrix whose first column is (1, 2) and second column is (3, 4).');
    expect(math).toEqual([]);
    const roman = slugsFor('Convert the Roman numeral XIV to a number. Which Greek letter denotes the angle?');
    expect(roman).toEqual([]);
  });

  it('does not match inside longer words', () => {
    expect(slugsFor('The domestic wiring and the Charminar-shaped logo')).not.toContain('general_architecture_knowledge');
    const islamic = matchFor('islamic_architecture', 'Where is the Charminar located?');
    expect(islamic?.terms).toEqual(['charminar']);
  });
});

describe('merging registry aliases', () => {
  it('adds the aliases a teacher typed, lower-cased and de-duplicated', () => {
    const phrases = keywordsForTag({ slug: 'islamic_architecture', aliases: ['Mosque', ' Sufi Shrine ', '', null as unknown as string] });
    expect(phrases).toContain('mosque');
    expect(phrases).toContain('sufi shrine');
    expect(phrases.filter((p) => p === 'mosque')).toHaveLength(1);
    expect(phrases).not.toContain('');
  });

  it('keeps a tag that is only known by its aliases, and drops a tag with nothing', () => {
    const merged = mergeTagKeywords([
      { slug: 'brand_new_theme', aliases: ['stepwell'] },
      { slug: 'no_words', aliases: [] },
    ]);
    expect(merged).toEqual({ brand_new_theme: ['stepwell'] });
  });
});
