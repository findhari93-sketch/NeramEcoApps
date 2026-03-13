import { test, expect } from '@playwright/test';

let testToken: string;
let classroomId: string;

test.describe('Nexus Drawings API', () => {
  test.describe.configure({ mode: 'serial' });
  test.use({ baseURL: 'http://localhost:3012' });

  test('setup: get test token and classroom', async ({ request }) => {
    const res = await request.post('/api/auth/test-login', {
      data: { email: 'e2e-drawings@neramclasses.com', role: 'teacher' },
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    testToken = body.testToken;
    classroomId = body.classrooms[0]?.id;
  });

  test('GET /api/drawings without classroom should return 400', async ({ request }) => {
    const res = await request.get('/api/drawings', {
      headers: { Authorization: `Bearer ${testToken}` },
      failOnStatusCode: false,
    });
    expect(res.status()).toBe(400);
  });

  test('GET /api/drawings without auth should return 401', async ({ request }) => {
    const res = await request.get(`/api/drawings?classroom=${classroomId}`, {
      headers: { Authorization: '' },
      failOnStatusCode: false,
    });
    expect(res.status()).toBe(401);
  });

  test('GET /api/drawings should return levels', async ({ request }) => {
    const res = await request.get(`/api/drawings?classroom=${classroomId}`, {
      headers: { Authorization: `Bearer ${testToken}` },
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.levels).toBeDefined();
    expect(Array.isArray(body.levels)).toBe(true);
  });

  test('GET /api/drawings?mode=progress should return progress summary', async ({ request }) => {
    const res = await request.get(`/api/drawings?classroom=${classroomId}&mode=progress`, {
      headers: { Authorization: `Bearer ${testToken}` },
    });
    expect(res.status()).toBe(200);
  });

  test('POST /api/drawings without type should return 400', async ({ request }) => {
    const res = await request.post('/api/drawings', {
      headers: { Authorization: `Bearer ${testToken}` },
      data: { classroom_id: classroomId, title: 'No type' },
      failOnStatusCode: false,
    });
    expect(res.status()).toBe(400);
    const body = await res.json();
    expect(body.error).toContain('type');
  });

  test('GET /api/drawings/submissions without classroom should return 400', async ({ request }) => {
    const res = await request.get('/api/drawings/submissions', {
      headers: { Authorization: `Bearer ${testToken}` },
      failOnStatusCode: false,
    });
    expect(res.status()).toBe(400);
  });

  test('POST /api/drawings/submissions without required fields should return 400', async ({ request }) => {
    const res = await request.post('/api/drawings/submissions', {
      headers: { Authorization: `Bearer ${testToken}` },
      data: { exercise_id: 'some-id' },
      failOnStatusCode: false,
    });
    expect(res.status()).toBe(400);
    const body = await res.json();
    expect(body.error).toContain('submission_url');
  });

  test('POST /api/drawings/evaluate without submission_id should return 400', async ({ request }) => {
    const res = await request.post('/api/drawings/evaluate', {
      headers: { Authorization: `Bearer ${testToken}` },
      data: { status: 'approved' },
      failOnStatusCode: false,
    });
    expect(res.status()).toBe(400);
    const body = await res.json();
    expect(body.error).toContain('submission_id');
  });

  test('POST /api/drawings/evaluate with invalid status should return 400', async ({ request }) => {
    const res = await request.post('/api/drawings/evaluate', {
      headers: { Authorization: `Bearer ${testToken}` },
      data: { submission_id: '00000000-0000-0000-0000-000000000000', status: 'invalid' },
      failOnStatusCode: false,
    });
    expect(res.status()).toBe(400);
    const body = await res.json();
    expect(body.error).toContain('approved');
  });
});
