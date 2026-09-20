/**
 * "That was not a class."
 *
 * On 2026-09-18 the tutor opened the meeting only to say the class was
 * postponed for school exams. Nineteen people were in the room, nothing was
 * taught, and seventeen students were left owing a catch-up for it. A teacher
 * had no way to say so: Cancel Class is hidden once a class has ended, and the
 * only remaining lever, Delete Permanently, cascades the attendance register
 * away with the class.
 *
 * These pin the four things that make it safe: it refuses a class that has not
 * finished, it never touches attendance, it cancels so the nightly cron cannot
 * re-create what it cleared, and its undo refuses to un-cancel a class that
 * really never ran.
 */
import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const PAST = { scheduled_date: '2026-09-01', start_time: '19:00:00', end_time: '20:30:00' };
const FUTURE = { scheduled_date: '2099-01-01', start_time: '19:00:00', end_time: '20:30:00' };

let tables: Record<string, any[]> = {};
let capable = true;
const readinessCalls: Array<{ recapId: string; patch: any }> = [];
const recomputed: Array<{ studentId: string; classId: string }> = [];

function builder(table: string) {
  const rows = () => (tables[table] ||= []);
  const filters: Array<(r: any) => boolean> = [];
  let op: 'select' | 'update' = 'select';
  let patch: any = null;
  let cap: number | null = null;

  const run = () => {
    let hit = rows().filter((r) => filters.every((f) => f(r)));
    if (op === 'update') hit.forEach((r) => Object.assign(r, patch));
    if (cap != null) hit = hit.slice(0, cap);
    return { data: hit, error: null };
  };

  const b: any = {
    select: () => b,
    update: (v: any) => ((op = 'update'), (patch = v), b),
    eq: (c: string, v: any) => (filters.push((r) => r[c] === v), b),
    is: (c: string, v: any) => (
      filters.push((r) => (v === null ? r[c] === null || r[c] === undefined : r[c] === v)), b
    ),
    limit: (n: number) => ((cap = n), b),
    maybeSingle: async () => ({ data: run().data[0] ?? null, error: null }),
    then: (resolve: any, reject?: any) => Promise.resolve(run()).then(resolve, reject),
  };
  return b;
}

vi.mock('@neram/database', () => ({
  getSupabaseAdminClient: () => ({ from: (t: string) => builder(t) }),
  setRecapReadiness: async (recapId: string, patch: any) => {
    readinessCalls.push({ recapId, patch });
    const recap = (tables.nexus_class_recaps || []).find((r) => r.id === recapId);
    if (recap) recap.readiness = patch.readiness;
  },
  recomputeCatchupItemCompletion: async (studentId: string, classId: string) => {
    recomputed.push({ studentId, classId });
  },
}));
vi.mock('@/lib/ms-verify', () => ({
  verifyMsToken: async () => ({ oid: 'teacher-oid' }),
}));
vi.mock('@/lib/staff-capabilities', () => ({ canUser: () => capable }));

import { POST } from './route';

function seed(over: { cls?: any; absences?: any[]; recap?: any } = {}) {
  tables = {
    users: [{ id: 'teacher-1', ms_oid: 'teacher-oid', user_type: 'teacher', can_teach: true }],
    nexus_classrooms: [{ id: 'room-1', is_archived: false }],
    nexus_scheduled_classes: [
      {
        id: 'class-1',
        classroom_id: 'room-1',
        title: 'Class Postponed Due to Exams',
        status: 'scheduled',
        ...PAST,
        ...(over.cls || {}),
      },
    ],
    nexus_class_absences: over.absences ?? [
      { id: 'a-1', scheduled_class_id: 'class-1', student_id: 's-1', excused_at: null, excused_by: null, excuse_note: null, caught_up_at: null },
      { id: 'a-2', scheduled_class_id: 'class-1', student_id: 's-2', excused_at: null, excused_by: null, excuse_note: null, caught_up_at: null },
    ],
    nexus_class_recaps: over.recap === null ? [] : [over.recap ?? { id: 'recap-1', scheduled_class_id: 'class-1', readiness: 'held' }],
    // Never read by the route. Present so a test can assert it is untouched.
    nexus_attendance: [
      { scheduled_class_id: 'class-1', student_id: 's-9', attended: true },
    ],
  };
}

function call(body: any = {}) {
  return POST(
    new NextRequest('http://localhost/api/timetable/class-1/not-taught', {
      method: 'POST',
      headers: { Authorization: 'Bearer t', 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }),
    { params: { classId: 'class-1' } },
  );
}

beforeEach(() => {
  capable = true;
  readinessCalls.length = 0;
  recomputed.length = 0;
  seed();
});

describe('marking a session as not a class', () => {
  it('cancels it, excuses everyone and closes the recap', async () => {
    const res = await call();
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body).toMatchObject({ ok: true, excused: 2, recapClosed: true });
    expect(tables.nexus_scheduled_classes[0].status).toBe('cancelled');
    expect(readinessCalls[0].patch.readiness).toBe('not_applicable');
  });

  it('leaves the attendance register completely alone', async () => {
    // The reason this exists rather than Delete Permanently, which cascades the
    // register, the recording and the transcript away with the class. Nineteen
    // people were in that room and the register should go on saying so.
    const before = JSON.stringify(tables.nexus_attendance);

    await call();

    expect(JSON.stringify(tables.nexus_attendance)).toBe(before);
  });

  it('refuses a class that has not finished yet', async () => {
    // Before the slot, Cancel Class is the right tool: it takes the Teams
    // meeting down and tells students. After it, both of those are wrong.
    seed({ cls: FUTURE });

    const res = await call();
    const body = await res.json();

    expect(res.status).toBe(400);
    expect(body.error).toContain('Cancel Class');
    expect(tables.nexus_scheduled_classes[0].status).toBe('scheduled');
  });

  it('refuses somebody who cannot change the timetable', async () => {
    capable = false;

    const res = await call();

    expect(res.status).toBe(403);
    expect(tables.nexus_scheduled_classes[0].status).toBe('scheduled');
  });

  it('refuses an archived classroom', async () => {
    tables.nexus_classrooms[0].is_archived = true;

    expect((await call()).status).toBe(403);
  });

  it('works on a class with no recap at all', async () => {
    seed({ recap: null });

    const body = await (await call()).json();

    expect(body).toMatchObject({ ok: true, excused: 2, recapClosed: false });
    expect(tables.nexus_scheduled_classes[0].status).toBe('cancelled');
  });

  it('recomputes completion only for the students it moved', async () => {
    await call();

    expect(recomputed.map((r) => r.studentId).sort()).toEqual(['s-1', 's-2']);
  });
});

describe('putting the class back', () => {
  it('un-cancels it, restores the obligations and re-queues the recap', async () => {
    await call();
    readinessCalls.length = 0;

    const body = await (await call({ undo: true })).json();

    expect(body).toMatchObject({ ok: true, restored: 2 });
    expect(tables.nexus_scheduled_classes[0].status).toBe('scheduled');
    // 'pending' rather than 'held': findAutodraftCandidates retries a pending
    // recap at once instead of making it wait out the stall window, so saying
    // "this was a class after all" puts it back in the queue now.
    expect(readinessCalls[0].patch.readiness).toBe('pending');
    expect(tables.nexus_class_absences.every((a) => a.excused_at === null)).toBe(true);
  });

  it('refuses a class that was cancelled some other way', async () => {
    // Load-bearing rather than fussy. Un-cancelling a class that genuinely
    // never ran hands it back to computeAbsencesForClass, which derives
    // absences for anything not cancelled, so the 21:00 cron would invent
    // obligations for a session nobody ever attended.
    seed({
      cls: { status: 'cancelled' },
      absences: [],
      recap: { id: 'recap-1', scheduled_class_id: 'class-1', readiness: 'held' },
    });

    const res = await call({ undo: true });
    const body = await res.json();

    expect(res.status).toBe(400);
    expect(body.error).toContain('cancelled some other way');
    expect(tables.nexus_scheduled_classes[0].status).toBe('cancelled');
  });
});
