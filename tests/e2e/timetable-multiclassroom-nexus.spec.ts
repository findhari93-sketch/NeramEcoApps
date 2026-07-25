import { test, expect } from '@playwright/test';

/**
 * Multi-classroom Add Class + Course-Plan topic picker — Nexus API.
 *
 * Covers the two changes to the Add Class dialog:
 *  1. Classroom target is now a multi-select (`classroom_ids[]`); the POST creates one
 *     row per classroom. `classroom_id` (single) still works for backward compatibility.
 *  2. Topics come from the Course Plan Builder via GET /api/timetable/plan-topics
 *     (staff-only), written to `course_topic_id`.
 *
 * API-level via test-login (bypasses Microsoft auth), same pattern as timetable-nexus.spec.ts.
 */

// Resolved at setup from the teacher's actual enrollment, so the test survives
// classroom-per-year rollovers (hardcoded ids drift; see classroom_per_year).
let E2E_CLASSROOM_ID: string;

let teacherToken: string;
let studentToken: string;
const createdClassIds: string[] = [];

test.describe('Nexus Timetable — multi-classroom + plan topics', () => {
  test.describe.configure({ mode: 'serial' });
  test.use({ baseURL: 'http://localhost:3012' });

  // ─── SETUP ───

  test('setup: tokens + resolve teacher classroom', async ({ request }) => {
    const t = await request.post('/api/auth/test-login', {
      data: { email: 'e2etestingteacher@neramclasses.com', role: 'teacher' },
    });
    expect(t.status()).toBe(200);
    teacherToken = (await t.json()).testToken;
    expect(teacherToken).toBeTruthy();

    const s = await request.post('/api/auth/test-login', {
      data: { email: 'e2etestingstudent@neramclasses.com', role: 'student' },
    });
    expect(s.status()).toBe(200);
    studentToken = (await s.json()).testToken;
    expect(studentToken).toBeTruthy();

    // The classroom the teacher can actually manage (teacher role, not archived).
    const me = await request.get('/api/auth/me', {
      headers: { Authorization: `Bearer ${teacherToken}` },
    });
    expect(me.status()).toBe(200);
    const classrooms: Array<{ id: string; enrollmentRole?: string; is_archived?: boolean }> =
      (await me.json()).classrooms || [];
    const managed = classrooms.find((c) => c.enrollmentRole === 'teacher' && !c.is_archived) || classrooms[0];
    expect(managed, 'teacher should have a manageable classroom').toBeTruthy();
    E2E_CLASSROOM_ID = managed!.id;
  });

  // ─── MULTI-CLASSROOM CREATE ───

  test('create with classroom_ids[] returns one class per classroom', async ({ request }) => {
    const res = await request.post('/api/timetable', {
      headers: { Authorization: `Bearer ${teacherToken}` },
      data: {
        classroom_ids: [E2E_CLASSROOM_ID],
        title: 'E2E Multi-Classroom Class',
        scheduled_date: '2026-06-18',
        start_time: '10:00',
        end_time: '11:00',
      },
    });
    expect(res.status()).toBe(201);
    const body = await res.json();
    expect(body.classes).toBeInstanceOf(Array);
    expect(body.count).toBe(1);
    expect(body.classes[0].classroom_id).toBe(E2E_CLASSROOM_ID);
    // Single classroom → no shared meeting group.
    expect(body.meeting_group_id).toBeNull();
    createdClassIds.push(...body.classes.map((c: { id: string }) => c.id));
  });

  test('backward-compat: single classroom_id still returns `class`', async ({ request }) => {
    const res = await request.post('/api/timetable', {
      headers: { Authorization: `Bearer ${teacherToken}` },
      data: {
        classroom_id: E2E_CLASSROOM_ID,
        title: 'E2E Legacy Single Class',
        scheduled_date: '2026-06-18',
        start_time: '12:00',
        end_time: '13:00',
      },
    });
    expect(res.status()).toBe(201);
    const body = await res.json();
    expect(body.class?.title).toBe('E2E Legacy Single Class');
    createdClassIds.push(body.class.id);
  });

  test('create with no classroom returns 400', async ({ request }) => {
    const res = await request.post('/api/timetable', {
      headers: { Authorization: `Bearer ${teacherToken}` },
      data: {
        classroom_ids: [],
        title: 'No classroom',
        scheduled_date: '2026-06-18',
        start_time: '14:00',
        end_time: '15:00',
      },
      failOnStatusCode: false,
    });
    expect(res.status()).toBe(400);
  });

  // ─── PLAN TOPICS ───

  test('teacher can fetch plan topics for a classroom', async ({ request }) => {
    const res = await request.get(`/api/timetable/plan-topics?classroom=${E2E_CLASSROOM_ID}`, {
      headers: { Authorization: `Bearer ${teacherToken}` },
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.topics).toBeInstanceOf(Array);
    // Each topic (if any) has the picker shape.
    for (const t of body.topics) {
      expect(typeof t.id).toBe('string');
      expect(typeof t.title).toBe('string');
      expect(typeof t.category).toBe('string');
    }
  });

  test('plan topics with no classroom returns empty list', async ({ request }) => {
    const res = await request.get('/api/timetable/plan-topics', {
      headers: { Authorization: `Bearer ${teacherToken}` },
    });
    expect(res.status()).toBe(200);
    expect((await res.json()).topics).toEqual([]);
  });

  test('student cannot fetch plan topics (403)', async ({ request }) => {
    const res = await request.get(`/api/timetable/plan-topics?classroom=${E2E_CLASSROOM_ID}`, {
      headers: { Authorization: `Bearer ${studentToken}` },
      failOnStatusCode: false,
    });
    expect(res.status()).toBe(403);
  });

  test('plan topics without auth is rejected', async ({ request }) => {
    const res = await request.get(`/api/timetable/plan-topics?classroom=${E2E_CLASSROOM_ID}`, {
      headers: { Authorization: '' },
      failOnStatusCode: false,
    });
    expect([401, 500]).toContain(res.status());
  });

  // ─── CLEANUP ───

  test('cleanup: delete created classes', async ({ request }) => {
    for (const classId of createdClassIds) {
      await request.delete('/api/timetable', {
        headers: { Authorization: `Bearer ${teacherToken}` },
        data: { id: classId, classroom_id: E2E_CLASSROOM_ID, permanent: true },
        failOnStatusCode: false,
      });
    }
  });
});
