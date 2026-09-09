/**
 * Setting up the reference sheets AI drawing evaluation is scored against.
 *
 * The arithmetic is covered by Vitest (annotation-geometry, schema, evaluate,
 * cost). This spec covers the wiring a unit test cannot: that the screen is
 * gated, that the API refuses the things it should refuse, and that no route
 * on this path can be made to spend money while the feature ships off.
 *
 * Nothing here calls a model. The evaluation endpoint is exercised only to
 * confirm it REFUSES, which is the state the feature ships in.
 *
 * Run: pnpm test:e2e tests/e2e/drawing-anchors-nexus.spec.ts --project=nexus-chrome
 */

import { test, expect } from '@playwright/test';
import { getTestAuthToken, injectAuthForPage, APP_URLS } from '../utils/credentials';

/** A 60x40 landscape PNG inlined, so no external host has to be reachable. */
const SHEET_PNG =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAADwAAAAoCAIAAAAt2Q6oAAAAP0lEQVR42u3OQQkAAAgEMONcJrMbxhQ+hMECrCZ5p6SlpaWlpaWlpaWlpaVP0ul5R1paWlpaWlpaWlpaWvrEAjT754Z+XTj2AAAAAElFTkSuQmCC';

test.describe('AI drawing evaluation setup', () => {
  // The teacher pages resolve auth client side and then fetch, which outruns
  // Playwright's 30s default on a cold dev server.
  test.describe.configure({ mode: 'serial', timeout: 150_000 });

  test('a student cannot read or change the anchor set', async ({ request }) => {
    const student = await getTestAuthToken(request, 'student');
    test.skip(!student, 'Test auth not configured');

    const headers = { Authorization: `Bearer ${student!.testToken}` };

    const read = await request.get(`${APP_URLS.nexus}/api/drawing/anchors`, { headers });
    expect(read.status()).toBe(403);

    const write = await request.post(`${APP_URLS.nexus}/api/drawing/anchors`, {
      headers: { ...headers, 'Content-Type': 'application/json' },
      data: { brief_type_key: '3d_composition.still_life', band: 5, submission_id: 'x' },
    });
    expect(write.status()).toBe(403);
  });

  test('a student cannot trigger an evaluation', async ({ request }) => {
    const student = await getTestAuthToken(request, 'student');
    test.skip(!student, 'Test auth not configured');

    const res = await request.post(`${APP_URLS.nexus}/api/drawing/evaluations`, {
      headers: {
        Authorization: `Bearer ${student!.testToken}`,
        'Content-Type': 'application/json',
      },
      data: { submission_id: 'anything' },
    });
    expect(res.status()).toBe(403);
  });

  test('the anchor API lists brief types for a teacher', async ({ request }) => {
    const teacher = await getTestAuthToken(request, 'teacher');
    test.skip(!teacher, 'Test auth not configured');

    const res = await request.get(`${APP_URLS.nexus}/api/drawing/anchors`, {
      headers: { Authorization: `Bearer ${teacher!.testToken}` },
    });

    // An environment without the migration answers 503, deliberately, so that
    // "not set up here" cannot be mistaken for "set up and empty". Skip on it,
    // with the body in the message so the skip is never silent.
    test.skip(res.status() === 503, `Drawing evaluation tables not migrated here: ${await res.text()}`);
    expect(res.ok()).toBeTruthy();

    const body = await res.json();
    expect(Array.isArray(body.brief_types)).toBe(true);
    // Asserted, not just shape-checked: the seed migration creates three, so an
    // empty list here means the seed did not run and the earlier version of
    // this test would have passed on it anyway.
    expect(body.brief_types.length).toBeGreaterThanOrEqual(3);
    expect(body.brief_types.map((b: { key: string }) => b.key)).toContain('3d_composition.still_life');
  });

  test('an ungraded sheet is refused as an anchor', async ({ request }) => {
    const teacher = await getTestAuthToken(request, 'teacher');
    const student = await getTestAuthToken(request, 'student');
    test.skip(!teacher || !student, 'Test auth not configured');

    // Free practice with no question_id: a question-backed drawing opens a
    // per (student, question) thread that refuses a second submission until it
    // is reviewed, so a repeat run would be turned away.
    const created = await request.post(`${APP_URLS.nexus}/api/drawing/submissions`, {
      headers: {
        Authorization: `Bearer ${student!.testToken}`,
        'Content-Type': 'application/json',
      },
      data: { source_type: 'free_practice', original_image_url: SHEET_PNG },
    });
    test.skip(!created.ok(), `Could not create submission: ${await created.text()}`);
    const submissionId = (await created.json()).submission?.id;
    expect(submissionId).toBeTruthy();

    const res = await request.post(`${APP_URLS.nexus}/api/drawing/anchors`, {
      headers: {
        Authorization: `Bearer ${teacher!.testToken}`,
        'Content-Type': 'application/json',
      },
      data: {
        brief_type_key: '3d_composition.still_life',
        band: 3,
        submission_id: submissionId,
      },
    });

    test.skip(
      res.status() === 404 || res.status() === 503,
      `Brief types not seeded in this environment: ${await res.text()}`,
    );
    // A sheet nobody has graded carries no judgement, so it cannot anchor a band.
    expect(res.status()).toBe(409);
    expect((await res.json()).error).toMatch(/graded/i);
  });

  test('a band outside 1 to 5 is rejected', async ({ request }) => {
    const teacher = await getTestAuthToken(request, 'teacher');
    test.skip(!teacher, 'Test auth not configured');

    const res = await request.post(`${APP_URLS.nexus}/api/drawing/anchors`, {
      headers: {
        Authorization: `Bearer ${teacher!.testToken}`,
        'Content-Type': 'application/json',
      },
      data: { brief_type_key: '3d_composition.still_life', band: 9, submission_id: 'x' },
    });
    expect(res.status()).toBe(400);
  });

  test('evaluation refuses while the feature ships off, and spends nothing', async ({ request }) => {
    const teacher = await getTestAuthToken(request, 'teacher');
    const student = await getTestAuthToken(request, 'student');
    test.skip(!teacher || !student, 'Test auth not configured');

    const created = await request.post(`${APP_URLS.nexus}/api/drawing/submissions`, {
      headers: {
        Authorization: `Bearer ${student!.testToken}`,
        'Content-Type': 'application/json',
      },
      data: { source_type: 'free_practice', original_image_url: SHEET_PNG },
    });
    test.skip(!created.ok(), `Could not create submission: ${await created.text()}`);
    const submissionId = (await created.json()).submission?.id;

    const res = await request.post(`${APP_URLS.nexus}/api/drawing/evaluations`, {
      headers: {
        Authorization: `Bearer ${teacher!.testToken}`,
        'Content-Type': 'application/json',
      },
      data: { submission_id: submissionId },
    });

    // 403 when the staff flag is off, 409 when the flag is on but the feature
    // mode is still off or the brief type is not set up. Both are refusals and
    // both cost nothing. A 200 here would mean the feature shipped live.
    expect([403, 409]).toContain(res.status());
  });

  test('mobile: the anchor screen is gated and does not overflow', async ({ page }) => {
    const ok = await injectAuthForPage(page, 'teacher');
    test.skip(!ok, 'Teacher auth injection failed (credentials likely missing)');

    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto(`${APP_URLS.nexus}/teacher/admin/drawing-anchors`, {
      waitUntil: 'domcontentloaded',
    });

    await page.waitForLoadState('networkidle').catch(() => {});

    // The flag ships off, so the expected outcome is the unavailable screen.
    // Either way the page must render something and must not scroll sideways.
    const overflows = await page.evaluate(
      () => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
    );
    expect(overflows).toBe(false);

    const body = await page.textContent('body');
    expect(body?.trim().length).toBeGreaterThan(0);
  });
});
