// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';
import { fakeDb } from '@/lib/assistant/testing/fake-db';
import { declareAwayWindow, resolveStudentEnrolment } from './away-windows-write';

const today = '2026-10-03';

function db(windows: Record<string, unknown>[] = []) {
  return fakeDb({
    users: [{ id: 's1', name: 'Priya S', ms_oid: 'oid-1' }],
    nexus_enrollments: [{ user_id: 's1', classroom_id: 'c1', role: 'student', is_active: true }],
    nexus_student_away_windows: windows,
  });
}
const notify = () => vi.fn(async () => undefined);

describe('resolveStudentEnrolment', () => {
  it('finds the student by id or by Microsoft oid, and null otherwise', async () => {
    expect(await resolveStudentEnrolment(db(), { userId: 's1' })).toEqual({ user: { id: 's1', name: 'Priya S' }, classroomId: 'c1' });
    expect(await resolveStudentEnrolment(db(), { msOid: 'oid-1' })).toMatchObject({ classroomId: 'c1' });
    expect(await resolveStudentEnrolment(db(), { userId: 'nobody' })).toBeNull();
  });
});

describe('declareAwayWindow', () => {
  it('refuses a non-student', async () => {
    expect(await declareAwayWindow(db(), { userId: 'nobody', reasonCode: 'unwell', today }, { notify: notify() })).toMatchObject({ ok: false, status: 403 });
  });

  it('applies the date rules', async () => {
    const d = { notify: notify() };
    expect(await declareAwayWindow(db(), { userId: 's1', reasonCode: 'nope', today }, d)).toMatchObject({ ok: false, status: 400, error: 'Pick a reason.' });
    expect(await declareAwayWindow(db(), { userId: 's1', reasonCode: 'other', today }, d)).toMatchObject({ ok: false, status: 400 });
    expect(await declareAwayWindow(db(), { userId: 's1', reasonCode: 'unwell', startsOn: '2026-10-01', today }, d)).toMatchObject({ ok: false, status: 400 });
    expect(await declareAwayWindow(db(), { userId: 's1', reasonCode: 'unwell', startsOn: '2026-10-05', endsOn: '2026-10-04', today }, d)).toMatchObject({ ok: false, status: 400 });
    expect(await declareAwayWindow(db(), { userId: 's1', reasonCode: 'unwell', startsOn: today, endsOn: '2027-03-01', today }, d)).toMatchObject({ ok: false, status: 400 });
  });

  it('refuses an overlap with a live window and names it', async () => {
    const existing = { id: 'w1', student_id: 's1', starts_on: '2026-10-04', ends_on: '2026-10-06', reason_code: 'family', reason_note: null, source: 'student', cancelled_at: null, created_at: '2026-10-01T00:00:00Z' };
    const out = await declareAwayWindow(db([existing]), { userId: 's1', reasonCode: 'unwell', startsOn: '2026-10-05', endsOn: '2026-10-07', today }, { notify: notify() });
    expect(out).toMatchObject({ ok: false, status: 409, existingId: 'w1' });
  });

  it('inserts a student-sourced window and tells the teachers', async () => {
    const d = db();
    const n = notify();
    const out = await declareAwayWindow(d, { userId: 's1', reasonCode: 'clash', startsOn: '2026-10-05', endsOn: '2026-10-09', note: 'School exams', today }, { notify: n });
    expect(out).toMatchObject({ ok: true, classroomId: 'c1' });
    expect(d.rows('nexus_student_away_windows')[0]).toMatchObject({ student_id: 's1', starts_on: '2026-10-05', ends_on: '2026-10-09', reason_code: 'clash', reason_note: 'School exams', source: 'student', created_by: 's1' });
    expect(n).toHaveBeenCalledTimes(1);
    expect(out.ok && out.summary.length > 0).toBe(true);
  });

  it('defaults the start to today and allows an open end', async () => {
    const d = db();
    const out = await declareAwayWindow(d, { userId: 's1', reasonCode: 'unwell', today }, { notify: notify() });
    expect(out.ok).toBe(true);
    expect(d.rows('nexus_student_away_windows')[0]).toMatchObject({ starts_on: today, ends_on: null });
  });
});
