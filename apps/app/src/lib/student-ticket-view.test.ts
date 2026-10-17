import { describe, test, expect } from 'vitest';
import { eventLine, staffLabel, toStudentListRow } from './student-ticket-view';
import { planCapture, FULL_PAGE_MAX_HEIGHT } from './capture-screenshot';
import { strongestHide } from '@/components/ReporterAccessContext';
import type { SupportTicket } from '@neram/database';

describe('staffLabel', () => {
  test('first name only, "from Neram"', () => {
    expect(staffLabel('Priya Raman')).toBe('Priya from Neram');
    expect(staffLabel('  Arun  ')).toBe('Arun from Neram');
  });
  test('no name, or the team name, reads as Neram Support', () => {
    expect(staffLabel(null)).toBe('Neram Support');
    expect(staffLabel('')).toBe('Neram Support');
    expect(staffLabel('Neram Support')).toBe('Neram Support');
  });
});

describe('toStudentListRow', () => {
  const base = {
    id: 't1',
    ticket_number: 'NERAM-TKT-00001',
    category: 'other',
    subject: 'Hi',
    status: 'in_progress',
    console_logs: [{ message: 'secret' }],
    device_info: { ua: 'secret' },
    created_at: '2026-10-01T00:00:00.000Z',
    updated_at: '2026-10-01T00:00:00.000Z',
  } as unknown as SupportTicket;

  test('drops console logs and device info', () => {
    const row = toStudentListRow(base) as unknown as Record<string, unknown>;
    expect(row).not.toHaveProperty('console_logs');
    expect(row).not.toHaveProperty('device_info');
  });

  test('has_unread only when staff replied after the student last looked', () => {
    const reply = { last_reply_at: '2026-10-02T00:00:00.000Z' };
    expect(toStudentListRow({ ...base, ...reply, last_reply_by: 'staff', student_seen_at: null }).has_unread).toBe(true);
    expect(
      toStudentListRow({ ...base, ...reply, last_reply_by: 'staff', student_seen_at: '2026-10-03T00:00:00.000Z' }).has_unread,
    ).toBe(false);
    expect(toStudentListRow({ ...base, ...reply, last_reply_by: 'student', student_seen_at: null }).has_unread).toBe(false);
  });
});

describe('eventLine', () => {
  test('student and staff wording, with no em dashes', () => {
    const lines = [
      eventLine({ action: 'created', actor_label: 'You', old_status: null }),
      eventLine({ action: 'started', actor_label: 'Priya from Neram', old_status: 'open' }),
      eventLine({ action: 'reopened', actor_label: 'You', old_status: 'closed' }),
      eventLine({ action: 'auto_closed', actor_label: 'Neram Support', old_status: 'waiting_on_student' }),
    ];
    expect(lines).toEqual([
      'You sent this request',
      'Priya from Neram started working on it',
      'You said it is still happening',
      'Closed, as we did not hear back',
    ]);
    for (const l of lines) expect(l).not.toMatch(/—|--/);
  });

  test('staff-only steps are left out', () => {
    expect(eventLine({ action: 'priority_changed', actor_label: 'x', old_status: null })).toBeNull();
    expect(eventLine({ action: 'assigned', actor_label: 'x', old_status: null })).toBeNull();
  });
});

describe('planCapture', () => {
  test('captures the whole page when it is a normal length', () => {
    expect(planCapture({ pageHeight: 2400, viewportHeight: 800, devicePixelRatio: 3 })).toEqual({
      mode: 'full',
      height: 2400,
      scale: 2,
    });
  });
  test('drops to 1x for long pages to keep the canvas small', () => {
    expect(planCapture({ pageHeight: 6000, viewportHeight: 800, devicePixelRatio: 2 })).toEqual({
      mode: 'full',
      height: 6000,
      scale: 1,
    });
  });
  test('falls back to the visible screen past the height limit', () => {
    expect(planCapture({ pageHeight: FULL_PAGE_MAX_HEIGHT + 1, viewportHeight: 812, devicePixelRatio: 2 })).toEqual({
      mode: 'viewport',
      height: 812,
      scale: 2,
    });
  });
  test('never shorter than the screen', () => {
    expect(planCapture({ pageHeight: 300, viewportHeight: 812, devicePixelRatio: 1 }).height).toBe(812);
  });
});

describe('strongestHide', () => {
  test('all beats md beats sm, and no request is null', () => {
    expect(strongestHide([])).toBeNull();
    expect(strongestHide(['sm'])).toBe('sm');
    expect(strongestHide(['sm', 'md'])).toBe('md');
    expect(strongestHide(['md', 'all', 'sm'])).toBe('all');
  });
});
