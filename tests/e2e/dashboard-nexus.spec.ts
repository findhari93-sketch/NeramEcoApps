import { test, expect } from '@playwright/test';

let testToken: string;
let classroomId: string;

test.describe('Nexus Dashboard API', () => {
  test.describe.configure({ mode: 'serial' });
  test.use({ baseURL: 'http://localhost:3012' });

  test('setup: get test token and classroom', async ({ request }) => {
    const res = await request.post('/api/auth/test-login', {
      data: { email: 'e2e-dashboard@neramclasses.com', role: 'teacher' },
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    testToken = body.testToken;
    classroomId = body.classrooms[0]?.id;
    expect(testToken).toBeDefined();
    expect(classroomId).toBeDefined();
  });

  test('GET /api/dashboard/teacher without classroom should return 400', async ({ request }) => {
    const res = await request.get('/api/dashboard/teacher', {
      headers: { Authorization: `Bearer ${testToken}` },
      failOnStatusCode: false,
    });
    expect(res.status()).toBe(400);
  });

  test('GET /api/dashboard/teacher without auth should return 401', async ({ request }) => {
    const res = await request.get(`/api/dashboard/teacher?classroom=${classroomId}`, {
      headers: { Authorization: '' },
      failOnStatusCode: false,
    });
    expect(res.status()).toBe(401);
  });

  test('GET /api/dashboard/teacher with valid classroom should return data', async ({ request }) => {
    const res = await request.get(`/api/dashboard/teacher?classroom=${classroomId}`, {
      headers: { Authorization: `Bearer ${testToken}` },
    });
    expect(res.status()).toBe(200);

    const body = await res.json();
    expect(body.todayClasses).toBeDefined();
    expect(Array.isArray(body.todayClasses)).toBe(true);
    expect(typeof body.studentCount).toBe('number');
    expect(typeof body.pendingTickets).toBe('number');
  });

  test('GET /api/dashboard/student without classroom should return 400', async ({ request }) => {
    const res = await request.get('/api/dashboard/student', {
      headers: { Authorization: `Bearer ${testToken}` },
      failOnStatusCode: false,
    });
    expect(res.status()).toBe(400);
  });

  test('GET /api/dashboard/student without auth should return 401', async ({ request }) => {
    const res = await request.get(`/api/dashboard/student?classroom=${classroomId}`, {
      headers: { Authorization: '' },
      failOnStatusCode: false,
    });
    expect(res.status()).toBe(401);
  });

  test('GET /api/dashboard/student with valid classroom should return data', async ({ request }) => {
    const res = await request.get(`/api/dashboard/student?classroom=${classroomId}`, {
      headers: { Authorization: `Bearer ${testToken}` },
    });
    expect(res.status()).toBe(200);

    const body = await res.json();
    expect(body.upcomingClasses).toBeDefined();
    expect(Array.isArray(body.upcomingClasses)).toBe(true);
    expect(body.attendanceSummary).toBeDefined();
    expect(typeof body.attendanceSummary.total).toBe('number');
    expect(typeof body.attendanceSummary.attended).toBe('number');
    expect(typeof body.attendanceSummary.percentage).toBe('number');
    expect(body.checklistProgress).toBeDefined();
    expect(body.topicProgress).toBeDefined();
  });
});
