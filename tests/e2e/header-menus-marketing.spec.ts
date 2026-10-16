import { test, expect, type Page } from '@playwright/test';
import { assertNoHorizontalOverflow } from '../utils/mobile-helpers';

/**
 * Header menus (laptop): every group opens the same panel design, the page
 * behind dims below the header, and the header stays clickable so
 * another menu is one click away.
 */

// A dev server compiles the header chunk on first use, so hydration-bound steps get room.
const HYDRATE = { timeout: 60_000 };

test.describe.configure({ mode: 'default', timeout: 120_000 });

const MENUS = [
  { trigger: 'Colleges', region: 'Colleges menu' },
  { trigger: 'Exam Hub', region: 'Exam Hub menu' },
  { trigger: 'Counseling', region: 'Counseling menu' },
  { trigger: 'About', region: 'About menu' },
] as const;

const trigger = (page: Page, name: string) =>
  page.getByRole('banner').getByRole('button', { name, exact: true });

/** Clicks a trigger until its panel shows (the first click can land before hydration). */
async function openMenu(page: Page, name: string, region: string) {
  const panel = page.getByRole('region', { name: region });
  await expect(async () => {
    if (!(await panel.isVisible())) await trigger(page, name).click();
    await expect(panel).toBeVisible({ timeout: 3000 });
  }).toPass(HYDRATE);
  return panel;
}

test.describe('Header menus (laptop)', () => {
  test.beforeEach(async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto('/colleges/tamil-nadu', { waitUntil: 'domcontentloaded' });
  });

  test('each menu opens its panel over a scrim that starts below the header', async ({ page }) => {
    for (const m of MENUS) {
      await openMenu(page, m.trigger, m.region);
      await expect(trigger(page, m.trigger)).toHaveAttribute('aria-expanded', 'true');

      const scrim = page.getByTestId('nav-scrim');
      await expect(scrim).toBeVisible();
      // The header animates its top when the broadcast banner settles, so poll.
      await expect
        .poll(async () => {
          const header = await page.getByRole('banner').boundingBox();
          const s = await scrim.boundingBox();
          return Math.abs((s?.y ?? 0) - ((header?.y ?? 0) + (header?.height ?? 0)));
        })
        .toBeLessThanOrEqual(1);
      // Design system: a navy dim, no blur (no backdropFilter anywhere).
      expect(await scrim.evaluate((el) => getComputedStyle(el).backgroundColor)).toBe('rgba(6, 13, 31, 0.4)');

      await page.keyboard.press('Escape');
      await expect(page.getByRole('region', { name: m.region })).toBeHidden();
    }
  });

  test('another trigger swaps the open menu in one click', async ({ page }) => {
    await openMenu(page, 'Colleges', 'Colleges menu');
    await trigger(page, 'Exam Hub').click();
    await expect(page.getByRole('region', { name: 'Exam Hub menu' })).toBeVisible();
    await expect(page.getByRole('region', { name: 'Colleges menu' })).toBeHidden();
    await expect(trigger(page, 'Colleges')).toHaveAttribute('aria-expanded', 'false');
  });

  test('Escape closes and returns focus to the trigger', async ({ page }) => {
    await openMenu(page, 'Counseling', 'Counseling menu');
    await page.keyboard.press('Escape');
    await expect(page.getByRole('region', { name: 'Counseling menu' })).toBeHidden();
    await expect(trigger(page, 'Counseling')).toBeFocused();
    await expect(page.getByTestId('nav-scrim')).toBeHidden();
  });

  test('clicking the scrim closes the menu', async ({ page }) => {
    await openMenu(page, 'About', 'About menu');
    await page.mouse.click(40, 700);
    await expect(page.getByRole('region', { name: 'About menu' })).toBeHidden();
  });

  test('a link navigates and closes the menu', async ({ page }) => {
    const panel = await openMenu(page, 'About', 'About menu');
    await panel.getByRole('link', { name: /Course fees/ }).click();
    // A cold dev server compiles the target route on first visit.
    await expect(page).toHaveURL(/\/fees/, { timeout: 90_000 });
    await expect(page.getByRole('region', { name: 'About menu' })).toBeHidden();
  });

  test('keyboard: Enter on a trigger moves focus into the panel', async ({ page }) => {
    // Hydrate first with a mouse open and close.
    await openMenu(page, 'Exam Hub', 'Exam Hub menu');
    await page.keyboard.press('Escape');
    await expect(trigger(page, 'Exam Hub')).toBeFocused();
    await page.keyboard.press('Enter');
    const panel = page.getByRole('region', { name: 'Exam Hub menu' });
    await expect(panel).toBeVisible();
    await expect(panel.getByRole('link', { name: 'Eligibility' }).first()).toBeFocused();
  });

  test('panels share one design: 44px targets, no emoji, footer link where set', async ({ page }) => {
    for (const m of MENUS) {
      const panel = await openMenu(page, m.trigger, m.region);
      const heights = await panel.getByRole('link').evaluateAll((els) => els.map((el) => el.getBoundingClientRect().height));
      expect(heights.length).toBeGreaterThan(0);
      for (const h of heights) expect(h).toBeGreaterThanOrEqual(44);
      expect(await panel.innerText()).not.toMatch(/\p{Extended_Pictographic}/u);
      await page.keyboard.press('Escape');
    }
    const counseling = await openMenu(page, 'Counseling', 'Counseling menu');
    await expect(counseling.getByRole('link', { name: 'All 28 counsellings' })).toBeVisible();
    await expect(counseling.getByRole('navigation', { name: 'Tools' }).getByRole('link')).toHaveCount(2);
  });

  for (const width of [900, 1024, 1440]) {
    test(`every panel fits the viewport at ${width}px`, async ({ page }) => {
      await page.setViewportSize({ width, height: 800 });
      // Below 1060px Counseling and About live in the More menu.
      const menus = width < 1060 ? [...MENUS.slice(0, 2), { trigger: 'More', region: 'More menu' }] : MENUS;
      for (const m of menus) {
        const panel = await openMenu(page, m.trigger, m.region);
        const box = await panel.boundingBox();
        expect(box?.x ?? -1).toBeGreaterThanOrEqual(0);
        expect((box?.x ?? 0) + (box?.width ?? 0)).toBeLessThanOrEqual(width);
        await assertNoHorizontalOverflow(page);
        await page.keyboard.press('Escape');
        await expect(page.getByRole('region', { name: m.region })).toBeHidden();
      }
    });
  }

  test('More (1024px) lists Counseling, About and Free Tools links', async ({ page }) => {
    await page.setViewportSize({ width: 1024, height: 800 });
    const panel = await openMenu(page, 'More', 'More menu');
    await expect(panel.getByRole('link', { name: 'All 28 counsellings' })).toBeVisible();
    await expect(panel.getByRole('link', { name: 'Course fees' })).toBeVisible();
    await expect(panel.getByRole('link', { name: 'Free Tools' })).toBeVisible();
  });
});

test.describe('Header menus (phone drawer)', () => {
  test('the drawer still lists links that moved to side panels and footers', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto('/', { waitUntil: 'domcontentloaded' });
    const group = page.getByRole('button', { name: 'Counseling' });
    // Open the drawer only (retrying until hydrated); the group buttons toggle, so click them once.
    await expect(async () => {
      if (!(await group.isVisible())) await page.getByRole('button', { name: 'Open menu' }).click();
      await expect(group).toBeVisible({ timeout: 3000 });
    }).toPass(HYDRATE);
    await group.click();
    await expect(page.getByRole('link', { name: 'All 28 counsellings' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Cutoff Calculator' })).toBeVisible();

    await page.getByRole('button', { name: 'Colleges' }).click();
    await expect(page.getByRole('link', { name: 'Compare colleges' })).toBeVisible();
    await page.getByRole('button', { name: /Exam Hub/ }).click();
    await expect(page.getByRole('link', { name: /Free Tools & Mocks/ })).toBeVisible();
    await expect(page.getByTestId('nav-scrim')).toHaveCount(0);
  });
});
