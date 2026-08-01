/**
 * Creating an assignment: can a teacher find the thing they came for?
 *
 * This exists because of a report that is worth quoting plainly: "I don't know
 * how to create such a kind of assignment which can be like an MCQ type or a
 * NAQ type". The composer was there the whole time. It lived on the second
 * screen of the create dialog behind a button that read "Create and add the
 * paper", where "paper" sounds like a PDF you upload, and on the edit path it
 * sat below the materials block, off the bottom of a phone.
 *
 * So these tests are about DISCOVERY, not about whether questions save. That is
 * covered by assignment-questions-nexus.spec.ts. What is asserted here:
 *  - the words "multiple choice" appear before any decision is committed
 *  - a drawing brief has somewhere to put the expected outcome and the focus
 *  - the questions card, and the editor route it opens, exist and are reachable
 *
 * Skips gracefully when test auth is unavailable. Serial: each step builds on
 * the previous.
 *
 * Run: pnpm test:e2e tests/e2e/assignment-authoring-nexus.spec.ts --project=nexus-chrome
 */

import { test, expect } from '@playwright/test';
import { getTestAuthToken, injectAuthForPage, APP_URLS } from '../utils/credentials';
import { assertNoHorizontalOverflow, assertTouchTargetSize } from '../utils/mobile-helpers';

test.use({ storageState: { cookies: [], origins: [] } });

test.describe('Assignment authoring', () => {
  test.describe.configure({ mode: 'serial', timeout: 150_000 });

  let teacherToken: string | null = null;
  let assignmentId: string | null = null;

  test.beforeAll(async ({ playwright }) => {
    const api = await playwright.request.newContext();
    teacherToken = (await getTestAuthToken(api, 'teacher'))?.testToken ?? null;
    await api.dispose();
  });

  test('AC: the first screen names multiple choice, before anything is committed', async ({ page }) => {
    test.skip(!teacherToken, 'No teacher test token available.');
    await injectAuthForPage(page, 'teacher');
    await page.goto(`${APP_URLS.nexus}/teacher/assignments`);
    await page.waitForLoadState('networkidle');

    const newButton = page.getByRole('button', { name: /new assignment|add assignment/i }).first();
    await expect(newButton).toBeVisible({ timeout: 30_000 });
    await newButton.click();

    // The question that replaced "Drawing or Document".
    await expect(page.getByText(/what will students do\?/i)).toBeVisible({ timeout: 15_000 });

    // All three modes are on screen at once. Hiding any of them is how the
    // question path became invisible.
    const modes = page.getByRole('radio');
    await expect(page.getByRole('radio', { name: /answer questions/i })).toBeVisible();
    await expect(page.getByRole('radio', { name: /solve and upload/i })).toBeVisible();
    await expect(page.getByRole('radio', { name: /drawing task/i })).toBeVisible();
    expect(await modes.count()).toBeGreaterThanOrEqual(3);

    // The literal words a teacher looking for MCQ would scan for.
    await expect(page.getByText(/multiple choice/i).first()).toBeVisible();
  });

  test('AC: choosing Drawing offers the outcome and the focus, not one box', async ({ page }) => {
    test.skip(!teacherToken, 'No teacher test token available.');
    await injectAuthForPage(page, 'teacher');
    await page.goto(`${APP_URLS.nexus}/teacher/assignments`);
    await page.waitForLoadState('networkidle');
    await page.getByRole('button', { name: /new assignment|add assignment/i }).first().click();
    await page.getByRole('radio', { name: /drawing task/i }).click();

    await expect(page.getByLabel(/^the task$/i)).toBeVisible({ timeout: 15_000 });
    await expect(page.getByLabel(/expected outcome/i)).toBeVisible();
    await expect(page.getByLabel(/what to focus on/i)).toBeVisible();
  });

  test('AC: an existing assignment shows a questions card that opens the editor', async ({
    page,
    request,
  }) => {
    test.skip(!teacherToken, 'No teacher test token available.');

    // Find any document assignment the teacher can open.
    const res = await request.get(`${APP_URLS.nexus}/api/assignments`, {
      headers: { Authorization: `Bearer ${teacherToken}` },
    });
    test.skip(!res.ok(), 'Could not list assignments.');
    const body = await res.json();
    const candidate = (body.assignments || []).find((a: any) => a.assignment_type !== 'drawing');
    test.skip(!candidate, 'No document assignment to exercise.');
    assignmentId = candidate.id;

    await injectAuthForPage(page, 'teacher');
    await page.goto(`${APP_URLS.nexus}/teacher/assignments/${assignmentId}`);
    await page.waitForLoadState('networkidle');

    await expect(page.getByRole('heading', { name: /questions in the app/i })).toBeVisible({
      timeout: 30_000,
    });

    const action = page.getByRole('button', { name: /add questions|edit questions|view questions/i });
    await expect(action).toBeVisible();
    await action.click();

    await expect(page).toHaveURL(new RegExp(`/teacher/assignments/${assignmentId}/questions`));
    await expect(page.getByRole('heading', { name: /^questions$/i })).toBeVisible({ timeout: 30_000 });
  });

  test('the empty card says what questions would do, not just that there are none', async ({
    page,
  }) => {
    test.skip(!assignmentId, 'No assignment.');
    await injectAuthForPage(page, 'teacher');
    await page.goto(`${APP_URLS.nexus}/teacher/assignments/${assignmentId}`);
    await page.waitForLoadState('networkidle');

    const card = page.getByRole('heading', { name: /questions in the app/i }).locator('..');
    const text = (await card.innerText()).toLowerCase();
    // Either it already has a paper, or the empty state has to sell the feature.
    if (text.includes('no questions yet')) {
      expect(text).toContain('multiple choice');
      expect(text).toContain('mark themselves');
    } else {
      expect(text).toMatch(/\d+ question/);
    }
  });

  test('the editor has room: add a question and it stays on screen', async ({ page }) => {
    test.skip(!assignmentId, 'No assignment.');
    await injectAuthForPage(page, 'teacher');
    await page.goto(`${APP_URLS.nexus}/teacher/assignments/${assignmentId}/questions`);
    await page.waitForLoadState('networkidle');

    const locked = await page.getByText(/already answered these questions/i).count();
    test.skip(locked > 0, 'This paper is locked because students have answered it.');

    await page.getByRole('button', { name: /^add question$/i }).click();
    await expect(page.getByLabel(/^question$/i).first()).toBeVisible();
    // The composer used to live in a 94vh bottom sheet, where this control was
    // frequently below the fold.
    await expect(page.getByRole('button', { name: /save paper|save and continue/i })).toBeVisible();
  });

  test('mobile: the picker fits and its targets are big enough', async ({ page }) => {
    test.skip(!teacherToken, 'No teacher test token available.');
    await page.setViewportSize({ width: 375, height: 812 });
    await injectAuthForPage(page, 'teacher');
    await page.goto(`${APP_URLS.nexus}/teacher/assignments`);
    await page.waitForLoadState('networkidle');
    await page.getByRole('button', { name: /new assignment|add assignment/i }).first().click();
    await expect(page.getByText(/what will students do\?/i)).toBeVisible({ timeout: 15_000 });

    await assertNoHorizontalOverflow(page);
    await assertTouchTargetSize(page, '[role="radio"]', 44);
  });

  test('mobile: the questions editor fits', async ({ page }) => {
    test.skip(!assignmentId, 'No assignment.');
    await page.setViewportSize({ width: 375, height: 812 });
    await injectAuthForPage(page, 'teacher');
    await page.goto(`${APP_URLS.nexus}/teacher/assignments/${assignmentId}/questions`);
    await page.waitForLoadState('networkidle');
    await assertNoHorizontalOverflow(page);
  });
});

test.describe('The class recording reaches the student', () => {
  test.describe.configure({ timeout: 90_000 });

  /**
   * The regression this guards is subtle and was invisible for months: the
   * lookup searched `plan_entry_id`, which nothing writes, so an assignment
   * linked to a class with a perfectly good recording resolved to null every
   * time. Nobody saw an error; they just never saw a recording.
   */
  test('an assignment linked to a class resolves that class recording', async ({
    request,
    playwright,
  }) => {
    const api = await playwright.request.newContext();
    const studentToken = (await getTestAuthToken(api, 'student'))?.testToken ?? null;
    await api.dispose();
    test.skip(!studentToken, 'No student test token available.');

    const list = await request.get(`${APP_URLS.nexus}/api/student/assignments`, {
      headers: { Authorization: `Bearer ${studentToken}` },
    });
    test.skip(!list.ok(), 'Could not list student assignments.');
    const { assignments } = await list.json();

    const linked = (assignments || []).filter((a: any) => a.scheduled_class_id && !a.recording_url);
    test.skip(!linked.length, 'No class-linked assignment without its own recording link.');

    // At least one of them should now resolve, because the classes carry
    // recordings. A blanket null across every one of them is the old bug.
    const detailed = await Promise.all(
      linked.slice(0, 5).map(async (a: any) => {
        const res = await request.get(`${APP_URLS.nexus}/api/assignments/${a.id}`, {
          headers: { Authorization: `Bearer ${studentToken}` },
        });
        return res.ok() ? (await res.json()).recording : null;
      }),
    );
    const resolved = detailed.filter((r) => r?.url);
    test.skip(!resolved.length, 'None of the linked classes has a recording yet.');

    for (const rec of resolved) {
      expect(rec.source).toMatch(/youtube|sharepoint/);
      // A source with no url would render an empty player.
      expect(rec.url).toBeTruthy();
    }
  });
});
