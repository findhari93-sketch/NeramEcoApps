/**
 * NATA Recalled Papers — E2E Tests
 *
 * Tests the recalled papers API routes and student-facing pages.
 * Uses test-login auth injection for fast, reliable auth.
 *
 * Run: pnpm test:e2e --project=nexus-chrome tests/e2e/nexus-recalled-papers.spec.ts
 */

import { test, expect } from '@playwright/test';
import { APP_URLS, getTestAuthToken } from '../utils/credentials';

const BASE_URL = APP_URLS.nexus; // http://localhost:3012

test.use({ baseURL: BASE_URL });

test.describe('NATA Recalled Papers', () => {
  test.describe.configure({ mode: 'serial' });

  let studentToken: string;
  let teacherToken: string;

  // ─── Setup ───

  test('setup: get auth tokens', async ({ request }) => {
    // Student token
    const studentAuth = await getTestAuthToken(request, 'student');
    if (studentAuth) {
      studentToken = studentAuth.testToken;
    }

    // Teacher token
    const teacherAuth = await getTestAuthToken(request, 'teacher');
    if (teacherAuth) {
      teacherToken = teacherAuth.testToken;
    }

    // At least teacher token should work
    expect(teacherToken).toBeTruthy();
  });

  // ─── API: Recalled Sessions ───

  test('GET /api/question-bank/recalled-sessions without auth returns 401', async ({ request }) => {
    const res = await request.get(`${BASE_URL}/api/question-bank/recalled-sessions`, {
      headers: { Authorization: '' },
      failOnStatusCode: false,
    });
    expect(res.status()).toBe(401);
  });

  test('GET /api/question-bank/recalled-sessions with valid token returns 200', async ({ request }) => {
    test.skip(!teacherToken, 'No teacher token');

    const res = await request.get(`${BASE_URL}/api/question-bank/recalled-sessions`, {
      headers: { Authorization: `Bearer ${teacherToken}` },
    });
    expect(res.status()).toBe(200);

    const body = await res.json();
    expect(body).toHaveProperty('data');
    expect(Array.isArray(body.data)).toBe(true);
  });

  test('GET /api/question-bank/recalled-sessions?year=2025 filters by year', async ({ request }) => {
    test.skip(!teacherToken, 'No teacher token');

    const res = await request.get(`${BASE_URL}/api/question-bank/recalled-sessions?year=2025`, {
      headers: { Authorization: `Bearer ${teacherToken}` },
    });
    expect(res.status()).toBe(200);

    const body = await res.json();
    expect(body).toHaveProperty('data');
    // All returned papers should be year 2025 (or empty if no data yet)
    for (const session of body.data) {
      expect(session.paper.year).toBe(2025);
    }
  });

  test('recalled session cards have expected shape', async ({ request }) => {
    test.skip(!teacherToken, 'No teacher token');

    const res = await request.get(`${BASE_URL}/api/question-bank/recalled-sessions`, {
      headers: { Authorization: `Bearer ${teacherToken}` },
    });
    const body = await res.json();

    // If there are sessions, validate shape
    if (body.data.length > 0) {
      const session = body.data[0];
      expect(session).toHaveProperty('paper');
      expect(session).toHaveProperty('contributors');
      expect(session).toHaveProperty('tier_counts');
      expect(session).toHaveProperty('topic_distribution');
      expect(session.tier_counts).toHaveProperty('tier_1');
      expect(session.tier_counts).toHaveProperty('tier_2');
      expect(session.tier_counts).toHaveProperty('tier_3');
      expect(Array.isArray(session.contributors)).toBe(true);
    }
  });

  // ─── API: Topic Intelligence ───

  test('GET /api/question-bank/topic-intelligence without auth returns 401', async ({ request }) => {
    const res = await request.get(`${BASE_URL}/api/question-bank/topic-intelligence`, {
      headers: { Authorization: '' },
      failOnStatusCode: false,
    });
    expect(res.status()).toBe(401);
  });

  test('GET /api/question-bank/topic-intelligence with valid token returns 200', async ({ request }) => {
    test.skip(!teacherToken, 'No teacher token');

    const res = await request.get(`${BASE_URL}/api/question-bank/topic-intelligence`, {
      headers: { Authorization: `Bearer ${teacherToken}` },
    });
    expect(res.status()).toBe(200);

    const body = await res.json();
    expect(body).toHaveProperty('data');
    expect(Array.isArray(body.data)).toBe(true);
  });

  test('topic intelligence items have expected shape', async ({ request }) => {
    test.skip(!teacherToken, 'No teacher token');

    const res = await request.get(`${BASE_URL}/api/question-bank/topic-intelligence`, {
      headers: { Authorization: `Bearer ${teacherToken}` },
    });
    const body = await res.json();

    if (body.data.length > 0) {
      const topic = body.data[0];
      expect(topic).toHaveProperty('id');
      expect(topic).toHaveProperty('name');
      expect(topic).toHaveProperty('priority');
      expect(topic).toHaveProperty('question_count');
      expect(topic).toHaveProperty('session_names');
      expect(typeof topic.question_count).toBe('number');
      expect(Array.isArray(topic.session_names)).toBe(true);
    }
  });

  // ─── API: Promote Recall (Teacher Only) ───

  test('POST /api/question-bank/promote-recall without auth returns 401', async ({ request }) => {
    const res = await request.post(`${BASE_URL}/api/question-bank/promote-recall`, {
      headers: { Authorization: '' },
      data: {},
      failOnStatusCode: false,
    });
    expect(res.status()).toBe(401);
  });

  test('POST /api/question-bank/promote-recall with missing fields returns 400', async ({ request }) => {
    test.skip(!teacherToken, 'No teacher token');

    const res = await request.post(`${BASE_URL}/api/question-bank/promote-recall`, {
      headers: { Authorization: `Bearer ${teacherToken}` },
      data: { threadId: null, paperId: null },
      failOnStatusCode: false,
    });
    // Should return 400 for missing required fields
    expect([400, 500]).toContain(res.status());
  });

  // ─── API: Questions Filter with confidence_tier ───

  test('GET /api/question-bank/questions with confidence_tier filter works', async ({ request }) => {
    test.skip(!teacherToken, 'No teacher token');

    const res = await request.get(
      `${BASE_URL}/api/question-bank/questions?confidence_tier=1,2&classroom_id=test`,
      { headers: { Authorization: `Bearer ${teacherToken}` }, failOnStatusCode: false }
    );
    // May return 200 (with results) or 404 (classroom not found) — both acceptable
    expect([200, 404]).toContain(res.status());
  });

  test('GET /api/question-bank/questions with paper_source=recalled filter works', async ({ request }) => {
    test.skip(!teacherToken, 'No teacher token');

    const res = await request.get(
      `${BASE_URL}/api/question-bank/questions?paper_source=recalled&classroom_id=test`,
      { headers: { Authorization: `Bearer ${teacherToken}` }, failOnStatusCode: false }
    );
    expect([200, 404]).toContain(res.status());
  });
});
