/**
 * Assignment detail, Back navigation (regression guard).
 *
 * The teacher assignment detail "Back" button must ALWAYS return to the
 * Assignments list (/teacher/assignments), never to whatever the browser
 * history happens to point at. Previously it used router.back(), so after a
 * teacher opened a drawing submission (which navigates back with router.push,
 * stacking history) the detail's Back landed on the submission page instead of
 * the list. It is now a link with an explicit href to /teacher/assignments,
 * labelled "Assignments" so it says where it goes. The breadcrumb that used to
 * repeat the same link one line lower was removed in the 2026-09-24 mobile pass.
 *
 * To prove the fix we seed history with a NON-list page (the teacher's
 * Sketchbooks hub) before opening the detail: a history-based Back would
 * return there, an explicit push lands on the list.
 *
 * Auth: shared test-login helpers (Microsoft OAuth bypass). Self-skips when the
 * Nexus dev server / test-login is unavailable or the teacher has no classroom.
 * Run: pnpm test:e2e --project=nexus-chrome --no-deps assignment-back-nav-nexus
 */

import { test, expect, request as apiRequest } from '@playwright/test';
import { getTestAuthToken, injectAuthForPage, APP_URLS } from '../utils/credentials';

const NEXUS = APP_URLS.nexus;

test.describe('Nexus — Assignment detail Back navigation', () => {
  test.describe.configure({ mode: 'serial' });

  let token = '';
  let classroomId: string | null = null;
  let assignmentId: string | null = null;
  let createdAssignment = false; // only delete what this suite created

  test.beforeAll(async () => {
    const ctx = await apiRequest.newContext();
    try {
      const auth = await getTestAuthToken(ctx, 'teacher');
      if (!auth) return; // tests self-skip below
      token = auth.testToken;
      classroomId = auth.classrooms?.[0]?.id ?? null;
      if (!classroomId) return;

      // Prefer an existing assignment; create a throwaway draft only if none exist.
      const listRes = await ctx.get(`${NEXUS}/api/assignments?classroom=${classroomId}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (listRes.ok()) {
        const { assignments } = await listRes.json();
        assignmentId = assignments?.[0]?.id ?? null;
      }
      if (!assignmentId) {
        const createRes = await ctx.post(`${NEXUS}/api/assignments`, {
          headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
          data: {
            action: 'create',
            classroom_id: classroomId,
            assignment_type: 'document',
            title: `e2e-back-nav ${Date.now()}`,
          },
        });
        if (createRes.ok()) {
          assignmentId = (await createRes.json()).assignment?.id ?? null;
          createdAssignment = !!assignmentId;
        }
      }
    } finally {
      await ctx.dispose();
    }
  });

  test.afterAll(async () => {
    if (!createdAssignment || !assignmentId || !token) return;
    const ctx = await apiRequest.newContext();
    try {
      await ctx.delete(`${NEXUS}/api/assignments/${assignmentId}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
    } catch {
      /* best-effort cleanup */
    } finally {
      await ctx.dispose();
    }
  });

  test('Back returns to the Assignments list even after visiting another page', async ({ page }) => {
    // Two cold routes in one test (the sketchbook seed page, then the
    // assignment detail), each able to take 26-36s to compile on a first hit;
    // the 30s default budget is tight for both back to back.
    test.setTimeout(90_000);
    test.skip(!token || !classroomId, 'Nexus test-login / classroom unavailable');
    test.skip(!assignmentId, 'No assignment available to open');

    const ok = await injectAuthForPage(page, 'teacher');
    test.skip(!ok, 'Teacher auth injection failed (credentials likely missing)');

    // Seed history with a NON-list page. A history-based back() would return here.
    await page.goto(`${NEXUS}/teacher/sketchbook`, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(1500);

    // Open the assignment detail (history is now [..., sketchbook, detail]).
    await page.goto(`${NEXUS}/teacher/assignments/${assignmentId}`, { waitUntil: 'domcontentloaded' });

    // This fixture assignment's own detail page is slow to answer on staging
    // (observed ~20s for its data fetch alone, precompiled or not), so the
    // 15s Playwright default is too tight here even with the compile paid for.
    const backBtn = page.getByRole('main').getByRole('link', { name: /^assignments$/i });
    await expect(backBtn).toBeVisible({ timeout: 45000 });
    await backBtn.click();

    // Must land on the list, NOT the sketchbook page we seeded.
    await page.waitForURL('**/teacher/assignments', { timeout: 15000 });
    expect(page.url()).not.toContain('sketchbook');
    expect(page.url()).not.toContain(assignmentId);
  });

  test('detail page has exactly one Back link, and it points at the list', async ({ page }) => {
    test.skip(!token || !assignmentId, 'No assignment available to open');

    const ok = await injectAuthForPage(page, 'teacher');
    test.skip(!ok, 'Teacher auth injection failed (credentials likely missing)');

    await page.goto(`${NEXUS}/teacher/assignments/${assignmentId}`, { waitUntil: 'domcontentloaded' });

    // Scoped to main so the sidebar's own "Assignments" nav link does not count.
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible({ timeout: 45000 });
    const back = page.getByRole('main').getByRole('link', { name: /^assignments$/i });
    await expect(back).toHaveCount(1);
    await expect(back).toHaveAttribute('href', '/teacher/assignments');
    await expect(page.getByRole('navigation', { name: /breadcrumb/i })).toHaveCount(0);
  });
});
