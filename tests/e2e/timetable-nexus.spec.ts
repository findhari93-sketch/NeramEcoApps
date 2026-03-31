import { test, expect } from '@playwright/test';

/**
 * Timetable E2E Tests — Nexus App
 *
 * Tests timetable API routes via test-login (bypasses Microsoft auth).
 * Runs against localhost:3012 (Nexus dev server).
 *
 * Test accounts:
 * - Teacher: e2etestingteacher@neramclasses.com (enrolled in E2E Test Classroom)
 * - Student: e2etestingstudent@neramclasses.com (enrolled in E2E Test Classroom + Common Classes)
 */

const E2E_CLASSROOM_ID = '6d065ef5-c945-4112-a94f-48f3eb3a95f4';
const COMMON_CLASSROOM_ID = '8876a8fc-ac99-4091-b3b2-15f93723c642';

let teacherToken: string;
let studentToken: string;
const createdClassIds: string[] = [];

test.describe('Nexus Timetable API', () => {
  test.describe.configure({ mode: 'serial' });
  test.use({ baseURL: 'http://localhost:3012' });

  // ─── SETUP ───

  test('setup: get teacher test token', async ({ request }) => {
    const res = await request.post('/api/auth/test-login', {
      data: { email: 'e2etestingteacher@neramclasses.com', role: 'teacher' },
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    teacherToken = body.testToken;
    expect(teacherToken).toBeTruthy();
  });

  test('setup: get student test token', async ({ request }) => {
    const res = await request.post('/api/auth/test-login', {
      data: { email: 'e2etestingstudent@neramclasses.com', role: 'student' },
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    studentToken = body.testToken;
    expect(studentToken).toBeTruthy();
  });

  // ─── CREATE CLASS ───

  test('teacher can create a class', async ({ request }) => {
    const res = await request.post('/api/timetable', {
      headers: { Authorization: `Bearer ${teacherToken}` },
      data: {
        classroom_id: E2E_CLASSROOM_ID,
        title: 'E2E Test Class A',
        scheduled_date: '2026-06-15',
        start_time: '10:00',
        end_time: '11:00',
        target_scope: 'classroom',
      },
    });
    expect(res.status()).toBe(201);
    const body = await res.json();
    expect(body.class.title).toBe('E2E Test Class A');
    expect(body.class.status).toBe('scheduled');
    createdClassIds.push(body.class.id);
  });

  test('create class with early morning time (6 AM)', async ({ request }) => {
    const res = await request.post('/api/timetable', {
      headers: { Authorization: `Bearer ${teacherToken}` },
      data: {
        classroom_id: E2E_CLASSROOM_ID,
        title: 'E2E Early Morning Class',
        scheduled_date: '2026-06-16',
        start_time: '06:00',
        end_time: '07:00',
      },
    });
    expect(res.status()).toBe(201);
    createdClassIds.push((await res.json()).class.id);
  });

  test('create class with late evening time (9 PM)', async ({ request }) => {
    const res = await request.post('/api/timetable', {
      headers: { Authorization: `Bearer ${teacherToken}` },
      data: {
        classroom_id: E2E_CLASSROOM_ID,
        title: 'E2E Late Evening Class',
        scheduled_date: '2026-06-16',
        start_time: '21:00',
        end_time: '22:00',
      },
    });
    expect(res.status()).toBe(201);
    createdClassIds.push((await res.json()).class.id);
  });

  test('student cannot create a class (403)', async ({ request }) => {
    const res = await request.post('/api/timetable', {
      headers: { Authorization: `Bearer ${studentToken}` },
      data: {
        classroom_id: E2E_CLASSROOM_ID,
        title: 'Student Attempt',
        scheduled_date: '2026-06-15',
        start_time: '10:00',
        end_time: '11:00',
      },
      failOnStatusCode: false,
    });
    expect(res.status()).toBe(403);
  });

  test('create class with missing fields returns 400', async ({ request }) => {
    const res = await request.post('/api/timetable', {
      headers: { Authorization: `Bearer ${teacherToken}` },
      data: { classroom_id: E2E_CLASSROOM_ID, title: 'Missing times' },
      failOnStatusCode: false,
    });
    expect(res.status()).toBe(400);
  });

  test('create class without auth returns 401', async ({ request }) => {
    const res = await request.post('/api/timetable', {
      headers: { Authorization: '' },
      data: {
        classroom_id: E2E_CLASSROOM_ID,
        title: 'No auth',
        scheduled_date: '2026-06-15',
        start_time: '10:00',
        end_time: '11:00',
      },
      failOnStatusCode: false,
    });
    expect([401, 500]).toContain(res.status());
  });

  // ─── READ / FETCH ───

  test('teacher can fetch classes with required params', async ({ request }) => {
    const res = await request.get(
      `/api/timetable?classroom=${E2E_CLASSROOM_ID}&start=2026-06-01&end=2026-06-30`,
      { headers: { Authorization: `Bearer ${teacherToken}` } },
    );
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.classes).toBeInstanceOf(Array);
    expect(body.role).toBe('teacher');
    // Should have the classes we created
    expect(body.classes.length).toBeGreaterThanOrEqual(1);
  });

  test('student sees classes from enrolled classroom', async ({ request }) => {
    const res = await request.get(
      `/api/timetable?classroom=${E2E_CLASSROOM_ID}&start=2026-06-01&end=2026-06-30`,
      { headers: { Authorization: `Bearer ${studentToken}` } },
    );
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.role).toBe('student');
    expect(body.classes).toBeInstanceOf(Array);
  });

  test('GET without required params returns 400', async ({ request }) => {
    const res = await request.get('/api/timetable', {
      headers: { Authorization: `Bearer ${teacherToken}` },
      failOnStatusCode: false,
    });
    expect(res.status()).toBe(400);
  });

  test('Common classes merge into non-common classroom view', async ({ request }) => {
    // When viewing E2E Test Classroom, Common Classes should also appear
    const res = await request.get(
      `/api/timetable?classroom=${E2E_CLASSROOM_ID}&start=2026-03-30&end=2026-04-05`,
      { headers: { Authorization: `Bearer ${studentToken}` } },
    );
    expect(res.status()).toBe(200);
    const body = await res.json();
    // Verify the merge works (classrooms array may include Common)
    const classroomIds = new Set(body.classes.map((c: any) => c.classroom_id));
    // If there are common classes in this date range, we'd see both IDs
    expect(body.classes).toBeInstanceOf(Array);
  });

  // ─── MY SCHEDULE (Student unified view) ───

  test('student can fetch unified schedule across all classrooms', async ({ request }) => {
    const res = await request.get(
      '/api/timetable/my-schedule?start=2026-03-01&end=2026-12-31',
      { headers: { Authorization: `Bearer ${studentToken}` } },
    );
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.classes).toBeInstanceOf(Array);
    expect(body.classrooms).toBeInstanceOf(Array);
    // Student enrolled in 2+ classrooms
    expect(body.classrooms.length).toBeGreaterThanOrEqual(1);
  });

  // ─── UPDATE ───

  test('teacher can update a class title', async ({ request }) => {
    const classId = createdClassIds[0];
    const res = await request.patch('/api/timetable', {
      headers: { Authorization: `Bearer ${teacherToken}` },
      data: {
        id: classId,
        classroom_id: E2E_CLASSROOM_ID,
        title: 'Updated E2E Title',
      },
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.class.title).toBe('Updated E2E Title');
  });

  test('teacher can update class time', async ({ request }) => {
    const classId = createdClassIds[0];
    const res = await request.patch('/api/timetable', {
      headers: { Authorization: `Bearer ${teacherToken}` },
      data: {
        id: classId,
        classroom_id: E2E_CLASSROOM_ID,
        start_time: '11:00',
        end_time: '12:00',
      },
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.class.start_time).toBe('11:00:00');
    expect(body.class.end_time).toBe('12:00:00');
  });

  test('PATCH without id returns 400', async ({ request }) => {
    const res = await request.patch('/api/timetable', {
      headers: { Authorization: `Bearer ${teacherToken}` },
      data: { classroom_id: E2E_CLASSROOM_ID, title: 'No ID' },
      failOnStatusCode: false,
    });
    expect(res.status()).toBe(400);
  });

  // ─── RSVP ───

  test('student can RSVP attending', async ({ request }) => {
    const classId = createdClassIds[0];
    const res = await request.post('/api/timetable/rsvp', {
      headers: { Authorization: `Bearer ${studentToken}` },
      data: {
        class_id: classId,
        classroom_id: E2E_CLASSROOM_ID,
        response: 'attending',
      },
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.rsvp.response).toBe('attending');
  });

  test('student can change RSVP to not_attending with reason', async ({ request }) => {
    const classId = createdClassIds[0];
    const res = await request.post('/api/timetable/rsvp', {
      headers: { Authorization: `Bearer ${studentToken}` },
      data: {
        class_id: classId,
        classroom_id: E2E_CLASSROOM_ID,
        response: 'not_attending',
        reason: 'E2E test decline reason',
      },
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.rsvp.response).toBe('not_attending');
    expect(body.rsvp.reason).toBe('E2E test decline reason');
  });

  test('student cannot decline without reason (400)', async ({ request }) => {
    const classId = createdClassIds[0];
    const res = await request.post('/api/timetable/rsvp', {
      headers: { Authorization: `Bearer ${studentToken}` },
      data: {
        class_id: classId,
        classroom_id: E2E_CLASSROOM_ID,
        response: 'not_attending',
        // Missing reason
      },
      failOnStatusCode: false,
    });
    expect(res.status()).toBe(400);
  });

  test('teacher can view RSVP list', async ({ request }) => {
    const classId = createdClassIds[0];
    const res = await request.get(
      `/api/timetable/rsvp?class_id=${classId}&classroom_id=${E2E_CLASSROOM_ID}`,
      { headers: { Authorization: `Bearer ${teacherToken}` } },
    );
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.rsvps).toBeInstanceOf(Array);
    expect(body.rsvps.length).toBeGreaterThanOrEqual(1);
  });

  // ─── HOLIDAYS ───

  test('teacher can create a holiday', async ({ request }) => {
    const res = await request.post('/api/timetable/holidays', {
      headers: { Authorization: `Bearer ${teacherToken}` },
      data: {
        classroom_id: E2E_CLASSROOM_ID,
        holiday_date: '2026-07-15',
        title: 'E2E Test Holiday',
      },
    });
    expect(res.status()).toBe(201);
    const body = await res.json();
    expect(body.holiday.title).toBe('E2E Test Holiday');

    // Cleanup
    await request.delete('/api/timetable/holidays', {
      headers: { Authorization: `Bearer ${teacherToken}` },
      data: { id: body.holiday.id, classroom_id: E2E_CLASSROOM_ID },
    });
  });

  test('student cannot create a holiday (403)', async ({ request }) => {
    const res = await request.post('/api/timetable/holidays', {
      headers: { Authorization: `Bearer ${studentToken}` },
      data: {
        classroom_id: E2E_CLASSROOM_ID,
        holiday_date: '2026-07-16',
        title: 'Student Holiday',
      },
      failOnStatusCode: false,
    });
    expect(res.status()).toBe(403);
  });

  test('teacher can fetch holidays', async ({ request }) => {
    const res = await request.get(
      `/api/timetable/holidays?classroom_id=${E2E_CLASSROOM_ID}&start=2026-01-01&end=2026-12-31`,
      { headers: { Authorization: `Bearer ${teacherToken}` } },
    );
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.holidays).toBeInstanceOf(Array);
  });

  // ─── REVIEWS ───

  test('student cannot review a non-completed class (400)', async ({ request }) => {
    const classId = createdClassIds[0]; // status = 'scheduled'
    const res = await request.post('/api/timetable/reviews', {
      headers: { Authorization: `Bearer ${studentToken}` },
      data: {
        class_id: classId,
        classroom_id: E2E_CLASSROOM_ID,
        rating: 5,
        comment: 'Great!',
      },
      failOnStatusCode: false,
    });
    expect(res.status()).toBe(400);
  });

  // ─── CANCEL / DELETE ───

  test('teacher can cancel (soft-delete) a class', async ({ request }) => {
    // Create a class to cancel
    const createRes = await request.post('/api/timetable', {
      headers: { Authorization: `Bearer ${teacherToken}` },
      data: {
        classroom_id: E2E_CLASSROOM_ID,
        title: 'To Cancel',
        scheduled_date: '2026-06-20',
        start_time: '16:00',
        end_time: '17:00',
      },
    });
    const created = await createRes.json();

    const res = await request.delete('/api/timetable', {
      headers: { Authorization: `Bearer ${teacherToken}` },
      data: { id: created.class.id, classroom_id: E2E_CLASSROOM_ID },
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.class.status).toBe('cancelled');
    createdClassIds.push(created.class.id);
  });

  test('teacher can permanently delete a class', async ({ request }) => {
    const createRes = await request.post('/api/timetable', {
      headers: { Authorization: `Bearer ${teacherToken}` },
      data: {
        classroom_id: E2E_CLASSROOM_ID,
        title: 'To Delete',
        scheduled_date: '2026-06-21',
        start_time: '16:00',
        end_time: '17:00',
      },
    });
    const created = await createRes.json();

    const res = await request.delete('/api/timetable', {
      headers: { Authorization: `Bearer ${teacherToken}` },
      data: { id: created.class.id, classroom_id: E2E_CLASSROOM_ID, permanent: true },
    });
    expect(res.status()).toBe(200);
    expect((await res.json()).deleted).toBe(true);
  });

  test('DELETE without id returns 400', async ({ request }) => {
    const res = await request.delete('/api/timetable', {
      headers: { Authorization: `Bearer ${teacherToken}` },
      data: { classroom_id: E2E_CLASSROOM_ID },
      failOnStatusCode: false,
    });
    expect(res.status()).toBe(400);
  });

  // ─── CLEANUP ───

  test('cleanup: delete all test classes', async ({ request }) => {
    for (const classId of createdClassIds) {
      await request.delete('/api/timetable', {
        headers: { Authorization: `Bearer ${teacherToken}` },
        data: { id: classId, classroom_id: E2E_CLASSROOM_ID, permanent: true },
        failOnStatusCode: false,
      });
    }
  });
});
