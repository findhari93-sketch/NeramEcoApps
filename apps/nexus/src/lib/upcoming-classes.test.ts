// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { fakeDb } from '@/lib/assistant/testing/fake-db';
import { dropEnded, loadDeclinedClassIds, loadUpcomingClasses } from './upcoming-classes';

const cls = (id: string, date: string, start: string, end: string, status = 'scheduled') => ({
  id, title: `Class ${id}`, classroom_id: 'c1', scheduled_date: date, start_time: start, end_time: end, status, teams_meeting_url: null,
});

describe('dropEnded', () => {
  it('drops a class today whose end time has passed and keeps everything else', () => {
    const rows = [cls('a', '2026-10-03', '16:00', '17:00'), cls('b', '2026-10-03', '18:00', '19:30'), cls('c', '2026-10-04', '09:00', '10:00')];
    expect(dropEnded(rows, '2026-10-03', '17:30').map((r) => r.id)).toEqual(['b', 'c']);
  });
  it('keeps a class that is live right now', () => {
    const rows = [cls('a', '2026-10-03', '16:00', '17:00')];
    expect(dropEnded(rows, '2026-10-03', '16:30')).toHaveLength(1);
  });
});

describe('loadUpcomingClasses', () => {
  it('returns scheduled and live classes from today on, in order, after dropping ended ones', async () => {
    const db = fakeDb({
      nexus_scheduled_classes: [
        cls('old', '2026-10-01', '18:00', '19:00'),
        cls('done', '2026-10-03', '10:00', '11:00'),
        cls('cancelled', '2026-10-04', '18:00', '19:00', 'cancelled'),
        cls('tonight', '2026-10-03', '18:00', '19:30'),
        cls('tomorrow', '2026-10-04', '18:00', '19:30'),
        { ...cls('other', '2026-10-04', '18:00', '19:30'), classroom_id: 'c2' },
      ],
    });
    const rows = await loadUpcomingClasses(db, 'c1', { today: '2026-10-03', nowHHMM: '12:00', limit: 5 });
    expect(rows.map((r) => r.id)).toEqual(['tonight', 'tomorrow']);
  });
  it('applies the limit after dropping, so an ended class does not steal a slot', async () => {
    const db = fakeDb({
      nexus_scheduled_classes: [cls('done', '2026-10-03', '10:00', '11:00'), cls('a', '2026-10-04', '18:00', '19:00'), cls('b', '2026-10-05', '18:00', '19:00')],
    });
    const rows = await loadUpcomingClasses(db, 'c1', { today: '2026-10-03', nowHHMM: '12:00', limit: 2 });
    expect(rows.map((r) => r.id)).toEqual(['a', 'b']);
  });
});

describe('loadDeclinedClassIds', () => {
  it('returns only not_attending rows of this student among the given classes', async () => {
    const db = fakeDb({
      nexus_class_rsvp: [
        { scheduled_class_id: 'a', student_id: 's1', response: 'not_attending' },
        { scheduled_class_id: 'b', student_id: 's1', response: 'attending' },
        { scheduled_class_id: 'c', student_id: 's2', response: 'not_attending' },
      ],
    });
    expect([...(await loadDeclinedClassIds(db, 's1', ['a', 'b', 'c']))]).toEqual(['a']);
    expect((await loadDeclinedClassIds(db, 's1', [])).size).toBe(0);
  });
});
