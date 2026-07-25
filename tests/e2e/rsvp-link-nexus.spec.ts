import { test, expect } from '@playwright/test';

/**
 * Shareable RSVP link + post-class insights — Nexus API.
 *
 * Covers:
 *  - GET /api/timetable/rsvp/context (backs the /student/rsvp/[classId] page):
 *    default-attending, decline writes a row, re-attend clears it.
 *  - GET /api/timetable/class-insights (teacher RSVP-vs-actual dashboard): shape + auth.
 *
 * API-level via test-login (bypasses Microsoft auth), same pattern as timetable specs.
 */

let teacherToken: string;
let studentToken: string;
let classroomId: string;
let classId: string;

test.describe('Nexus RSVP link + insights', () => {
  test.describe.configure({ mode: 'serial' });
  test.use({ baseURL: 'http://localhost:3012' });

  test('setup: tokens, classroom, and a class', async ({ request }) => {
    const t = await request.post('/api/auth/test-login', {
      data: { email: 'e2etestingteacher@neramclasses.com', role: 'teacher' },
    });
    expect(t.status()).toBe(200);
    teacherToken = (await t.json()).testToken;

    const s = await request.post('/api/auth/test-login', {
      data: { email: 'e2etestingstudent@neramclasses.com', role: 'student' },
    });
    expect(s.status()).toBe(200);
    studentToken = (await s.json()).testToken;

    // Use the classroom the TEACHER manages (the student is enrolled there too), so the
    // teacher can create the class AND the student's RSVP context resolves.
    const me = await request.get('/api/auth/me', { headers: { Authorization: `Bearer ${teacherToken}` } });
    expect(me.status()).toBe(200);
    const classrooms: Array<{ id: string; enrollmentRole?: string; is_archived?: boolean }> =
      (await me.json()).classrooms || [];
    const managed = classrooms.find((c) => c.enrollmentRole === 'teacher' && !c.is_archived) || classrooms[0];
    expect(managed, 'teacher needs a manageable classroom').toBeTruthy();
    classroomId = managed!.id;

    const created = await request.post('/api/timetable', {
      headers: { Authorization: `Bearer ${teacherToken}` },
      data: {
        classroom_id: classroomId,
        title: 'E2E RSVP Class',
        scheduled_date: '2026-06-28',
        start_time: '19:00',
        end_time: '20:30',
      },
    });
    expect(created.status()).toBe(201);
    classId = (await created.json()).class.id;
    expect(classId).toBeTruthy();
  });

  test('context: student is attending by default', async ({ request }) => {
    const res = await request.get(`/api/timetable/rsvp/context?class_id=${classId}`, {
      headers: { Authorization: `Bearer ${studentToken}` },
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.class.id).toBe(classId);
    expect(body.class.classroom_id).toBe(classroomId);
    expect(body.myRsvp).toBeNull(); // default-attending
  });

  test('context: decline writes a row, re-attend clears it', async ({ request }) => {
    // Decline with a reason.
    const decline = await request.post('/api/timetable/rsvp', {
      headers: { Authorization: `Bearer ${studentToken}` },
      data: { class_id: classId, classroom_id: classroomId, response: 'not_attending', reason_code: 'unwell' },
    });
    expect(decline.status()).toBe(200);

    const after = await request.get(`/api/timetable/rsvp/context?class_id=${classId}`, {
      headers: { Authorization: `Bearer ${studentToken}` },
    });
    expect((await after.json()).myRsvp?.response).toBe('not_attending');

    // Flip back to attending — the row is deleted.
    const attend = await request.post('/api/timetable/rsvp', {
      headers: { Authorization: `Bearer ${studentToken}` },
      data: { class_id: classId, classroom_id: classroomId, response: 'attending' },
    });
    expect(attend.status()).toBe(200);

    const cleared = await request.get(`/api/timetable/rsvp/context?class_id=${classId}`, {
      headers: { Authorization: `Bearer ${studentToken}` },
    });
    expect((await cleared.json()).myRsvp).toBeNull();
  });

  test('context: missing class_id returns 400', async ({ request }) => {
    const res = await request.get('/api/timetable/rsvp/context', {
      headers: { Authorization: `Bearer ${studentToken}` },
      failOnStatusCode: false,
    });
    expect(res.status()).toBe(400);
  });

  test('insights: teacher gets reconciled buckets', async ({ request }) => {
    const res = await request.get(`/api/timetable/class-insights?class_id=${classId}&classroom_id=${classroomId}`, {
      headers: { Authorization: `Bearer ${teacherToken}` },
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.summary).toBeTruthy();
    expect(typeof body.summary.rosterSize).toBe('number');
    expect(body.buckets).toHaveProperty('attendingAttended');
    expect(body.buckets).toHaveProperty('attendingAbsent');
    expect(Array.isArray(body.students)).toBe(true);
  });

  test('insights: student is forbidden (403)', async ({ request }) => {
    const res = await request.get(`/api/timetable/class-insights?class_id=${classId}&classroom_id=${classroomId}`, {
      headers: { Authorization: `Bearer ${studentToken}` },
      failOnStatusCode: false,
    });
    expect(res.status()).toBe(403);
  });

  test('cleanup: delete the class', async ({ request }) => {
    await request.delete('/api/timetable', {
      headers: { Authorization: `Bearer ${teacherToken}` },
      data: { id: classId, classroom_id: classroomId, permanent: true },
      failOnStatusCode: false,
    });
  });
});
