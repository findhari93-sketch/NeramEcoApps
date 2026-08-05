import { test, expect } from '@playwright/test';
import { APP_URLS, injectAuthForPage } from '../utils/credentials';
import { assertNoHorizontalOverflow } from '../utils/mobile-helpers';

/**
 * Both languages on one screen, and a language list that grows without a deploy.
 *
 * The machinery always supported a Tamil recording and an English one, each with
 * its own transcript and its own checkpoints. What it did not support was
 * FINDING that: adding the second language was a collapsed form behind a
 * dropdown, and the dropdown defaulted to English and was never reset, so the
 * press right after adding English reopened the form already showing English,
 * already taken, and failed with a 409. Production ran with zero tracks.
 *
 * What these lock down: every offered language is visible at once without
 * opening anything AND stays visible while a link is being pasted, the offered
 * list comes from settings rather than from five hardcoded copies, and a bad
 * language code is refused with a sentence a human can act on.
 *
 * Nothing here asserts a language is absent. Which languages are offered is
 * admin-editable data, so "Tamil + English is gone" is a unit test against the
 * built-in list, not an E2E against whatever an admin has configured.
 *
 * Read-only against real data. Nothing here attaches or removes a recording,
 * because both write to whatever chapter this environment happens to hold.
 */

const NEXUS = APP_URLS.nexus;
const PHONE = { width: 375, height: 812 };
const COLD_COMPILE_BUDGET = 120_000;

test.describe('Foundation chapter languages (mobile)', () => {
  test.setTimeout(COLD_COMPILE_BUDGET);

  test('the offered languages come from settings, with usage counts', async ({ browser }) => {
    const context = await browser.newContext({ viewport: PHONE });
    const page = await context.newPage();

    const injected = await injectAuthForPage(page, 'teacher');
    test.skip(!injected, 'Nexus test-login unavailable');

    await page.goto(`${NEXUS}/teacher/study-materials`, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(4000);

    const body = await page.evaluate(async () => {
      const token = localStorage.getItem('nexus_test_token');
      const r = await fetch('/api/study-materials/track-languages', {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!r.ok) return null;
      return r.json();
    });
    test.skip(!body, 'Track languages API unavailable');

    // At minimum the two the chapters were taught in. More is fine: an admin may
    // have added one, which is the entire point of the list being data.
    const codes = (body.languages || []).map((l: any) => l.code);
    expect(codes).toContain('en');
    expect(codes).toContain('ta');

    // Every entry is usable: the code matches what the database CHECK allows and
    // the label is what a student sees on the picker button, so neither may be
    // blank.
    for (const l of body.languages || []) {
      expect(l.code).toMatch(/^[a-z]{2,3}(_[a-z]{2,3})*$/);
      expect(String(l.label).trim().length).toBeGreaterThan(0);
    }

    expect(body.usage).toBeDefined();
    await context.close();
  });

  test('a malformed language code is refused with a usable sentence', async ({ browser }) => {
    const context = await browser.newContext({ viewport: PHONE });
    const page = await context.newPage();

    const injected = await injectAuthForPage(page, 'teacher');
    test.skip(!injected, 'Nexus test-login unavailable');

    await page.goto(`${NEXUS}/teacher/study-materials`, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(4000);

    // Deliberately invalid, so this cannot alter the real list even if the
    // account turns out to hold system.settings.
    const res = await page.evaluate(async () => {
      const token = localStorage.getItem('nexus_test_token');
      const r = await fetch('/api/study-materials/track-languages', {
        method: 'PUT',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ languages: [{ code: 'english', label: 'English' }] }),
      });
      return { status: r.status, body: await r.json().catch(() => ({})) };
    });

    // 400 from the validator, or 403 if this tier cannot edit settings. Both are
    // correct refusals; a 200 would mean "english" reached the CHECK constraint.
    expect([400, 403]).toContain(res.status);
    expect(String(res.body?.error || '').length).toBeGreaterThan(10);
    await context.close();
  });

  test('every language is visible at once, with no dropdown to open', async ({ browser }) => {
    const context = await browser.newContext({ viewport: PHONE });
    const page = await context.newPage();

    const injected = await injectAuthForPage(page, 'teacher');
    test.skip(!injected, 'Nexus test-login unavailable');

    await page.goto(`${NEXUS}/teacher/study-materials`, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(5000);

    const menuButtons = page.locator('button[aria-label*="menu" i], button:has(svg[data-testid="MoreVertIcon"])');
    const count = await menuButtons.count();
    test.skip(count === 0, 'No study files in this environment');

    await menuButtons.first().click();
    const recordings = page.getByRole('menuitem', { name: /class recordings/i });
    test.skip((await recordings.count()) === 0, 'Class recordings is not offered on this file');
    await recordings.click();

    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible({ timeout: 20_000 });

    // The sequence, stated before any button. Four controls with no hint they
    // are ordered is what sent the first press to a dead end.
    await expect(dialog.getByText(/upload its transcript/i)).toBeVisible();

    // Both languages reachable without opening anything. Either as a card,
    // because a recording is already attached, or as an add chip.
    const english = dialog.getByText('English', { exact: false });
    const tamil = dialog.getByText('தமிழ்', { exact: false });
    expect(await english.count()).toBeGreaterThan(0);
    expect(await tamil.count()).toBeGreaterThan(0);

    // The dropdown is gone. A select here is what let a teacher submit a
    // language that was already taken.
    expect(await dialog.locator('[role="combobox"]').count()).toBe(0);

    await assertNoHorizontalOverflow(page);
    await context.close();
  });

  test('opening one language leaves the others on screen', async ({ browser }) => {
    const context = await browser.newContext({ viewport: PHONE });
    const page = await context.newPage();

    const injected = await injectAuthForPage(page, 'teacher');
    test.skip(!injected, 'Nexus test-login unavailable');

    await page.goto(`${NEXUS}/teacher/study-materials`, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(5000);

    const menuButtons = page.locator('button[aria-label*="menu" i], button:has(svg[data-testid="MoreVertIcon"])');
    test.skip((await menuButtons.count()) === 0, 'No study files in this environment');

    await menuButtons.first().click();
    const recordings = page.getByRole('menuitem', { name: /class recordings/i });
    test.skip((await recordings.count()) === 0, 'Class recordings is not offered on this file');
    await recordings.click();

    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible({ timeout: 20_000 });

    const chips = dialog.locator('.MuiChip-clickable');
    const before = await chips.count();
    test.skip(before === 0, 'Every offered language already has a recording here');

    // Tapping a chip only opens a form. Nothing is written until the Add button
    // is pressed, which this test never does: it would attach a recording to
    // whatever chapter this environment happens to hold.
    await chips.first().click();

    // The form is open...
    await expect(dialog.getByLabel(/recording link/i)).toBeVisible();
    // ...and the row did not swap itself out for it. The count is the assertion
    // rather than a named language, because which languages are offered is
    // admin-editable data and an E2E must not fail on a correct configuration.
    expect(await chips.count()).toBe(before);

    // Publishing is the only action here with a student-visible consequence, so
    // a chapter that has any recording must say what a student currently gets.
    if ((await dialog.locator('button[aria-label^="Remove the"]').count()) > 0) {
      await expect(dialog.getByText(/students see/i).first()).toBeVisible();
    }

    await assertNoHorizontalOverflow(page);
    await context.close();
  });

  test('the checkpoint editor is reachable, or plainly says why not', async ({ browser }) => {
    const context = await browser.newContext({ viewport: PHONE });
    const page = await context.newPage();

    const injected = await injectAuthForPage(page, 'teacher');
    test.skip(!injected, 'Nexus test-login unavailable');

    await page.goto(`${NEXUS}/teacher/study-materials`, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(5000);

    const menuButtons = page.locator('button[aria-label*="menu" i], button:has(svg[data-testid="MoreVertIcon"])');
    test.skip((await menuButtons.count()) === 0, 'No study files in this environment');

    await menuButtons.first().click();
    const recordings = page.getByRole('menuitem', { name: /class recordings/i });
    test.skip((await recordings.count()) === 0, 'Class recordings is not offered on this file');
    await recordings.click();

    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible({ timeout: 20_000 });

    const edit = dialog.getByRole('button', { name: /edit checkpoints/i });
    const upload = dialog.getByRole('button', { name: /upload transcript/i });

    // Exactly one of these is the right next move, and which one depends on
    // whether the recording has checkpoints yet. What must never happen is
    // neither: "review them, then publish" with nothing to open is the state
    // this work was undoing.
    const hasEdit = (await edit.count()) > 0;
    const hasUpload = (await upload.count()) > 0;
    const hasAddChip = (await dialog.locator('.MuiChip-clickable').count()) > 0;
    expect(hasEdit || hasUpload || hasAddChip).toBe(true);

    if (hasEdit) {
      await edit.first().click();
      await expect(page).toHaveURL(/\/teacher\/study-materials\/checkpoints\//, { timeout: 20_000 });
      await expect(page.getByText(/checkpoints/i).first()).toBeVisible();
      await assertNoHorizontalOverflow(page);
    }

    await context.close();
  });
});
