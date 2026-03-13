import { test, expect } from '@playwright/test';

let testToken: string;
let classroomId: string;

test.describe('Nexus Checklist API', () => {
  test.describe.configure({ mode: 'serial' });
  test.use({ baseURL: 'http://localhost:3012' });

  test('setup: get test token and classroom', async ({ request }) => {
    const res = await request.post('/api/auth/test-login', {
      data: { email: 'e2e-checklist@neramclasses.com', role: 'teacher' },
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    testToken = body.testToken;
    classroomId = body.classrooms[0]?.id;
  });

  test('GET /api/checklist without classroom should return 400', async ({ request }) => {
    const res = await request.get('/api/checklist', {
      headers: { Authorization: `Bearer ${testToken}` },
      failOnStatusCode: false,
    });
    expect(res.status()).toBe(400);
  });

  test('GET /api/checklist without auth should return 401', async ({ request }) => {
    const res = await request.get(`/api/checklist?classroom=${classroomId}`, {
      headers: { Authorization: '' },
      failOnStatusCode: false,
    });
    expect(res.status()).toBe(401);
  });

  test('GET /api/checklist should return items array', async ({ request }) => {
    const res = await request.get(`/api/checklist?classroom=${classroomId}`, {
      headers: { Authorization: `Bearer ${testToken}` },
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.items).toBeDefined();
    expect(Array.isArray(body.items)).toBe(true);
  });

  test('GET /api/checklist?mode=manage should return items with completion counts', async ({ request }) => {
    const res = await request.get(`/api/checklist?classroom=${classroomId}&mode=manage`, {
      headers: { Authorization: `Bearer ${testToken}` },
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.items).toBeDefined();
    expect(Array.isArray(body.items)).toBe(true);
    if (body.items.length > 0) {
      expect(typeof body.items[0].completion_count).toBe('number');
    }
  });

  test('POST /api/checklist without required fields should return 400', async ({ request }) => {
    const res = await request.post('/api/checklist', {
      headers: { Authorization: `Bearer ${testToken}` },
      data: { classroom_id: classroomId },
      failOnStatusCode: false,
    });
    expect(res.status()).toBe(400);
    const body = await res.json();
    expect(body.error).toContain('title');
  });

  test('POST /api/checklist should create item (teacher)', async ({ request }) => {
    const res = await request.post('/api/checklist', {
      headers: { Authorization: `Bearer ${testToken}` },
      data: {
        classroom_id: classroomId,
        title: 'E2E Test Checklist Item',
        description: 'Created by Playwright E2E tests',
      },
    });
    expect(res.status()).toBe(201);
    const body = await res.json();
    expect(body.item).toBeDefined();
    expect(body.item.title).toBe('E2E Test Checklist Item');
  });

  test('POST /api/checklist/toggle without item_id should return 400', async ({ request }) => {
    const res = await request.post('/api/checklist/toggle', {
      headers: { Authorization: `Bearer ${testToken}` },
      data: { completed: true },
      failOnStatusCode: false,
    });
    expect(res.status()).toBe(400);
    const body = await res.json();
    expect(body.error).toContain('item_id');
  });

  test('POST /api/checklist/toggle without completed boolean should return 400', async ({ request }) => {
    const res = await request.post('/api/checklist/toggle', {
      headers: { Authorization: `Bearer ${testToken}` },
      data: { item_id: '00000000-0000-0000-0000-000000000000' },
      failOnStatusCode: false,
    });
    expect(res.status()).toBe(400);
    const body = await res.json();
    expect(body.error).toContain('completed');
  });
});
