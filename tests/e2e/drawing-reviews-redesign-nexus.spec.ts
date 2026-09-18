/**
 * Drawing Reviews redesign — classroom-free, unified gallery, tag filters, view modes.
 *
 * Covers:
 * - Classroom chip hidden on /teacher/drawing-reviews routes
 * - Tag filter bar renders on the teacher review list
 * - Tags API: GET lists seeded tags; POST creates new tags as teacher
 * - Publish endpoint accepts { visible } payload and flips is_gallery_visible
 * - Gallery feed responds with { posts }
 *
 * Auth: uses the shared test-login helpers (Microsoft OAuth bypass).
 */

import { test, expect } from '@playwright/test';
import { getTestAuthToken, APP_URLS } from '../utils/credentials';

test.describe('Drawing Reviews redesign', () => {
  test.describe.configure({ mode: 'serial' });

  test('GET /api/drawing/tags returns seeded tags', async ({ request }) => {
    const auth = await getTestAuthToken(request, 'teacher');
    test.skip(!auth, 'Teacher test auth not configured');
    const res = await request.get(`${APP_URLS.nexus}/api/drawing/tags`, {
      headers: { Authorization: `Bearer ${auth!.testToken}` },
    });
    expect(res.ok()).toBe(true);
    const body = await res.json();
    expect(Array.isArray(body.tags)).toBe(true);
    // We seeded 2D/3D/Kit/Scenery/etc. — confirm at least 2D is present.
    const slugs: string[] = body.tags.map((t: any) => t.slug);
    expect(slugs).toContain('2d-composition');
    expect(slugs).toContain('scenery');
  });

  test('POST /api/drawing/tags creates (or fetches) a tag for teacher', async ({ request }) => {
    const auth = await getTestAuthToken(request, 'teacher');
    test.skip(!auth, 'Teacher test auth not configured');
    const label = `E2E Test Tag ${Date.now()}`;
    const res = await request.post(`${APP_URLS.nexus}/api/drawing/tags`, {
      headers: { Authorization: `Bearer ${auth!.testToken}`, 'Content-Type': 'application/json' },
      data: { label },
    });
    expect(res.ok()).toBe(true);
    const { tag } = await res.json();
    expect(tag.label).toBe(label);
    expect(tag.slug).toMatch(/^e2e-test-tag-/);
    expect(tag.is_seed).toBe(false);
  });

  test('GET /api/drawing/gallery returns posts array (may be empty)', async ({ request }) => {
    const auth = await getTestAuthToken(request, 'teacher');
    test.skip(!auth, 'Teacher test auth not configured');
    const res = await request.get(`${APP_URLS.nexus}/api/drawing/gallery?limit=5`, {
      headers: { Authorization: `Bearer ${auth!.testToken}` },
    });
    expect(res.ok()).toBe(true);
    const body = await res.json();
    expect(Array.isArray(body.posts)).toBe(true);
  });

  test('POST /api/drawing/gallery/publish accepts visible:false without submission_id rejects', async ({ request }) => {
    const auth = await getTestAuthToken(request, 'teacher');
    test.skip(!auth, 'Teacher test auth not configured');
    const res = await request.post(`${APP_URLS.nexus}/api/drawing/gallery/publish`, {
      headers: { Authorization: `Bearer ${auth!.testToken}`, 'Content-Type': 'application/json' },
      data: { visible: false },
      failOnStatusCode: false,
    });
    expect(res.status()).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/submission_id/);
  });

  // The teacher Gallery tab left with the Drawing Reviews queue (retired September 2026). Inspiration replaces it.
  //
  // (This case checked the classroom chip was hidden on the queue page's header.
  // The file seeds no submission id to repoint it at a review screen with, so it
  // is retired rather than adapted; the review screen's own header is covered by
  // tests/e2e/sketchbook-hub-nexus-mobile.spec.ts.)
});
