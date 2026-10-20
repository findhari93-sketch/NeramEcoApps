import { describe, it, expect } from 'vitest';
import { demoGoogleUrl, demoIcsUrl, demoOutlookUrl } from './demo-calendar-links';

const e = {
  ref: 'DEMO-JWQ8',
  token: 'tok',
  start: new Date('2026-10-20T04:30:00Z'),
  minutes: 45,
  joinUrl: 'https://teams.microsoft.com/meet/1?p=x',
  hostName: 'Hari',
  origin: '',
};

describe('demo calendar links', () => {
  it('builds an Outlook add-event link with exact UTC times and the join link', () => {
    const u = new URL(demoOutlookUrl(e));
    expect(u.hostname).toBe('outlook.live.com');
    expect(u.searchParams.get('startdt')).toBe('2026-10-20T04:30:00.000Z');
    expect(u.searchParams.get('enddt')).toBe('2026-10-20T05:15:00.000Z');
    expect(u.searchParams.get('body')).toContain('https://teams.microsoft.com/meet/1?p=x');
  });

  it('builds a Google link and falls back to the booking page without a join link', () => {
    const g = new URL(demoGoogleUrl({ ...e, joinUrl: null }));
    expect(g.searchParams.get('dates')).toBe('20261020T043000Z/20261020T051500Z');
    expect(g.searchParams.get('details')).toContain('https://neramclasses.com/d/tok');
  });

  it('points Apple and other apps at the .ics', () => {
    expect(demoIcsUrl(e)).toBe('/api/demo-class/ics/tok');
  });
});
