import { describe, expect, it } from 'vitest';
import * as language from './student-language';
import {
  LANGUAGES,
  LANGUAGE_ORDER,
  countLanguages,
  englishFluencyAuditValue,
  englishFluencyEventTitle,
  isHomeLanguageValue,
  isLanguageValue,
  languageEventTitle,
  languageKeyOf,
  languageLabel,
  languageLabelOf,
  languageParamOf,
  languageSentence,
  matchesLanguages,
  parseLanguageParam,
  showsLanguageMark,
} from './student-language';

describe('languageKeyOf', () => {
  it('reads every stored key back', () => {
    for (const key of LANGUAGE_ORDER) expect(languageKeyOf(key)).toBe(key);
  });

  it('reads an unrecorded student as English, which is what the UI shows', () => {
    expect(languageKeyOf(null)).toBe('english');
    expect(languageKeyOf(undefined)).toBe('english');
    expect(languageKeyOf('')).toBe('english');
  });

  it('reads a retired or mistyped word as English rather than throwing', () => {
    expect(languageKeyOf('telugu')).toBe('english');
    expect(languageKeyOf('Tamil')).toBe('english');
  });
});

describe('isLanguageValue / isHomeLanguageValue', () => {
  it('accepts exactly the five keys', () => {
    for (const key of LANGUAGE_ORDER) expect(isLanguageValue(key)).toBe(true);
  });

  it('refuses anything a careless client might send', () => {
    for (const bad of [undefined, null, 'Tamil', 'ta', true, 1, 0, '', {}, []]) {
      expect(isLanguageValue(bad)).toBe(false);
    }
  });

  it('additionally accepts null for the API, because Undo sends it', () => {
    expect(isHomeLanguageValue(null)).toBe(true);
    expect(isHomeLanguageValue('hindi')).toBe(true);
    expect(isHomeLanguageValue(undefined)).toBe(false);
    expect(isHomeLanguageValue('yes')).toBe(false);
  });
});

describe('showsLanguageMark', () => {
  it('marks every language but English', () => {
    expect(showsLanguageMark('tamil')).toBe(true);
    expect(showsLanguageMark('hindi')).toBe(true);
    expect(showsLanguageMark('kannada')).toBe(true);
    expect(showsLanguageMark('malayalam')).toBe(true);
    expect(showsLanguageMark('english')).toBe(false);
  });

  it('marks an English student who cannot follow English', () => {
    expect(showsLanguageMark('english', true)).toBe(true);
  });
});

describe('languageLabel', () => {
  it('names the language on its own', () => {
    expect(languageLabel('tamil')).toBe('Tamil');
    expect(languageLabel(null)).toBe('English');
    expect(languageLabelOf('kannada')).toBe('Kannada');
  });

  it('adds the limited English case to the language it rides on', () => {
    expect(languageLabel('tamil', true)).toBe('Tamil, limited English');
    expect(languageLabel('english', true)).toBe('Limited English');
  });
});

describe('languageSentence', () => {
  it('says nothing for a plain English student, so most avatars read as before', () => {
    expect(languageSentence('english')).toBeNull();
    expect(languageSentence(null)).toBeNull();
    expect(languageSentence(undefined)).toBeNull();
  });

  it('names a recorded language', () => {
    expect(languageSentence('tamil')).toBe('Tamil.');
    expect(languageSentence('malayalam')).toBe('Malayalam.');
  });

  it('adds the limited English sentence after the language', () => {
    expect(languageSentence('hindi', true)).toBe('Hindi. Limited English.');
    expect(languageSentence('english', true)).toBe('Limited English.');
  });

  it('never ends in a colon, so it cannot be mistaken for a ring label prefix', () => {
    for (const key of LANGUAGE_ORDER) {
      expect(languageSentence(key, true)).not.toMatch(/:$/);
      expect(LANGUAGES[key].label).not.toContain(':');
    }
  });
});

describe('matchesLanguages', () => {
  it('matches everyone when no language is picked', () => {
    expect(matchesLanguages('tamil', [])).toBe(true);
    expect(matchesLanguages(null, [])).toBe(true);
  });

  it('matches any of the picked languages', () => {
    expect(matchesLanguages('tamil', ['tamil'])).toBe(true);
    expect(matchesLanguages('hindi', ['tamil', 'hindi'])).toBe(true);
    expect(matchesLanguages('kannada', ['tamil'])).toBe(false);
  });

  it('finds an unrecorded student under English', () => {
    expect(matchesLanguages(null, ['english'])).toBe(true);
    expect(matchesLanguages(undefined, ['tamil'])).toBe(false);
  });
});

describe('countLanguages', () => {
  it('counts every row into exactly one bucket', () => {
    const rows = [
      { l: 'tamil' },
      { l: 'tamil' },
      { l: 'hindi' },
      { l: null },
      {} as { l?: string | null },
    ];
    expect(countLanguages(rows, (r) => r.l)).toEqual({
      tamil: 2,
      hindi: 1,
      kannada: 0,
      malayalam: 0,
      english: 2,
    });
  });

  it('returns zeros for an empty list', () => {
    expect(countLanguages([], () => null)).toEqual({
      tamil: 0,
      hindi: 0,
      kannada: 0,
      malayalam: 0,
      english: 0,
    });
  });
});

describe('parseLanguageParam / languageParamOf', () => {
  it('round-trips in a stable order, so the URL does not depend on tap order', () => {
    expect(languageParamOf(['hindi', 'tamil'])).toBe('tamil,hindi');
    expect(parseLanguageParam('tamil,hindi')).toEqual(['tamil', 'hindi']);
  });

  it('drops unknown values and duplicates rather than failing', () => {
    expect(parseLanguageParam('english,klingon,english')).toEqual(['english']);
    // The word the first round used for "never recorded" is simply gone.
    expect(parseLanguageParam('unset')).toEqual([]);
    expect(parseLanguageParam('')).toEqual([]);
    expect(parseLanguageParam(null)).toEqual([]);
  });

  it('removes the param entirely when nothing is picked', () => {
    expect(languageParamOf([])).toBeNull();
  });
});

describe('audit vocabulary', () => {
  it('titles a language event by where it landed', () => {
    expect(languageEventTitle('tamil')).toBe('Language set to Tamil');
    expect(languageEventTitle('kannada')).toBe('Language set to Kannada');
    expect(languageEventTitle(null)).toBe('Language cleared');
  });

  it('still reads the rows the first round wrote', () => {
    expect(languageEventTitle('english')).toBe('Language set to English');
  });

  it('stores and reads the English fluency tick as words', () => {
    expect(englishFluencyAuditValue(true)).toBe('limited');
    expect(englishFluencyAuditValue(false)).toBe('follows');
    expect(englishFluencyEventTitle('limited')).toBe('Marked limited English');
    expect(englishFluencyEventTitle('follows')).toBe('Marked as following English');
  });
});

describe('the marks', () => {
  it('uses each language\'s own letter where it is read here', () => {
    expect(LANGUAGES.tamil.mark).toBe('த');
    expect(LANGUAGES.hindi.mark).toBe('ह');
  });

  it('uses a Latin initial for the scripts nobody here reads', () => {
    expect(LANGUAGES.kannada.mark).toBe('K');
    expect(LANGUAGES.malayalam.mark).toBe('M');
  });

  it('gives every language exactly one character, so the disc stays legible', () => {
    for (const key of LANGUAGE_ORDER) expect(Array.from(LANGUAGES[key].mark)).toHaveLength(1);
  });

  it('names a font stack only for the scripts that need one', () => {
    expect(LANGUAGES.tamil.fontStack).toContain('Tamil');
    expect(LANGUAGES.hindi.fontStack).toContain('Devanagari');
    expect(LANGUAGES.kannada.fontStack).toBeNull();
    expect(LANGUAGES.english.fontStack).toBeNull();
  });
});

describe('copy rules', () => {
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
  });

  it('calls the default English, not "English only", now that everyone has it', () => {
    expect(LANGUAGES.english.label).toBe('English');
  });
});
