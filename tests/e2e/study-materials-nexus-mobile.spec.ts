/**
 * Teacher Study Materials on a touch phone (375px), after the 2026-09-24 pass.
 *
 *  - the title stays on one line and the actions sit in even columns;
 *  - Upload is absent at the top level instead of shown disabled;
 *  - drag handles are gone on touch (HTML drag never starts from a finger);
 *  - every item menu is a 44px target;
 *  - the Progress report shows at least four chapters, with Done pinned;
 *  - the chapter page's tab labels are readable and its Back is 44px.
 *
 * The folders, report and chapter are mocked: the E2E classroom on staging has
 * no study materials. Read-only.
 * Run: pnpm test:e2e --project=nexus-chrome --no-deps study-materials-nexus-mobile
 */
import { test, expect, type Page } from '@playwright/test';
import { injectAuthForPage, APP_URLS } from '../utils/credentials';

const NEXUS = APP_URLS.nexus;

test.use({ viewport: { width: 375, height: 812 }, isMobile: true, hasTouch: true });

const folder = (id: string, name: string, n: number) => ({
  id, name, description: null, item_count: n, target_exams: ['nata', 'jee'], target_programs: ['architecture'], allow_download: false,
});
const file = (id: string, title: string) => ({
  id, title, kind: 'pdf', file_type: 'application/pdf', folder_id: 'f2', downloadable: true, allow_download: null,
  has_test: false, qb_paper: null, video_languages: [], has_slides: false, slides_problem: null, recording: null,
});
const ROOT = {
  folders: [folder('f1', 'Foundation Books', 9), folder('f2', 'Previous Question Papers (NATA and JEE Paper 2)', 2)],
  files: [],
  breadcrumb: [],
};
const INSIDE = {
  folders: [],
  files: [file('x1', 'NATA 2023 Part A: Drawing and Composition'), file('x2', 'JEE Paper 2 2022 Aptitude')],
  breadcrumb: [{ id: 'a', name: 'Previous Question Papers' }, { id: 'f2', name: '2023 session two' }],
};
const STATUSES = ['completed', 'studying', 'not_opened', 'test_pending', 'video_pending'];
const chapters = Array.from({ length: 12 }, (_, i) => ({ id: `c${i}`, title: `Chapter ${i + 1}` }));
const REPORT = {
  folder: { id: 'f2', name: 'Foundation Books' },
  chapters,
  students: ['Sowmiya Lakshmi Narayanan', 'Hari Heera', 'Meera'].map((name, i) => ({
    student_id: `s${i}`, name, email: null, completed_count: i + 2, average_score_pct: 70,
    cells: Object.fromEntries(chapters.map((c, j) => [c.id, {
      status: STATUSES[(i + j) % 5], best_score_pct: 70, revision_best_score_pct: null, video_language: 'ta',
      watched_seconds: 600, blocked_seeks: 0, checkpoint_attempts: 1,
    }])),
  })),
  stats: { students: 3, chapters: 12, completion_pct: 42, fully_done: 0, not_started: 1 },
};

async function mock(page: Page) {
  await page.route('**/api/study-materials/folders**', (r) =>
    r.fulfill({ json: r.request().url().includes('parent=') ? INSIDE : ROOT }),
  );
  await page.route('**/api/study-materials/reports/folder/**', (r) => r.fulfill({ json: REPORT }));
  await page.route('**/api/study-materials/files/x1', (r) =>
    r.fulfill({ json: { file: { ...file('x1', 'NATA 2023 Part A: Drawing and Composition'), kind: 'image', file_type: 'image/png' } } }),
  );
}

test.describe('Study Materials on a touch phone', () => {
  test.beforeEach(async ({ page }) => {
    test.setTimeout(120_000);
    const ok = await injectAuthForPage(page, 'teacher');
    test.skip(!ok, 'Teacher test-login unavailable');
    await mock(page);
  });

  test('top level: one-line title, New folder only, no drag handles, 44px menus', async ({ page }) => {
    await page.goto(`${NEXUS}/teacher/study-materials`, { waitUntil: 'domcontentloaded' });
    const title = page.getByRole('heading', { name: 'Study Materials' });
    await expect(title).toBeVisible({ timeout: 60000 });
    expect((await title.boundingBox())!.height).toBeLessThan(44);

    await expect(page.getByRole('button', { name: 'New folder' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Upload' })).toHaveCount(0);

    const menus = page.getByRole('button', { name: /^Folder actions: / });
    await expect(menus).toHaveCount(2);
    for (let i = 0; i < 2; i++) {
      const b = await menus.nth(i).boundingBox();
      expect(b!.width).toBeGreaterThanOrEqual(44);
      expect(b!.height).toBeGreaterThanOrEqual(44);
    }
    const handleShown = await page
      .locator('[aria-label="Drag to reorder or move"]')
      .evaluateAll((els) => els.some((e) => getComputedStyle(e).display !== 'none'));
    expect(handleShown).toBe(false);
  });

  test('inside a folder: actions in even columns, breadcrumb within the width', async ({ page }) => {
    await page.goto(`${NEXUS}/teacher/study-materials?folder=f2`, { waitUntil: 'domcontentloaded' });
    const upload = page.getByRole('button', { name: 'Upload' });
    await expect(upload).toBeVisible({ timeout: 60000 });
    const newFolder = page.getByRole('button', { name: 'New folder' });
    const [u, n] = [await upload.boundingBox(), await newFolder.boundingBox()];
    expect(Math.abs(u!.y - n!.y)).toBeLessThan(4);
    expect(Math.abs(u!.width - n!.width)).toBeLessThan(4);

    // The deepest crumb is the one a long trail would push off the edge.
    const last = page.getByText('2023 session two', { exact: true });
    await expect(last).toBeVisible();
    const c = await last.boundingBox();
    expect(c!.x + c!.width).toBeLessThanOrEqual(375);
  });

  test('Progress shows at least four chapters with Done pinned', async ({ page }) => {
    await page.goto(`${NEXUS}/teacher/study-materials/reports/f2`, { waitUntil: 'domcontentloaded' });
    await expect(page.getByText('Done', { exact: true })).toBeVisible({ timeout: 60000 });
    const m = await page.evaluate(() => {
      const done = [...document.querySelectorAll('p, span')].find((e) => e.textContent?.trim() === 'Done')!;
      const doneLeft = done.getBoundingClientRect().left;
      const heads = [...document.querySelectorAll('span[title^="Chapter"]')];
      const visible = heads.filter((h) => {
        const r = h.getBoundingClientRect();
        return r.left >= 0 && r.right <= doneLeft;
      }).length;
      return { visible, doneRight: done.getBoundingClientRect().right };
    });
    expect(m.visible).toBeGreaterThanOrEqual(4);
    expect(m.doneRight).toBeLessThanOrEqual(375);
  });

  test('chapter page: readable tabs and a 44px Back', async ({ page }) => {
    await page.goto(`${NEXUS}/teacher/study-materials/x1`, { waitUntil: 'domcontentloaded' });
    const back = page.getByRole('button', { name: 'Back to the folder' });
    await expect(back).toBeVisible({ timeout: 60000 });
    const b = await back.boundingBox();
    expect(b!.height).toBeGreaterThanOrEqual(44);
    const size = await page.getByRole('button', { name: /Setup/ }).evaluate((el) => parseFloat(getComputedStyle(el).fontSize));
    expect(size).toBeGreaterThanOrEqual(12);
  });
});
