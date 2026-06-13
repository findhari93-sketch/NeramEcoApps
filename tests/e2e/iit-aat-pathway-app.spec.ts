/**
 * IIT B.Arch / AAT pathway in the JoSAA predictor — E2E (unauthenticated-safe).
 *
 * The student app uses Firebase auth, not automated in this suite, so result
 * rendering (Zone 1 / Zone 2 cards) is covered by unit tests on the partition
 * helpers (apps/app/src/lib/josaa-zones.test.ts). Here we assert the form,
 * including the new optional JEE Advanced rank field, renders and is mobile-safe.
 */

import { test, expect } from '@playwright/test';
import { APP_URLS } from '../utils/credentials';
import { assertNoHorizontalOverflow } from '../utils/mobile-helpers';

const PAGE_PATH = '/tools/counseling/josaa-predictor';

test.use({ baseURL: APP_URLS.student });

test.describe('JoSAA Predictor — IIT/AAT pathway field', () => {
  test('renders the optional JEE Advanced rank field', async ({ page }) => {
    await page.goto(PAGE_PATH);
    await expect(page.getByRole('heading', { name: /JoSAA B\.Arch Predictor/i })).toBeVisible();
    await expect(page.getByLabel(/JEE Advanced rank \(optional/i)).toBeVisible();
  });

  test('Advanced rank field accepts numeric input', async ({ page }) => {
    await page.goto(PAGE_PATH);
    const adv = page.getByLabel(/JEE Advanced rank \(optional/i);
    await adv.fill('14500');
    await expect(adv).toHaveValue('14500');
  });
});

test.describe('JoSAA Predictor — IIT/AAT field mobile layout', () => {
  test.use({ viewport: { width: 375, height: 812 } });

  test('no horizontal overflow with the new field on 375px', async ({ page }) => {
    await page.goto(PAGE_PATH);
    await page.getByRole('heading', { name: /JoSAA B\.Arch Predictor/i }).waitFor();
    await assertNoHorizontalOverflow(page);
  });

  test('Advanced rank field is at least 44px tall on mobile', async ({ page }) => {
    await page.goto(PAGE_PATH);
    const box = await page.getByLabel(/JEE Advanced rank \(optional/i).boundingBox();
    expect(box, 'advanced rank input must have a bounding box').not.toBeNull();
    if (box) expect(box.height).toBeGreaterThanOrEqual(44);
  });
});
