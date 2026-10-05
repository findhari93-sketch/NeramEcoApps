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
    features: ['Live Class, Doubt solving, Evaluation'],
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
    // One year (₹25,000 pay once) plus ₹5,000 for the second year
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

test.describe('Header: Fees + Join Now', () => {
  test('desktop: new visitor sees Fees beside Join Now on one line', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await mockFees(page, PLANS);
    await page.goto('/', { waitUntil: 'domcontentloaded' });

    const banner = page.locator('header').first();
    const joinNow = banner.getByRole('link', { name: 'Join Now', exact: true });
    await expect(joinNow).toBeVisible();
    await expect(banner.getByRole('link', { name: 'Pay & Join Now' })).toHaveCount(0);

    const feesLink = banner.getByRole('link', { name: 'Fees', exact: true });
    await expect(feesLink).toBeVisible();

    // Same row, Fees first, and the toolbar keeps its 64px height.
    const [fees, join, bar] = await Promise.all([
      feesLink.boundingBox(),
      joinNow.boundingBox(),
      banner.locator('.MuiToolbar-root').first().boundingBox(),
    ]);
    expect(Math.abs(fees!.y + fees!.height / 2 - (join!.y + join!.height / 2))).toBeLessThanOrEqual(2);
    expect(fees!.x + fees!.width).toBeLessThanOrEqual(join!.x);
    expect(bar!.height).toBeLessThanOrEqual(64);

    await feesLink.click();
    await expect(page).toHaveURL(/\/fees$/, HYDRATE);
    // The link hides itself on the page it points to.
    await expect(banner.getByRole('link', { name: 'Fees', exact: true })).toHaveCount(0);
  });

  test('1024px: Fees and Join Now fit without wrapping or overflow', async ({ page }) => {
    await page.setViewportSize({ width: 1024, height: 768 });
    await mockFees(page, PLANS);
    await page.goto('/', { waitUntil: 'domcontentloaded' });

    const banner = page.locator('header').first();
    await expect(banner.getByRole('link', { name: 'Fees', exact: true })).toBeVisible();
    const join = await banner.getByRole('link', { name: 'Join Now', exact: true }).boundingBox();
    expect(join!.height).toBeLessThan(50);
    await assertNoHorizontalOverflow(page);
  });

  test('mobile: View fees sits in the menu as a full-size button', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await mockFees(page, PLANS);
    await page.goto('/', { waitUntil: 'domcontentloaded' });

    // Too small to tap in the 56px toolbar, so it is not shown there.
    await expect(page.locator('header').first().getByRole('link', { name: 'Fees', exact: true })).toBeHidden();

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

  test('every plan lists what is included, and Two Year reads as One Year plus ₹5,000', async ({ page }) => {
    await mockFees(page, PLANS);
    await page.goto('/fees', { waitUntil: 'domcontentloaded' });
    await expect(page.getByTestId('fee-card')).toHaveCount(2, HYDRATE);

    const [oneYear, twoYear] = [page.getByTestId('fee-card').nth(0), page.getByTestId('fee-card').nth(1)];
    for (const card of [oneYear, twoYear]) {
      await expect(card).toContainText('Trained for 4 attempts: 2 NATA and both JEE Main sessions');
      await expect(card).toContainText('Nexus app with question bank and AI Maths Teacher');
      await expect(card).toContainText('Help from the application form to college admission');
    }
    // Staff extras from Admin still show on the plan they belong to.
    await expect(oneYear).toContainText('Live Class, Doubt solving, Evaluation');

    await expect(oneYear).not.toContainText('Everything in the One Year program');
    await expect(twoYear).toContainText('₹30,000');
    await expect(twoYear).toContainText('Everything in the One Year program, for 2 full years');
    await expect(twoYear).toContainText('The second year costs only ₹5,000 more');
    // Instalments: ₹35,000 against ₹30,000 is still ₹5,000 more.
    await page.getByRole('button', { name: 'Installment payment' }).click();
    await expect(twoYear).toContainText('The second year costs only ₹5,000 more');

    // The full list, grouped, with the link from the card landing on it.
    const section = page.getByRole('region', { name: 'Everything included in your fee' });
    await expect(section.getByTestId('included-group')).toHaveCount(4);
    for (const text of [
      'AI Maths Teacher for NATA and JEE Paper 2 maths',
      'Microsoft 365 student account with Teams, Word, PowerPoint and OneDrive',
      "Neram video library of previous years' classes, like a private YouTube for your course",
      'Counselling guidance: college choice, choice filling and admission',
    ]) {
      await expect(section).toContainText(text);
    }
    await oneYear.getByRole('link', { name: 'See everything included' }).click();
    await expect(page).toHaveURL(/#included$/);
    await expect(section).toBeInViewport();
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
    await assertTouchTargetSize(page, 'a[href="#included"]');
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
