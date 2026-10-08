import { describe, it, expect } from 'vitest';
import {
  availableDemoDays,
  defaultStartFor,
  demoReminderPlan,
  formatDemoDateTime,
  formatDemoPreference,
  isDemoRefCode,
  isJoinOpen,
  isOfferedPreference,
  isOutsidePreference,
  istDateKey,
  istDateTime,
  makeDemoJoinToken,
  makeDemoRefCode,
  resolveDemoSchedule,
  thanksSendAfter,
  DEFAULT_DEMO_SCHEDULE,
  googleCalendarUrl,
  demoIcs,
  resolveDemoSettings,
  publicDemoSettings,
  drawingWhatsAppLink,
  staffReminderPlan,
  demoTutorName,
} from './demo-schedule';

// Tue 14 Oct 2025 is used throughout; IST = UTC+5:30.
const at = (iso: string) => new Date(iso);

describe('IST helpers', () => {
  it('istDateKey uses the India day, not the UTC day', () => {
    // 20:00 UTC on the 13th is 01:30 IST on the 14th
    expect(istDateKey(at('2025-10-13T20:00:00Z'))).toBe('2025-10-14');
    expect(istDateKey(at('2025-10-13T18:00:00Z'))).toBe('2025-10-13');
  });

  it('istDateTime converts India wall clock to the right instant', () => {
    expect(istDateTime('2025-10-14', '18:00').toISOString()).toBe('2025-10-14T12:30:00.000Z');
    expect(istDateTime('2025-10-14', '00:15').toISOString()).toBe('2025-10-13T18:45:00.000Z');
  });
});

describe('resolveDemoSchedule', () => {
  it('falls back to defaults for junk', () => {
    expect(resolveDemoSchedule(null)).toEqual(DEFAULT_DEMO_SCHEDULE);
    expect(resolveDemoSchedule({ windows: [{ id: 'night', start: '25:00', end: '1' }], daysAhead: 99 })).toEqual(
      DEFAULT_DEMO_SCHEDULE,
    );
  });

  it('keeps valid overrides', () => {
    const s = resolveDemoSchedule({
      windows: [{ id: 'evening', start: '19:00', end: '21:00' }],
      daysAhead: 5,
      closedWeekdays: [0, 9],
    });
    expect(s.windows).toEqual([{ id: 'evening', label: 'Evening', start: '19:00', end: '21:00' }]);
    expect(s.daysAhead).toBe(5);
    expect(s.closedWeekdays).toEqual([0]);
  });
});

describe('availableDemoDays', () => {
  it('offers 7 days starting today with all windows early in the morning', () => {
    const days = availableDemoDays(at('2025-10-14T02:00:00Z')); // 07:30 IST
    expect(days).toHaveLength(7);
    expect(days[0]).toMatchObject({ date: '2025-10-14', label: 'Today', windows: ['morning', 'afternoon', 'evening'] });
    expect(days[1].label).toBe('Tomorrow');
    expect(days[2].label).toBe('Thu');
    expect(days[0].sub).toBe('14 Oct');
  });

  it("drops today's windows that start within the lead time", () => {
    const days = availableDemoDays(at('2025-10-14T08:00:00Z')); // 13:30 IST, afternoon at 14:00 is < 60 min
    expect(days[0].windows).toEqual(['evening']);
  });

  it('drops today entirely once the last window is too close', () => {
    const days = availableDemoDays(at('2025-10-14T12:00:00Z')); // 17:30 IST
    expect(days[0].date).toBe('2025-10-15');
    expect(days).toHaveLength(6);
  });

  it('skips closed weekdays', () => {
    const s = { ...DEFAULT_DEMO_SCHEDULE, closedWeekdays: [0] };
    const days = availableDemoDays(at('2025-10-14T02:00:00Z'), s);
    expect(days.some((d) => d.date === '2025-10-19')).toBe(false); // Sunday
  });
});

describe('isOfferedPreference', () => {
  const now = at('2025-10-14T08:00:00Z'); // 13:30 IST
  it('accepts anytime only without a date', () => {
    expect(isOfferedPreference(now, null, 'anytime')).toBe(true);
    expect(isOfferedPreference(now, '2025-10-15', 'anytime')).toBe(false);
  });
  it('rejects a past or too-close window', () => {
    expect(isOfferedPreference(now, '2025-10-14', 'morning')).toBe(false);
    expect(isOfferedPreference(now, '2025-10-14', 'evening')).toBe(true);
    expect(isOfferedPreference(now, '2025-12-01', 'evening')).toBe(false);
  });
});

describe('defaultStartFor / isOutsidePreference', () => {
  it('starts at the window opening', () => {
    expect(defaultStartFor('2025-10-14', 'evening')?.toISOString()).toBe('2025-10-14T12:30:00.000Z');
    expect(defaultStartFor(null, 'anytime')).toBeNull();
  });

  it('flags a different day or a time outside the window', () => {
    const pref = { date: '2025-10-14', window: 'evening' as const };
    expect(isOutsidePreference(istDateTime('2025-10-14', '19:30'), pref)).toBe(false);
    expect(isOutsidePreference(istDateTime('2025-10-14', '20:30'), pref)).toBe(true); // end is exclusive
    expect(isOutsidePreference(istDateTime('2025-10-14', '11:00'), pref)).toBe(true);
    expect(isOutsidePreference(istDateTime('2025-10-15', '18:30'), pref)).toBe(true);
  });

  it('never flags an anytime request', () => {
    expect(isOutsidePreference(istDateTime('2025-10-20', '07:00'), { date: null, window: 'anytime' })).toBe(false);
  });
});

describe('demoReminderPlan', () => {
  it('confirmed the day before: confirm now, 8 AM reminder, 30 min reminder', () => {
    const now = at('2025-10-13T10:00:00Z');
    const start = istDateTime('2025-10-14', '18:00');
    const plan = demoReminderPlan(start, now);
    expect(plan.map((p) => p.kind)).toEqual(['confirmed', 'reminder_day', 'reminder_soon']);
    expect(plan[1].sendAfter.toISOString()).toBe('2025-10-14T02:30:00.000Z'); // 08:00 IST
    expect(plan[2].sendAfter.toISOString()).toBe('2025-10-14T12:00:00.000Z'); // 17:30 IST
  });

  it('confirmed after 8 AM on the day: no day reminder', () => {
    const now = at('2025-10-14T05:00:00Z'); // 10:30 IST
    const plan = demoReminderPlan(istDateTime('2025-10-14', '18:00'), now);
    expect(plan.map((p) => p.kind)).toEqual(['confirmed', 'reminder_soon']);
  });

  it('skips the day reminder for an 8:30 AM demo and the soon one when it is too late', () => {
    const now = at('2025-10-14T02:50:00Z'); // 08:20 IST
    const plan = demoReminderPlan(istDateTime('2025-10-14', '08:40'), now, 'rescheduled');
    expect(plan.map((p) => p.kind)).toEqual(['rescheduled']);
  });

  it('thanks goes 30 minutes after the end, never in the past', () => {
    const start = istDateTime('2025-10-14', '18:00');
    expect(thanksSendAfter(start, 45, at('2025-10-14T12:40:00Z')).toISOString()).toBe('2025-10-14T13:45:00.000Z');
    const late = at('2025-10-15T00:00:00Z');
    expect(thanksSendAfter(start, 45, late)).toEqual(late);
  });
});

describe('codes', () => {
  it('ref codes use the readable alphabet', () => {
    for (let i = 0; i < 200; i++) {
      const c = makeDemoRefCode();
      expect(isDemoRefCode(c)).toBe(true);
      expect(c.slice(5)).not.toMatch(/[01OIL]/);
    }
  });

  it('join tokens are 24 url-safe chars and differ', () => {
    const a = makeDemoJoinToken();
    expect(a).toMatch(/^[A-Za-z0-9]{24}$/);
    expect(makeDemoJoinToken()).not.toBe(a);
  });
});

describe('formatting', () => {
  it('formats in IST regardless of host timezone', () => {
    expect(formatDemoDateTime(istDateTime('2025-10-14', '18:30'))).toBe('Tue, 14 Oct at 6:30 PM');
  });
  it('formats a preference', () => {
    expect(formatDemoPreference('2025-10-14', 'evening')).toBe('Tue, 14 Oct, Evening (6 PM to 8:30 PM)');
    expect(formatDemoPreference(null, 'anytime')).toBe('Any time, call me');
  });
});

describe('isJoinOpen', () => {
  const start = istDateTime('2025-10-14', '18:00');
  it('opens 15 minutes before and closes at the end', () => {
    expect(isJoinOpen(start, 45, new Date(start.getTime() - 16 * 60_000))).toBe(false);
    expect(isJoinOpen(start, 45, new Date(start.getTime() - 15 * 60_000))).toBe(true);
    expect(isJoinOpen(start, 45, new Date(start.getTime() + 46 * 60_000))).toBe(false);
  });
});

describe('calendar links', () => {
  const e = {
    title: 'Neram free demo class',
    start: istDateTime('2025-10-14', '18:30'),
    minutes: 45,
    details: 'Parents welcome, ask your doubts.',
    url: 'https://neramclasses.com/d/abc',
    uid: 'DEMO-4K7Q',
  };
  it('google link carries exact UTC instants', () => {
    const u = new URL(googleCalendarUrl(e));
    expect(u.searchParams.get('dates')).toBe('20251014T130000Z/20251014T134500Z');
  });
  it('ics escapes commas and uses PUBLISH', () => {
    const ics = demoIcs(e, new Date('2025-10-13T00:00:00Z'));
    expect(ics).toContain('METHOD:PUBLISH');
    expect(ics).toContain('DTSTART:20251014T130000Z');
    expect(ics).toContain('Parents welcome\\, ask');
  });
});

describe('resolveDemoSettings', () => {
  it('fills defaults and normalises hosts', () => {
    const s = resolveDemoSettings({
      hosts: [{ upn: ' Hari@NeramClasses.com ', name: 'Hari' }, { upn: 'bad' }],
      drawingWhatsApp: '+91 91761 37043',
      youtube_video_url: ' https://youtu.be/x ',
    });
    expect(s.hosts).toEqual([{ upn: 'hari@neramclasses.com', name: 'Hari', notifyNewRequests: true }]);
    expect(s.defaultTutorUpn).toBe('hari@neramclasses.com');
    expect(s.drawingWhatsApp).toBe('919176137043');
    expect(s.youtubeUrl).toBe('https://youtu.be/x');
    expect(s.callbackPromise).toBe('within 2 working hours');
    expect(publicDemoSettings(s)).not.toHaveProperty('hosts');
  });

  it('drawing link carries the ref', () => {
    expect(drawingWhatsAppLink('919176137043', 'DEMO-4K7Q')).toContain('DEMO-4K7Q');
    expect(drawingWhatsAppLink('919176137043', 'DEMO-4K7Q')).toMatch(/^https:\/\/wa\.me\/919176137043\?text=/);
  });
});

describe('demo team', () => {
  const team = resolveDemoSettings({
    hosts: [
      { upn: 'Haribabu@neramclasses.com', name: 'Hari', notifyNewRequests: false },
      { upn: 'TamilSelvan@neramclasses.com', name: 'Tamil Selvan' },
    ],
    defaultTutorUpn: 'haribabu@neramclasses.com',
  });

  it('keeps the default tutor and per-member new-request pings', () => {
    expect(team.defaultTutorUpn).toBe('haribabu@neramclasses.com');
    expect(team.hosts.map((h) => h.notifyNewRequests)).toEqual([false, true]);
    expect(resolveDemoSettings({ hosts: team.hosts, defaultTutorUpn: 'gone@x.com' }).defaultTutorUpn).toBe(
      'haribabu@neramclasses.com',
    );
  });

  it('names the tutor, falling back to the organizer', () => {
    expect(demoTutorName(team, { tutor_upn: 'TamilSelvan@neramclasses.com' })).toBe('Tamil Selvan');
    expect(demoTutorName(team, { tutor_upn: null, organizer_upn: 'haribabu@neramclasses.com' })).toBe('Hari');
    expect(demoTutorName(team, {})).toBeNull();
  });

  it('plans 8 AM pings for everyone and a 15-minute ping for the tutor', () => {
    const start = istDateTime('2025-10-14', '18:00');
    const plan = staffReminderPlan(start, new Date('2025-10-13T10:00:00Z'), ['a@x', 'b@x'], 'a@x');
    expect(plan.map((p) => `${p.kind}:${p.upn}`)).toEqual(['staff_day:a@x', 'staff_day:b@x', 'staff_soon:a@x']);
    expect(plan[2].sendAfter.toISOString()).toBe('2025-10-14T12:15:00.000Z');
  });

  it('skips the morning ping once it has passed', () => {
    const start = istDateTime('2025-10-14', '18:00');
    const plan = staffReminderPlan(start, new Date('2025-10-14T06:00:00Z'), ['a@x'], 'a@x');
    expect(plan.map((p) => p.kind)).toEqual(['staff_soon']);
  });
});
