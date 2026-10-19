import { test, expect, type Page } from '@playwright/test';
import { APP_URLS } from '../utils/credentials';

/**
 * Admin People (/crm) redesign, 2026-10-19.
 *
 *  - one plain header with a "How People works" explainer (archive never blocks sign-in)
 *  - season row with "Exam year known: N of M", one stage + activity strip
 *  - Sign-in and Call outcome moved under "More filters"
 *  - auto-archive status bar (preview, run, turn on) replacing "N suggested to archive"
 *  - parents on their child's row, and a queue of parent accounts to link
 *
 * API tests hit the real routes (local Admin reads the staging DB) and only read
 * or send invalid input. UI tests mock the page's API calls so the numbers are
 * known. UI tests skip when the runner has no Microsoft session, like the other
 * admin UI specs.
 *
 * Run: pnpm test:e2e tests/e2e/people-redesign-admin.spec.ts --project=admin-chrome --no-deps
 */

const ADMIN = APP_URLS.admin || 'http://localhost:3013';

const breakdown = [
  { lifecycle_status: 'active', exam_year: 2026, exam_year_source: 'signup', lifecycle_stage: 'lead', engagement: 'dormant', n: 1200 },
  { lifecycle_status: 'active', exam_year: 2027, exam_year_source: 'signup', lifecycle_stage: 'lead', engagement: 'inactive', n: 339 },
  { lifecycle_status: 'active', exam_year: 2027, exam_year_source: 'stated', lifecycle_stage: 'prospect', engagement: 'engaged', n: 41 },
  { lifecycle_status: 'active', exam_year: 2027, exam_year_source: 'batch', lifecycle_stage: 'active_student', engagement: 'low', n: 61 },
  { lifecycle_status: 'active', exam_year: 2027, exam_year_source: 'stated', lifecycle_stage: 'applicant', engagement: 'low', n: 12 },
  { lifecycle_status: 'archived', exam_year: 2026, exam_year_source: 'signup', lifecycle_stage: 'archived', engagement: 'dormant', n: 69 },
];

const aisha = {
  id: '178900d0-8408-4f9c-a056-21651151683d',
  name: 'Aisha Eshal',
  email: 'aishaeshal@neramclasses.com',
  phone: null,
  user_type: 'student',
  lifecycle_status: 'active',
  lifecycle_stage: 'active_student',
  engagement: 'low',
  exam_year: 2027,
  exam_year_source: 'batch',
  created_at: '2026-10-17T07:55:33Z',
  last_meaningful_activity_at: '2026-10-18T09:00:00Z',
  has_firebase: false,
  has_microsoft: true,
  guardians: [
    {
      link_id: '99999999-9999-4999-8999-999999999999',
      guardian_user_id: 'c091f68f-c6f0-4af8-83c8-52f6684e21a7',
      student_user_id: '178900d0-8408-4f9c-a056-21651151683d',
      name: 'Sameera Najmal',
      email: 'sameera@example.org',
      phone: null,
      relationship: 'parent',
      source: 'staff',
    },
  ],
};

const autoArchive = {
  enabled: false,
  rules: { earlier_season_idle_days: 90, lead_archive_days: 180 },
  preview: {
    total: 1206,
    byRule: { earlier_season: 1199, long_quiet: 7 },
    sample: [
      {
        user_id: '11111111-1111-4111-8111-111111111111',
        name: 'Quiet Lead',
        email: 'quiet@example.com',
        exam_year: 2026,
        exam_year_source: 'signup',
        lifecycle_stage: 'lead',
        created_at: '2026-03-01T00:00:00Z',
        last_activity_at: '2026-06-01T00:00:00Z',
        rule: 'earlier_season',
      },
    ],
  },
  lastRun: null,
  runs: [],
};

async function mockApis(page: Page) {
  await page.route('**/api/crm/users?*', async (route) => {
    const url = new URL(route.request().url());
    if (url.searchParams.get('summary') === 'only') {
      return route.fulfill({ json: { users: [], total: 0, breakdown, currentExamYear: 2027, allAccounts: 1973, archiveSuggestions: 187 } });
    }
    return route.fulfill({ json: { users: [aisha], total: 1, page: 0, limit: 50 } });
  });
  await page.route('**/api/lifecycle/auto-archive', (route) => route.fulfill({ json: autoArchive }));
  await page.route('**/api/crm/guardians?unlinked=1', (route) =>
    route.fulfill({
      json: {
        accounts: [
          {
            user_id: 'c091f68f-c6f0-4af8-83c8-52f6684e21a7',
            name: 'Sameera Najmal',
            email: 'sameera@example.org',
            phone: '+919000000001',
            created_at: '2026-10-14T10:38:11Z',
            demo_student_name: 'Eeshal',
            demo_date: '2026-10-15',
          },
        ],
      },
    })
  );
}

async function open(page: Page, path = '/crm') {
  await mockApis(page);
  await page.goto(`${ADMIN}${path}`, { waitUntil: 'domcontentloaded' });
  const rendered = await page
    .getByRole('heading', { name: /People/ })
    .first()
    .waitFor({ timeout: 30_000 })
    .then(() => true, () => false);
  test.skip(!rendered || /\/login|microsoftonline/.test(page.url()), 'No Microsoft session on this runner');
}

test.describe('People redesign: API', () => {
  test('auto-archive status answers with the rule and a preview', async ({ request }) => {
    const res = await request.get(`${ADMIN}/api/lifecycle/auto-archive`, { failOnStatusCode: false });
    test.skip(res.status() === 401, 'Admin API refused the test token on this runner');
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(typeof body.enabled).toBe('boolean');
    expect(body.rules.earlier_season_idle_days).toBeGreaterThan(0);
    expect(typeof body.preview.total).toBe('number');
    expect(body.preview.total).toBe(body.preview.byRule.earlier_season + body.preview.byRule.long_quiet);
  });

  test('auto-archive refuses an unknown action', async ({ request }) => {
    const res = await request.post(`${ADMIN}/api/lifecycle/auto-archive`, { data: { action: 'delete_everyone' }, failOnStatusCode: false });
    test.skip(res.status() === 401, 'Admin API refused the test token on this runner');
    expect(res.status()).toBe(400);
  });

  test('unlinked parent accounts list loads', async ({ request }) => {
    const res = await request.get(`${ADMIN}/api/crm/guardians?unlinked=1`, { failOnStatusCode: false });
    test.skip(res.status() === 401, 'Admin API refused the test token on this runner');
    expect(res.status()).toBe(200);
    expect(Array.isArray((await res.json()).accounts)).toBe(true);
  });

  test('linking needs both people, unlinking needs a link id', async ({ request }) => {
    const link = await request.post(`${ADMIN}/api/crm/guardians`, { data: { guardianUserId: 'x' }, failOnStatusCode: false });
    test.skip(link.status() === 401, 'Admin API refused the test token on this runner');
    expect(link.status()).toBe(400);
    const unlink = await request.delete(`${ADMIN}/api/crm/guardians?id=nope`, { failOnStatusCode: false });
    expect(unlink.status()).toBe(400);
  });

  test('People list leaves parent accounts out and filters to "exam year still to ask"', async ({ request }) => {
    const res = await request.get(`${ADMIN}/api/crm/users?identity=all&season=all&year_source=signup&limit=50`, {
      failOnStatusCode: false,
    });
    test.skip(res.status() === 401, 'Admin API refused the test token on this runner');
    expect(res.status()).toBe(200);
    const body = await res.json();
    for (const u of body.users) {
      expect(u.exam_year_source).toBe('signup');
      expect(u.is_guardian_account).toBe(false);
    }
  });
});

test.describe('People redesign: page', () => {
  test.use({ viewport: { width: 1440, height: 900 } });
  // A dev-server compile plus the sign-in check can outlast the default 30s.
  test.describe.configure({ timeout: 120_000 });

  test('plain header explains Current and Archived, and that archive keeps sign-in', async ({ page }) => {
    await open(page);
    await expect(page.getByText('Leads and students who signed up to Neram.')).toBeVisible();
    await expect(page.getByText(/staff and parents/)).toHaveCount(0);
    await expect(page.getByText(/suggested to archive/)).toHaveCount(0);
    await page.getByRole('button', { name: 'How People works' }).click();
    await expect(page.getByText(/can still sign in to the Tools app and Nexus/)).toBeVisible();
    await page.keyboard.press('Escape');
  });

  test('sign-in and call outcome live under More filters', async ({ page }) => {
    await open(page);
    await expect(page.getByLabel('Sign-in')).toHaveCount(0);
    await page.getByRole('button', { name: /More filters/ }).click();
    await expect(page.getByLabel('Sign-in')).toBeVisible();
    await expect(page.getByLabel('Call outcome')).toBeVisible();
  });

  test('season row shows how many exam years are known; the strip is one line', async ({ page }) => {
    await open(page);
    // 2027 season: 453 people, 339 estimated, so 114 known.
    await expect(page.getByRole('button', { name: /Exam year known: 114 of 453/ })).toBeVisible();
    const strip = page.getByRole('group', { name: 'Where they are' });
    const box = await strip.boundingBox();
    expect(box?.height ?? 0).toBeLessThanOrEqual(60);
    await page.screenshot({ path: 'test-results/people-redesign-1440.png', fullPage: false });
  });

  test('auto-archive bar offers preview and a confirmed run', async ({ page }) => {
    await open(page);
    await expect(page.getByText('Auto-archive is off.')).toBeVisible();
    await page.getByRole('button', { name: 'Preview' }).click();
    await expect(page.getByText('Quiet Lead')).toBeVisible();
    await page.getByRole('button', { name: 'Close' }).first().click();
    await page.getByRole('button', { name: /Archive 1,206 now/ }).first().click();
    await expect(page.getByText(/they can still sign in to the Tools app and Nexus/)).toBeVisible();
    await expect(page.getByLabel('Also run it every night from now on')).toBeChecked();
    await page.getByRole('button', { name: 'Cancel' }).click();
  });

  test("a parent shows on the child's row; unlinked parent accounts have a queue", async ({ page }) => {
    await open(page);
    await expect(page.getByRole('link', { name: 'Parent: Sameera Najmal' })).toBeVisible();
    await expect(page.getByText(/1 parent account is not linked to a student yet/)).toBeVisible();
    await page.getByRole('button', { name: 'Link now' }).click();
    await expect(page.getByText('Eeshal')).toBeVisible();
  });

  test('no horizontal scroll at 1280 and 1024', async ({ page }) => {
    for (const width of [1280, 1024]) {
      await page.setViewportSize({ width, height: 900 });
      await open(page);
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      expect(overflow, `page scrolls sideways at ${width}px`).toBeLessThanOrEqual(1);
      await page.screenshot({ path: `test-results/people-redesign-${width}.png` });
    }
  });
});
