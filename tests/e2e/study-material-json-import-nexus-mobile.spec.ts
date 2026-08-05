import { test, expect } from '@playwright/test';
import type { Page } from '@playwright/test';
import { APP_URLS, injectAuthForPage } from '../utils/credentials';
import { assertNoHorizontalOverflow, assertTouchTargetSize } from '../utils/mobile-helpers';

/**
 * Upload a question set onto a chapter, from a phone.
 *
 * The chapter dialog used to have one answer to "put a test here": ask Gemini,
 * which tops out near 40 questions. A teacher who had already written 150 with
 * the chapter PDF in their own session had to leave Study Materials entirely,
 * build the test in the Tests module, come back, and link it by hand.
 *
 * What these lock down: the second mode exists and is reachable from the file
 * menu, the count and the skipped rows are shown BEFORE anything is written, and
 * the route refuses unusable input with a sentence rather than a 500.
 *
 * Nothing here presses "Create the test". Doing so would publish a test on a
 * real chapter in whatever environment this runs against and gate it for real
 * students, with no cleanup path that also removes the bank questions it wrote.
 * The commit itself is covered by the unit tests over buildChapterTest, which is
 * the code that decides what actually gets written.
 */

const NEXUS = APP_URLS.nexus;
const PHONE = { width: 375, height: 812 };
/** The dev server compiles this route on first hit, and it is not a small one. */
const COLD_COMPILE_BUDGET = 120_000;

/** Three usable questions and one whose answer matches no option. */
const FIXTURE = JSON.stringify({
  test: { title: 'E2E upload check', suggested_folder: 'E2E / Upload check' },
  questions: [
    {
      question: 'Which walled city founded by Shah Jahan is now Old Delhi?',
      options: { a: 'Agra', b: 'Shahjahanabad', c: 'Lahore', d: 'Jaipur' },
      answer: 'b',
      explanation: 'Shahjahanabad is the walled city that is now Old Delhi.',
    },
    {
      question: 'Which material dominates the facade of the Taj Mahal?',
      options: { a: 'Red sandstone', b: 'Granite', c: 'White marble', d: 'Laterite' },
      answer: 'c',
      explanation: 'The Taj Mahal is faced in white Makrana marble.',
    },
    {
      question: 'A stepwell used for water storage in Gujarat is called what?',
      options: { a: 'Vav', b: 'Chhatri', c: 'Jaali', d: 'Torana' },
      answer: 'a',
      explanation: 'Vav is the Gujarati term for a stepwell.',
    },
    {
      question: 'This row is deliberately broken so the summary has something to report.',
      options: { a: 'One', b: 'Two' },
      answer: 'z',
    },
  ],
});

async function signIn(page: Page): Promise<boolean> {
  const injected = await injectAuthForPage(page, 'teacher');
  if (!injected) return false;
  await page.goto(`${NEXUS}/teacher/study-materials`, { waitUntil: 'domcontentloaded' });
  await expect(page.getByRole('heading', { name: 'Study Materials' })).toBeVisible({ timeout: 30_000 });
  return true;
}

/**
 * Open the "Add a test" dialog on whichever file offers it.
 *
 * Which chapters already carry a test is environment data, so the menu item is
 * hunted for rather than assumed to be on the first card.
 */
async function openAddTestDialog(page: Page): Promise<boolean> {
  const menus = page.getByRole('button', { name: 'File actions' });
  const count = Math.min(await menus.count(), 8);
  for (let i = 0; i < count; i += 1) {
    await menus.nth(i).click();
    const item = page.getByRole('menuitem', { name: /Add a test/i });
    if (await item.isVisible().catch(() => false)) {
      await item.click();
      return true;
    }
    await page.keyboard.press('Escape');
  }
  return false;
}

test.describe('Chapter test from uploaded JSON (mobile)', () => {
  test.setTimeout(COLD_COMPILE_BUDGET);

  test('a pasted set is counted, with the unusable rows named, before anything is written', async ({ browser }) => {
    const context = await browser.newContext({ viewport: PHONE });
    const page = await context.newPage();

    const ok = await signIn(page);
    test.skip(!ok, 'Nexus dev server / test-login unavailable');

    const opened = await openAddTestDialog(page);
    test.skip(!opened, 'No chapter in this environment is offering a test yet');

    await expect(page.getByRole('heading', { name: 'Add a test' })).toBeVisible();

    // Both answers to "put a test on this chapter" are on one switch.
    const upload = page.getByRole('button', { name: 'Upload JSON' });
    await expect(page.getByRole('button', { name: 'Write with AI' })).toBeVisible();
    await expect(upload).toBeVisible();
    await upload.click();

    // The prompt is offered without being in the way of somebody who already ran it.
    await expect(page.getByRole('button', { name: /Need the prompt for this chapter/i })).toBeVisible();

    await page.getByLabel('Or paste the JSON').fill(FIXTURE);
    await page.getByRole('button', { name: 'Read the questions' }).click();

    // The whole point of the confirm step: the numbers appear before the write.
    await expect(page.getByText('3 in the test')).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText('1 skipped')).toBeVisible();
    await expect(page.getByText(/does not match any option/i)).toBeVisible();

    // Serve is clamped to what the file actually yielded, not left at the default 20.
    const serve = page.getByLabel('Asked each time');
    await expect(serve).toHaveValue('3');
    await expect(page.getByText(/Every student is asked all 3/i)).toBeVisible();

    // Present, and deliberately not pressed. See the note at the top of this file.
    await expect(page.getByRole('button', { name: 'Create the test' })).toBeEnabled();

    await assertNoHorizontalOverflow(page);
    await context.close();
  });

  test('the mode switch and the primary actions are thumb sized', async ({ browser }) => {
    const context = await browser.newContext({ viewport: PHONE });
    const page = await context.newPage();

    const ok = await signIn(page);
    test.skip(!ok, 'Nexus dev server / test-login unavailable');

    const opened = await openAddTestDialog(page);
    test.skip(!opened, 'No chapter in this environment is offering a test yet');

    await page.getByRole('button', { name: 'Upload JSON' }).click();
    await expect(page.getByRole('button', { name: 'Read the questions' })).toBeVisible();

    await assertTouchTargetSize(page, 'button:has-text("Upload JSON")');
    await assertTouchTargetSize(page, 'button:has-text("Write with AI")');
    await assertTouchTargetSize(page, 'button:has-text("Read the questions")');
    await assertTouchTargetSize(page, 'button:has-text("Choose a file")');

    await assertNoHorizontalOverflow(page);
    await context.close();
  });

  test('the route refuses unusable input with a sentence, not a 500', async ({ browser }) => {
    const context = await browser.newContext({ viewport: PHONE });
    const page = await context.newPage();

    const ok = await signIn(page);
    test.skip(!ok, 'Nexus dev server / test-login unavailable');

    // Any file will do: both refusals below happen before the file is read.
    const fileId = await page.evaluate(async () => {
      const token = localStorage.getItem('nexus_test_token');
      const headers = { Authorization: `Bearer ${token}` };
      const walk = async (parent?: string): Promise<string | null> => {
        const r = await fetch(`/api/study-materials/folders${parent ? `?parent=${parent}` : ''}`, { headers });
        if (!r.ok) return null;
        const j = await r.json();
        if (j.files?.length) return j.files[0].id as string;
        for (const f of j.folders || []) {
          const found = await walk(f.id);
          if (found) return found;
        }
        return null;
      };
      return walk();
    });
    test.skip(!fileId, 'No study file in this environment');

    const post = (body: unknown) =>
      page.evaluate(
        async ([id, payload]) => {
          const token = localStorage.getItem('nexus_test_token');
          const r = await fetch(`/api/study-materials/files/${id}/test/import`, {
            method: 'POST',
            headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
            body: payload as string,
          });
          return { status: r.status, body: await r.json().catch(() => ({})) };
        },
        [fileId, JSON.stringify(body)] as const,
      );

    // Nothing sent at all.
    const empty = await post({});
    expect(empty.status).toBe(400);
    expect(String(empty.body.error)).toContain('No questions were sent');

    // Something sent, but not JSON. The message has to say what to do about it.
    const garbage = await post({ payload: 'I could not complete this request.' });
    expect(garbage.status).toBe(400);
    expect(String(garbage.body.error)).toMatch(/Could not read that as JSON|No usable questions/i);

    // Valid JSON, no usable rows. Still the teacher's problem to fix, still a 400.
    const unusable = await post({
      payload: JSON.stringify({ questions: [{ question: 'Too short answerless stem?', options: { a: 'One' } }] }),
    });
    expect(unusable.status).toBe(400);

    await context.close();
  });
});
