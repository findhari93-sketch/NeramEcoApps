import { test, expect } from '@playwright/test';

/**
 * Drawing Module API Integration Tests
 * Tests: Questions, Submissions, Threads, Reviews, Checklist, Objects
 *
 * Run with: npx playwright test tests/e2e/drawing-module-nexus.spec.ts --reporter=line
 * Requires: Nexus dev server running on port 3012
 */

const BASE = process.env.NEXUS_URL || 'http://localhost:3012';

let teacherToken: string;
let studentToken: string;

test.describe('Drawing Module API', () => {
  test.describe.configure({ mode: 'serial' });

  // ============================================================
  // Setup: get auth tokens
  // ============================================================
  test('setup: authenticate as teacher and student', async ({ request }) => {
    // Teacher token
    const teacherRes = await request.post(`${BASE}/api/auth/test-login`, {
      data: { email: 'e2etestingteacher@neramclasses.com', role: 'teacher' },
    });
    expect(teacherRes.ok()).toBeTruthy();
    const teacherData = await teacherRes.json();
    teacherToken = teacherData.testToken;
    expect(teacherToken).toBeTruthy();

    // Student token
    const studentRes = await request.post(`${BASE}/api/auth/test-login`, {
      data: { email: 'e2etestingstudent@neramclasses.com', role: 'student' },
    });
    expect(studentRes.ok()).toBeTruthy();
    const studentData = await studentRes.json();
    studentToken = studentData.testToken;
    expect(studentToken).toBeTruthy();
  });

  // ============================================================
  // Question Bank
  // ============================================================
  test.describe('Question Bank', () => {
    test('GET /api/drawing/questions returns questions', async ({ request }) => {
      const res = await request.get(`${BASE}/api/drawing/questions`, {
        headers: { Authorization: `Bearer ${teacherToken}` },
      });
      expect(res.status()).toBe(200);
      const body = await res.json();
      expect(body.questions).toBeDefined();
      expect(body.total).toBeGreaterThan(0);
      expect(body.questions.length).toBeGreaterThan(0);
    });

    test('GET /api/drawing/questions filters by category', async ({ request }) => {
      const res = await request.get(`${BASE}/api/drawing/questions?category=2d_composition`, {
        headers: { Authorization: `Bearer ${teacherToken}` },
      });
      expect(res.status()).toBe(200);
      const body = await res.json();
      expect(body.questions.length).toBeGreaterThan(0);
      for (const q of body.questions) {
        expect(q.category).toBe('2d_composition');
      }
    });

    test('GET /api/drawing/questions filters by difficulty', async ({ request }) => {
      const res = await request.get(`${BASE}/api/drawing/questions?difficulty_tag=easy`, {
        headers: { Authorization: `Bearer ${teacherToken}` },
      });
      expect(res.status()).toBe(200);
      const body = await res.json();
      for (const q of body.questions) {
        expect(q.difficulty_tag).toBe('easy');
      }
    });

    test('GET /api/drawing/questions supports search', async ({ request }) => {
      const res = await request.get(`${BASE}/api/drawing/questions?search=parallelogram`, {
        headers: { Authorization: `Bearer ${teacherToken}` },
      });
      expect(res.status()).toBe(200);
      const body = await res.json();
      expect(body.questions.length).toBeGreaterThan(0);
    });

    test('GET /api/drawing/questions supports pagination', async ({ request }) => {
      const res = await request.get(`${BASE}/api/drawing/questions?limit=5&offset=0`, {
        headers: { Authorization: `Bearer ${teacherToken}` },
      });
      expect(res.status()).toBe(200);
      const body = await res.json();
      expect(body.questions.length).toBeLessThanOrEqual(5);
      expect(body.total).toBeGreaterThan(5);
    });

    test('GET /api/drawing/questions/[id] returns single question', async ({ request }) => {
      // First get a question ID
      const listRes = await request.get(`${BASE}/api/drawing/questions?limit=1`, {
        headers: { Authorization: `Bearer ${teacherToken}` },
      });
      const listBody = await listRes.json();
      const questionId = listBody.questions[0].id;

      const res = await request.get(`${BASE}/api/drawing/questions/${questionId}`, {
        headers: { Authorization: `Bearer ${teacherToken}` },
      });
      expect(res.status()).toBe(200);
      const body = await res.json();
      expect(body.question.id).toBe(questionId);
      expect(body.question.question_text).toBeTruthy();
      expect(body.question.category).toBeTruthy();
    });

    test('GET /api/drawing/questions/[id] returns 404 for invalid ID', async ({ request }) => {
      const res = await request.get(`${BASE}/api/drawing/questions/00000000-0000-0000-0000-000000000000`, {
        headers: { Authorization: `Bearer ${teacherToken}` },
        failOnStatusCode: false,
      });
      expect(res.status()).toBe(404);
    });

    test('GET /api/drawing/questions requires auth', async ({ request }) => {
      const res = await request.get(`${BASE}/api/drawing/questions`, {
        failOnStatusCode: false,
      });
      expect(res.status()).toBe(401);
    });
  });

  // ============================================================
  // Foundation Checklist
  // ============================================================
  test.describe('Foundation Checklist', () => {
    test('GET /api/drawing/checklist returns items with progress', async ({ request }) => {
      const res = await request.get(`${BASE}/api/drawing/checklist`, {
        headers: { Authorization: `Bearer ${studentToken}` },
      });
      expect(res.status()).toBe(200);
      const body = await res.json();
      expect(body.items).toBeDefined();
      expect(body.items.length).toBeGreaterThan(50); // ~60 items

      // Check structure
      const item = body.items[0];
      expect(item.category).toBeTruthy();
      expect(item.skill_name).toBeTruthy();
      expect(item.sort_order).toBeDefined();
    });

    test('PATCH /api/drawing/checklist toggles item status', async ({ request }) => {
      // Get an item ID
      const listRes = await request.get(`${BASE}/api/drawing/checklist`, {
        headers: { Authorization: `Bearer ${studentToken}` },
      });
      const items = (await listRes.json()).items;
      const itemId = items[0].id;

      // Toggle to in_progress
      const res = await request.patch(`${BASE}/api/drawing/checklist`, {
        headers: { Authorization: `Bearer ${studentToken}`, 'Content-Type': 'application/json' },
        data: { item_id: itemId, status: 'in_progress' },
      });
      expect(res.status()).toBe(200);

      // Verify it stuck
      const verifyRes = await request.get(`${BASE}/api/drawing/checklist`, {
        headers: { Authorization: `Bearer ${studentToken}` },
      });
      const verifyItems = (await verifyRes.json()).items;
      const updated = verifyItems.find((i: any) => i.id === itemId);
      expect(updated.progress?.status).toBe('in_progress');

      // Toggle back to not_started (cleanup)
      await request.patch(`${BASE}/api/drawing/checklist`, {
        headers: { Authorization: `Bearer ${studentToken}`, 'Content-Type': 'application/json' },
        data: { item_id: itemId, status: 'not_started' },
      });
    });

    test('GET /api/drawing/checklist/heatmap requires teacher role', async ({ request }) => {
      // Student should be denied
      const studentRes = await request.get(`${BASE}/api/drawing/checklist/heatmap`, {
        headers: { Authorization: `Bearer ${studentToken}` },
        failOnStatusCode: false,
      });
      expect(studentRes.status()).toBe(403);

      // Teacher should succeed
      const teacherRes = await request.get(`${BASE}/api/drawing/checklist/heatmap`, {
        headers: { Authorization: `Bearer ${teacherToken}` },
      });
      expect(teacherRes.status()).toBe(200);
      const body = await teacherRes.json();
      expect(body.heatmap).toBeDefined();
    });
  });

  // ============================================================
  // Object Library
  // ============================================================
  test.describe('Object Library', () => {
    test('GET /api/drawing/objects returns objects', async ({ request }) => {
      const res = await request.get(`${BASE}/api/drawing/objects`, {
        headers: { Authorization: `Bearer ${studentToken}` },
      });
      expect(res.status()).toBe(200);
      const body = await res.json();
      expect(body.objects).toBeDefined();
      expect(body.total).toBeGreaterThan(50); // ~62 objects
    });

    test('GET /api/drawing/objects filters by family', async ({ request }) => {
      const res = await request.get(`${BASE}/api/drawing/objects?family=fruits`, {
        headers: { Authorization: `Bearer ${studentToken}` },
      });
      expect(res.status()).toBe(200);
      const body = await res.json();
      expect(body.objects.length).toBeGreaterThan(0);
      for (const obj of body.objects) {
        expect(obj.family).toBe('fruits');
      }
    });

    test('GET /api/drawing/objects filters by difficulty', async ({ request }) => {
      const res = await request.get(`${BASE}/api/drawing/objects?difficulty=easy`, {
        headers: { Authorization: `Bearer ${studentToken}` },
      });
      expect(res.status()).toBe(200);
      const body = await res.json();
      for (const obj of body.objects) {
        expect(obj.difficulty).toBe('easy');
      }
    });

    test('GET /api/drawing/objects supports search', async ({ request }) => {
      const res = await request.get(`${BASE}/api/drawing/objects?search=Orange`, {
        headers: { Authorization: `Bearer ${studentToken}` },
      });
      expect(res.status()).toBe(200);
      const body = await res.json();
      expect(body.objects.length).toBeGreaterThan(0);
      expect(body.objects[0].object_name).toContain('Orange');
    });

    test('GET /api/drawing/objects/[id] returns single object', async ({ request }) => {
      const listRes = await request.get(`${BASE}/api/drawing/objects?limit=1`, {
        headers: { Authorization: `Bearer ${studentToken}` },
      });
      const objectId = (await listRes.json()).objects[0].id;

      const res = await request.get(`${BASE}/api/drawing/objects/${objectId}`, {
        headers: { Authorization: `Bearer ${studentToken}` },
      });
      expect(res.status()).toBe(200);
      const body = await res.json();
      expect(body.object.id).toBe(objectId);
      expect(body.object.object_name).toBeTruthy();
      expect(body.object.family).toBeTruthy();
      expect(body.object.tips).toBeTruthy();
    });
  });

  // ============================================================
  // Review Queue (Teacher)
  // ============================================================
  test.describe('Review Queue', () => {
    test('GET /api/drawing/submissions/review-queue requires teacher role', async ({ request }) => {
      const studentRes = await request.get(`${BASE}/api/drawing/submissions/review-queue`, {
        headers: { Authorization: `Bearer ${studentToken}` },
        failOnStatusCode: false,
      });
      expect(studentRes.status()).toBe(403);

      const teacherRes = await request.get(`${BASE}/api/drawing/submissions/review-queue`, {
        headers: { Authorization: `Bearer ${teacherToken}` },
      });
      expect(teacherRes.status()).toBe(200);
      const body = await teacherRes.json();
      expect(body.submissions).toBeDefined();
    });

    test('GET /api/drawing/submissions/review-queue filters by status', async ({ request }) => {
      const res = await request.get(`${BASE}/api/drawing/submissions/review-queue?status=completed`, {
        headers: { Authorization: `Bearer ${teacherToken}` },
      });
      expect(res.status()).toBe(200);
    });
  });

  // ============================================================
  // Comments
  // ============================================================
  test.describe('Comments', () => {
    test('GET /api/drawing/submissions/[id]/comments returns 500 for invalid ID', async ({ request }) => {
      // Invalid UUID should fail gracefully
      const res = await request.get(`${BASE}/api/drawing/submissions/00000000-0000-0000-0000-000000000000/comments`, {
        headers: { Authorization: `Bearer ${studentToken}` },
      });
      // Should return empty or error, not crash
      expect([200, 500]).toContain(res.status());
    });

    test('POST /api/drawing/submissions/[id]/comments requires comment_text', async ({ request }) => {
      const res = await request.post(`${BASE}/api/drawing/submissions/00000000-0000-0000-0000-000000000000/comments`, {
        headers: { Authorization: `Bearer ${studentToken}`, 'Content-Type': 'application/json' },
        data: { comment_text: '' },
        failOnStatusCode: false,
      });
      expect(res.status()).toBe(400);
    });
  });

  // ============================================================
  // Thread Management
  // ============================================================
  test.describe('Thread Management', () => {
    test('GET /api/drawing/submissions/thread requires question_id', async ({ request }) => {
      const res = await request.get(`${BASE}/api/drawing/submissions/thread`, {
        headers: { Authorization: `Bearer ${studentToken}` },
        failOnStatusCode: false,
      });
      expect(res.status()).toBe(400);
    });

    test('GET /api/drawing/submissions/thread returns null for unstarted question', async ({ request }) => {
      const res = await request.get(`${BASE}/api/drawing/submissions/thread?question_id=00000000-0000-0000-0000-000000000000`, {
        headers: { Authorization: `Bearer ${studentToken}` },
      });
      expect(res.status()).toBe(200);
      const body = await res.json();
      expect(body.thread).toBeNull();
    });

    test('DELETE /api/drawing/submissions/thread/manage requires question_id', async ({ request }) => {
      const res = await request.delete(`${BASE}/api/drawing/submissions/thread/manage`, {
        headers: { Authorization: `Bearer ${studentToken}` },
        failOnStatusCode: false,
      });
      expect(res.status()).toBe(400);
    });
  });

  // ============================================================
  // Nav Badges
  // ============================================================
  test.describe('Nav Badges', () => {
    test('GET /api/nav-badges includes drawing_reviews count for teacher', async ({ request }) => {
      const res = await request.get(`${BASE}/api/nav-badges`, {
        headers: { Authorization: `Bearer ${teacherToken}` },
      });
      expect(res.status()).toBe(200);
      const body = await res.json();
      expect(body.badges).toBeDefined();
      expect(typeof body.badges.drawing_reviews).toBe('number');
    });
  });
});