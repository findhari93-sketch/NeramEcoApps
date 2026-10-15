// @vitest-environment node
import { describe, it, expect } from 'vitest';
import { channelLabel, classifyChannel, resolveSignupFirstTouch, sanitizeFirstTouch, type Touches } from './index';

const cookie = (name: string, value: unknown) => `${name}=${encodeURIComponent(JSON.stringify(value))}`;

const organicFirst: Touches = {
  first: { source: 'www.google.com', medium: 'referral', campaign: null, landing_page: '/nata-coaching', referrer: 'https://www.google.com', channel: 'google_organic', ts: '2026-10-01T00:00:00Z' },
  last: null,
};

describe('resolveSignupFirstTouch', () => {
  it('records an organic or AI visit that has no campaign record', () => {
    const touches: Touches = {
      first: { source: 'chatgpt.com', medium: 'referral', campaign: null, landing_page: '/nata-app', referrer: 'https://chatgpt.com', channel: 'ai_chatgpt', ts: 't' },
      last: null,
    };
    expect(resolveSignupFirstTouch({ cookieHeader: cookie('neram_touches', touches) })).toEqual({
      landing_page: '/nata-app',
      referrer: 'https://chatgpt.com',
      channel: 'ai_chatgpt',
    });
  });

  it('keeps the click id and credits Google Ads when a campaign record exists', () => {
    const header = [
      cookie('neram_attribution', { gclid: 'abc', utm_source: 'google', utm_medium: 'cpc', landing_page: '/apply' }),
      cookie('neram_touches', organicFirst),
    ].join('; ');
    expect(resolveSignupFirstTouch({ cookieHeader: header })).toEqual({
      gclid: 'abc',
      utm_source: 'google',
      utm_medium: 'cpc',
      landing_page: '/apply',
      referrer: 'https://www.google.com',
      channel: 'google_ads',
    });
  });

  it('classifies ChatGPT links that carry utm_source=chatgpt.com', () => {
    const r = resolveSignupFirstTouch({ bodyFirstTouch: { utm_source: 'chatgpt.com', landing_page: '/' } });
    expect(r?.channel).toBe('ai_chatgpt');
  });

  it('prefers the body (cross-origin sign-up) over the cookie', () => {
    const r = resolveSignupFirstTouch({
      bodyTouches: organicFirst,
      cookieHeader: cookie('neram_touches', { first: { ...organicFirst.first, channel: 'direct', referrer: null } }),
    });
    expect(r?.channel).toBe('google_organic');
  });

  it('records a direct first visit as direct', () => {
    const touches = { first: { source: null, medium: null, campaign: null, landing_page: '/', referrer: null, channel: 'direct', ts: 't' }, last: null };
    expect(resolveSignupFirstTouch({ bodyTouches: touches })).toEqual({ landing_page: '/', channel: 'direct' });
  });

  it('returns null when nothing is known', () => {
    expect(resolveSignupFirstTouch({ cookieHeader: null })).toBeNull();
    expect(resolveSignupFirstTouch({ bodyTouches: 'not json', cookieHeader: 'other=1' })).toBeNull();
  });

  it('drops an unknown channel sent by a client', () => {
    expect(sanitizeFirstTouch({ channel: 'free_money', utm_source: 'x' })).toEqual({ utm_source: 'x' });
  });
});

describe('classifyChannel and labels', () => {
  it('tells search engines, AI tools and other websites apart', () => {
    expect(classifyChannel({ referrer: 'https://www.google.co.in/' })).toBe('google_organic');
    expect(classifyChannel({ referrer: 'https://www.perplexity.ai/search' })).toBe('ai_perplexity');
    expect(classifyChannel({ referrer: 'https://example.org/' })).toBe('referral');
    expect(classifyChannel({ referrer: 'https://app.neramclasses.com/' })).toBe('direct');
  });

  it('labels unknown channels as not recorded', () => {
    expect(channelLabel('google_ads')).toBe('Google Ads');
    expect(channelLabel(null)).toBe('Not recorded');
  });
});
