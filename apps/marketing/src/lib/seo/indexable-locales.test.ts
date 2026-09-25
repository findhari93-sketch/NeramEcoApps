import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import { ENGLISH_ONLY_SECTIONS, indexableLocales } from './indexable-locales';
import { buildAlternates } from './metadata';

const BASE = 'https://neramclasses.com';

describe('ENGLISH_ONLY_SECTIONS', () => {
  it('matches the noindex header rule in next.config.js', () => {
    const src = fs.readFileSync(path.resolve(__dirname, '../../../next.config.js'), 'utf8');
    const m = src.match(/source:\s*'\/\(ta\|hi\|kn\|ml\)\/\(([^)]+)\)\/:path\*'/);
    expect(m, 'noindex rule not found in next.config.js').toBeTruthy();
    expect([...m![1].split('|')].sort()).toEqual([...ENGLISH_ONLY_SECTIONS].sort());
  });
});

describe('indexableLocales', () => {
  it('is English only for noindexed and coaching sections', () => {
    expect(indexableLocales('/nata-2026/syllabus')).toEqual(['en']);
    expect(indexableLocales('/nata-coaching/chennai')).toEqual(['en']);
    expect(indexableLocales('/coaching/nata-coaching/nata-coaching-centers-in-pune')).toEqual(['en']);
  });

  it('keeps the partial and full translations', () => {
    expect(indexableLocales('/nata-online-coaching')).toEqual(['en', 'ta', 'hi']);
    expect(indexableLocales('/about')).toEqual(['en', 'ta', 'hi', 'kn', 'ml']);
    expect(indexableLocales('')).toEqual(['en', 'ta', 'hi', 'kn', 'ml']);
  });
});

describe('buildAlternates', () => {
  it('emits no hreflang to noindexed locale copies', () => {
    const a = buildAlternates('en', '/nata-coaching/chennai');
    expect(a.canonical).toBe(`${BASE}/nata-coaching/chennai`);
    expect(a.languages).toBeUndefined();
  });

  it('points a noindexed locale copy at the English canonical', () => {
    expect(buildAlternates('ta', '/nata-2026').canonical).toBe(`${BASE}/nata-2026`);
    expect(buildAlternates('kn', '/nata-online-coaching').canonical).toBe(`${BASE}/nata-online-coaching`);
  });

  it('keeps the full cluster for translated pages', () => {
    const a = buildAlternates('ta', '/about');
    expect(a.canonical).toBe(`${BASE}/ta/about`);
    expect(a.languages).toEqual({
      en: `${BASE}/about`,
      ta: `${BASE}/ta/about`,
      hi: `${BASE}/hi/about`,
      kn: `${BASE}/kn/about`,
      ml: `${BASE}/ml/about`,
      'x-default': `${BASE}/about`,
    });
  });

  it('lists only the translated locales on a partially translated page', () => {
    expect(Object.keys(buildAlternates('hi', '/nata-online-coaching').languages!)).toEqual(['en', 'ta', 'hi', 'x-default']);
  });
});
