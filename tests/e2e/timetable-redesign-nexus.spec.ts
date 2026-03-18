import { test, expect } from '@playwright/test';

let teacherToken: string;
let studentToken: string;
let classroomId: string;
let createdClassId: string;
let createdHolidayId: string;

test.describe('Timetable Redesign API Tests', () => {
  test.describe.configure({ mode: 'serial' });
  test.use({ baseURL: 'http://localhost:3012' });

  // ============================================================
  // Setup
  // ============================================================

  test('setup: get teacher token', async ({ request }) => {
    const res = await request.post('/api/auth/test-login', {
      data: { email: 'e2e-timetable@neramclasses.com', role: 'teacher' },
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    teacherToken = body.testToken;
    classroomId = body.classrooms[0]?.id;
    expect(classroomId).toBeTruthy();
  });

  test('setup: get student token', async ({ request }) => {
    const res = await request.post('/api/auth/test-login', {
      data: { email: 'e2e-student@neramclasses.com', role: 'student' },
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    studentToken = body.testToken;
  });

  // ============================================================
  // Holiday API Tests
  // ============================================================

  test('POST /api/timetable/holidays — teacher can create holiday', async ({ request }) => {
    const res = await request.post('/api/timetable/holidays', {
      headers: { Authorization: `Bearer ${teacherToken}` },
      data: {
        classroom_id: classroomId,
        holiday_date: '2026-12-25',
        title: 'Christmas Holiday',
        description: 'E2E test holiday',
      },
    });
    expect(res.status()).toBe(201);
    const body = await res.json();
    expect(body.holiday).toBeDefined();
    expect(body.holiday.title).toBe('Christmas Holiday');
    createdHolidayId = body.holiday.id;
  });

  test('POST /api/timetable/holidays — duplicate date returns 409', async ({ request }) => {
    const res = await request.post('/api/timetable/holidays', {
      headers: { Authorization: `Bearer ${teacherToken}` },
      data: {
        classroom_id: classroomId,
        holiday_date: '2026-12-25',
        title: 'Duplicate',
      },
      failOnStatusCode: false,
    });
    expect(res.status()).toBe(409);
  });

  test('GET /api/timetable/holidays — returns created holiday', async ({ request }) => {
    const res = await request.get(
      `/api/timetable/holidays?classroom_id=${classroomId}&start=2026-12-01&end=2026-12-31`,
      { headers: { Authorization: `Bearer ${teacherToken}` } }
    );
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.holidays.length).toBeGreaterThanOrEqual(1);
    expect(body.holidays.some((h: any) => h.title === 'Christmas Holiday')).toBe(true);
  });

  test('DELETE /api/timetable/holidays — teacher can delete holiday', async ({ request }) => {
    const res = await request.delete('/api/timetable/holidays', {
      headers: { Authorization: `Bearer ${teacherToken}` },
      data: { id: createdHolidayId, classroom_id: classroomId },
    });
    expect(res.status()).toBe(200);
  });

  // ============================================================
  // RSVP Mandatory Reason Tests
  // ============================================================

  test('setup: create a class for RSVP testing', async ({ request }) => {
    const res = await request.post('/api/timetable', {
      headers: { Authorization: `Bearer ${teacherToken}` },
      data: {
        classroom_id: classroomId,
        title: 'RSVP Test Class',
        scheduled_date: '2026-12-20',
        start_time: '10:00',
        end_time: '11:00',
      },
    });
    expect(res.status()).toBe(201);
    const body = await res.json();
    createdClassId = body.class.id;
  });

  test('POST /api/timetable/rsvp — not_attending without reason returns 400', async ({ request }) => {
    const res = await request.post('/api/timetable/rsvp', {
      headers: { Authorization: `Bearer ${studentToken}` },
      data: {
        class_id: createdClassId,
        classroom_id: classroomId,
        response: 'not_attending',
      },
      failOnStatusCode: false,
    });
    expect(res.status()).toBe(400);
    const body = await res.json();
    expect(body.error).toContain('Reason is required');
  });

  test('POST /api/timetable/rsvp — not_attending with reason succeeds', async ({ request }) => {
    const res = await request.post('/api/timetable/rsvp', {
      headers: { Authorization: `Bearer ${studentToken}` },
      data: {
        class_id: createdClassId,
        classroom_id: classroomId,
        response: 'not_attending',
        reason: 'Have an exam',
      },
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.rsvp.response).toBe('not_attending');
    expect(body.rsvp.reason).toBe('Have an exam');
  });

  test('POST /api/timetable/rsvp — attending without reason succeeds', async ({ request }) => {
    const res = await request.post('/api/timetable/rsvp', {
      headers: { Authorization: `Bearer ${studentToken}` },
      data: {
        class_id: createdClassId,
        classroom_id: classroomId,
        response: 'attending',
      },
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.rsvp.response).toBe('attending');
  });

  // ============================================================
  // RSVP Dashboard Tests
  // ============================================================

  test('GET /api/timetable/rsvp-dashboard — teacher sees breakdown', async ({ request }) => {
    const res = await request.get(
      `/api/timetable/rsvp-dashboard?classroom_id=${classroomId}&class_id=${createdClassId}`,
      { headers: { Authorization: `Bearer ${teacherToken}` } }
    );
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.summary).toBeDefined();
    expect(typeof body.summary.attending).toBe('number');
    expect(typeof body.summary.not_attending).toBe('number');
    expect(typeof body.summary.no_response).toBe('number');
    expect(body.attending).toBeDefined();
    expect(body.not_attending).toBeDefined();
    expect(body.no_response).toBeDefined();
  });

  test('GET /api/timetable/rsvp-dashboard — date range mode works', async ({ request }) => {
    const res = await request.get(
      `/api/timetable/rsvp-dashboard?classroom_id=${classroomId}&start=2026-12-01&end=2026-12-31`,
      { headers: { Authorization: `Bearer ${teacherToken}` } }
    );
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.classes).toBeDefined();
    expect(Array.isArray(body.classes)).toBe(true);
  });

  // ============================================================
  // Meeting Recap Tests
  // ============================================================

  test('GET /api/timetable/recap — returns recap data', async ({ request }) => {
    const res = await request.get(
      `/api/timetable/recap?class_id=${createdClassId}&classroom_id=${classroomId}`,
      { headers: { Authorization: `Bearer ${teacherToken}` } }
    );
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.attendance).toBeDefined();
    expect(body.rsvp).toBeDefined();
    expect(body.rsvp_vs_actual).toBeDefined();
    expect(typeof body.attendance.present).toBe('number');
    expect(typeof body.attendance.absent).toBe('number');
  });

  // ============================================================
  // Timetable Notifications Tests
  // ============================================================

  test('GET /api/timetable/notifications — teacher gets notifications', async ({ request }) => {
    const res = await request.get(
      `/api/timetable/notifications?classroom_id=${classroomId}&limit=10`,
      { headers: { Authorization: `Bearer ${teacherToken}` } }
    );
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.notifications).toBeDefined();
    expect(Array.isArray(body.notifications)).toBe(true);
  });

  test('GET /api/timetable/notifications — countOnly mode works', async ({ request }) => {
    const res = await request.get(
      `/api/timetable/notifications?classroom_id=${classroomId}&countOnly=true`,
      { headers: { Authorization: `Bearer ${teacherToken}` } }
    );
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(typeof body.count).toBe('number');
  });

  test('PATCH /api/timetable/notifications — mark all read', async ({ request }) => {
    const res = await request.patch('/api/timetable/notifications', {
      headers: { Authorization: `Bearer ${teacherToken}` },
      data: { markAll: true, classroom_id: classroomId },
    });
    expect(res.status()).toBe(200);
  });

  // ============================================================
  // Cleanup
  // ============================================================

  test('cleanup: cancel test class', async ({ request }) => {
    if (!createdClassId) return;
    const res = await request.delete('/api/timetable', {
      headers: { Authorization: `Bearer ${teacherToken}` },
      data: { id: createdClassId, classroom_id: classroomId },
    });
    expect(res.status()).toBe(200);
  });
});
