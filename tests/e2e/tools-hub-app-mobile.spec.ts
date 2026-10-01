/**
 * Tools App: the Tools hub (/tools/all) and the redesigned shell around tool pages.
 *
 * Runs in app-chrome (desktop) and mobile-chrome (Pixel 5) because the file name
 * matches both projects. Signs in once with the Firebase email/password test user
 * (see project notes: Google popup cannot be automated) and reuses the page.
 *
 * Requires E2E_TEST_APP_EMAIL / E2E_TEST_APP_PASSWORD and NEXT_PUBLIC_E2E_TEST_MODE=true,
 * otherwise the signed-in suite skips. The signed-out check always runs.
 */

import { test, expect, type Page, type BrowserContext } from '@playwright/test';
import { signInAppWithEmail, loginWithPhoneOTP } from '../utils/auth-helpers';
import { assertNoHorizontalOverflow, assertTouchTargetSize } from '../utils/mobile-helpers';

const APP_EMAIL = process.env.E2E_TEST_APP_EMAIL || '';
const APP_PASSWORD = process.env.E2E_TEST_APP_PASSWORD || '';
const TEST_PHONE = process.env.E2E_TEST_PHONE_NUMBER || '+919999900001';
const TEST_OTP = process.env.E2E_TEST_FIXED_OTP || '123456';
const E2E_MODE = process.env.NEXT_PUBLIC_E2E_TEST_MODE === 'true';
const SHOT_DIR = process.env.TOOLS_HUB_SHOT_DIR || 'test-results/tools-hub';

const HUB = '/tools/all';
const TOOL_PAGES = [
  '/tools/nata/cutoff-calculator',
  '/tools/nata/exam-planner',
  '/tools/nata/exam-centers',
  '/tools/nata/eligibility-checker',
  '/tools/nata/image-crop',
  '/tools/nata/cost-calculator',
  '/tools/nata/question-bank',
  '/tools/counseling/college-predictor',
  '/tools/counseling/josaa-predictor',
  '/tools/counseling/rank-predictor',
  '/tools/counseling/insights',
  '/tools/counseling/coa-checker',
  '/tools/jee/seat-matrix',
];

async function signIn(page: Page) {
  // A saved session sends /login straight on to the dashboard; only sign in when
  // the form actually appears.
  await page.goto('/login');
  const emailField = page.getByLabel('Email', { exact: true });
  let state = 'wait';
  await expect
    .poll(
      async () => {
        if (!new URL(page.url()).pathname.startsWith('/login')) state = 'signed-in';
        else if (await emailField.isVisible().catch(() => false)) state = 'form';
        return state;
      },
      { timeout: 60000 },
    )
    .not.toBe('wait');
  if (state === 'form') {
    await signInAppWithEmail(page, APP_EMAIL, APP_PASSWORD);
    await page.waitForURL((url) => !url.pathname.startsWith('/login'), { timeout: 60000 });
  }
  await page.goto(HUB);

  const phoneModal = page.getByText('Verify Your Phone', { exact: true });
  const hubHeading = page.getByRole('heading', { level: 1, name: 'Tools' });
  await expect(phoneModal.or(hubHeading)).toBeVisible({ timeout: 30000 });
  if (await phoneModal.isVisible()) {
    await loginWithPhoneOTP(page, TEST_PHONE, { otp: TEST_OTP });
    await expect(phoneModal).toBeHidden({ timeout: 30000 });
  }

  // First-run onboarding overlays the shell; skip it when present.
  const skip = page.getByRole('button', { name: /^skip/i });
  if (await skip.first().isVisible().catch(() => false)) await skip.first().click();
  await expect(hubHeading).toBeVisible({ timeout: 30000 });
}

/**
 * Hard loads re-run the protected layout's sign-in check (register-user) before
 * the shell renders, so wait for the main landmark rather than the default 5s.
 */
async function open(page: Page, path: string) {
  await page.goto(path, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await expect(page.locator('#main-content')).toBeVisible({ timeout: 60000 });
}

test.describe('Tools hub: signed out', () => {
  test.use({ storageState: { cookies: [], origins: [] } });

  test('unauthenticated visitor is sent to login', async ({ page }) => {
    await page.goto(HUB);
    await page.waitForURL(/\/login/, { timeout: 30000 });
    expect(new URL(page.url()).pathname).toBe('/login');
  });
});

test.describe('Tools hub: signed in', () => {
  // Dev mode compiles each route on first hit; sign-in alone can take a minute.
  test.describe.configure({ mode: 'serial', timeout: 180_000 });
  test.use({ storageState: { cookies: [], origins: [] } });
  test.skip(
    !APP_EMAIL || !APP_PASSWORD || !E2E_MODE,
    'Set E2E_TEST_APP_EMAIL, E2E_TEST_APP_PASSWORD and NEXT_PUBLIC_E2E_TEST_MODE=true to run.',
  );

  let context: BrowserContext;
  let page: Page;
  const consoleErrors: string[] = [];

  test.beforeAll(async ({ browser }, testInfo) => {
    testInfo.setTimeout(180_000);
    context = await browser.newContext(testInfo.project.use);
    // Use the app's own "Skip for now" flag so the phone modal does not block the
    // shell. Phone verification has its own spec (phone-auth-app.spec.ts).
    await context.addInitScript(() => {
      try {
        window.sessionStorage.setItem('phone_verification_skipped', '1');
      } catch {}
    });
    page = await context.newPage();
    page.on('console', (m) => {
      if (m.type() === 'error') consoleErrors.push(m.text());
    });
    await signIn(page);
  });

  test.afterAll(async () => {
    await context?.close();
  });

  test('AC1: hub groups tools by the student journey', async () => {
    await open(page, HUB);
    for (const heading of ['Get ready for the exam', 'Know your score and rank', 'Choose your college']) {
      await expect(page.getByRole('heading', { level: 2, name: heading })).toBeVisible();
    }
    await expect(page.getByRole('heading', { level: 2, name: 'Where most students start' })).toBeVisible();
    await expect(page.getByRole('link', { name: /Cutoff Calculator/ }).first()).toHaveAttribute(
      'href',
      '/tools/nata/cutoff-calculator',
    );
  });

  test('AC2: search narrows the list and an empty search can be reset', async () => {
    await open(page, HUB);
    const search = page.getByRole('searchbox', { name: 'Search tools' });
    await search.fill('josaa');
    await expect(page.getByRole('status').filter({ hasText: /matching "josaa"/ })).toBeVisible();
    await expect(page.getByRole('link', { name: /JoSAA B.Arch Predictor/ })).toBeVisible();
    // Scope to the page: the laptop sidebar lists every tool too
    await expect(page.getByRole('main').getByRole('link', { name: /Exam Centers/ })).toHaveCount(0);

    await search.fill('zzzz no such tool');
    await expect(page.getByText('No tools match "zzzz no such tool"')).toBeVisible();
    await page.getByRole('button', { name: 'Show all tools' }).click();
    await expect(search).toHaveValue('');
    await expect(page.getByRole('heading', { level: 2, name: 'Choose your college' })).toBeVisible();
  });

  test('AC3: exam filter shows only that exam and marks itself pressed', async () => {
    await open(page, HUB);
    const filter = page.getByRole('group', { name: 'Filter by exam' });
    await filter.getByRole('button', { name: 'Counseling' }).click();
    await expect(filter.getByRole('button', { name: 'Counseling' })).toHaveAttribute('aria-pressed', 'true');
    await expect(page.getByRole('link', { name: /College Predictor/ }).first()).toBeVisible();
    await expect(page.getByRole('main').getByRole('link', { name: /Exam Planner/ })).toHaveCount(0);
  });

  test('AC4: coming-soon tools are listed but not links', async () => {
    await open(page, HUB);
    await expect(page.getByText('JoSAA Seat Matrix')).toBeVisible();
    await expect(page.getByRole('main').getByRole('link', { name: /JoSAA Seat Matrix/ })).toHaveCount(0);
  });

  test('AC5: a tool page has an explicit way back to the hub and remembers the visit', async () => {
    await open(page, '/tools/nata/cost-calculator');
    const back = page.getByRole('navigation', { name: 'Breadcrumb' }).getByRole('link', { name: /All tools|^Tools$/ });
    await expect(back.first()).toBeVisible();
    await back.first().click();
    await page.waitForURL(`**${HUB}`);
    await expect(page.getByRole('heading', { level: 2, name: 'Pick up where you left off' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Cost Calculator' }).first()).toBeVisible();
  });

  test('mobile: Tools tab opens the hub and stays active inside a tool', async ({}, testInfo) => {
    test.skip(!testInfo.project.name.includes('mobile'), 'Bottom tab bar is phone-only');
    await open(page, '/dashboard');
    const tabs = page.getByRole('navigation', { name: 'Main' });
    await tabs.getByRole('link', { name: 'Tools' }).click();
    await page.waitForURL(`**${HUB}`);
    await open(page, '/tools/nata/exam-centers');
    await expect(tabs.getByRole('link', { name: 'Tools' })).toHaveAttribute('aria-current', 'page');
    await assertTouchTargetSize(page, 'nav[aria-label="Main"] a');
  });

  test('mobile: filter chips and back link meet 44px touch targets', async ({}, testInfo) => {
    test.skip(!testInfo.project.name.includes('mobile'), 'Phone-only check');
    await open(page, HUB);
    await assertTouchTargetSize(page, '[aria-label="Filter by exam"] button');
    await open(page, '/tools/nata/eligibility-checker');
    await assertTouchTargetSize(page, 'nav[aria-label="Breadcrumb"] a:visible');
  });

  test('no horizontal scroll at 375, 768, 1024 and 1440 (with screenshots)', async ({}, testInfo) => {
    test.setTimeout(900_000);
    const shoot = async (path: string, width: number) => {
      await page.setViewportSize({ width, height: width < 800 ? 812 : 900 });
      await open(page, path);
      // Pages poll (heartbeat, notifications), so networkidle may never come; cap it.
      await page.waitForLoadState('networkidle', { timeout: 10000 }).catch(() => {});
      await assertNoHorizontalOverflow(page);
      const name = path.replace(/\//g, '_').replace(/^_/, '');
      await page.screenshot({ path: `${SHOT_DIR}/${testInfo.project.name}-${width}-${name}.png`, fullPage: true });
    };
    for (const width of [768, 1024]) await shoot(HUB, width);
    for (const width of [375, 1440]) {
      for (const path of [HUB, ...TOOL_PAGES]) await shoot(path, width);
    }
  });

  test('zero console errors on the hub', async () => {
    const relevant = consoleErrors.filter(
      // "Error registering user: TypeError: Failed to fetch" is the sign-in check
      // aborted by this suite's back-to-back hard loads, not a page fault.
      (e) =>
        !/favicon|Download the React DevTools|net::ERR_|Failed to load resource|tawk|gtag|googletagmanager/i.test(e) &&
        !/Error registering user: TypeError: Failed to fetch/.test(e),
    );
    expect(relevant, relevant.join('\n')).toEqual([]);
  });
});
