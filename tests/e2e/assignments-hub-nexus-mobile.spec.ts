/**
 * Teacher Assignments screens on a phone (375px), after the 2026-09-24 mobile pass.
 *
 * What each test guards:
 *  - the first assignment card is on the first screen (the old hub spent the
 *    whole fold on four decorative tiles and three stacked buttons);
 *  - the status tiles ARE the filter, and the filter lives in the URL;
 *  - Delete is in the card's menu, not a bare icon beside the chevron;
 *  - nothing sticks out of the viewport, measured per element, because
 *    html/body/main clip overflow and a scrollWidth check always passes;
 *  - the Questions page's Save bar is above the bottom nav, not under it.
 *
 * Read-only: opens menus and filters, never publishes or deletes.
 * Run: pnpm test:e2e --project=nexus-chrome --no-deps assignments-hub-nexus-mobile
 */
import { test, expect, type Page } from '@playwright/test';
import { getTestAuthToken, injectAuthForPage, APP_URLS } from '../utils/credentials';

const NEXUS = APP_URLS.nexus;

test.use({ viewport: { width: 375, height: 812 } });

/** Elements in main whose right edge passes the viewport. */
async function overflowingElements(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const w = document.documentElement.clientWidth;
    const bad: string[] = [];
    document.querySelectorAll('main *').forEach((el) => {
      const r = el.getBoundingClientRect();
      if (r.width > 0 && r.right > w + 1) bad.push(`${el.tagName} right=${Math.round(r.right)}`);
    });
    return bad.slice(0, 5);
  });
}

test.describe('Nexus teacher Assignments on a phone', () => {
  test.describe.configure({ mode: 'serial' });

  let hasAssignments = false;
  let firstId: string | null = null;

  test.beforeAll(async ({ request }) => {
    const auth = await getTestAuthToken(request, 'teacher');
    const classroomId = auth?.classrooms?.[0]?.id;
    if (!auth || !classroomId) return;
    const res = await request.get(`${NEXUS}/api/assignments?classroom=${classroomId}`, {
      headers: { Authorization: `Bearer ${auth.testToken}` },
    });
    if (res.ok()) {
      const { assignments } = await res.json();
      hasAssignments = (assignments?.length ?? 0) > 0;
      firstId = assignments?.[0]?.id ?? null;
    }
  });

  test.beforeEach(async ({ page }) => {
    test.setTimeout(120_000);
    const ok = await injectAuthForPage(page, 'teacher');
    test.skip(!ok, 'Teacher test-login unavailable');
  });

  test('hub: first assignment is above the fold, with no overflow', async ({ page }) => {
    test.skip(!hasAssignments, 'Test teacher has no assignments');
    await page.goto(`${NEXUS}/teacher/assignments`, { waitUntil: 'domcontentloaded' });
    await expect(page.getByRole('heading', { level: 1, name: 'Assignments' })).toBeVisible({ timeout: 60000 });

    const firstCard = page.getByRole('main').locator('a[href^="/teacher/assignments/"]:not([href$="/overview"])').first();
    await expect(firstCard).toBeVisible({ timeout: 45000 });
    const box = await firstCard.boundingBox();
    // Above the bottom nav (64px) on an 812px screen.
    expect(box!.y).toBeLessThan(812 - 64 - 40);

    expect(await overflowingElements(page)).toEqual([]);
  });

  test('hub: status tiles filter the list and write the URL', async ({ page }) => {
    test.skip(!hasAssignments, 'Test teacher has no assignments');
    await page.goto(`${NEXUS}/teacher/assignments`, { waitUntil: 'domcontentloaded' });
    const tiles = page.getByRole('group', { name: 'Filter assignments by status' });
    await expect(tiles).toBeVisible({ timeout: 60000 });

    const all = tiles.getByRole('button', { name: /All/ });
    await expect(all).toHaveAttribute('aria-pressed', 'true');

    const drafts = tiles.getByRole('button', { name: /Drafts/ });
    await drafts.click();
    await expect(drafts).toHaveAttribute('aria-pressed', 'true');
    await expect(page).toHaveURL(/status=draft/);

    // Every card left is a draft.
    const chips = page.getByRole('main').locator('.MuiChip-label');
    const labels = await chips.allTextContents();
    for (const l of labels.filter((x) => /^(draft|published|closed)$/i.test(x))) {
      expect(l.toLowerCase()).toBe('draft');
    }

    // Tiles are at least 56px tall, well past the 44px touch minimum.
    const tileBox = await drafts.boundingBox();
    expect(tileBox!.height).toBeGreaterThanOrEqual(44);
  });

  test('hub: Delete lives in the card menu', async ({ page }) => {
    test.skip(!hasAssignments, 'Test teacher has no assignments');
    await page.goto(`${NEXUS}/teacher/assignments`, { waitUntil: 'domcontentloaded' });
    const more = page.getByRole('button', { name: /^More actions for / }).first();
    await expect(more).toBeVisible({ timeout: 60000 });
    const b = await more.boundingBox();
    expect(b!.width).toBeGreaterThanOrEqual(44);
    expect(b!.height).toBeGreaterThanOrEqual(44);

    await expect(page.getByRole('main').getByRole('button', { name: /^Delete$/ })).toHaveCount(0);
    await more.click();
    await expect(page.getByRole('menuitem', { name: 'Delete' })).toBeVisible();
    await page.keyboard.press('Escape');
  });

  test('detail: one row of actions, count tiles, no overflow', async ({ page }) => {
    test.skip(!firstId, 'Test teacher has no assignments');
    await page.goto(`${NEXUS}/teacher/assignments/${firstId}`, { waitUntil: 'domcontentloaded' });
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible({ timeout: 60000 });

    await expect(page.getByRole('button', { name: 'More actions' })).toBeVisible();
    await expect(page.getByRole('group', { name: 'Show students by submission' })).toBeVisible();
    expect(await overflowingElements(page)).toEqual([]);
  });

  test('questions: Save sits above the bottom nav', async ({ page }) => {
    test.skip(!firstId, 'Test teacher has no assignments');
    await page.goto(`${NEXUS}/teacher/assignments/${firstId}/questions`, { waitUntil: 'domcontentloaded' });
    const save = page.getByRole('button', { name: /^Save/ });
    const locked = page.getByText(/can no longer be changed/);
    await expect(save.or(locked).first()).toBeVisible({ timeout: 60000 });
    test.skip(await locked.isVisible(), 'Paper is locked, so there is no Save bar');

    const s = await save.boundingBox();
    // The bottom nav occupies the last 64px.
    expect(s!.y + s!.height).toBeLessThanOrEqual(812 - 64);
    // And it is the element actually hit at its centre, not the nav.
    const hit = await page.evaluate(
      ([x, y]) => document.elementFromPoint(x, y)?.closest('button')?.textContent ?? '',
      [s!.x + s!.width / 2, s!.y + s!.height / 2],
    );
    expect(hit).toMatch(/^Save/);
  });
});
