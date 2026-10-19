import { describe, expect, it } from 'vitest';
import {
  isRecentAccountWithoutOrigin,
  resolveSignupFirstTouch,
  resolveSignupLastTouch,
  sanitizeFirstTouch,
  SIGNUP_ORIGIN_WINDOW_MS,
} from './index';

describe('signup origin helpers', () => {
  const now = Date.parse('2026-10-17T12:00:00Z');

  it('keeps the Google Ads final URL suffix keys', () => {
    expect(sanitizeFirstTouch({ gclid: 'G', matchtype: 'e', device: 'm', junk: 'x' })).toEqual({ gclid: 'G', matchtype: 'e', device: 'm' });
  });

  it('fills an origin only on an account made in the last day', () => {
    const fresh = new Date(now - 60_000).toISOString();
    const old = new Date(now - SIGNUP_ORIGIN_WINDOW_MS - 1).toISOString();
    expect(isRecentAccountWithoutOrigin({ created_at: fresh, first_touch_at: null, anonymous_id: 'a' }, now)).toBe(true);
    expect(isRecentAccountWithoutOrigin({ created_at: fresh, first_touch_at: 'x', anonymous_id: null }, now)).toBe(true);
    expect(isRecentAccountWithoutOrigin({ created_at: fresh, first_touch_at: 'x', anonymous_id: 'a' }, now)).toBe(false);
    expect(isRecentAccountWithoutOrigin({ created_at: old, first_touch_at: null, anonymous_id: null }, now)).toBe(false);
    expect(isRecentAccountWithoutOrigin({ created_at: null }, now)).toBe(false);
  });

  it('reads first and last touch from the body before the cookie', () => {
    const touches = {
      first: { source: null, medium: null, campaign: null, landing_page: '/', referrer: null, channel: 'direct', ts: '2026-10-01T00:00:00Z' },
      last: { source: 'google', medium: 'cpc', campaign: '999', landing_page: '/nata', referrer: null, channel: 'google_ads', ts: '2026-10-16T00:00:00Z' },
    };
    const first = resolveSignupFirstTouch({ bodyFirstTouch: { gclid: 'G', utm_source: 'google' }, bodyTouches: touches, cookieHeader: null });
    expect(first).toMatchObject({ gclid: 'G', utm_source: 'google', landing_page: '/' });
    expect(resolveSignupLastTouch({ bodyTouches: touches, cookieHeader: null })).toMatchObject({ campaign: '999', channel: 'google_ads' });
    expect(resolveSignupLastTouch({ cookieHeader: null })).toBeNull();
  });
});
