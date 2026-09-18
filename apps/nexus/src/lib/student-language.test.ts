import { describe, expect, it } from 'vitest';
import * as language from './student-language';
import {
  LANGUAGE_FILTER_LABEL,
  LANGUAGE_LABEL,
  LANGUAGE_ORDER,
  LANGUAGE_SENTENCE,
  TAMIL_BADGE_LETTER,
  countLanguages,
  isKnowsTamilValue,
  knowsTamilOf,
  languageAuditValue,
  languageEventTitle,
  languageKeyOf,
  languageParamOf,
  languageSentence,
  matchesLanguages,
  parseLanguageParam,
} from './student-language';

describe('languageKeyOf / knowsTamilOf', () => {
  it('reads the tri-state column without collapsing null into English only', () => {
    expect(languageKeyOf(true)).toBe('tamil');
    expect(languageKeyOf(false)).toBe('english');
    expect(languageKeyOf(null)).toBe('unset');
    expect(languageKeyOf(undefined)).toBe('unset');
  });

  it('round-trips every key back to the column value', () => {
    for (const key of LANGUAGE_ORDER) {
      expect(languageKeyOf(knowsTamilOf(key))).toBe(key);
    }
    expect(knowsTamilOf('unset')).toBeNull();
  });
});

describe('isKnowsTamilValue', () => {
  it('accepts exactly true, false and null', () => {
    expect(isKnowsTamilValue(true)).toBe(true);
    expect(isKnowsTamilValue(false)).toBe(true);
    expect(isKnowsTamilValue(null)).toBe(true);
  });

  it('refuses anything a careless client might send', () => {
    for (const bad of [undefined, 'yes', 'true', 1, 0, '', {}, []]) {
      expect(isKnowsTamilValue(bad)).toBe(false);
    }
  });
});

describe('languageSentence', () => {
  it('says something only when the language is known', () => {
    expect(languageSentence(true)).toBe('Knows Tamil.');
    expect(languageSentence(false)).toBe('English only.');
    expect(languageSentence(null)).toBeNull();
    expect(languageSentence(undefined)).toBeNull();
  });

  it('never ends in a colon, so it cannot be mistaken for a ring label prefix', () => {
    for (const key of LANGUAGE_ORDER) {
      expect(LANGUAGE_SENTENCE[key] ?? '').not.toMatch(/:$/);
      expect(LANGUAGE_FILTER_LABEL[key]).not.toContain(':');
    }
  });
});

describe('matchesLanguages', () => {
  it('matches everyone when no language is picked', () => {
    expect(matchesLanguages(true, [])).toBe(true);
    expect(matchesLanguages(false, [])).toBe(true);
    expect(matchesLanguages(null, [])).toBe(true);
  });

  it('matches any of the picked languages', () => {
    expect(matchesLanguages(true, ['tamil'])).toBe(true);
    expect(matchesLanguages(false, ['tamil'])).toBe(false);
    expect(matchesLanguages(null, ['tamil', 'unset'])).toBe(true);
    expect(matchesLanguages(undefined, ['english'])).toBe(false);
  });
});

describe('countLanguages', () => {
  it('counts every row into exactly one bucket', () => {
    const rows = [{ k: true }, { k: true }, { k: false }, { k: null }, {} as { k?: boolean | null }];
    expect(countLanguages(rows, (r) => r.k)).toEqual({ tamil: 2, english: 1, unset: 2 });
  });

  it('returns zeros for an empty list', () => {
    expect(countLanguages([], () => null)).toEqual({ tamil: 0, english: 0, unset: 0 });
  });
});

describe('parseLanguageParam / languageParamOf', () => {
  it('round-trips in a stable order', () => {
    expect(languageParamOf(['unset', 'tamil'])).toBe('tamil,unset');
    expect(parseLanguageParam('tamil,unset')).toEqual(['tamil', 'unset']);
  });

  it('drops unknown values and duplicates rather than failing', () => {
    expect(parseLanguageParam('english,klingon,english')).toEqual(['english']);
    expect(parseLanguageParam('')).toEqual([]);
    expect(parseLanguageParam(null)).toEqual([]);
  });

  it('removes the param entirely when nothing is picked', () => {
    expect(languageParamOf([])).toBeNull();
  });
});

describe('audit vocabulary', () => {
  it('stores readable words, not booleans, on the classification trail', () => {
    expect(languageAuditValue(true)).toBe('tamil');
    expect(languageAuditValue(false)).toBe('english');
    expect(languageAuditValue(null)).toBeNull();
  });

  it('titles a timeline event by where it landed', () => {
    expect(languageEventTitle('tamil')).toBe('Language set to Knows Tamil');
    expect(languageEventTitle('english')).toBe('Language set to English only');
    expect(languageEventTitle(null)).toBe('Language cleared');
  });
});

describe('copy rules', () => {
  it('uses the Tamil letter for the badge', () => {
    expect(TAMIL_BADGE_LETTER).toBe('த');
  });

  it('has no em dashes or double dashes in any user-visible string', () => {
    const strings: string[] = [];
    const collect = (value: unknown) => {
      if (typeof value === 'string') strings.push(value);
      else if (value && typeof value === 'object') Object.values(value).forEach(collect);
    };
    Object.values(language).forEach(collect);
    expect(strings.length).toBeGreaterThan(5);
    for (const s of strings) {
      expect(s).not.toContain('—');
      expect(s).not.toContain('--');
    }
    expect(LANGUAGE_LABEL.english).toBe('English only');
  });
});
