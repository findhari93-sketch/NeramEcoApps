import { test, expect } from '@playwright/test';

let testToken: string;
let classroomId: string;
let teacherUserId: string;

test.describe('Nexus Parent API', () => {
  test.describe.configure({ mode: 'serial' });
  test.use({ baseURL: 'http://localhost:3012' });

  test('setup: get test token and classroom', async ({ request }) => {
    const res = await request.post('/api/auth/test-login', {
      data: { email: 'e2e-parent-api@neramclasses.com', role: 'teacher' },
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    testToken = body.testToken;
    classroomId = body.classrooms[0]?.id;
    teacherUserId = body.user.id;
  });

  test('POST /api/parent/invite without required fields should return 400', async ({ request }) => {
    const res = await request.post('/api/parent/invite', {
      headers: { Authorization: `Bearer ${testToken}` },
      data: { classroom_id: classroomId },
      failOnStatusCode: false,
    });
    expect(res.status()).toBe(400);
    const body = await res.json();
    expect(body.error).toContain('student_id');
  });

  test('POST /api/parent/invite without auth should return error', async ({ request }) => {
    const res = await request.post('/api/parent/invite', {
      headers: { Authorization: '' },
      data: { classroom_id: classroomId, student_id: 'some-id' },
      failOnStatusCode: false,
    });
    expect([401, 500]).toContain(res.status());
  });

  test('GET /api/parent/invite without code should return 400', async ({ request }) => {
    const res = await request.get('/api/parent/invite', {
      failOnStatusCode: false,
    });
    expect(res.status()).toBe(400);
    const body = await res.json();
    expect(body.error).toContain('code');
  });

  test('GET /api/parent/invite with invalid code should return 404', async ({ request }) => {
    const res = await request.get('/api/parent/invite?code=INVALID', {
      failOnStatusCode: false,
    });
    expect(res.status()).toBe(404);
    const body = await res.json();
    expect(body.error).toContain('Invalid');
  });

  test('GET /api/parent/progress without classroom should return 400', async ({ request }) => {
    const res = await request.get('/api/parent/progress', {
      headers: { Authorization: `Bearer ${testToken}` },
      failOnStatusCode: false,
    });
    expect(res.status()).toBe(400);
  });

  test('GET /api/parent/progress without linked student returns null child', async ({ request }) => {
    const res = await request.get(`/api/parent/progress?classroom=${classroomId}`, {
      headers: { Authorization: `Bearer ${testToken}` },
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    // Teacher is not a parent, so no linked student
    expect(body.child).toBeNull();
  });
});
