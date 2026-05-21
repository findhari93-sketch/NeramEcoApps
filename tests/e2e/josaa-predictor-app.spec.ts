/**
 * JoSAA B.Arch Predictor — E2E tests
 *
 * The student app uses Firebase auth (Google / Phone OTP) which is not
 * automated in this repo's Playwright suite. These tests cover what is
 * exercisable without sign-in: form rendering, mobile layout, auth gate
 * behaviour after submit, and the API route's 401 contract.
 *
 * After real JoSAA data lands in staging via `pnpm josaa:import:staging`,
 * extend this spec with authenticated happy-path tests (mock the Firebase
 * token via `auth.setup.ts`).
 */

import { test, expect } from '@playwright/test';
import { APP_URLS } from '../utils/credentials';
import { assertNoHorizontalOverflow } from '../utils/mobile-helpers';

const PAGE_PATH = '/tools/josaa-predictor';
const API_PATH = '/api/tools/josaa-predictor';

test.use({ baseURL: APP_URLS.student });

test.describe('JoSAA Predictor — page', () => {
  test('renders the form unauthenticated', async ({ page }) => {
    await page.goto(PAGE_PATH);
    await expect(page).toHaveURL(new RegExp(PAGE_PATH));

    // Heading present
    await expect(page.getByRole('heading', { name: /JoSAA B\.Arch Predictor/i })).toBeVisible();

    // Rank input present and focusable
    const rank = page.getByLabel(/JEE Main Paper 2 Rank/i);
    await expect(rank).toBeVisible();

    // Predict button present
    await expect(page.getByRole('button', { name: /Predict colleges/i })).toBeVisible();
  });

  test('rejects empty rank submission', async ({ page }) => {
    await page.goto(PAGE_PATH);
    const submit = page.getByRole('button', { name: /Predict colleges/i });
    // Button is disabled when rank is empty
    await expect(submit).toBeDisabled();
  });

  test('shows auth gate after submitting a rank while unauthenticated', async ({ page }) => {
    await page.goto(PAGE_PATH);
    await page.getByLabel(/JEE Main Paper 2 Rank/i).fill('1247');
    await page.getByRole('button', { name: /Predict colleges/i }).click();
    // AuthGate prompt should appear: title + Continue with Phone button
    await expect(page.getByText(/Sign in to see your predictions/i)).toBeVisible({ timeout: 5000 });
    await expect(page.getByRole('button', { name: /Continue with Phone/i })).toBeVisible();
  });

  test('Advanced (year, round) accordion toggles', async ({ page }) => {
    await page.goto(PAGE_PATH);
    const toggle = page.getByRole('button', { name: /Advanced \(year, round\)/i });
    await toggle.click();
    await expect(page.getByLabel(/Year \(optional\)/i)).toBeVisible();
    await expect(page.getByLabel(/Round \(optional\)/i)).toBeVisible();
  });
});

test.describe('JoSAA Predictor — mobile layout', () => {
  test.use({ viewport: { width: 375, height: 812 } });

  test('no horizontal overflow on 375px', async ({ page }) => {
    await page.goto(PAGE_PATH);
    await page.getByRole('heading', { name: /JoSAA B\.Arch Predictor/i }).waitFor();
    await assertNoHorizontalOverflow(page);
  });

  test('rank input is large enough for mobile (>= 44px tall)', async ({ page }) => {
    await page.goto(PAGE_PATH);
    const input = page.getByLabel(/JEE Main Paper 2 Rank/i);
    const box = await input.boundingBox();
    expect(box, 'rank input must have a bounding box').not.toBeNull();
    if (box) expect(box.height).toBeGreaterThanOrEqual(44);
  });

  test('Predict button is full-width on mobile and at least 44px tall', async ({ page }) => {
    await page.goto(PAGE_PATH);
    await page.getByLabel(/JEE Main Paper 2 Rank/i).fill('1500');
    const btn = page.getByRole('button', { name: /Predict colleges/i });
    const box = await btn.boundingBox();
    expect(box, 'predict button must have a bounding box').not.toBeNull();
    if (box) expect(box.height).toBeGreaterThanOrEqual(44);
  });
});

test.describe('JoSAA Predictor — API route', () => {
  test('returns 401 without auth', async ({ request }) => {
    const res = await request.post(`${APP_URLS.student}${API_PATH}`, {
      data: { rank: 1247, seatType: 'OPEN', gender: 'Gender-Neutral' },
    });
    expect(res.status()).toBe(401);
    const body = await res.json();
    expect(body.error).toMatch(/Authentication required/i);
  });

  test('returns 401 even for malformed body (auth check runs first)', async ({ request }) => {
    const res = await request.post(`${APP_URLS.student}${API_PATH}`, {
      data: { foo: 'bar' },
    });
    expect(res.status()).toBe(401);
  });
});
