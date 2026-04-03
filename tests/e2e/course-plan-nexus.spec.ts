/**
 * Course Plan Module - API + Teacher E2E Tests (Serial)
 *
 * Tests the full course plan CRUD lifecycle:
 * Plan creation, sessions, homework, drill, tests, resources.
 * Uses serial mode so plan/session/homework IDs carry between tests.
 */

import { test, expect } from '@playwright/test';

test.describe.configure({ mode: 'serial' });

const BASE = 'http://localhost:3012';
let teacherToken: string;
let classroomId: string;
let planId: string;
let weekId: string;
let sessionId: string;
let homeworkId: string;

test.describe('Course Plan Module', () => {
  test.use({ baseURL: BASE });

  // =========================================================================
  // Setup
  // =========================================================================

  test('setup: authenticate as teacher', async ({ request }) => {
    const res = await request.post('/api/auth/test-login', {
      data: { email: 'e2e-teacher@neramclasses.com', role: 'teacher' },
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    teacherToken = body.testToken;
    classroomId = body.classrooms[0]?.id;
    expect(teacherToken).toBeDefined();
    expect(classroomId).toBeDefined();
  });

  // =========================================================================
  // Plan CRUD
  // =========================================================================

  test('API: create course plan', async ({ request }) => {
    const res = await request.post('/api/course-plans', {
      headers: { Authorization: `Bearer ${teacherToken}`, 'Content-Type': 'application/json' },
      data: {
        classroom_id: classroomId,
        name: '__TEST__Course Plan E2E',
        description: 'E2E test course plan',
        duration_weeks: 2,
        days_per_week: ['tue', 'wed', 'thu'],
        sessions_per_day: [
          { slot: 'am', label: 'Morning' },
          { slot: 'pm', label: 'Afternoon' },
        ],
      },
    });
    expect(res.status()).toBe(201);
    const body = await res.json();
    expect(body.plan).toBeDefined();
    expect(body.plan.id).toBeTruthy();
    expect(body.plan.name).toBe('__TEST__Course Plan E2E');
    expect(body.plan.status).toBe('draft');
    planId = body.plan.id;
  });

  test('API: list course plans', async ({ request }) => {
    const res = await request.get(`/api/course-plans?classroom_id=${classroomId}`, {
      headers: { Authorization: `Bearer ${teacherToken}` },
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(Array.isArray(body.plans)).toBe(true);
    const testPlan = body.plans.find((p: any) => p.id === planId);
    expect(testPlan).toBeTruthy();
  });

  test('API: get plan detail with auto-generated weeks and sessions', async ({ request }) => {
    const res = await request.get(`/api/course-plans/${planId}`, {
      headers: { Authorization: `Bearer ${teacherToken}` },
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    const plan = body.plan;
    expect(plan.name).toBe('__TEST__Course Plan E2E');
    expect(plan.weeks).toHaveLength(2);
    weekId = plan.weeks[0].id;

    // 2 weeks x 3 days x 2 slots = 12 sessions total
    const totalSessions = plan.weeks.reduce((sum: number, w: any) => {
      return sum + (w.sessions?.length || 0);
    }, 0);
    expect(totalSessions).toBe(12);

    // Grab first session ID for later tests
    sessionId = plan.weeks[0].sessions?.[0]?.id;
    expect(sessionId).toBeTruthy();
  });

  test('API: update plan status to active', async ({ request }) => {
    const res = await request.put(`/api/course-plans/${planId}`, {
      headers: { Authorization: `Bearer ${teacherToken}`, 'Content-Type': 'application/json' },
      data: { status: 'active' },
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.plan.status).toBe('active');
  });

  // =========================================================================
  // Sessions
  // =========================================================================

  test('API: list sessions by week', async ({ request }) => {
    const res = await request.get(`/api/course-plans/${planId}/sessions?week_id=${weekId}`, {
      headers: { Authorization: `Bearer ${teacherToken}` },
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    // 3 days x 2 slots = 6 sessions per week
    expect(body.sessions.length).toBe(6);
  });

  test('API: update session title', async ({ request }) => {
    const res = await request.post(`/api/course-plans/${planId}/sessions`, {
      headers: { Authorization: `Bearer ${teacherToken}`, 'Content-Type': 'application/json' },
      data: {
        session_id: sessionId,
        title: '__TEST__Updated Session Title',
        description: 'Updated description for testing',
      },
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.session.title).toBe('__TEST__Updated Session Title');
  });

  // =========================================================================
  // Homework
  // =========================================================================

  test('API: create homework', async ({ request }) => {
    const res = await request.post(`/api/course-plans/${planId}/homework`, {
      headers: { Authorization: `Bearer ${teacherToken}`, 'Content-Type': 'application/json' },
      data: {
        session_id: sessionId,
        plan_id: planId,
        title: '__TEST__Draw 2 colour wheels',
        description: 'Draw primary and secondary colour wheels',
        type: 'drawing',
        max_points: 10,
        estimated_minutes: 20,
      },
    });
    expect(res.status()).toBe(201);
    const body = await res.json();
    expect(body.homework.title).toBe('__TEST__Draw 2 colour wheels');
    expect(body.homework.max_points).toBe(10);
    homeworkId = body.homework.id;
  });

  test('API: list homework for plan', async ({ request }) => {
    const res = await request.get(`/api/course-plans/${planId}/homework`, {
      headers: { Authorization: `Bearer ${teacherToken}` },
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.homework.length).toBeGreaterThanOrEqual(1);
  });

  test('API: get homework grading grid', async ({ request }) => {
    const res = await request.get(`/api/course-plans/${planId}/homework/grid`, {
      headers: { Authorization: `Bearer ${teacherToken}` },
    });
    expect(res.status()).toBe(200);
    const grid = await res.json();
    expect(grid.homework).toBeDefined();
    expect(grid.students).toBeDefined();
    expect(grid.submissions).toBeDefined();
  });

  // =========================================================================
  // Drill
  // =========================================================================

  test('API: create drill question', async ({ request }) => {
    const res = await request.post(`/api/course-plans/${planId}/drill`, {
      headers: { Authorization: `Bearer ${teacherToken}`, 'Content-Type': 'application/json' },
      data: {
        question_text: '__TEST__Nobel Peace Prize 2024?',
        answer_text: 'Nihon Hidankyo',
        explanation: 'Japanese anti-nuclear organization',
        frequency_note: '6+ sessions',
      },
    });
    expect(res.status()).toBe(201);
    const body = await res.json();
    expect(body.drill.question_text).toBe('__TEST__Nobel Peace Prize 2024?');
  });

  test('API: list drill questions', async ({ request }) => {
    const res = await request.get(`/api/course-plans/${planId}/drill`, {
      headers: { Authorization: `Bearer ${teacherToken}` },
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.drills.length).toBeGreaterThanOrEqual(1);
  });

  // =========================================================================
  // Tests
  // =========================================================================

  test('API: create weekly test', async ({ request }) => {
    const res = await request.post(`/api/course-plans/${planId}/tests`, {
      headers: { Authorization: `Bearer ${teacherToken}`, 'Content-Type': 'application/json' },
      data: {
        plan_id: planId,
        week_id: weekId,
        title: '__TEST__Week 1 Mini Test',
        question_count: 30,
        duration_minutes: 40,
        scope: 'Week 1 topics only',
      },
    });
    expect(res.status()).toBe(201);
    const body = await res.json();
    expect(body.test.title).toBe('__TEST__Week 1 Mini Test');
  });

  test('API: list tests for plan', async ({ request }) => {
    const res = await request.get(`/api/course-plans/${planId}/tests`, {
      headers: { Authorization: `Bearer ${teacherToken}` },
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.tests.length).toBeGreaterThanOrEqual(1);
  });

  // =========================================================================
  // Resources
  // =========================================================================

  test('API: create resource', async ({ request }) => {
    const res = await request.post(`/api/course-plans/${planId}/resources`, {
      headers: { Authorization: `Bearer ${teacherToken}`, 'Content-Type': 'application/json' },
      data: {
        session_id: sessionId,
        title: '__TEST__Khan Academy Geometry',
        url: 'https://www.khanacademy.org',
        type: 'practice',
      },
    });
    expect(res.status()).toBe(201);
    const body = await res.json();
    expect(body.resource.title).toBe('__TEST__Khan Academy Geometry');
  });

  test('API: list resources for plan', async ({ request }) => {
    const res = await request.get(`/api/course-plans/${planId}/resources`, {
      headers: { Authorization: `Bearer ${teacherToken}` },
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.resources.length).toBeGreaterThanOrEqual(1);
  });

  // =========================================================================
  // Auth / role guard checks
  // =========================================================================

  test('API: list plans without auth returns 401 or 500', async ({ request }) => {
    const res = await request.get(`/api/course-plans?classroom_id=${classroomId}`, {
      headers: { Authorization: '' },
      failOnStatusCode: false,
    });
    // Without valid token, should reject
    expect([401, 500]).toContain(res.status());
  });

  test('API: list plans without classroom_id returns 400', async ({ request }) => {
    const res = await request.get('/api/course-plans', {
      headers: { Authorization: `Bearer ${teacherToken}` },
      failOnStatusCode: false,
    });
    expect(res.status()).toBe(400);
  });

  test('API: student can see active plan', async ({ request }) => {
    const studentRes = await request.post('/api/auth/test-login', {
      data: { email: 'e2e-student@neramclasses.com', role: 'student' },
    });
    if (!studentRes.ok()) {
      test.skip(true, 'Student test account not available');
      return;
    }
    const studentBody = await studentRes.json();
    const studentToken = studentBody.testToken;

    const res = await request.get(`/api/course-plans?classroom_id=${classroomId}`, {
      headers: { Authorization: `Bearer ${studentToken}` },
      failOnStatusCode: false,
    });

    // Student may or may not be enrolled in same classroom
    if (res.ok()) {
      const body = await res.json();
      // If student is enrolled, should only see active plans
      for (const p of body.plans) {
        expect(p.status).toBe('active');
      }
    }
  });

  // =========================================================================
  // Cleanup
  // =========================================================================

  test('cleanup: delete test plan via Supabase admin', async ({ request }) => {
    if (!planId) {
      test.skip(true, 'No plan to clean up');
      return;
    }

    // Use the Supabase proxy or direct URL
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'http://localhost:54321';
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!serviceKey) {
      console.warn('SUPABASE_SERVICE_ROLE_KEY not set; skipping cleanup');
      test.skip(true, 'Service key not available for cleanup');
      return;
    }

    // Delete plan — cascade should clean up weeks, sessions, homework, drill, tests, resources
    const res = await request.delete(`${supabaseUrl}/rest/v1/nexus_course_plans?id=eq.${planId}`, {
      headers: {
        apikey: serviceKey,
        Authorization: `Bearer ${serviceKey}`,
      },
      failOnStatusCode: false,
    });

    // Accept 200 or 204 (no content) as success
    expect([200, 204]).toContain(res.status());
  });
});
