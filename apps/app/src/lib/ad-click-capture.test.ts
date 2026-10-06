// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { readFirstTouchCookie } from '@neram/database/analytics';
import { ATTRIBUTION_COOKIE, campaignFromUrl, cookieString } from './ad-click-capture';

describe('ad click capture on the app', () => {
  it('keeps the click id and utm from the landing URL, gbraid included', () => {
    expect(campaignFromUrl('?gclid=G1&gbraid=B1&utm_source=google&utm_medium=cpc&x=1', '/tools/nata-cutoff', new Date('2026-10-06T00:00:00Z'))).toEqual({
      gclid: 'G1',
      gbraid: 'B1',
      utm_source: 'google',
      utm_medium: 'cpc',
      landing_page: '/tools/nata-cutoff',
      captured_at: '2026-10-06T00:00:00.000Z',
    });
  });

  it('leaves the stored touch alone on a page without campaign params, and drops contact details', () => {
    expect(campaignFromUrl('?page=2', '/')).toBeNull();
    expect(campaignFromUrl('?utm_source=asha@example.com&utm_campaign=9876543210', '/')).toBeNull();
  });

  it('writes a cookie that register-user reads straight into users.first_touch', () => {
    const record = campaignFromUrl('?gclid=G1&gbraid=B1&utm_source=google', '/tools', new Date('2026-10-06T00:00:00Z'))!;
    const cookie = cookieString(record, 'app.neramclasses.com', true);
    expect(cookie).toContain('Domain=.neramclasses.com');
    expect(cookie).toContain('Secure');
    const header = cookie.split('; ')[0]; // what the browser sends back
    expect(header.startsWith(`${ATTRIBUTION_COOKIE}=`)).toBe(true);
    expect(readFirstTouchCookie(header)).toEqual({ gclid: 'G1', gbraid: 'B1', utm_source: 'google', landing_page: '/tools' });
  });

  it('stays host-only off the production domains', () => {
    expect(cookieString({ gclid: 'x' }, 'localhost', false)).not.toContain('Domain=');
  });
});
