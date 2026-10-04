import { describe, it, expect } from 'vitest';
import { STATES, getCity } from '@/data/geo';
import { FIXTURE_DATASETS as ds } from './__fixtures__/geo-datasets';
import { buildLlmsFullTxt, buildLlmsTxt } from './llms';
import { cityAnswer, cityDescription, cityFaqs, cityTitle, stateAnswer, stateFaqs, stateTitle } from './location-copy';
import { allCityGates, cityFactsFor, lookupCity, stateFactsFor } from './location-pages';

/** Copy rules from CLAUDE.md and the SEO strategy: no em dashes, no unverifiable claims. */
const BANNED = /—|–|\s--\s|#\s?1\b|99\.9|150\+|10,000\+|2500\+|India's best|number one/i;

const cityText = (exam: 'nata' | 'jee-paper-2', slug: string) => {
  const { facts } = cityFactsFor(exam, getCity(slug)!, ds);
  return [cityTitle(facts), cityDescription(facts), ...cityAnswer(facts), ...cityFaqs(facts).flatMap((f) => [f.question, f.answer])].join('\n');
};

describe('location copy', () => {
  it('never uses banned punctuation or claims on any city page, for either exam', () => {
    for (const exam of ['nata', 'jee-paper-2'] as const) {
      for (const { facts } of allCityGates(exam, ds)) {
        const text = [cityTitle(facts), cityDescription(facts), ...cityAnswer(facts), ...cityFaqs(facts).flatMap((f) => [f.answer, f.question])].join('\n');
        expect(text, `${exam}/${facts.place.slug}`).not.toMatch(BANNED);
      }
    }
  });

  it('never claims a classroom in a city without one', () => {
    const text = cityText('nata', 'jaipur');
    expect(text).not.toMatch(/classroom batches at its|Visit the classroom|our Jaipur cent/i);
    expect(text).toMatch(/live online classes/);
  });

  it('names the real classroom for a classroom city', () => {
    expect(cityText('nata', 'bangalore')).toMatch(/Electronic City, Bangalore centre/);
  });

  it('keeps titles under 60 characters before the brand suffix', () => {
    for (const { facts } of allCityGates('nata', ds)) expect(cityTitle(facts).length, facts.place.slug).toBeLessThanOrEqual(60);
  });

  it('builds state copy for every state without banned text', () => {
    for (const exam of ['nata', 'jee-paper-2'] as const) {
      for (const s of STATES) {
        const { facts } = stateFactsFor(exam, s, ds);
        const text = [stateTitle(facts), ...stateAnswer(facts), ...stateFaqs(facts).flatMap((f) => [f.question, f.answer])].join('\n');
        expect(text, `${exam}/${s.slug}`).not.toMatch(BANNED);
      }
    }
  });
});

describe('lookupCity', () => {
  it('resolves pages, redirects aliases and 404s unknown slugs', () => {
    expect(lookupCity('nata', 'nata-coaching-centers-in-chennai')).toMatchObject({ kind: 'page' });
    expect(lookupCity('nata', 'nata-coaching-centers-in-bengaluru')).toEqual({
      kind: 'redirect',
      to: '/coaching/nata-coaching/nata-coaching-centers-in-bangalore',
    });
    expect(lookupCity('nata', 'nata-coaching-centers-in-atlantis')).toEqual({ kind: 'not-found' });
    expect(lookupCity('nata', 'chennai')).toEqual({ kind: 'not-found' });
    expect(lookupCity('jee-paper-2', 'jee-paper-2-coaching-in-dubai')).toEqual({ kind: 'not-found' });
  });

  it('heals doubled old URL shapes instead of 404ing them', () => {
    expect(lookupCity('nata', 'nata-coaching-centers-in-in-chennai')).toEqual({
      kind: 'redirect',
      to: '/coaching/nata-coaching/nata-coaching-centers-in-chennai',
    });
    expect(lookupCity('nata', 'nata-coaching-centers-in-center-in-tamil-nadu')).toEqual({
      kind: 'redirect',
      to: '/coaching/nata-coaching-in-tamil-nadu',
    });
    expect(lookupCity('nata', 'nata-coaching-centers-in-kerala')).toEqual({
      kind: 'redirect',
      to: '/coaching/nata-coaching-in-kerala',
    });
    expect(lookupCity('nata', 'nata-coaching-centers-in-in-atlantis')).toEqual({ kind: 'not-found' });
  });

  it('merges duplicate GeoNames places into one page', () => {
    expect(lookupCity('nata', 'nata-coaching-centers-in-bengaluru-rural')).toEqual({
      kind: 'redirect',
      to: '/coaching/nata-coaching/nata-coaching-centers-in-bangalore',
    });
    expect(lookupCity('jee-paper-2', 'jee-paper-2-coaching-in-gadag-betageri')).toEqual({
      kind: 'redirect',
      to: '/coaching/jee-paper-2-coaching/jee-paper-2-coaching-in-gadag',
    });
  });
});

describe('llms.txt', () => {
  it('lists facts and canonical pages, never redirected URLs or unverified claims', () => {
    for (const txt of [buildLlmsTxt(ds), buildLlmsFullTxt(ds)]) {
      expect(txt).toMatch(/Founded: 2009/);
      expect(txt).toMatch(/\/coaching\/nata-coaching-in-tamil-nadu/);
      expect(txt).not.toMatch(BANNED);
      expect(txt).not.toMatch(/best-nata-coaching-online|best-nata-coaching-india|\.com\/nata-coaching\/[a-z]/);
    }
    expect(buildLlmsFullTxt(ds)).toMatch(/nata-coaching-centers-in-chennai/);
  });
});
