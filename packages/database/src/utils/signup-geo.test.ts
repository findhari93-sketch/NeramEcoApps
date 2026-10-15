// @vitest-environment node
import { describe, it, expect } from 'vitest';
import { clientIpFromHeaders, formatSignupPlace, signupGeoFromHeaders } from './signup-geo';

const h = (values: Record<string, string>) => new Headers(values);

describe('signupGeoFromHeaders', () => {
  it('reads Cloudflare visitor location headers when proxied', () => {
    expect(
      signupGeoFromHeaders(h({ 'cf-connecting-ip': '49.1.1.1', 'cf-ipcountry': 'IN', 'cf-ipcity': 'Madurai', 'cf-region': 'Tamil Nadu', 'cf-region-code': 'TN' })),
    ).toEqual({ city: 'Madurai', state: 'Tamil Nadu', country: 'IN', source: 'cloudflare' });
  });

  it('maps an Indian region code to the state name', () => {
    expect(signupGeoFromHeaders(h({ 'cf-connecting-ip': '1', 'cf-ipcountry': 'IN', 'cf-region-code': 'KA' }))?.state).toBe('Karnataka');
  });

  it('ignores Vercel headers behind Cloudflare (they describe the edge server)', () => {
    expect(
      signupGeoFromHeaders(h({ 'cf-connecting-ip': '1', 'cf-ipcountry': 'IN', 'x-vercel-ip-city': 'Mumbai', 'x-vercel-ip-country-region': 'MH' })),
    ).toEqual({ city: null, state: null, country: 'IN', source: 'cloudflare' });
  });

  it('falls back to Vercel headers without Cloudflare, decoding the city', () => {
    expect(
      signupGeoFromHeaders(h({ 'x-vercel-ip-country': 'IN', 'x-vercel-ip-city': 'Tiruchirappalli', 'x-vercel-ip-country-region': 'TN' })),
    ).toEqual({ city: 'Tiruchirappalli', state: 'Tamil Nadu', country: 'IN', source: 'vercel' });
    expect(signupGeoFromHeaders(h({ 'x-vercel-ip-country': 'AE', 'x-vercel-ip-city': 'Abu%20Dhabi' }))?.city).toBe('Abu Dhabi');
  });

  it('treats unknown markers and empty headers as unknown', () => {
    expect(signupGeoFromHeaders(h({ 'cf-connecting-ip': '1', 'cf-ipcountry': 'XX' }))).toBeNull();
    expect(signupGeoFromHeaders(h({}))).toBeNull();
  });
});

describe('clientIpFromHeaders', () => {
  it('prefers the real visitor IP from Cloudflare', () => {
    expect(clientIpFromHeaders(h({ 'cf-connecting-ip': '49.2.2.2', 'x-forwarded-for': '162.158.1.1' }))).toBe('49.2.2.2');
    expect(clientIpFromHeaders(h({ 'x-forwarded-for': '10.0.0.1, 162.158.1.1' }))).toBe('10.0.0.1');
    expect(clientIpFromHeaders(h({}))).toBeNull();
  });
});

describe('formatSignupPlace', () => {
  it('shows city and state in India, the country abroad', () => {
    expect(formatSignupPlace({ city: 'Chennai', state: 'Tamil Nadu', country: 'IN' })).toBe('Chennai, Tamil Nadu');
    expect(formatSignupPlace({ city: 'Dubai', state: 'Dubai', country: 'AE' })).toBe('Dubai, United Arab Emirates');
    expect(formatSignupPlace({ country: 'IN' })).toBe('India');
    expect(formatSignupPlace({})).toBeNull();
  });
});
