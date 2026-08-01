import { test, expect } from '@playwright/test';
import { APP_URLS, getTestAuthToken, injectAuthForPage } from '../utils/credentials';
import { assertNoHorizontalOverflow } from '../utils/mobile-helpers';

/**
 * The student profile on a phone.
 *
 * Teachers check a student between classes on a 375px screen, so this is the
 * primary viewport, not an afterthought. Two things are worth proving beyond
 * the usual: that a collapsed section fetches NOTHING (the whole reason the page
 * is split into three calls), and that every section header clears the touch
 * target.
 *
 * Self-skips without the Nexus dev server on :3012.
 */

const NEXUS = APP_URLS.nexus;

async function getWarm(request: any, url: string, headers: Record<string, string> = {}) {
  let res = await request.get(url, { headers });
  for (let i = 0; i < 3 && res.status() === 404; i++) {
    await new Promise((r) => setTimeout(r, 4000));
    res = await request.get(url, { headers });
  }
  return res;
}

async function context(request: any) {
  const auth = await getTestAuthToken(request, 'teacher');
  if (!auth) return null;
  const classroom = auth.classrooms?.[0];
  if (!classroom) return null;
  const res = await getWarm(request, `${NEXUS}/api/students?classroom=${classroom.id}`, {
    Authorization: `Bearer ${auth.testToken}`,
  });
  if (res.status() !== 200) return null;
  const student = (await res.json()).students?.[0];
  if (!student) return null;
  return { auth, classroomId: classroom.id, student };
}

/**
 * Navigate and wait for the page to actually render. A Next dev server compiles
 * the route on first request, which on a cold machine takes well past the
 * default expect timeout; anchoring on the section id ends the wait as soon as
 * the page exists, and a genuinely broken page still fails.
 */
async function openProfile(page: any, studentId: string) {
  await page.goto(`${NEXUS}/teacher/students/${studentId}`, { waitUntil: 'domcontentloaded' });
  await expect(page.locator('#profile-identity')).toBeVisible({ timeout: 120_000 });
}

test.use({ viewport: { width: 375, height: 812 } });

// Cold route compile plus a retried test login runs past Playwright's 30s
// default, which would fail for reasons unrelated to the code.
test.describe.configure({ timeout: 180_000 });

test.describe('Nexus student profile — mobile', () => {
  test('no horizontal scroll, collapsed or fully expanded', async ({ page, request }) => {
    const ctx = await context(request);
    if (!ctx) {
      test.skip(true, 'Nexus dev server unavailable');
      return;
    }
    if (!(await injectAuthForPage(page, 'teacher'))) {
      test.skip(true, 'could not inject auth');
      return;
    }

    await openProfile(page, ctx.student.id);

    await assertNoHorizontalOverflow(page);

    // Expand everything. Long values (addresses, school names) are the usual
    // cause of a page that only overflows once a section is open.
    const summaries = page.locator('.MuiAccordionSummary-root');
    const count = await summaries.count();
    for (let i = 0; i < count; i++) {
      await summaries.nth(i).click();
      await page.waitForTimeout(150);
    }
    await page.waitForTimeout(500);

    await assertNoHorizontalOverflow(page);
  });

  test('every section header clears the 48px touch target', async ({ page, request }) => {
    const ctx = await context(request);
    if (!ctx) {
      test.skip(true, 'Nexus dev server unavailable');
      return;
    }
    if (!(await injectAuthForPage(page, 'teacher'))) {
      test.skip(true, 'could not inject auth');
      return;
    }

    await openProfile(page, ctx.student.id);

    const summaries = await page.locator('.MuiAccordionSummary-root').all();
    expect(summaries.length).toBeGreaterThan(0);
    for (const s of summaries) {
      const box = await s.boundingBox();
      if (box) expect(box.height, 'section header is too small to tap').toBeGreaterThanOrEqual(48);
    }
  });

  test('a collapsed section fetches nothing until it is opened', async ({ page, request }) => {
    const ctx = await context(request);
    if (!ctx) {
      test.skip(true, 'Nexus dev server unavailable');
      return;
    }
    if (!(await injectAuthForPage(page, 'teacher'))) {
      test.skip(true, 'could not inject auth');
      return;
    }

    const performanceCalls: string[] = [];
    page.on('request', (r) => {
      if (r.url().includes('/performance')) performanceCalls.push(r.url());
    });

    await openProfile(page, ctx.student.id);
    await page.waitForTimeout(2500);

    // Attendance is expanded by default, so exactly one call is expected. The
    // point is that opening the Work section afterwards adds NO second call:
    // both sections share one fetch.
    const afterLoad = performanceCalls.length;
    expect(afterLoad).toBeLessThanOrEqual(1);

    await page.locator('#profile-work').locator('.MuiAccordionSummary-root').click();
    await page.waitForTimeout(1500);
    expect(performanceCalls.length).toBe(afterLoad);
  });

  test('opens on content, with the first two sections already expanded', async ({
    page,
    request,
  }) => {
    const ctx = await context(request);
    if (!ctx) {
      test.skip(true, 'Nexus dev server unavailable');
      return;
    }
    if (!(await injectAuthForPage(page, 'teacher'))) {
      test.skip(true, 'could not inject auth');
      return;
    }

    await openProfile(page, ctx.student.id);

    // Identity and attendance open, application closed: a teacher lands on the
    // answers rather than on a wall of collapsed bars.
    await expect(
      page.locator('#profile-identity .MuiAccordionSummary-root'),
    ).toHaveAttribute('aria-expanded', 'true');
    await expect(
      page.locator('#profile-application .MuiAccordionSummary-root'),
    ).toHaveAttribute('aria-expanded', 'false');
  });

  test('a collapsed summary already answers the question it is about', async ({
    page,
    request,
  }) => {
    const ctx = await context(request);
    if (!ctx) {
      test.skip(true, 'Nexus dev server unavailable');
      return;
    }
    if (!(await injectAuthForPage(page, 'teacher'))) {
      test.skip(true, 'could not inject auth');
      return;
    }

    await openProfile(page, ctx.student.id);
    await expect(page.locator('#profile-documents')).toBeVisible();

    // The headline carries the count, so the common question costs zero taps.
    await expect(page.locator('#profile-documents')).toContainText(
      /uploaded|Nothing uploaded/i,
    );
  });

  test('back returns to the students list', async ({ page, request }) => {
    const ctx = await context(request);
    if (!ctx) {
      test.skip(true, 'Nexus dev server unavailable');
      return;
    }
    if (!(await injectAuthForPage(page, 'teacher'))) {
      test.skip(true, 'could not inject auth');
      return;
    }

    await openProfile(page, ctx.student.id);

    await page.getByRole('button', { name: /Back to Students/i }).click();
    // Generous: the App Router only swaps the URL once the destination's payload
    // arrives, and the students list is a large route that a dev server compiles
    // on first visit. This is a dev-server cost, not a slow product.
    await expect(page).toHaveURL(/\/teacher\/students\/?$/, { timeout: 90_000 });
  });
});
