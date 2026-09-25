import { describe, it, expect, beforeEach } from 'vitest';
import {
  captureAttributionFromUrl,
  getStoredAttribution,
  leadAttribution,
  attributionCookieDomain,
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
