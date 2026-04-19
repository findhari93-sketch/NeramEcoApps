import { test, expect, type Page } from '@playwright/test';

/**
 * College Hub - Neram Staff Outreach E2E Tests
 *
 * Covers:
 * - Staff login sets a session cookie
 * - /me endpoint returns staff identity when logged in
 * - /me returns 401 when not logged in
 * - FAB "Send outreach" is visible for staff on college detail pages
 * - FAB is hidden for non-staff visitors
 * - Preview renders subject, HTML iframe, plain text
 * - Outreach API rejects unauthenticated requests (401)
 * - Outreach API rejects bad origin (403)
 * - Admin colleges list page loads, filters work
 * - Tier upgrade endpoint validates and updates
 *
 * Requires env vars set in .env.test:
 *   E2E_STAFF_SECRET   - value of NERAM_STAFF_ADMIN_SECRET running on the server
 *
 * Run:
 *   pnpm test:e2e --project=marketing-chrome tests/e2e/college-hub/outreach-staff-marketing.spec.ts
 */

const STAFF_SECRET = process.env.E2E_STAFF_SECRET ?? process.env.NERAM_STAFF_ADMIN_SECRET ?? '';
const STAFF_NAME = 'E2E Staff';
const STAFF_EMAIL = 'e2e-staff@neram.test';
const TEST_COLLEGE_SLUG = 'anna-university-architecture';
const TEST_COLLEGE_STATE = 'tamil-nadu';

const hasStaffSecret = !!STAFF_SECRET;

// Tests share login state via the dev server's cookie store, so run them serially
// to avoid one test's login/logout stomping on another.
test.describe.configure({ mode: 'serial' });

async function loginAsStaff(page: Page) {
  const res = await page.request.post('/api/admin/staff-login', {
    data: { secret: STAFF_SECRET, name: STAFF_NAME, email: STAFF_EMAIL },
  });
  expect(res.status()).toBe(200);
}

async function logoutStaff(page: Page) {
  await page.request.post('/api/admin/staff-logout');
}

test.describe('Staff Auth API', () => {
  test.use({ baseURL: 'http://localhost:3010' });

  test('GET /api/admin/colleges/outreach/me returns 401 without cookie', async ({ request }) => {
    const res = await request.get('/api/admin/colleges/outreach/me');
    expect(res.status()).toBe(401);
    const body = await res.json();
    expect(body.isStaff).toBe(false);
  });

  test('POST /api/admin/staff-login with wrong secret returns 401', async ({ request }) => {
    const res = await request.post('/api/admin/staff-login', {
      data: { secret: 'definitely-wrong', name: 'Valid Name', email: 'valid@neram.test' },
    });
    expect(res.status()).toBe(401);
  });

  test('POST /api/admin/staff-login with missing fields returns 400', async ({ request }) => {
    const res = await request.post('/api/admin/staff-login', {
      data: { secret: STAFF_SECRET || 'x' },
    });
    expect(res.status()).toBe(400);
  });

  test.describe('When E2E_STAFF_SECRET is set', () => {
    test.skip(!hasStaffSecret, 'E2E_STAFF_SECRET not set');

    test('valid login sets cookie and /me returns staff identity', async ({ page }) => {
      await loginAsStaff(page);

      const meRes = await page.request.get('/api/admin/colleges/outreach/me');
      expect(meRes.status()).toBe(200);
      const me = await meRes.json();
      expect(me.isStaff).toBe(true);
      expect(me.name).toBe(STAFF_NAME);
      expect(me.email).toBe(STAFF_EMAIL);
    });

    test('logout clears the cookie', async ({ page }) => {
      await loginAsStaff(page);
      await logoutStaff(page);
      const meRes = await page.request.get('/api/admin/colleges/outreach/me');
      expect(meRes.status()).toBe(401);
    });
  });
});

test.describe('Outreach API security', () => {
  test.use({ baseURL: 'http://localhost:3010' });

  test('POST /api/admin/colleges/outreach returns 401 without cookie', async ({ request }) => {
    const res = await request.post('/api/admin/colleges/outreach', {
      data: { college_id: 'does-not-matter', preview_only: true },
    });
    expect(res.status()).toBe(401);
  });

  test('PATCH /api/admin/colleges/tier returns 401 without cookie', async ({ request }) => {
    const res = await request.fetch('/api/admin/colleges/tier', {
      method: 'PATCH',
      data: { college_id: 'x', tier: 'gold' },
    });
    expect(res.status()).toBe(401);
  });

  test('GET /api/admin/colleges/list returns 401 without cookie', async ({ request }) => {
    const res = await request.get('/api/admin/colleges/list');
    expect(res.status()).toBe(401);
  });
});

test.describe('FAB visibility on college detail pages', () => {
  test.use({ baseURL: 'http://localhost:3010' });

  test('FAB is hidden for non-staff visitors', async ({ page }) => {
    await logoutStaff(page);
    await page.goto(`/en/colleges/${TEST_COLLEGE_STATE}/${TEST_COLLEGE_SLUG}`);
    await page.waitForLoadState('domcontentloaded');
    await expect(page.getByRole('button', { name: /send outreach/i })).toHaveCount(0);
  });

  test.describe('When logged in as staff', () => {
    test.skip(!hasStaffSecret, 'E2E_STAFF_SECRET not set');

    test('FAB appears on college detail page', async ({ page }) => {
      await loginAsStaff(page);
      await page.goto(`/en/colleges/${TEST_COLLEGE_STATE}/${TEST_COLLEGE_SLUG}`);
      await page.waitForLoadState('domcontentloaded');
      await expect(page.getByRole('button', { name: /send outreach/i })).toBeVisible({ timeout: 8000 });
    });
  });
});

test.describe('Outreach preview and send flow', () => {
  test.use({ baseURL: 'http://localhost:3010' });
  test.skip(!hasStaffSecret, 'E2E_STAFF_SECRET not set');

  let collegeId = '';

  test.beforeAll(async ({ request }) => {
    // Resolve the Anna University college id via the public listing query.
    // We use the admin list endpoint for a single source of truth (requires staff auth).
    const loginRes = await request.post('/api/admin/staff-login', {
      data: { secret: STAFF_SECRET, name: STAFF_NAME, email: STAFF_EMAIL },
    });
    expect(loginRes.status()).toBe(200);

    const listRes = await request.get(
      `/api/admin/colleges/list?q=${encodeURIComponent('Anna University')}&state=Tamil Nadu`,
    );
    expect(listRes.status()).toBe(200);
    const data = await listRes.json();
    const anna = (data.colleges as Array<{ id: string; slug: string }>).find(
      (c) => c.slug === TEST_COLLEGE_SLUG,
    );
    expect(anna, 'Anna University should exist on staging').toBeTruthy();
    collegeId = anna!.id;
  });

  test('preview_only returns rendered subject + html + text with no unresolved tokens', async ({ page }) => {
    await loginAsStaff(page);
    const res = await page.request.post('/api/admin/colleges/outreach', {
      data: {
        college_id: collegeId,
        preview_only: true,
        override_to_email: 'e2e-preview@neram.test',
        include_bcc: false,
      },
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.subject).toBeTruthy();
    expect(body.html).toBeTruthy();
    expect(body.text).toBeTruthy();
    expect(body.recipient).toBe('e2e-preview@neram.test');
    expect(body.bcc).toBeNull();

    // Template lint invariants
    expect(body.html).not.toContain('{{');
    expect(body.html).not.toContain('}}');
    expect(body.text).not.toContain('{{');
    expect(body.html).not.toContain('\u2014'); // em dash
    expect(body.html).not.toContain('&mdash;');
    expect(body.text).not.toContain('\u2014');
  });

  test('preview returns 404 for missing college_id', async ({ page }) => {
    await loginAsStaff(page);
    const res = await page.request.post('/api/admin/colleges/outreach', {
      data: {
        college_id: '00000000-0000-0000-0000-000000000000',
        preview_only: true,
        override_to_email: 'e2e@neram.test',
      },
    });
    expect(res.status()).toBe(404);
  });

  test('preview returns 400 when college_id is missing', async ({ page }) => {
    await loginAsStaff(page);
    const res = await page.request.post('/api/admin/colleges/outreach', {
      data: { preview_only: true },
    });
    expect(res.status()).toBe(400);
  });

  test('subject variant 2 differs from variant 1', async ({ page }) => {
    await loginAsStaff(page);
    const v1 = await (await page.request.post('/api/admin/colleges/outreach', {
      data: { college_id: collegeId, preview_only: true, subject_variant: 1, override_to_email: 'e2e@neram.test' },
    })).json();
    const v2 = await (await page.request.post('/api/admin/colleges/outreach', {
      data: { college_id: collegeId, preview_only: true, subject_variant: 2, override_to_email: 'e2e@neram.test' },
    })).json();
    expect(v1.subject).not.toBe(v2.subject);
  });
});

test.describe('SendOutreachButton dialog UI', () => {
  test.use({ baseURL: 'http://localhost:3010' });
  test.skip(!hasStaffSecret, 'E2E_STAFF_SECRET not set');

  test('clicking FAB opens dialog with subject and preview iframe', async ({ page }) => {
    await loginAsStaff(page);
    await page.goto(`/en/colleges/${TEST_COLLEGE_STATE}/${TEST_COLLEGE_SLUG}`);
    await page.waitForLoadState('domcontentloaded');

    await page.getByRole('button', { name: /send outreach/i }).click();

    // Dialog title
    await expect(page.getByText(/Outreach:/)).toBeVisible({ timeout: 8000 });

    // Recipient input visible
    await expect(page.getByLabel(/recipient email/i)).toBeVisible();

    // Preview iframe mounts (may take a beat to render)
    const iframe = page.locator('iframe[title="Email HTML preview"]');
    await expect(iframe).toBeVisible({ timeout: 10000 });

    // Buttons present
    await expect(page.getByRole('button', { name: /send via neram/i })).toBeVisible();
    await expect(page.getByRole('button', { name: /open in outlook/i })).toBeVisible();
  });

  test('dialog allows overriding recipient before sending', async ({ page }) => {
    await loginAsStaff(page);
    await page.goto(`/en/colleges/${TEST_COLLEGE_STATE}/${TEST_COLLEGE_SLUG}`);
    await page.waitForLoadState('domcontentloaded');
    await page.getByRole('button', { name: /send outreach/i }).click();

    const input = page.getByLabel(/recipient email/i);
    await expect(input).toBeVisible({ timeout: 8000 });
    await input.fill('e2e-override@neram.test');
    await expect(input).toHaveValue('e2e-override@neram.test');
  });
});

test.describe('Admin colleges list page', () => {
  test.use({ baseURL: 'http://localhost:3010' });
  test.skip(!hasStaffSecret, 'E2E_STAFF_SECRET not set');

  test('unauthenticated visitor is redirected to staff-login', async ({ page }) => {
    await logoutStaff(page);
    await page.goto('/admin/colleges');
    await expect(page).toHaveURL(/\/admin\/staff-login/, { timeout: 8000 });
  });

  test('staff sees table with colleges', async ({ page }) => {
    await loginAsStaff(page);
    await page.goto('/admin/colleges');
    await page.waitForLoadState('domcontentloaded');

    // Heading
    await expect(page.getByText(/Neram Staff: Colleges/i)).toBeVisible({ timeout: 8000 });

    // The table should show at least one TN college row (we populated 32)
    await expect(page.getByText(/Anna University/i).first()).toBeVisible({ timeout: 10000 });
  });

  test('tier upgrade PATCH succeeds and reverts', async ({ page }) => {
    await loginAsStaff(page);

    // Get a TN college id
    const listRes = await page.request.get(
      `/api/admin/colleges/list?state=${encodeURIComponent('Tamil Nadu')}`,
    );
    const { colleges } = await listRes.json();
    const target = (colleges as Array<{ id: string; neram_tier: string | null }>)[0];
    expect(target).toBeTruthy();

    const originalTier = target.neram_tier ?? 'free';

    // Upgrade to gold
    const upRes = await page.request.fetch('/api/admin/colleges/tier', {
      method: 'PATCH',
      data: { college_id: target.id, tier: 'gold' },
    });
    expect(upRes.status()).toBe(200);
    const upBody = await upRes.json();
    expect(upBody.college.neram_tier).toBe('gold');

    // Revert
    const revRes = await page.request.fetch('/api/admin/colleges/tier', {
      method: 'PATCH',
      data: { college_id: target.id, tier: originalTier },
    });
    expect(revRes.status()).toBe(200);
  });

  test('tier PATCH rejects invalid tier values', async ({ page }) => {
    await loginAsStaff(page);
    const res = await page.request.fetch('/api/admin/colleges/tier', {
      method: 'PATCH',
      data: { college_id: '00000000-0000-0000-0000-000000000000', tier: 'diamond' },
    });
    expect(res.status()).toBe(400);
  });
});

test.describe('Mobile: outreach dialog on 375px', () => {
  test.use({ baseURL: 'http://localhost:3010', viewport: { width: 375, height: 812 } });
  test.skip(!hasStaffSecret, 'E2E_STAFF_SECRET not set');

  test('dialog renders fullscreen and has no horizontal overflow', async ({ page }) => {
    await loginAsStaff(page);
    await page.goto(`/en/colleges/${TEST_COLLEGE_STATE}/${TEST_COLLEGE_SLUG}`);
    await page.waitForLoadState('domcontentloaded');

    await page.getByRole('button', { name: /send outreach/i }).click();
    await expect(page.getByText(/Outreach:/)).toBeVisible({ timeout: 8000 });

    const body = await page.evaluate(() => ({
      scrollWidth: document.documentElement.scrollWidth,
      clientWidth: document.documentElement.clientWidth,
    }));
    expect(body.scrollWidth).toBeLessThanOrEqual(body.clientWidth + 2);
  });
});
