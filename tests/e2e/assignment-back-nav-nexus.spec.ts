/**
 * Assignment detail — Back navigation + breadcrumb (regression guard).
 *
 * The teacher assignment detail "Back" button must ALWAYS return to the
 * Assignments list (/teacher/assignments), never to whatever the browser
 * history happens to point at. Previously it used router.back(), so after a
 * teacher opened a drawing submission (which navigates back with router.push,
 * stacking history) the detail's Back landed on the submission page instead of
 * the list. It now does an explicit router.push('/teacher/assignments').
 *
 * To prove the fix we seed history with a NON-list page (drawing-reviews) before
 * opening the detail: a history-based Back would return there, an explicit push
 * lands on the list.
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
    test.skip(!token || !classroomId, 'Nexus test-login / classroom unavailable');
    test.skip(!assignmentId, 'No assignment available to open');

    const ok = await injectAuthForPage(page, 'teacher');
    test.skip(!ok, 'Teacher auth injection failed (credentials likely missing)');

    // Seed history with a NON-list page. A history-based back() would return here.
    await page.goto(`${NEXUS}/teacher/drawing-reviews`, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(1500);

    // Open the assignment detail (history is now [..., drawing-reviews, detail]).
    await page.goto(`${NEXUS}/teacher/assignments/${assignmentId}`, { waitUntil: 'domcontentloaded' });

    const backBtn = page.getByRole('button', { name: /^back$/i });
    await expect(backBtn).toBeVisible({ timeout: 15000 });
    await backBtn.click();

    // Must land on the list, NOT the drawing-reviews page we seeded.
    await page.waitForURL('**/teacher/assignments', { timeout: 15000 });
    expect(page.url()).not.toContain('drawing-reviews');
    expect(page.url()).not.toContain(assignmentId);
  });

  test('detail page shows an Assignments breadcrumb that links to the list', async ({ page }) => {
    test.skip(!token || !assignmentId, 'No assignment available to open');

    const ok = await injectAuthForPage(page, 'teacher');
    test.skip(!ok, 'Teacher auth injection failed (credentials likely missing)');

    await page.goto(`${NEXUS}/teacher/assignments/${assignmentId}`, { waitUntil: 'domcontentloaded' });

    // The breadcrumb renders once the assignment loads. Scope to the breadcrumb
    // nav so we do not match the sidebar's "Assignments" nav link.
    const crumb = page
      .getByRole('navigation', { name: /breadcrumb/i })
      .getByRole('link', { name: /^assignments$/i });
    await expect(crumb).toBeVisible({ timeout: 15000 });
    await expect(crumb).toHaveAttribute('href', '/teacher/assignments');

    // Clicking the crumb also returns to the list.
    await crumb.click();
    await page.waitForURL('**/teacher/assignments', { timeout: 15000 });
    expect(page.url()).not.toContain(assignmentId);
  });
});
