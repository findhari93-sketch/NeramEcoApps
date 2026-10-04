import { test, expect, type Page } from '@playwright/test';
import { assertNoHorizontalOverflow, assertTouchTargetSize } from '../utils/mobile-helpers';

/**
 * Header "Join Now" + "View fees" and the light /fees page.
 *
 * Students look for the fee before they fill the application form, so the
 * header links to /fees and the page shows prices first with only a short FAQ.
 * The fee API is mocked so the test does not depend on what staff set in
 * Admin > Fee Structures.
 */

const PLANS = [
  {
    id: 'plan-1y',
    course_type: 'both',
    program_type: 'year_long',
    display_name: 'One Year Long Program',
    display_name_ta: null,
    fee_amount: 30000,
    combo_extra_fee: 0,
    duration: '12 months',
    schedule_summary: null,
    features: [],
    is_active: true,
    display_order: 0,
    single_payment_discount: 5000,
    installment_1_amount: 16500,
    installment_2_amount: 13500,
    is_hidden_from_public: false,
  },
  {
    id: 'plan-2y',
    course_type: 'both',
    program_type: 'year_long',
    display_name: 'Two Year program',
    display_name_ta: null,
    fee_amount: 35000,
    combo_extra_fee: 0,
    duration: '24 Months',
    schedule_summary: null,
    features: [],
    is_active: true,
    display_order: 1,
    single_payment_discount: 5000,
    installment_1_amount: 17500,
    installment_2_amount: 17500,
    is_hidden_from_public: false,
  },
];

async function mockFees(page: Page, feeStructures: unknown[], delayMs = 0) {
  await page.route('**/api/fee-structures**', async (route) => {
    if (delayMs) await new Promise((r) => setTimeout(r, delayMs));
    await route.fulfill({ json: { feeStructures } });
  });
}

// A dev server takes ~20s to hydrate /fees, and the cards only fetch after
// hydration, so client-rendered assertions get a hydration-sized wait.
const HYDRATE = { timeout: 60_000 };

test.describe.configure({ mode: 'default', timeout: 120_000 });

test.describe('Header: Join Now + View fees', () => {
  test('desktop: new visitor sees Join Now with a View fees link', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await mockFees(page, PLANS);
    await page.goto('/', { waitUntil: 'domcontentloaded' });

    const banner = page.locator('header').first();
    await expect(banner.getByRole('link', { name: 'Join Now', exact: true })).toBeVisible();
    await expect(banner.getByRole('link', { name: 'Pay & Join Now' })).toHaveCount(0);

    const feesLink = banner.getByRole('link', { name: 'View fees' });
    await expect(feesLink).toBeVisible();
    await feesLink.click();
    await expect(page).toHaveURL(/\/fees$/, HYDRATE);
    // The link hides itself on the page it points to.
    await expect(banner.getByRole('link', { name: 'View fees' })).toHaveCount(0);
  });

  test('mobile: View fees sits in the menu as a full-size button', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await mockFees(page, PLANS);
    await page.goto('/', { waitUntil: 'domcontentloaded' });

    // Too small to tap in the 56px toolbar, so it is not shown there.
    await expect(page.locator('header').first().getByRole('link', { name: 'View fees' })).toBeHidden();

    // The menu button does nothing until the header hydrates, so retry the tap.
    const drawerLink = page.getByRole('link', { name: 'View fees' }).last();
    await expect(async () => {
      if (!(await drawerLink.isVisible())) await page.getByRole('button', { name: 'Open menu' }).click();
      await expect(drawerLink).toBeVisible({ timeout: 3000 });
    }).toPass(HYDRATE);
    const box = await drawerLink.boundingBox();
    expect(box?.height ?? 0).toBeGreaterThanOrEqual(44);
    await drawerLink.click();
    await expect(page).toHaveURL(/\/fees$/, HYDRATE);
  });
});

test.describe('/fees page', () => {
  test('shows prices first, with badges, toggle and a short FAQ', async ({ page }) => {
    await mockFees(page, PLANS);
    await page.goto('/fees', { waitUntil: 'domcontentloaded' });

    await expect(page.getByRole('heading', { level: 1, name: 'Course fees' })).toBeVisible();
    await expect(page.getByTestId('fee-card')).toHaveCount(2, HYDRATE);

    // Pay once shows the discounted price.
    const oneYear = page.getByTestId('fee-card').first();
    await expect(oneYear).toContainText('₹25,000');
    await expect(oneYear).toContainText('Recommended for current year exam');
    await expect(page.getByTestId('fee-card').nth(1)).toContainText('Best value for future year exam');

    // Instalments show both parts.
    await page.getByRole('button', { name: 'Installment payment' }).click();
    await expect(oneYear).toContainText('₹16,500');
    await expect(oneYear).toContainText('₹13,500');

    // The selling sections are gone; only 4 fee questions remain.
    await expect(page.getByText(/Why invest/i)).toHaveCount(0);
    await expect(page.locator('.MuiAccordion-root')).toHaveCount(4);
    await expect(page.getByText('Are there any hidden charges beyond the fee shown?')).toBeVisible();

    await expect(page.getByRole('link', { name: /Questions about fees\? Call/ })).toHaveAttribute('href', 'tel:+919176137043');
  });

  test('mobile: cards stack, no overflow, tap targets are large enough', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await mockFees(page, PLANS);
    await page.goto('/fees', { waitUntil: 'domcontentloaded' });
    await expect(page.getByTestId('fee-card')).toHaveCount(2, HYDRATE);

    const [first, second] = await Promise.all([
      page.getByTestId('fee-card').nth(0).boundingBox(),
      page.getByTestId('fee-card').nth(1).boundingBox(),
    ]);
    expect(second!.y).toBeGreaterThan(first!.y + first!.height - 1);

    await assertNoHorizontalOverflow(page);
    await assertTouchTargetSize(page, '[data-testid="fee-card"] a');
    await assertTouchTargetSize(page, '.MuiToggleButton-root');
    await assertTouchTargetSize(page, 'a[href^="tel:"]');
  });

  test('empty state: no public plans shows the call button', async ({ page }) => {
    await mockFees(page, []);
    await page.goto('/fees', { waitUntil: 'domcontentloaded' });
    await expect(page.getByText('Fee information is currently being updated')).toBeVisible(HYDRATE);
    await expect(page.getByRole('link', { name: 'Call Us' })).toBeVisible();
  });

  test('slow API shows skeletons, then the cards', async ({ page }) => {
    await mockFees(page, PLANS, 2500);
    await page.goto('/fees', { waitUntil: 'domcontentloaded' });
    await expect(page.getByTestId('fee-skeletons')).toBeVisible();
    await expect(page.getByTestId('fee-card')).toHaveCount(2, HYDRATE);
  });
});
