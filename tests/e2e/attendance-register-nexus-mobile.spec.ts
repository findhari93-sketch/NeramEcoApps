/**
 * Attendance Register on a phone (375px), after the 2026-09-24 fix.
 *
 * The bug: the name column was meant to be 132px but table cells grow to their
 * content, and a no-wrap name's content is the whole name, so the longest name
 * in the class set the column (263px at 375). A teacher saw ONE class. And the
 * grid was a fixed 62% scroll box inside a page that also scrolled, so swipes
 * went to the wrong scroller.
 *
 * The register is mocked (12 classes, long names) because the E2E teacher's
 * classroom has no finished classes; what is under test is layout, not data.
 * Run: pnpm test:e2e --project=nexus-chrome --no-deps attendance-register-nexus-mobile
 */
import { test, expect, type Page } from '@playwright/test';
import { injectAuthForPage, APP_URLS } from '../utils/credentials';

const NEXUS = APP_URLS.nexus;

const NAMES = [
  'Hari Heera',
  'Sowmiya Lakshmi Narayanan',
  'Ridhusha Prawin Rajan',
  'Karthikeyan Subramaniam',
  'Rakshana Rajagopal',
  'Nethra Ranjith',
  'Pranava sakthi',
  'Deepika Venkatesh',
  'Arun',
  'Meera',
];
const GROUPS = ['whole', 'partly', 'reason', 'no_reason', 'away'];

function mockRegister() {
  const classes = Array.from({ length: 12 }, (_, i) => {
    const ymd = new Date(Date.UTC(2026, 8, 18 - i * 2)).toISOString().slice(0, 10);
    return {
      id: `c${i}`,
      title: `Class ${i}`,
      scheduled_date: ymd,
      start_time: '19:00',
      end_time: '20:30',
      held: null,
      measured: true,
      sync_status: 'ok',
      counts: { whole: 0, partly: 0, away: 0, reason: 0, noReason: 0, joinedLater: 0 },
    };
  });
  const students = NAMES.map((name, i) => ({
    id: `s${i}`,
    name,
    avatar_url: null,
    study_stage: null,
    enrolled_at: null,
    present: 5,
    counted: 10,
    rate: i * 10,
    away: 0,
    away_now: null,
  }));
  const cells: Record<string, Record<string, { g: string }>> = {};
  classes.forEach((c, ci) => {
    cells[c.id] = {};
    students.forEach((s, si) => (cells[c.id][s.id] = { g: GROUPS[(ci + si) % GROUPS.length] }));
  });
  return { classroom_id: 'x', range: { from: '2026-08-20', to: '2026-09-19' }, classes, students, cells, paused_hidden: 0, away_today: 0 };
}

async function openRegister(page: Page) {
  await page.route('**/api/attendance/register**', (r) => r.fulfill({ json: mockRegister() }));
  await page.goto(`${NEXUS}/teacher/attendance?view=register&range=30d`, { waitUntil: 'domcontentloaded' });
  await expect(page.getByRole('table')).toBeVisible({ timeout: 60000 });
}

test.describe('Attendance Register on a phone', () => {
  test.use({ viewport: { width: 375, height: 812 } });

  test.beforeEach(async ({ page }) => {
    test.setTimeout(120_000);
    const ok = await injectAuthForPage(page, 'teacher');
    test.skip(!ok, 'Teacher test-login unavailable');
  });

  test('the name column holds its width, so at least four classes show', async ({ page }) => {
    await openRegister(page);
    const m = await page.evaluate(() => {
      const heads = [...document.querySelectorAll('[role=columnheader]')];
      const name = heads[0].getBoundingClientRect().width;
      // Class columns wholly on screen, left of the pinned % column.
      const rate = heads[heads.length - 1].getBoundingClientRect().left;
      const full = heads.slice(1, -1).filter((h) => {
        const r = h.getBoundingClientRect();
        return r.left >= 0 && r.right <= rate + 1;
      }).length;
      return { name, full };
    });
    expect(m.name).toBeLessThanOrEqual(128);
    expect(m.full).toBeGreaterThanOrEqual(4);
  });

  test('a long name wraps to two lines instead of widening the column', async ({ page }) => {
    await openRegister(page);
    const row = page.getByRole('rowheader').filter({ hasText: 'Sowmiya' });
    await expect(row).toContainText('Lakshmi Narayanan');
    const box = await row.boundingBox();
    expect(box!.width).toBeLessThanOrEqual(128);
  });

  test('the page does not scroll; only the grid does', async ({ page }) => {
    await openRegister(page);
    await page.waitForTimeout(500);
    const m = await page.evaluate(() => {
      const grid = document.querySelector('[role=table]')!.parentElement!;
      return {
        pageExtra: document.documentElement.scrollHeight - window.innerHeight,
        gridBottom: grid.getBoundingClientRect().bottom,
        gridScrolls: grid.scrollHeight > grid.clientHeight,
      };
    });
    expect(m.pageExtra).toBeLessThanOrEqual(2);
    // Clear of the 64px bottom nav.
    expect(m.gridBottom).toBeLessThanOrEqual(812 - 64);
    expect(m.gridScrolls).toBe(true);
  });

  test('the key opens from the grid corner and explains every letter', async ({ page }) => {
    await openRegister(page);
    const key = page.getByRole('button', { name: 'What the letters mean' });
    await expect(key).toBeVisible();
    await key.click();
    const dialog = page.getByRole('dialog');
    await expect(dialog).toContainText('Stayed the whole class');
    await expect(dialog).toContainText('Missed, no reason');
    await dialog.getByRole('button', { name: 'Got it' }).click();
    await expect(dialog).toBeHidden();
  });
});

test.describe('Attendance Register on a laptop', () => {
  test.use({ viewport: { width: 1280, height: 900 } });

  test('a name that fits is not clipped, and the key sits under the grid', async ({ page }) => {
    test.setTimeout(120_000);
    const ok = await injectAuthForPage(page, 'teacher');
    test.skip(!ok, 'Teacher test-login unavailable');
    await openRegister(page);
    await expect(page.getByRole('rowheader').filter({ hasText: 'Ridhusha Prawin Rajan' })).toBeVisible();
    // The column grows to 220px of name before it clips, so a three-word name
    // like this one shows whole where the phone-sized 152px used to cut it.
    const clipped = await page
      .getByRole('rowheader')
      .filter({ hasText: 'Ridhusha Prawin Rajan' })
      .locator('p')
      .first()
      .evaluate((p) => p.scrollWidth > p.clientWidth + 1);
    expect(clipped).toBe(false);
    await expect(page.getByRole('button', { name: 'What the letters mean' })).toBeHidden();
    await expect(page.getByText('Stayed the whole class')).toBeVisible();
  });
});
