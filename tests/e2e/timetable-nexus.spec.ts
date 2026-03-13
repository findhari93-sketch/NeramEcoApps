import { test, expect } from '@playwright/test';

let testToken: string;
let classroomId: string;

test.describe('Nexus Timetable API', () => {
  test.describe.configure({ mode: 'serial' });
  test.use({ baseURL: 'http://localhost:3012' });

  test('setup: get test token and classroom', async ({ request }) => {
    const res = await request.post('/api/auth/test-login', {
      data: { email: 'e2e-timetable@neramclasses.com', role: 'teacher' },
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    testToken = body.testToken;
    classroomId = body.classrooms[0]?.id;
  });

  test('GET /api/timetable without required params should return 400', async ({ request }) => {
    const res = await request.get('/api/timetable', {
      headers: { Authorization: `Bearer ${testToken}` },
      failOnStatusCode: false,
    });
    expect(res.status()).toBe(400);
  });

  test('GET /api/timetable without auth should return 401', async ({ request }) => {
    const res = await request.get(`/api/timetable?classroom=${classroomId}&start=2026-01-01&end=2026-12-31`, {
      headers: { Authorization: '' },
      failOnStatusCode: false,
    });
    expect(res.status()).toBe(401);
  });

  test('GET /api/timetable with valid params should return classes', async ({ request }) => {
    const res = await request.get(`/api/timetable?classroom=${classroomId}&start=2026-01-01&end=2026-12-31`, {
      headers: { Authorization: `Bearer ${testToken}` },
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.classes).toBeDefined();
    expect(Array.isArray(body.classes)).toBe(true);
  });

  test('POST /api/timetable without required fields should return 400', async ({ request }) => {
    const res = await request.post('/api/timetable', {
      headers: { Authorization: `Bearer ${testToken}` },
      data: { classroom_id: classroomId, title: 'Missing time fields' },
      failOnStatusCode: false,
    });
    expect(res.status()).toBe(400);
  });

  test('POST /api/timetable should create a scheduled class', async ({ request }) => {
    const res = await request.post('/api/timetable', {
      headers: { Authorization: `Bearer ${testToken}` },
      data: {
        classroom_id: classroomId,
        title: 'E2E Test Class',
        scheduled_date: '2026-06-15',
        start_time: '10:00',
        end_time: '11:30',
      },
    });
    expect(res.status()).toBe(201);
    const body = await res.json();
    expect(body.class).toBeDefined();
    expect(body.class.title).toBe('E2E Test Class');
    expect(body.class.status).toBe('scheduled');
  });

  test('PATCH /api/timetable without id should return 400', async ({ request }) => {
    const res = await request.patch('/api/timetable', {
      headers: { Authorization: `Bearer ${testToken}` },
      data: { classroom_id: classroomId, title: 'Updated' },
      failOnStatusCode: false,
    });
    expect(res.status()).toBe(400);
    const body = await res.json();
    expect(body.error).toContain('id');
  });

  test('DELETE /api/timetable without id should return 400', async ({ request }) => {
    const res = await request.delete('/api/timetable', {
      headers: { Authorization: `Bearer ${testToken}` },
      data: { classroom_id: classroomId },
      failOnStatusCode: false,
    });
    expect(res.status()).toBe(400);
  });
});
