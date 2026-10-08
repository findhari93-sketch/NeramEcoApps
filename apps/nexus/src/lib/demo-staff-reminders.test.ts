import { describe, it, expect } from 'vitest';
import { DEFAULT_DEMO_SCHEDULE, istDateTime, type DemoRequest } from '@neram/database';
import { buildStaffReminder, staffReminderSkipReason } from './demo-staff-reminders';

const start = istDateTime('2025-10-14', '18:30');
const r = {
  id: 'r1',
  name: 'Priya Ramesh',
  current_class: '12th',
  phone: '9876543210',
  ref_code: 'DEMO-4K7Q',
  status: 'approved',
  scheduled_start: start.toISOString(),
  scheduled_minutes: 45,
  preferred_date: '2025-10-14',
  preferred_window: 'evening',
  parent_joining: true,
  teams_join_url: 'https://teams.microsoft.com/l/meetup-join/x',
  next_contact_at: null,
} as unknown as DemoRequest;

const ctx = { tutorName: 'Hari', adminOrigin: 'https://admin.neramclasses.com', schedule: DEFAULT_DEMO_SCHEDULE };

describe('staffReminderSkipReason', () => {
  const morning = istDateTime('2025-10-14', '08:00');
  it('sends the morning ping for a confirmed demo that day', () => {
    expect(staffReminderSkipReason({ kind: 'staff_day', send_after: morning.toISOString() }, r, morning)).toBeNull();
  });
  it('skips the morning ping when the demo moved to another day', () => {
    const moved = { ...r, scheduled_start: istDateTime('2025-10-15', '18:30').toISOString() };
    expect(staffReminderSkipReason({ kind: 'staff_day', send_after: morning.toISOString() }, moved, morning)).toMatch(/another day/);
  });
  it('drops a new-request ping once someone has called', () => {
    expect(
      staffReminderSkipReason({ kind: 'staff_new_request', send_after: morning.toISOString() }, { ...r, status: 'contacted' }, morning),
    ).toMatch(/contacted/);
  });
  it('drops a call-back ping whose time was changed', () => {
    const at = istDateTime('2025-10-14', '11:00');
    const req = { ...r, status: 'contacted', next_contact_at: istDateTime('2025-10-14', '15:00').toISOString() } as DemoRequest;
    expect(staffReminderSkipReason({ kind: 'staff_callback', send_after: at.toISOString() }, req, at)).toMatch(/changed/);
  });
});

describe('buildStaffReminder', () => {
  it('new request: preference, phone and a link to the desk', () => {
    const n = buildStaffReminder({ kind: 'staff_new_request' }, { ...r, status: 'pending' } as DemoRequest, ctx);
    expect(n.subject).toBe('New demo request: Priya');
    expect(n.plain).toContain('Tue, 14 Oct, Evening');
    expect(n.plain).toContain('+91 98765 43210');
    expect(n.link.url).toBe('https://admin.neramclasses.com/demo-classes?id=r1');
  });
  it('15 minutes before: time and a Join button', () => {
    const n = buildStaffReminder({ kind: 'staff_soon' }, r, ctx);
    expect(n.subject).toBe('Demo starts in 15 minutes: Priya');
    expect(n.plain).toContain('6:30 PM with Priya Ramesh (Class 12), with a parent');
    expect(n.link).toEqual({ url: r.teams_join_url, label: 'Join the demo' });
  });
  it('never uses em dashes', () => {
    for (const kind of ['staff_new_request', 'staff_callback', 'staff_day', 'staff_soon'] as const) {
      const n = buildStaffReminder({ kind }, r, ctx);
      expect(`${n.subject} ${n.plain}`).not.toMatch(/—|--/);
    }
  });
});
