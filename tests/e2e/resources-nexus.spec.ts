import { test, expect } from '@playwright/test';

let testToken: string;
let classroomId: string;

test.describe('Nexus Resources API', () => {
  test.describe.configure({ mode: 'serial' });
  test.use({ baseURL: 'http://localhost:3012' });

  test('setup: get test token and classroom', async ({ request }) => {
    const res = await request.post('/api/auth/test-login', {
      data: { email: 'e2e-resources@neramclasses.com', role: 'teacher' },
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    testToken = body.testToken;
    classroomId = body.classrooms[0]?.id;
  });

  test('GET /api/resources without classroom should return 400', async ({ request }) => {
    const res = await request.get('/api/resources', {
      headers: { Authorization: `Bearer ${testToken}` },
      failOnStatusCode: false,
    });
    expect(res.status()).toBe(400);
  });

  test('GET /api/resources without auth should return 401', async ({ request }) => {
    const res = await request.get(`/api/resources?classroom=${classroomId}`, {
      headers: { Authorization: '' },
      failOnStatusCode: false,
    });
    expect(res.status()).toBe(401);
  });

  test('GET /api/resources with classroom should return resources array', async ({ request }) => {
    const res = await request.get(`/api/resources?classroom=${classroomId}`, {
      headers: { Authorization: `Bearer ${testToken}` },
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.resources).toBeDefined();
    expect(Array.isArray(body.resources)).toBe(true);
  });

  test('POST /api/resources should create resource (teacher)', async ({ request }) => {
    const res = await request.post('/api/resources', {
      headers: { Authorization: `Bearer ${testToken}` },
      data: {
        classroom_id: classroomId,
        title: 'E2E Test Resource',
        resource_type: 'youtube',
        url: 'https://youtube.com/watch?v=e2e-test',
      },
    });
    expect(res.status()).toBe(201);
    const body = await res.json();
    expect(body.resource).toBeDefined();
    expect(body.resource.title).toBe('E2E Test Resource');
  });
});

test.describe('Nexus Documents API', () => {
  test.describe.configure({ mode: 'serial' });
  test.use({ baseURL: 'http://localhost:3012' });

  let docToken: string;
  let docClassroomId: string;

  test('setup: get test token and classroom', async ({ request }) => {
    const res = await request.post('/api/auth/test-login', {
      data: { email: 'e2e-documents@neramclasses.com', role: 'student' },
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    docToken = body.testToken;
    docClassroomId = body.classrooms[0]?.id;
  });

  test('GET /api/documents without classroom should return 400', async ({ request }) => {
    const res = await request.get('/api/documents', {
      headers: { Authorization: `Bearer ${docToken}` },
      failOnStatusCode: false,
    });
    expect(res.status()).toBe(400);
  });

  test('GET /api/documents without auth should return 401', async ({ request }) => {
    const res = await request.get(`/api/documents?classroom=${docClassroomId}`, {
      headers: { Authorization: '' },
      failOnStatusCode: false,
    });
    expect(res.status()).toBe(401);
  });

  test('GET /api/documents should return documents array', async ({ request }) => {
    const res = await request.get(`/api/documents?classroom=${docClassroomId}`, {
      headers: { Authorization: `Bearer ${docToken}` },
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.documents).toBeDefined();
    expect(Array.isArray(body.documents)).toBe(true);
  });

  test('POST /api/documents should create document record', async ({ request }) => {
    const res = await request.post('/api/documents', {
      headers: { Authorization: `Bearer ${docToken}` },
      data: {
        classroom_id: docClassroomId,
        category: 'hall_ticket',
        title: 'E2E Test Hall Ticket',
        file_url: 'https://example.com/e2e-test-file.pdf',
        file_type: 'pdf',
      },
    });
    expect(res.status()).toBe(201);
    const body = await res.json();
    expect(body.document).toBeDefined();
    expect(body.document.title).toBe('E2E Test Hall Ticket');
  });
});
