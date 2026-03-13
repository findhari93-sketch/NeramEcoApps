import { test, expect } from '@playwright/test';

let testToken: string;
let classroomId: string;

test.describe('Nexus Tests API', () => {
  test.describe.configure({ mode: 'serial' });
  test.use({ baseURL: 'http://localhost:3012' });

  test('setup: get test token and classroom', async ({ request }) => {
    const res = await request.post('/api/auth/test-login', {
      data: { email: 'e2e-tests@neramclasses.com', role: 'teacher' },
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    testToken = body.testToken;
    classroomId = body.classrooms[0]?.id;
  });

  test('GET /api/tests without classroom should return 400', async ({ request }) => {
    const res = await request.get('/api/tests', {
      headers: { Authorization: `Bearer ${testToken}` },
      failOnStatusCode: false,
    });
    expect(res.status()).toBe(400);
  });

  test('GET /api/tests without auth should return 401', async ({ request }) => {
    const res = await request.get(`/api/tests?classroom=${classroomId}`, {
      headers: { Authorization: '' },
      failOnStatusCode: false,
    });
    expect(res.status()).toBe(401);
  });

  test('GET /api/tests with classroom should return tests and role', async ({ request }) => {
    const res = await request.get(`/api/tests?classroom=${classroomId}`, {
      headers: { Authorization: `Bearer ${testToken}` },
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.tests).toBeDefined();
    expect(Array.isArray(body.tests)).toBe(true);
    expect(body.role).toBe('teacher');
  });

  test('POST /api/tests should create a test', async ({ request }) => {
    const res = await request.post('/api/tests', {
      headers: { Authorization: `Bearer ${testToken}` },
      data: {
        classroom_id: classroomId,
        title: 'E2E Test Exam',
        description: 'Created by Playwright',
        test_type: 'timed',
        duration_minutes: 30,
        total_marks: 10,
      },
    });
    expect(res.status()).toBe(201);
    const body = await res.json();
    expect(body.test).toBeDefined();
    expect(body.test.title).toBe('E2E Test Exam');
  });

  test('PATCH /api/tests without test_id should return 400', async ({ request }) => {
    const res = await request.patch('/api/tests', {
      headers: { Authorization: `Bearer ${testToken}` },
      data: { is_published: true },
      failOnStatusCode: false,
    });
    expect(res.status()).toBe(400);
    const body = await res.json();
    expect(body.error).toContain('test_id');
  });

  test('GET /api/tests/attempt without test_id should return 400', async ({ request }) => {
    const res = await request.get('/api/tests/attempt', {
      headers: { Authorization: `Bearer ${testToken}` },
      failOnStatusCode: false,
    });
    expect(res.status()).toBe(400);
  });

  test('POST /api/tests/attempt without attempt_id should return 400', async ({ request }) => {
    const res = await request.post('/api/tests/attempt', {
      headers: { Authorization: `Bearer ${testToken}` },
      data: { answers: {}, action: 'save' },
      failOnStatusCode: false,
    });
    expect(res.status()).toBe(400);
    const body = await res.json();
    expect(body.error).toContain('attempt_id');
  });
});

test.describe('Nexus Questions API', () => {
  test.describe.configure({ mode: 'serial' });
  test.use({ baseURL: 'http://localhost:3012' });

  let qToken: string;
  let qClassroomId: string;

  test('setup: get test token and classroom', async ({ request }) => {
    const res = await request.post('/api/auth/test-login', {
      data: { email: 'e2e-questions@neramclasses.com', role: 'teacher' },
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    qToken = body.testToken;
    qClassroomId = body.classrooms[0]?.id;
  });

  test('GET /api/questions without classroom should return 400', async ({ request }) => {
    const res = await request.get('/api/questions', {
      headers: { Authorization: `Bearer ${qToken}` },
      failOnStatusCode: false,
    });
    expect(res.status()).toBe(400);
  });

  test('GET /api/questions?mode=bank should return verified questions', async ({ request }) => {
    const res = await request.get(`/api/questions?classroom=${qClassroomId}&mode=bank`, {
      headers: { Authorization: `Bearer ${qToken}` },
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.questions).toBeDefined();
    expect(Array.isArray(body.questions)).toBe(true);
  });

  test('GET /api/questions?mode=submissions should return pending submissions', async ({ request }) => {
    const res = await request.get(`/api/questions?classroom=${qClassroomId}&mode=submissions`, {
      headers: { Authorization: `Bearer ${qToken}` },
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.submissions).toBeDefined();
    expect(Array.isArray(body.submissions)).toBe(true);
  });

  test('POST /api/questions should create verified question (teacher)', async ({ request }) => {
    const res = await request.post('/api/questions', {
      headers: { Authorization: `Bearer ${qToken}` },
      data: {
        classroom_id: qClassroomId,
        question_text: 'E2E Test Question: What is 2+2?',
        question_type: 'mcq',
        options: [
          { text: '3', is_correct: false },
          { text: '4', is_correct: true },
          { text: '5', is_correct: false },
        ],
        correct_answer: '4',
        difficulty: 'easy',
      },
    });
    expect(res.status()).toBe(201);
    const body = await res.json();
    expect(body.question).toBeDefined();
    expect(body.question.question_text).toContain('E2E Test');
  });

  test('PATCH /api/questions without submission_id or question_id should return 400', async ({ request }) => {
    const res = await request.patch('/api/questions', {
      headers: { Authorization: `Bearer ${qToken}` },
      data: { status: 'verified' },
      failOnStatusCode: false,
    });
    expect(res.status()).toBe(400);
    const body = await res.json();
    expect(body.error).toContain('submission_id');
  });
});
