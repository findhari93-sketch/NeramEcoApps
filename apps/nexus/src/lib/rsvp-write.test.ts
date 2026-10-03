// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';
import { fakeDb } from '@/lib/assistant/testing/fake-db';
import { writeRsvp } from './rsvp-write';

function db() {
  return fakeDb({
    users: [{ id: 's1', name: 'Priya S' }],
    nexus_enrollments: [{ user_id: 's1', classroom_id: 'c1', role: 'student', is_active: true }],
    nexus_scheduled_classes: [{ id: 'k1', title: 'Perspective', classroom_id: 'c1' }],
    nexus_class_rsvp: [],
  });
}

describe('writeRsvp', () => {
  it('rejects a bad response value and a missing reason', async () => {
    expect(await writeRsvp(db(), { userId: 's1', classId: 'k1', response: 'maybe' as any })).toMatchObject({ ok: false, status: 400 });
    expect(await writeRsvp(db(), { userId: 's1', classId: 'k1', response: 'not_attending' })).toMatchObject({ ok: false, status: 400 });
    expect(await writeRsvp(db(), { userId: 's1', classId: 'k1', response: 'not_attending', reasonCode: 'other' })).toMatchObject({
      ok: false, status: 400, error: expect.stringMatching(/Tell us a little more/),
    });
  });

  it('404s an unknown class and 403s a student not enrolled in its classroom', async () => {
    expect(await writeRsvp(db(), { userId: 's1', classId: 'nope', response: 'not_attending', reasonCode: 'unwell' })).toMatchObject({ ok: false, status: 404 });
    expect(await writeRsvp(db(), { userId: 's9', classId: 'k1', response: 'not_attending', reasonCode: 'unwell' })).toMatchObject({ ok: false, status: 403 });
  });

  it('stores the opt-out, notifies the teachers once, and reports the class title', async () => {
    const d = db();
    const notify = vi.fn(async () => undefined);
    const out = await writeRsvp(d, { userId: 's1', classId: 'k1', response: 'not_attending', reasonCode: 'unwell', wantsCatchup: true }, { notify });
    expect(out).toMatchObject({ ok: true, attending: false, classTitle: 'Perspective', classroomId: 'c1' });
    expect(d.rows('nexus_class_rsvp')[0]).toMatchObject({ scheduled_class_id: 'k1', student_id: 's1', response: 'not_attending', reason_code: 'unwell', reason: null, wants_catchup: true });
    expect(notify).toHaveBeenCalledWith('c1', 'Priya S', 'not_attending', null, 'Perspective', 'k1');
  });

  it('opting back in deletes the row and notifies nobody', async () => {
    const d = db();
    const notify = vi.fn(async () => undefined);
    await writeRsvp(d, { userId: 's1', classId: 'k1', response: 'not_attending', reasonCode: 'family' }, { notify });
    const out = await writeRsvp(d, { userId: 's1', classId: 'k1', response: 'attending' }, { notify });
    expect(out).toMatchObject({ ok: true, attending: true });
    expect(d.rows('nexus_class_rsvp')).toHaveLength(0);
    expect(notify).toHaveBeenCalledTimes(1);
  });

  it('a notification failure never loses the RSVP', async () => {
    const d = db();
    const notify = vi.fn(async () => { throw new Error('teams down'); });
    const out = await writeRsvp(d, { userId: 's1', classId: 'k1', response: 'not_attending', reasonCode: 'clash' }, { notify });
    expect(out.ok).toBe(true);
    expect(d.rows('nexus_class_rsvp')).toHaveLength(1);
  });
});
