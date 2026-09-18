/**
 * Gallery Feed Enhancement - E2E Tests
 *
 * Tests the enhanced Drawing Gallery with:
 * - Side-by-side student/teacher reference comparison
 * - "Teacher Refs Only" filter
 * - Pagination (12 per batch, Load More)
 * - Teacher Gallery tab with unpublish
 * - Mobile swipe-to-toggle image comparison
 * - Role-based access control
 */

import { test, expect } from '@playwright/test';

const BASE = process.env.NEXUS_URL || 'http://localhost:3012';

// ============================================================
// PART 1: API Integration Tests
// ============================================================

test.describe('Gallery Feed API', () => {
  test.describe.configure({ mode: 'serial' });
  test.use({ baseURL: BASE });

  let teacherToken: string;
  let studentToken: string;

  test('setup: authenticate as teacher and student', async ({ request }) => {
    test.setTimeout(60000);

    const teacherRes = await request.post(`${BASE}/api/auth/test-login`, {
      data: { email: 'e2e-teacher@neramclasses.com', role: 'teacher' },
    });
    expect(teacherRes.ok()).toBeTruthy();
    teacherToken = (await teacherRes.json()).testToken;

    const studentRes = await request.post(`${BASE}/api/auth/test-login`, {
      data: { email: 'e2e-student@neramclasses.com', role: 'student' },
    });
    expect(studentRes.ok()).toBeTruthy();
    studentToken = (await studentRes.json()).testToken;
  });

  test.describe('Gallery Feed Endpoint', () => {
    test('GET /api/drawing/gallery returns posts array', async ({ request }) => {
      const res = await request.get(`${BASE}/api/drawing/gallery`, {
        headers: { Authorization: `Bearer ${studentToken}` },
      });
      expect(res.status()).toBe(200);
      const body = await res.json();
      expect(body.posts).toBeDefined();
      expect(Array.isArray(body.posts)).toBe(true);
    });

    test('GET /api/drawing/gallery without auth returns error', async ({ request }) => {
      const res = await request.get(`${BASE}/api/drawing/gallery`, {
        headers: { Authorization: '' },
        failOnStatusCode: false,
      });
      expect([401, 500]).toContain(res.status());
    });

    test('GET /api/drawing/gallery respects limit param', async ({ request }) => {
      const res = await request.get(`${BASE}/api/drawing/gallery?limit=2`, {
        headers: { Authorization: `Bearer ${studentToken}` },
      });
      expect(res.status()).toBe(200);
      const body = await res.json();
      expect(body.posts.length).toBeLessThanOrEqual(2);
    });

    test('GET /api/drawing/gallery respects offset param', async ({ request }) => {
      const allRes = await request.get(`${BASE}/api/drawing/gallery?limit=50`, {
        headers: { Authorization: `Bearer ${studentToken}` },
      });
      const allPosts = (await allRes.json()).posts;

      if (allPosts.length > 1) {
        const offsetRes = await request.get(`${BASE}/api/drawing/gallery?limit=50&offset=1`, {
          headers: { Authorization: `Bearer ${studentToken}` },
        });
        const offsetPosts = (await offsetRes.json()).posts;
        expect(offsetPosts.length).toBe(allPosts.length - 1);
      }
    });

    test('GET /api/drawing/gallery default limit is 12', async ({ request }) => {
      const res = await request.get(`${BASE}/api/drawing/gallery`, {
        headers: { Authorization: `Bearer ${studentToken}` },
      });
      expect(res.status()).toBe(200);
      const body = await res.json();
      expect(body.posts.length).toBeLessThanOrEqual(12);
    });

    test('GET /api/drawing/gallery filters by category', async ({ request }) => {
      const res = await request.get(`${BASE}/api/drawing/gallery?category=2d_composition`, {
        headers: { Authorization: `Bearer ${studentToken}` },
      });
      expect(res.status()).toBe(200);
      const body = await res.json();
      expect(body.posts).toBeDefined();
      for (const post of body.posts) {
        if (post.question) {
          expect(post.question.category).toBe('2d_composition');
        }
      }
    });

    test('GET /api/drawing/gallery with hasReference=true filters to posts with corrected_image_url', async ({ request }) => {
      const res = await request.get(`${BASE}/api/drawing/gallery?hasReference=true`, {
        headers: { Authorization: `Bearer ${studentToken}` },
      });
      expect(res.status()).toBe(200);
      const body = await res.json();
      expect(body.posts).toBeDefined();
      for (const post of body.posts) {
        expect(post.corrected_image_url).toBeTruthy();
      }
    });

    test('GET /api/drawing/gallery hasReference subset check', async ({ request }) => {
      const allRes = await request.get(`${BASE}/api/drawing/gallery?limit=50`, {
        headers: { Authorization: `Bearer ${studentToken}` },
      });
      const allPosts = (await allRes.json()).posts;

      const refRes = await request.get(`${BASE}/api/drawing/gallery?hasReference=true&limit=50`, {
        headers: { Authorization: `Bearer ${studentToken}` },
      });
      const refPosts = (await refRes.json()).posts;

      expect(refPosts.length).toBeLessThanOrEqual(allPosts.length);
    });

    test('gallery posts include original_image_url field', async ({ request }) => {
      const res = await request.get(`${BASE}/api/drawing/gallery`, {
        headers: { Authorization: `Bearer ${studentToken}` },
      });
      const body = await res.json();
      for (const post of body.posts) {
        expect(post.original_image_url).toBeDefined();
        expect(typeof post.original_image_url).toBe('string');
      }
    });

    test('gallery posts include reaction counts and user_reactions', async ({ request }) => {
      const res = await request.get(`${BASE}/api/drawing/gallery`, {
        headers: { Authorization: `Bearer ${studentToken}` },
      });
      const body = await res.json();
      for (const post of body.posts) {
        expect(post.reactions).toBeDefined();
        expect(post.reactions).toHaveProperty('heart');
        expect(post.reactions).toHaveProperty('clap');
        expect(post.reactions).toHaveProperty('fire');
        expect(post.reactions).toHaveProperty('star');
        expect(post.reactions).toHaveProperty('wow');
        expect(post.user_reactions).toBeDefined();
        expect(Array.isArray(post.user_reactions)).toBe(true);
        expect(typeof post.comment_count).toBe('number');
      }
    });
  });

  test.describe('Gallery Publish RBAC', () => {
    test('POST /api/drawing/gallery/publish requires teacher role', async ({ request }) => {
      const res = await request.post(`${BASE}/api/drawing/gallery/publish`, {
        headers: { Authorization: `Bearer ${studentToken}`, 'Content-Type': 'application/json' },
        data: { submission_id: '00000000-0000-0000-0000-000000000000', publish: false },
        failOnStatusCode: false,
      });
      expect(res.status()).toBe(403);
    });

    test('teacher can call gallery publish endpoint', async ({ request }) => {
      const res = await request.post(`${BASE}/api/drawing/gallery/publish`, {
        headers: { Authorization: `Bearer ${teacherToken}`, 'Content-Type': 'application/json' },
        data: { submission_id: '00000000-0000-0000-0000-000000000000', publish: false },
        failOnStatusCode: false,
      });
      expect(res.status()).not.toBe(401);
      expect(res.status()).not.toBe(403);
    });
  });
});

// The student Gallery and Reference tabs left with /student/drawings (retired September 2026, the page now redirects to Inspiration). Inspiration replaces them.

// The teacher Gallery tab left with the Drawing Reviews queue (retired September 2026). Inspiration replaces it.

// ============================================================
// PART 6: Role-Based Access (Student cannot unpublish)
// ============================================================

test.describe('Gallery RBAC - Student restrictions', () => {
  test.use({ baseURL: BASE });

  test('student cannot access gallery publish/unpublish endpoint', async ({ request }) => {
    const authRes = await request.post(`${BASE}/api/auth/test-login`, {
      data: { email: 'e2e-student@neramclasses.com', role: 'student' },
    });
    const studentToken = (await authRes.json()).testToken;

    const res = await request.post(`${BASE}/api/drawing/gallery/publish`, {
      headers: { Authorization: `Bearer ${studentToken}`, 'Content-Type': 'application/json' },
      data: { submission_id: '00000000-0000-0000-0000-000000000000', publish: false },
      failOnStatusCode: false,
    });
    expect(res.status()).toBe(403);
  });
});
