import { describe, it, expect } from 'vitest';
import { isTrackerRequest } from './error-buffer';

describe('isTrackerRequest', () => {
  it('flags the Ads beacons that filled the first staging report', () => {
    expect(isTrackerRequest('https://www.google.com/ccm/collect?en=page_view')).toBe(true);
    expect(isTrackerRequest('https://www.google.com/rmkt/collect/757750634/?random=1')).toBe(true);
    expect(isTrackerRequest('https://ad.doubleclick.net/ccm/s/collect?x=1')).toBe(true);
    expect(isTrackerRequest('https://www.google-analytics.com/g/collect?v=2')).toBe(true);
    expect(isTrackerRequest('https://www.googletagmanager.com/gtag/js?id=G-1')).toBe(true);
    expect(isTrackerRequest('https://www.google.co.in/pagead/1p-user-list/1')).toBe(true);
  });

  it('keeps our own calls and real Google APIs', () => {
    expect(isTrackerRequest('/api/questions?page=2')).toBe(false);
    expect(isTrackerRequest('https://staging-app.neramclasses.com/api/error-reports')).toBe(false);
    expect(isTrackerRequest('https://db.neramclasses.com/rest/v1/colleges')).toBe(false);
    expect(isTrackerRequest('https://www.googleapis.com/youtube/v3/channels')).toBe(false);
    expect(isTrackerRequest('https://identitytoolkit.googleapis.com/v1/accounts:lookup')).toBe(false);
    expect(isTrackerRequest('https://www.google.com/recaptcha/api2/reload')).toBe(false);
  });

  it('never throws on junk', () => {
    expect(isTrackerRequest('')).toBe(false);
    expect(isTrackerRequest('::::')).toBe(false);
  });
});
