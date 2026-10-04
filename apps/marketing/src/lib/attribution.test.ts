import { describe, it, expect, beforeEach } from 'vitest';
import {
  captureAttributionFromUrl,
  getStoredAttribution,
  leadAttribution,
  attributionCookieDomain,
  classifyChannel,
  nextTouches,
} from './attribution';

function visit(pathAndQuery: string) {
  window.history.replaceState({}, '', pathAndQuery);
  return captureAttributionFromUrl();
}

function clearCookie() {
  document.cookie = 'neram_attribution=; Max-Age=0; Path=/';
}

beforeEach(() => {
  window.sessionStorage.clear();
  clearCookie();
  window.history.replaceState({}, '', '/');
});

/**
 * 2026-09-25 audit of the analytics plan: four callback forms, the demo-class
 * form and both chatbots posted no attribution, although their APIs accept it,
 * so every Google Ads lead that came in through them read as "direct".
 */
describe('leadAttribution', () => {
  it('returns the campaign fields a lead API stores', () => {
    visit('/nata-coaching/chennai?utm_source=google&utm_medium=cpc&utm_campaign=tn_authority&gclid=Cj0KCQ');
    expect(leadAttribution()).toEqual({
      utm_source: 'google',
      utm_medium: 'cpc',
      utm_campaign: 'tn_authority',
      gclid: 'Cj0KCQ',
    });
  });

  it('is empty for a direct visitor, so the POST body gains no keys', () => {
    visit('/fees');
    expect(leadAttribution()).toEqual({});
  });
});

describe('captureAttributionFromUrl', () => {
  it('replaces the whole campaign when a new one arrives, never mixing two', () => {
    visit('/?utm_source=google&utm_medium=cpc&utm_campaign=tn_authority&gclid=abc');
    visit('/?utm_source=whatsapp&utm_medium=broadcast');
    expect(leadAttribution()).toEqual({ utm_source: 'whatsapp', utm_medium: 'broadcast' });
  });

  it('keeps the campaign when a later page has no campaign params', () => {
    visit('/?utm_source=google&utm_campaign=tn_authority');
    visit('/apply');
    expect(leadAttribution()).toEqual({ utm_source: 'google', utm_campaign: 'tn_authority' });
  });

  it('records where and when the campaign touch landed', () => {
    visit('/nata-coaching/chennai?utm_source=google');
    const stored = getStoredAttribution();
    expect(stored.landing_page).toBe('/nata-coaching/chennai');
    expect(stored.captured_at).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  it('keeps a referral code without disturbing the campaign', () => {
    visit('/?utm_source=google');
    visit('/?ref=STU123');
    expect(getStoredAttribution()).toMatchObject({ utm_source: 'google', referral_code: 'STU123' });
  });

  it('survives a new tab through the first-party cookie', () => {
    visit('/?utm_source=google&gclid=abc');
    window.sessionStorage.clear();
    expect(leadAttribution()).toEqual({ utm_source: 'google', gclid: 'abc' });
  });

  it('trims values and caps them at 100 characters', () => {
    visit(`/?utm_source=%20google%20&utm_content=${'x'.repeat(150)}`);
    const stored = getStoredAttribution();
    expect(stored.utm_source).toBe('google');
    expect(stored.utm_content).toHaveLength(100);
  });

  it('drops a value that carries an email address or a phone number', () => {
    visit('/?utm_source=google&utm_content=student%40example.com&utm_term=call%209876543210');
    expect(getStoredAttribution()).toMatchObject({ utm_source: 'google' });
    expect(getStoredAttribution().utm_content).toBeUndefined();
    expect(getStoredAttribution().utm_term).toBeUndefined();
  });
});

describe('attributionCookieDomain', () => {
  it('shares the cookie across every neramclasses.com subdomain', () => {
    expect(attributionCookieDomain('neramclasses.com')).toBe('.neramclasses.com');
    expect(attributionCookieDomain('www.neramclasses.com')).toBe('.neramclasses.com');
    expect(attributionCookieDomain('staging-app.neramclasses.com')).toBe('.neramclasses.com');
  });

  it('stays host-only on localhost and Vercel previews', () => {
    expect(attributionCookieDomain('localhost')).toBeUndefined();
    expect(attributionCookieDomain('neram-marketing-git-x.vercel.app')).toBeUndefined();
    expect(attributionCookieDomain('evilneramclasses.com')).toBeUndefined();
  });
});

describe('classifyChannel', () => {
  it.each([
    [{ referrer: 'https://chatgpt.com/' }, 'ai_chatgpt'],
    [{ utm_source: 'chatgpt.com' }, 'ai_chatgpt'],
    [{ referrer: 'https://www.perplexity.ai/search?q=nata' }, 'ai_perplexity'],
    [{ referrer: 'https://claude.ai/chat/x' }, 'ai_claude'],
    [{ referrer: 'https://gemini.google.com/app' }, 'ai_gemini'],
    [{ referrer: 'https://copilot.microsoft.com/' }, 'ai_copilot'],
    [{ referrer: 'https://www.google.com/' }, 'google_organic'],
    [{ referrer: 'https://www.google.co.in/' }, 'google_organic'],
    [{ referrer: 'https://www.bing.com/' }, 'bing_organic'],
    [{ gclid: 'abc', referrer: 'https://www.google.com/' }, 'google_ads'],
    [{ fbclid: 'x' }, 'meta_ads'],
    [{ utm_source: 'whatsapp' }, 'whatsapp'],
    [{ referrer: 'https://www.youtube.com/watch?v=1' }, 'youtube'],
    [{ referrer: 'https://neramclasses.com/fees' }, 'direct'],
    [{}, 'direct'],
    [{ referrer: 'https://www.shiksha.com/' }, 'referral'],
    [{ utm_source: 'google', utm_medium: 'gbp', referrer: 'https://www.google.com/' }, 'google_business'],
    [{ utm_source: 'google', utm_medium: 'GBP' }, 'google_business'],
  ] as const)('%o -> %s', (input, expected) => {
    expect(classifyChannel(input)).toBe(expected);
  });
});

describe('nextTouches', () => {
  const now = '2026-10-03T00:00:00Z';
  it('keeps the first touch and moves the last touch on a new external visit', () => {
    const first = nextTouches({ first: null, last: null }, { search: '', pathname: '/coaching/x', referrer: 'https://chatgpt.com/', now })!;
    expect(first.first?.channel).toBe('ai_chatgpt');
    const second = nextTouches(first, { search: '?utm_source=whatsapp', pathname: '/fees', referrer: null, now })!;
    expect(second.first?.channel).toBe('ai_chatgpt');
    expect(second.last?.channel).toBe('whatsapp');
    expect(second.last?.landing_page).toBe('/fees');
  });

  it('ignores moves between our own pages once a first touch exists', () => {
    const first = nextTouches({ first: null, last: null }, { search: '', pathname: '/', referrer: null, now })!;
    expect(first.first?.channel).toBe('direct');
    expect(nextTouches(first, { search: '', pathname: '/fees', referrer: 'https://neramclasses.com/', now })).toBeNull();
  });
});
