import { describe, it, expect } from 'vitest';
import {
  normaliseTrackLanguages,
  readTrackLanguages,
  labelForCode,
  trackLanguageOrder,
  isValidTrackLanguageCode,
  FALLBACK_TRACK_LANGUAGES,
} from './track-languages';

/**
 * The offered language list is admin-editable data, which means it is the one
 * place in this feature where a human types directly into something the routes
 * then trust. These tests are about what happens when that typing is wrong.
 *
 * The rule throughout: never throw, never return nothing. A chapter must still
 * open when the settings row is missing, malformed or unreachable, because the
 * alternative is that one bad character locks every teacher out of every
 * chapter at once.
 */

describe('normaliseTrackLanguages', () => {
  it('keeps a well-formed list in the admin’s order', () => {
    const out = normaliseTrackLanguages([
      { code: 'ta', label: 'தமிழ்' },
      { code: 'en', label: 'English' },
      { code: 'hi', label: 'हिन्दी' },
    ]);
    expect(out.map((l) => l.code)).toEqual(['ta', 'en', 'hi']);
  });

  it('accepts a language nobody hardcoded, which is the entire point', () => {
    const out = normaliseTrackLanguages([{ code: 'ml', label: 'മലയാളം' }]);
    expect(out).toEqual([{ code: 'ml', label: 'മലയാളം' }]);
  });

  it('lowercases and trims a code, because PostgREST .eq is case sensitive', () => {
    // A stored 'EN' would match nothing on the way back out, so every chapter
    // using it would silently show no recordings.
    const out = normaliseTrackLanguages([{ code: '  EN ', label: 'English' }]);
    expect(out[0].code).toBe('en');
  });

  it('drops a code the database CHECK would reject', () => {
    const out = normaliseTrackLanguages([
      { code: 'english', label: 'English' },
      { code: 'e', label: 'Short' },
      { code: 'e n', label: 'Spaced' },
      { code: 'ta', label: 'தமிழ்' },
    ]);
    expect(out.map((l) => l.code)).toEqual(['ta']);
  });

  it('drops an entry with no label rather than rendering a blank button', () => {
    const out = normaliseTrackLanguages([
      { code: 'en', label: '   ' },
      { code: 'ta', label: 'தமிழ்' },
    ]);
    expect(out.map((l) => l.code)).toEqual(['ta']);
  });

  it('keeps the first of a duplicated code', () => {
    const out = normaliseTrackLanguages([
      { code: 'en', label: 'English' },
      { code: 'en', label: 'English (again)' },
    ]);
    expect(out).toHaveLength(1);
    expect(out[0].label).toBe('English');
  });

  it('falls back when the value is not a list at all', () => {
    for (const raw of [null, undefined, {}, 'en,ta', 42]) {
      expect(normaliseTrackLanguages(raw)).toEqual(FALLBACK_TRACK_LANGUAGES);
    }
  });

  it('falls back when every entry was dropped, so a chapter is never left with no options', () => {
    const out = normaliseTrackLanguages([{ code: 'nonsense-code', label: 'x' }, 'junk', null]);
    expect(out).toEqual(FALLBACK_TRACK_LANGUAGES);
  });

  it('returns a copy, so a caller mutating the result cannot poison the fallback', () => {
    const out = normaliseTrackLanguages(null);
    out.pop();
    expect(FALLBACK_TRACK_LANGUAGES).toHaveLength(2);
  });
});

describe('the built-in list', () => {
  it('offers one entry per language and nothing that reads like an action', () => {
    // Deliberately exact. The original list also carried 'ta_en', one video with
    // both languages spoken in it, and among chips labelled "add a language"
    // that reads as "add both at once". The first teacher to open the dialog
    // picked it for that reason. A combined recording is still reachable, by an
    // admin adding it from Manage languages, which is a decision rather than a
    // default.
    expect(FALLBACK_TRACK_LANGUAGES.map((l) => l.code)).toEqual(['en', 'ta']);
  });

  it('still accepts a combined code an admin adds on purpose', () => {
    // Removing it from the default list must not make it unusable: the shape
    // check and the database CHECK both allow the underscore form.
    expect(isValidTrackLanguageCode('ta_en')).toBe(true);
    expect(normaliseTrackLanguages([{ code: 'ta_en', label: 'Tamil and English mixed' }])).toEqual([
      { code: 'ta_en', label: 'Tamil and English mixed' },
    ]);
  });
});

describe('isValidTrackLanguageCode', () => {
  it('mirrors what chk_class_recaps_language allows', () => {
    for (const ok of ['en', 'ta', 'hi', 'mal', 'ta_en', 'ta_en_hi']) {
      expect(isValidTrackLanguageCode(ok)).toBe(true);
    }
    for (const bad of ['', 'e', 'english', 'EN ish', 'ta-en', 'ta_', '2en', null, 7]) {
      expect(isValidTrackLanguageCode(bad)).toBe(false);
    }
  });
});

describe('readTrackLanguages', () => {
  const client = (impl: () => unknown) => ({
    from: () => ({
      select: () => ({ eq: () => ({ maybeSingle: async () => impl() }) }),
    }),
  });

  it('reads and normalises the settings row', async () => {
    const out = await readTrackLanguages(
      client(() => ({ data: { value: [{ code: 'hi', label: 'हिन्दी' }] }, error: null })),
    );
    expect(out).toEqual([{ code: 'hi', label: 'हिन्दी' }]);
  });

  it('falls back when the row does not exist yet', async () => {
    const out = await readTrackLanguages(client(() => ({ data: null, error: null })));
    expect(out).toEqual(FALLBACK_TRACK_LANGUAGES);
  });

  it('falls back on a query error instead of failing the chapter screen', async () => {
    const out = await readTrackLanguages(client(() => ({ data: null, error: { message: 'boom' } })));
    expect(out).toEqual(FALLBACK_TRACK_LANGUAGES);
  });

  it('falls back when the client itself throws', async () => {
    const out = await readTrackLanguages(
      client(() => {
        throw new Error('network down');
      }),
    );
    expect(out).toEqual(FALLBACK_TRACK_LANGUAGES);
  });
});

describe('labelForCode and trackLanguageOrder', () => {
  const langs = [
    { code: 'en', label: 'English' },
    { code: 'ta', label: 'தமிழ்' },
  ];

  it('finds the configured label', () => {
    expect(labelForCode(langs, 'ta')).toBe('தமிழ்');
  });

  it('falls back to the raw code for a language that was removed from the list', () => {
    // Ugly but legible, and far better than an empty picker button on a chapter
    // that still has that recording published.
    expect(labelForCode(langs, 'hi')).toBe('hi');
  });

  it('orders by the list the admin arranged', () => {
    expect(trackLanguageOrder(langs)).toEqual(['en', 'ta']);
  });
});
