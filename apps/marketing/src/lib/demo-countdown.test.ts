import { describe, it, expect } from 'vitest';
import { demoCountdown } from './demo-countdown';

const start = new Date('2026-10-20T04:30:00Z'); // 10:00 AM IST
const at = (iso: string) => new Date(iso);

describe('demoCountdown', () => {
  it('shows days and hours when more than a day away', () => {
    const c = demoCountdown(start, 45, at('2026-10-18T02:30:00Z'));
    expect(c).toMatchObject({ phase: 'later', days: 2, hours: 2, short: '2d 2h' });
    expect(c.label).toBe('Starts in 2 days 2 hours');
  });

  it('shows hours and minutes on the day before', () => {
    const c = demoCountdown(start, 45, at('2026-10-19T18:18:00Z'));
    expect(c.short).toBe('10h 12m');
    expect(c.label).toBe('Starts in 10 hours 12 min');
  });

  it('rounds the last minutes up and turns soon inside the join window', () => {
    expect(demoCountdown(start, 45, at('2026-10-20T04:17:30Z'))).toMatchObject({ phase: 'soon', short: '13 min' });
    expect(demoCountdown(start, 45, at('2026-10-20T04:29:59Z')).short).toBe('1 min');
    expect(demoCountdown(start, 45, at('2026-10-20T04:00:00Z')).phase).toBe('later');
  });

  it('is live from the start until the end, then over', () => {
    expect(demoCountdown(start, 45, at('2026-10-20T04:30:00Z')).phase).toBe('live');
    expect(demoCountdown(start, 45, at('2026-10-20T05:15:00Z')).phase).toBe('live');
    expect(demoCountdown(start, 45, at('2026-10-20T05:15:01Z'))).toMatchObject({ phase: 'over', short: '' });
  });

  it('gives the phone chip a single unit', () => {
    expect(demoCountdown(start, 45, at('2026-10-18T02:30:00Z')).tiny).toBe('2d');
    expect(demoCountdown(start, 45, at('2026-10-19T18:18:00Z')).tiny).toBe('10h');
    expect(demoCountdown(start, 45, at('2026-10-20T04:17:30Z')).tiny).toBe('13m');
    expect(demoCountdown(start, 45, at('2026-10-20T04:40:00Z')).tiny).toBe('Live');
  });

  it('drops a zero unit', () => {
    expect(demoCountdown(start, 45, at('2026-10-17T04:30:00Z')).short).toBe('3d');
    expect(demoCountdown(start, 45, at('2026-10-20T02:30:00Z')).short).toBe('2h');
  });
});
