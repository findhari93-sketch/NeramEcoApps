/**
 * Timetable phase 2: default-attending RSVP.
 *
 * The model under test: every enrolled student is attending every class unless
 * they say otherwise. Only opt-outs are stored, so the ABSENCE of a row means
 * attending and there is no "no response" state.
 *
 * Proves the parts that would silently rot:
 *  - A student who never responds is counted as attending, not as unanswered.
 *  - Declining requires a reason code; "other" additionally requires a note.
 *  - Opting back in DELETES the row rather than writing response='attending'.
 *  - Neither the RSVP endpoint nor the dashboard reports a no_response bucket.
 *
 * Mutates the E2E test student's RSVP on a real class, then restores the
 * default (attending) in an afterAll, so re-runs start clean.
 *
 * Run: pnpm test:e2e tests/e2e/timetable-rsvp-default-nexus.spec.ts --project=nexus-chrome --no-deps
 */

import { test, expect } from '@playwright/test';
import { getTestAuthToken, APP_URLS } from '../utils/credentials';

test.use({ storageState: { cookies: [], origins: [] } });

const NEXUS = APP_URLS.nexus;

/** A wide window, so the spec finds a class whenever the classroom has any. */
function wideRange(): { start: string; end: string } {
  const iso = (d: Date) =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  const now = new Date();
  const from = new Date(now);
  from.setDate(now.getDate() - 120);
  const to = new Date(now);
  to.setDate(now.getDate() + 120);
  return { start: iso(from), end: iso(to) };
}

test.describe('Default-attending RSVP', () => {
  test.describe.configure({ mode: 'serial', timeout: 120_000 });

  let studentToken: string | null = null;
  let teacherToken: string | null = null;
  let classId: string | null = null;
  let classroomId: string | null = null;

  test('setup: find a class the test student can RSVP to', async ({ request }) => {
    const student = await getTestAuthToken(request, 'student');
    const teacher = await getTestAuthToken(request, 'teacher');
    test.skip(!student || !teacher, 'Test auth not configured');
    studentToken = student!.testToken;
    teacherToken = teacher!.testToken;

    const { start, end } = wideRange();
    const res = await request.get(`${NEXUS}/api/timetable/my-schedule?start=${start}&end=${end}`, {
      headers: { Authorization: `Bearer ${studentToken}` },
    });
    expect(res.ok()).toBe(true);

    const { classes } = await res.json();
    const usable = (classes || []).find((c: any) => c.classroom?.id);
    test.skip(!usable, 'Test student has no scheduled class to RSVP to');

    classId = usable.id;
    classroomId = usable.classroom.id;
  });

  test('AC1: a student who never responds is attending, with no pending state', async ({ request }) => {
    test.skip(!classId, 'No class');

    // Start from the default by removing any opt-out left by a prior run.
    await request.post(`${NEXUS}/api/timetable/rsvp`, {
      headers: { Authorization: `Bearer ${studentToken}`, 'Content-Type': 'application/json' },
      data: { class_id: classId, classroom_id: classroomId, response: 'attending' },
    });

    const mine = await request.get(
      `${NEXUS}/api/timetable/rsvp?class_id=${classId}&classroom_id=${classroomId}`,
      { headers: { Authorization: `Bearer ${studentToken}` } },
    );
    expect(mine.ok()).toBe(true);
    // No row is the representation of "attending".
    expect((await mine.json()).rsvp).toBeNull();

    const teacherView = await request.get(
      `${NEXUS}/api/timetable/rsvp?class_id=${classId}&classroom_id=${classroomId}`,
      { headers: { Authorization: `Bearer ${teacherToken}` } },
    );
    expect(teacherView.ok()).toBe(true);
    const body = await teacherView.json();

    expect(body.summary).toBeTruthy();
    expect(body.summary).not.toHaveProperty('no_response');
    // Nobody opted out, so attending must equal the whole roster.
    expect(body.summary.attending).toBe(body.summary.total);
    expect(body.optedOut).toEqual([]);
  });

  test('AC2: declining without a reason code is rejected', async ({ request }) => {
    test.skip(!classId, 'No class');

    const res = await request.post(`${NEXUS}/api/timetable/rsvp`, {
      headers: { Authorization: `Bearer ${studentToken}`, 'Content-Type': 'application/json' },
      data: { class_id: classId, classroom_id: classroomId, response: 'not_attending' },
    });
    expect(res.status()).toBe(400);
  });

  test('AC3: an unknown reason code is rejected before it reaches the CHECK constraint', async ({ request }) => {
    test.skip(!classId, 'No class');

    const res = await request.post(`${NEXUS}/api/timetable/rsvp`, {
      headers: { Authorization: `Bearer ${studentToken}`, 'Content-Type': 'application/json' },
      data: {
        class_id: classId,
        classroom_id: classroomId,
        response: 'not_attending',
        reason_code: 'network',
      },
    });
    // A 400 here, not a 500: the route validates rather than letting Postgres throw.
    expect(res.status()).toBe(400);
  });

  test('AC4: "other" additionally requires a note', async ({ request }) => {
    test.skip(!classId, 'No class');

    const bare = await request.post(`${NEXUS}/api/timetable/rsvp`, {
      headers: { Authorization: `Bearer ${studentToken}`, 'Content-Type': 'application/json' },
      data: {
        class_id: classId,
        classroom_id: classroomId,
        response: 'not_attending',
        reason_code: 'other',
      },
    });
    expect(bare.status()).toBe(400);

    // Whitespace is not a note.
    const blank = await request.post(`${NEXUS}/api/timetable/rsvp`, {
      headers: { Authorization: `Bearer ${studentToken}`, 'Content-Type': 'application/json' },
      data: {
        class_id: classId,
        classroom_id: classroomId,
        response: 'not_attending',
        reason_code: 'other',
        reason: '   ',
      },
    });
    expect(blank.status()).toBe(400);
  });

  test('AC5: a one-tap reason opts the student out and lands on the teacher view', async ({ request }) => {
    test.skip(!classId, 'No class');

    const res = await request.post(`${NEXUS}/api/timetable/rsvp`, {
      headers: { Authorization: `Bearer ${studentToken}`, 'Content-Type': 'application/json' },
      data: {
        class_id: classId,
        classroom_id: classroomId,
        response: 'not_attending',
        reason_code: 'unwell',
        wants_catchup: true,
      },
    });
    expect(res.ok()).toBe(true);

    const saved = (await res.json()).rsvp;
    expect(saved.response).toBe('not_attending');
    expect(saved.reason_code).toBe('unwell');
    expect(saved.wants_catchup).toBe(true);

    const teacherView = await request.get(
      `${NEXUS}/api/timetable/rsvp?class_id=${classId}&classroom_id=${classroomId}`,
      { headers: { Authorization: `Bearer ${teacherToken}` } },
    );
    const body = await teacherView.json();
    expect(body.optedOut.length).toBe(1);
    expect(body.optedOut[0].reason_code).toBe('unwell');
    expect(body.reasonTally.unwell).toBe(1);
    // Attending is derived, so one opt-out must reduce it by exactly one.
    expect(body.summary.attending).toBe(body.summary.total - 1);
  });

  test('AC6: opting back in deletes the row rather than writing "attending"', async ({ request }) => {
    test.skip(!classId, 'No class');

    const res = await request.post(`${NEXUS}/api/timetable/rsvp`, {
      headers: { Authorization: `Bearer ${studentToken}`, 'Content-Type': 'application/json' },
      data: { class_id: classId, classroom_id: classroomId, response: 'attending' },
    });
    expect(res.ok()).toBe(true);
    const body = await res.json();
    expect(body.rsvp).toBeNull();
    expect(body.attending).toBe(true);

    // The proof it was deleted, not flipped: nothing comes back for the student,
    // and the teacher's opt-out list is empty again.
    const mine = await request.get(
      `${NEXUS}/api/timetable/rsvp?class_id=${classId}&classroom_id=${classroomId}`,
      { headers: { Authorization: `Bearer ${studentToken}` } },
    );
    expect((await mine.json()).rsvp).toBeNull();

    const teacherView = await request.get(
      `${NEXUS}/api/timetable/rsvp?class_id=${classId}&classroom_id=${classroomId}`,
      { headers: { Authorization: `Bearer ${teacherToken}` } },
    );
    const t = await teacherView.json();
    expect(t.optedOut).toEqual([]);
    expect(t.summary.attending).toBe(t.summary.total);
  });

  test('AC7: my-schedule reports only opt-outs, so an absent key means attending', async ({ request }) => {
    test.skip(!classId, 'No class');

    const { start, end } = wideRange();
    const res = await request.get(`${NEXUS}/api/timetable/my-schedule?start=${start}&end=${end}`, {
      headers: { Authorization: `Bearer ${studentToken}` },
    });
    const { rsvps } = await res.json();

    // The student is attending everything right now, so the map has no entry
    // for this class at all.
    expect(rsvps[classId!]).toBeUndefined();
    // And nothing in the map is ever an 'attending' row.
    for (const value of Object.values(rsvps as Record<string, any>)) {
      expect(value.response).toBe('not_attending');
    }
  });

  test('AC8: the dashboard has no no_response bucket', async ({ request }) => {
    test.skip(!classId, 'No class');

    const res = await request.get(
      `${NEXUS}/api/timetable/rsvp-dashboard?classroom_id=${classroomId}&class_id=${classId}`,
      { headers: { Authorization: `Bearer ${teacherToken}` } },
    );
    expect(res.ok()).toBe(true);

    const body = await res.json();
    expect(body).not.toHaveProperty('no_response');
    expect(body.summary).not.toHaveProperty('no_response');
    expect(body.reason_tally).toBeTruthy();
    // Attending plus opted out accounts for the entire roster: nobody is pending.
    expect(body.summary.attending + body.summary.not_attending).toBe(body.summary.total);
  });

  test.afterAll(async ({ request }) => {
    // Leave the account on the default so a re-run starts clean.
    if (classId && classroomId && studentToken) {
      await request
        .post(`${NEXUS}/api/timetable/rsvp`, {
          headers: { Authorization: `Bearer ${studentToken}`, 'Content-Type': 'application/json' },
          data: { class_id: classId, classroom_id: classroomId, response: 'attending' },
        })
        .catch(() => {});
    }
  });
});
