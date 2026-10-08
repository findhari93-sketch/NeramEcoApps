import { describe, it, expect } from 'vitest';
import { DEFAULT_DEMO_SCHEDULE, istDateTime, type DemoRequest } from '@neram/database';
import { buildDemoInviteHtml, buildDemoMessageParams, demoEventSubject, demoMessageSkipReason } from './messages';

const start = istDateTime('2025-10-14', '18:30');

const base = {
  id: 'r1',
  name: 'priya ramesh',
  parent_name: 'Ramesh K',
  ref_code: 'DEMO-4K7Q',
  join_token: 'tok123tok123tok123tok123',
  status: 'approved',
  scheduled_start: start.toISOString(),
  scheduled_minutes: 45,
  preferred_date: '2025-10-14',
  preferred_window: 'evening',
  schedule_change_reason: null,
  cancel_reason: null,
} as unknown as DemoRequest;

describe('demoMessageSkipReason', () => {
  const now = new Date(start.getTime() - 60 * 60_000);
  it('sends a due reminder for a confirmed demo', () => {
    expect(demoMessageSkipReason({ kind: 'reminder_soon', send_after: now.toISOString() }, base, now)).toBeNull();
  });
  it('skips reminders once the request is no longer confirmed', () => {
    expect(
      demoMessageSkipReason({ kind: 'reminder_day', send_after: now.toISOString() }, { ...base, status: 'cancelled' }, now),
    ).toMatch(/cancelled/);
  });
  it('skips stale sends', () => {
    const old = new Date(now.getTime() - 7 * 60 * 60_000);
    expect(demoMessageSkipReason({ kind: 'confirmed', send_after: old.toISOString() }, base, now)).toMatch(/stale/);
  });
  it('skips "starting soon" after the start', () => {
    const late = new Date(start.getTime() + 5 * 60_000);
    expect(demoMessageSkipReason({ kind: 'reminder_soon', send_after: start.toISOString() }, base, late)).toMatch(/started/);
  });
  it('sends thanks only to attendees', () => {
    expect(demoMessageSkipReason({ kind: 'thanks', send_after: now.toISOString() }, { ...base, status: 'attended' }, now)).toBeNull();
    expect(demoMessageSkipReason({ kind: 'thanks', send_after: now.toISOString() }, { ...base, status: 'no_show' }, now)).not.toBeNull();
  });
});

describe('buildDemoMessageParams', () => {
  it('addresses the student as "you"', () => {
    const p = buildDemoMessageParams({
      request: base,
      recipient: 'student',
      hostName: 'Hari',
      schedule: DEFAULT_DEMO_SCHEDULE,
      marketingOrigin: 'https://neramclasses.com',
    });
    expect(p.recipientName).toBe('Priya');
    expect(p.studentName).toBe('you');
    expect(p.when).toBe('Tue, 14 Oct at 6:30 PM');
    expect(p.time).toBe('6:30 PM');
    expect(p.token).toBe(base.join_token);
    expect(p.surveyUrl).toBe('https://neramclasses.com/demo-class/survey/r1');
  });
  it('addresses the parent by name and names the student', () => {
    const p = buildDemoMessageParams({
      request: base,
      recipient: 'parent',
      hostName: null,
      schedule: DEFAULT_DEMO_SCHEDULE,
      marketingOrigin: 'https://neramclasses.com',
    });
    expect(p.recipientName).toBe('Ramesh');
    expect(p.studentName).toBe('Priya');
    expect(p.hostName).toBe('our architect faculty');
  });
});

describe('buildDemoInviteHtml', () => {
  it('escapes user text', () => {
    const html = buildDemoInviteHtml({
      studentName: '<b>x</b>',
      hostName: 'Hari',
      ref: 'DEMO-4K7Q',
      myDemoUrl: 'https://neramclasses.com/d/tok',
      drawingLink: 'https://wa.me/919176137043?text=a&b',
    });
    expect(html).not.toContain('<b>x</b>');
    expect(html).toContain('Parents are welcome');
    expect(html).toContain('&amp;b');
  });
});

describe('demoEventSubject', () => {
  it('marks the event as a demo with a short name, class and ref', () => {
    expect(demoEventSubject({ name: 'Priya Ramesh Kumar', current_class: '12th', ref_code: 'DEMO-4K7Q' })).toBe(
      'NERAM DEMO · Priya K (Class 12) · DEMO-4K7Q',
    );
    expect(demoEventSubject({ name: 'Priya', current_class: null, ref_code: null })).toBe('NERAM DEMO · Priya');
  });
});
