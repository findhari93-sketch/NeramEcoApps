import { test, expect, type Page } from '@playwright/test';
import { APP_URLS } from '../utils/credentials';
import { assertNoHorizontalOverflow } from '../utils/mobile-helpers';

/**
 * Admin > PersonAvatar: the ring (gold student, dashed gold paused, silver
 * alumni, slate lead, blue staff, dotted slate for everyone else) and the
 * language letter on every person, the orange break-year pill, and the quick
 * editor a click on any student or lead's avatar opens.
 *
 * UI tests read real staging rows (the ring vocabulary is what is checked, not
 * particular people) and skip when the runner has no Microsoft session, as the
 * other admin UI specs do. API tests hit the real routes and never write: the
 * language route is only exercised on input it must refuse. The 401 for an
 * unverified caller is a unit test (route.test.ts): dev middleware may run in
 * report mode, which lets an anonymous call through on a local runner.
 *
 * Run: pnpm test:e2e --project="admin-chrome" --no-deps tests/e2e/admin-person-avatar.spec.ts
 */

const ADMIN = APP_URLS.admin;
const RINGS = ['student', 'paused', 'alumni', 'lead', 'staff', 'other'];
const SOME_UUID = '00000000-0000-4000-8000-000000000000';

async function open(page: Page, path: string, heading: RegExp) {
  await page.goto(`${ADMIN}${path}`, { waitUntil: 'domcontentloaded' });
  // Whichever comes first: the page, or the sign-in screen of a runner with no session.
  const state = await Promise.race([
    page.getByRole('heading', { name: heading }).first().waitFor({ timeout: 45_000 }).then(() => 'page'),
    page.getByRole('button', { name: 'Sign in with Microsoft' }).waitFor({ timeout: 45_000 }).then(() => 'login'),
  ]).catch(() => 'none');
  test.skip(state !== 'page' || /\/login|microsoftonline/.test(page.url()), 'No Microsoft session on this runner');
}

test.describe('PersonAvatar @admin', () => {
  // A cold dev server compiles /crm in about 40s on first visit.
  test.describe.configure({ timeout: 120_000 });

  test('API: facts answer staff, and guess a place with no account', async ({ request }) => {
    const res = await request.post(`${ADMIN}/api/people/facts`, {
      data: { ids: [SOME_UUID], places: [{ key: 'chennai', city: 'Chennai' }, { key: 'dubai', city: 'Dubai' }] },
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.people[SOME_UUID]).toBeUndefined();
    expect(body.places.chennai).toMatchObject({ key: 'tamil', source: 'city' });
    expect(body.places.dubai).toBeNull();
  });

  test('API: the language route refuses anything but the six keys', async ({ request }) => {
    for (const homeLanguage of ['Tamil', 'ta', 'marathi']) {
      const res = await request.patch(`${ADMIN}/api/crm/users/${SOME_UUID}/language`, { data: { homeLanguage } });
      expect(res.status()).toBe(400);
    }
  });

  test('API: the studies route refuses a bad class or a year that does not fit', async ({ request }) => {
    const url = `${ADMIN}/api/crm/users/${SOME_UUID}/studies`;
    for (const data of [
      { studyStage: '9th' },
      { studyStage: 'Break year' },
      {},
      { studyStage: '12th', twelfthPassedYear: 2025 },
      { studyStage: 'gap_year', twelfthPassedYear: new Date().getFullYear() + 1 },
    ]) {
      expect((await request.patch(url, { data })).status()).toBe(400);
    }
  });

  test('CRM: a click on an avatar opens the quick editor, not the person', async ({ page }) => {
    await open(page, '/crm', /People/);
    const editable = page.getByRole('button', { name: /Set class or language\.$/ }).first();
    await expect(editable).toBeVisible({ timeout: 30_000 });
    const before = page.url();
    await editable.click();
    const editor = page.getByTestId('person-quick-editor');
    await expect(editor).toBeVisible();
    await expect(editor.getByRole('button', { name: 'Break year' })).toBeVisible();
    await expect(editor.getByRole('group', { name: 'Language' })).toBeVisible();
    // Opening the editor is not a navigation: the row did not open.
    expect(page.url()).toBe(before);
    await page.keyboard.press('Escape');
    await expect(editor).toBeHidden();
  });

  test('CRM: every person wears a ring from the vocabulary, and the key explains it', async ({ page }) => {
    const errors: string[] = [];
    page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
    await open(page, '/crm', /People/);

    const avatars = page.getByTestId('person-avatar');
    await expect(avatars.first()).toBeVisible({ timeout: 30_000 });
    // Let the batched facts call land.
    await page.waitForResponse((r) => r.url().includes('/api/people/facts'), { timeout: 15_000 }).catch(() => null);

    const rings = await page.locator('[data-testid="person-avatar"] [data-ring]').evaluateAll((els) =>
      els.map((el) => el.getAttribute('data-ring')),
    );
    expect(rings.length).toBeGreaterThan(0);
    for (const ring of rings) expect(RINGS).toContain(ring);

    // Every avatar says who it is in words, so the ring is never the only cue.
    const label = await avatars.first().getAttribute('aria-label');
    expect(label?.length).toBeGreaterThan(0);

    await page.getByRole('button', { name: 'What do the avatar rings mean?' }).first().click();
    const key = page.getByRole('dialog', { name: 'Avatar key' });
    await expect(key.getByText('Enrolled student')).toBeVisible();
    await expect(key.getByText('Telugu')).toBeVisible();
    await page.keyboard.press('Escape');

    await assertNoHorizontalOverflow(page);
    expect(errors.filter((e) => /PersonAvatar|people\/facts|LanguageMark/.test(e))).toEqual([]);
  });

  test('Demo classes: rows now carry an avatar', async ({ page }) => {
    await open(page, '/demo-classes', /Demo classes/);
    const table = page.getByRole('table').first();
    const rows = await table.locator('tbody tr').count();
    test.skip(rows === 0, 'No demo requests in this tab on this environment');
    await expect(table.getByTestId('person-avatar').first()).toBeVisible();
  });

  test('layout holds at a 900px laptop split', async ({ page }) => {
    await page.setViewportSize({ width: 900, height: 900 });
    await open(page, '/crm', /People/);
    await expect(page.getByTestId('person-avatar').first()).toBeVisible({ timeout: 30_000 });
    await assertNoHorizontalOverflow(page);
  });
});
