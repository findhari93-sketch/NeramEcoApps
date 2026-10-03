import { test, expect, type Page } from '@playwright/test';
import { APP_URLS, STUDENT_ACCOUNT, injectAuthForPage } from '../utils/credentials';
import { assertNoHorizontalOverflow, assertTouchTargetSize } from '../utils/mobile-helpers';

/**
 * Neram Assistant M1 on a phone and on a desktop.
 *
 * The server side is stubbed: the brief, the turn and the action routes answer
 * with fixtures, so no database row is written and no model is called. This file
 * holds the facts that have to be true on screen. One floating button on student
 * pages, above the bottom nav. The sheet opens as a labelled dialog, the quick
 * actions are there, a reply renders with chips of a tappable size, the guided
 * flow reaches a confirmation card and a confirmed result, focus goes back to the
 * button that opened the panel, the page never scrolls sideways, and Report a
 * problem still works from inside the assistant.
 *
 * The test-mode session turns every feature flag on, so the launcher renders.
 * Self-skips when the Nexus dev server (APP_URLS.nexus, E2E_NEXUS_URL) is down.
 *
 * Against a server you started yourself on another port, pass PW_APPS=none:
 *   E2E_NEXUS_URL=http://localhost:3032 PW_APPS=none pnpm exec playwright test \
 *     --project=nexus-mobile --no-deps tests/e2e/assistant-nexus-mobile.spec.ts
 * With PW_APPS=nexus, Playwright checks :3012 and, when nothing answers there,
 * runs `next dev` in apps/nexus itself. That second server rewrites the same
 * .next folder under the one on your port and leaves it serving 404s.
 */

const NEXUS = APP_URLS.nexus;
const PHONE = { width: 375, height: 812 };
const DESKTOP = { width: 1280, height: 800 };

const BRIEF = {
  brief: {
    greeting: 'Good evening, Priya',
    classroomName: 'JEE B.Arch Session 1',
    hasContent: true,
    sections: [
      { id: 'next_class', text: 'Class today at 6:00 pm: Perspective.', link: '/student/timetable' },
      { id: 'assignments', text: '2 assignments to submit. Shading sheet is due tomorrow.', link: '/student/assignments' },
    ],
  },
};

function envelope(reply: string, extra: Record<string, unknown> = {}) {
  return {
    reply,
    suggestions: [
      { label: 'Tomorrow 6:00 pm: Perspective', send: 'Tomorrow 6:00 pm: Perspective' },
      { label: 'Several days', send: 'Several days' },
    ],
    links: [],
    action: null,
    mode: 'general',
    threadId: 'thread-e2e',
    ...extra,
  };
}

/** Every /api/assistant/* call answers from a fixture. Records what the page sent. */
async function stubAssistant(page: Page) {
  const sent: { turns: string[]; confirms: unknown[] } = { turns: [], confirms: [] };
  await page.route('**/api/assistant/brief**', (route) => route.fulfill({ json: BRIEF }));
  await page.route('**/api/assistant/threads**', (route) => route.fulfill({ json: { threadId: 'thread-e2e' } }));
  await page.route('**/api/assistant/turn**', async (route) => {
    const body = route.request().postDataJSON() as { text?: string };
    const text = body?.text || '';
    sent.turns.push(text);
    if (/can'?t attend/i.test(text)) {
      // Held back a moment so the in-flight state (skeleton, Send blocked,
      // text box still enabled) can be observed.
      await new Promise((r) => setTimeout(r, 1_500));
      return route.fulfill({ json: envelope('Which class can you not attend?') });
    }
    if (/Perspective/.test(text)) {
      return route.fulfill({ json: envelope('Perspective, tomorrow at 6:00 pm. Why can you not make it?', { suggestions: [{ label: 'Feeling unwell', send: 'Feeling unwell' }] }) });
    }
    if (/unwell/i.test(text)) {
      return route.fulfill({
        json: envelope('Here is what I will tell your teacher. Confirm and it is done.', {
          suggestions: [],
          action: {
            id: 'act-1',
            kind: 'decline_class',
            summary: 'Tell your teacher you cannot attend Perspective on Tomorrow at 6:00 pm.',
            fields: [{ label: 'Class', value: 'Perspective' }, { label: 'Reason', value: 'Feeling unwell' }],
            confirmToken: 'ct',
            expiresAt: new Date(Date.now() + 600_000).toISOString(),
          },
        }),
      });
    }
    return route.fulfill({ json: envelope('I cannot answer free questions yet. Here is what I can do right now.') });
  });
  await page.route('**/api/assistant/actions/**', (route) => {
    sent.confirms.push({ method: route.request().method(), url: route.request().url(), body: route.request().postDataJSON() });
    return route.fulfill({
      json: { ok: true, reply: 'Done. Your teacher knows you cannot attend Perspective.', links: [{ label: 'Timetable', url: '/student/timetable' }], threadId: 'thread-e2e' },
    });
  });
  return sent;
}

/**
 * Signs in as the STUDENT (the project's storageState is cleared below, so no
 * teacher session leaks in), stubs the assistant, opens the dashboard and waits
 * for the brief card.
 *
 * Only an unreachable server skips. A test-login endpoint that answers with an
 * error, an auth injection that fails, or a dashboard without the brief card are
 * failures: skipping on them would read green while the brief route, the card or
 * the flag gating is broken.
 */
async function openDashboard(page: Page) {
  // Probe the test-login endpoint first, so "nothing is listening" (skip) can be
  // told apart from "the server answered and refused" (fail).
  // A Next dev server answers 404 while it compiles a cold route, so a 404 is
  // retried the way getTestAuthToken does; a route that is really gone still
  // 404s on the last attempt and fails below.
  let probe: Awaited<ReturnType<typeof page.request.post>> | Error = new Error('not attempted');
  for (let attempt = 0; attempt < 3; attempt++) {
    probe = await page.request
      .post(`${NEXUS}/api/auth/test-login`, { data: { email: STUDENT_ACCOUNT.email, role: 'student' }, failOnStatusCode: false, timeout: 90_000 })
      .catch((err: Error) => err);
    if (probe instanceof Error || probe.status() !== 404) break;
    await page.waitForTimeout(4_000);
  }
  if (probe instanceof Error) {
    const unreachable = /ECONNREFUSED|ECONNRESET|ENOTFOUND|socket hang up/i.test(probe.message);
    test.skip(unreachable, `Nexus test-login endpoint unreachable at ${NEXUS}: ${probe.message}`);
    throw new Error(`Student test login request failed: ${probe.message}`);
  }
  expect(probe.status(), `Student test login answered ${probe.status()} on a reachable server`).toBe(200);

  // The first-run welcome tour is a modal: while it is open MUI aria-hides the
  // rest of the app and every getByRole below finds nothing.
  await page.addInitScript(() => {
    try {
      window.localStorage.setItem('nexus_welcome_seen_v1', new Date().toISOString());
    } catch {
      /* blocked storage is the environment's problem */
    }
  });
  expect(await injectAuthForPage(page, 'student'), 'injectAuthForPage(student) failed against a reachable server').toBe(true);
  const sent = await stubAssistant(page);
  await page.goto(`${NEXUS}/student/dashboard`, { waitUntil: 'domcontentloaded' });
  await expect(
    page.getByText('Good evening, Priya'),
    'the brief card never showed the stubbed greeting: check the brief card mount, the student.assistant-chat gating and the session',
  ).toBeVisible({ timeout: 90_000 });
  const skip = page.getByRole('button', { name: /^skip$/i });
  if (await skip.count()) {
    await skip.first().click();
    await expect(skip.first()).toBeHidden({ timeout: 15_000 });
  }
  return sent;
}

/** The accessible label (or tag) of whatever holds focus, for readable failures. */
function activeLabel(page: Page) {
  return page.evaluate(() => {
    const el = document.activeElement as HTMLElement | null;
    if (!el) return 'nothing';
    return el.getAttribute('aria-label') || `${el.tagName.toLowerCase()}${el.getAttribute('role') ? `[role=${el.getAttribute('role')}]` : ''}`;
  });
}

/**
 * Escape only reaches the panel when focus is inside it (MUI's Modal listens on
 * its own root), so wait for that first. Otherwise a keypress that lands while
 * focus is briefly on the body is lost, and the test fails on timing rather than
 * on the focus-return behaviour it is here to prove.
 */
async function focusInsideSheet(page: Page) {
  await expect
    .poll(() => page.evaluate(() => Boolean(document.activeElement?.closest('[role="dialog"]'))), { message: 'focus moves into the open panel' })
    .toBe(true);
}

test.describe('Neram Assistant', () => {
  test.describe.configure({ mode: 'default', timeout: 120_000 });
  // The nexus-mobile project hands every context the TEACHER storageState. Start
  // clean; openDashboard signs in as the student.
  test.use({ storageState: { cookies: [], origins: [] } });

  let serverUp = true;

  test.beforeAll(async ({ browser }, testInfo) => {
    testInfo.setTimeout(240_000);
    // A cold dev route takes longer than the project's 30s; compile the
    // dashboard (server and client bundles) once before the tests run.
    const ctx = await browser.newContext({ storageState: { cookies: [], origins: [] } });
    try {
      const p = await ctx.newPage();
      const res = await p.goto(`${NEXUS}/login`, { waitUntil: 'domcontentloaded', timeout: 60_000 }).catch(() => null);
      if (!res || !res.ok()) {
        serverUp = false;
        return;
      }
      await p.goto(`${NEXUS}/student/dashboard`, { waitUntil: 'load', timeout: 200_000 }).catch(() => null);
    } finally {
      await ctx.close();
    }
  });

  test.describe('on a phone', () => {
    test.use({ viewport: PHONE });

    test('one floating button, above the bottom nav, and the brief card', async ({ page }) => {
      test.skip(!serverUp, `Nexus dev server not reachable at ${NEXUS}`);
      const sent = await openDashboard(page);

      // One corner button: the old Report a problem Fab is gone with the flag on.
      await expect(page.locator('[data-no-screenshot="true"]')).toHaveCount(1);
      const launcher = page.getByRole('button', { name: 'Open Neram Assistant' });
      await expect(launcher).toHaveCount(1);
      await expect(launcher).toBeVisible();
      const box = (await launcher.boundingBox())!;
      expect(box.width).toBeGreaterThanOrEqual(56);
      expect(box.height).toBeGreaterThanOrEqual(56);
      // Clear of the 64px bottom nav.
      expect(box.y + box.height).toBeLessThanOrEqual(PHONE.height - 64);

      // The brief card links each line to the page it came from.
      await expect(page.getByRole('link', { name: /Class today at 6:00 pm/ })).toHaveAttribute('href', '/student/timetable');
      await expect(page.getByRole('link', { name: /Shading sheet is due tomorrow/ })).toHaveAttribute('href', '/student/assignments');
      await expect(page.locator('section[aria-labelledby="brief-title"] a')).toHaveCount(2);
      await assertTouchTargetSize(page, 'section[aria-labelledby="brief-title"] a', 48);
      await assertNoHorizontalOverflow(page);

      // Open and close with nothing in between: focus goes back to the launcher.
      await launcher.click();
      const sheet = page.getByRole('dialog', { name: 'Neram Assistant' });
      await expect(sheet).toBeVisible();
      await expect(launcher).toBeHidden();
      await focusInsideSheet(page);
      await page.keyboard.press('Escape');
      await expect(sheet).toBeHidden();
      await expect(launcher).toBeVisible();
      await expect.poll(() => activeLabel(page), { message: 'focus after closing the sheet' }).toBe('Open Neram Assistant');
      await expect(launcher).toBeFocused();
    });

    test('the guided flow runs to a confirmation card, with tappable chips, and focus returns to the launcher', async ({ page }) => {
      test.skip(!serverUp, `Nexus dev server not reachable at ${NEXUS}`);
      const sent = await openDashboard(page);

      const launcher = page.getByRole('button', { name: 'Open Neram Assistant' });
      await launcher.click();
      const sheet = page.getByRole('dialog', { name: 'Neram Assistant' });
      await expect(sheet).toBeVisible();
      // While the panel is open the launcher zooms out of sight and out of the tree.
      await expect(launcher).toBeHidden();
      // A bottom sheet, most of the screen tall.
      await expect.poll(async () => (await sheet.boundingBox())?.height ?? 0).toBeGreaterThan(PHONE.height * 0.8);
      const sheetBox = (await sheet.boundingBox())!;
      expect(sheetBox.y + sheetBox.height).toBeGreaterThanOrEqual(PHONE.height - 1);

      // The five quick actions.
      for (const name of ["What's on today?", "I can't attend a class", 'Remind me', 'Add a sketch', 'Report a problem']) {
        await expect(sheet.getByRole('button', { name: new RegExp(name.replace(/[?']/g, '.')) })).toBeVisible();
      }

      await sheet.getByRole('button', { name: /I can.t attend a class/ }).click();
      // In flight: a skeleton, Send blocked, the text box still takes typing.
      await expect(sheet.getByRole('status', { name: 'Neram Assistant is thinking' })).toBeVisible();
      const box = sheet.getByRole('textbox', { name: 'Message Neram Assistant' });
      await expect(box).toBeEnabled();
      await box.fill('typed while waiting');
      await expect(sheet.getByRole('button', { name: 'Send' })).toBeDisabled();
      await expect(sheet.getByText('Which class can you not attend?')).toBeVisible({ timeout: 15_000 });
      // What was typed during the wait survives the reply landing.
      await expect(box).toHaveValue('typed while waiting');
      await box.fill('');

      const chips = sheet.getByTestId('assistant-chip');
      await expect(page.locator('[data-testid="assistant-chip"]')).toHaveCount(2);
      await assertTouchTargetSize(page, '[data-testid="assistant-chip"]', 48);
      await expect(page.locator('button[aria-label="Send"]')).toHaveCount(1);
      await assertTouchTargetSize(page, 'button[aria-label="Send"]', 48);
      await expect(page.locator('button[aria-label="Attach a photo"]')).toHaveCount(1);
      await assertTouchTargetSize(page, 'button[aria-label="Attach a photo"]', 48);
      // The file input takes images from the camera or the gallery (no capture).
      const file = sheet.getByTestId('assistant-file-input');
      await expect(file).toHaveAttribute('accept', 'image/*');
      expect(await file.getAttribute('capture')).toBeNull();

      await chips.filter({ hasText: 'Perspective' }).click();
      await expect(sheet.getByText(/Why can you not make it/)).toBeVisible();
      await chips.filter({ hasText: 'Feeling unwell' }).click();
      const card = sheet.getByRole('group', { name: 'Confirm this action' });
      await expect(card).toBeVisible();
      await expect(card.getByText('Tell your teacher you cannot attend Perspective on Tomorrow at 6:00 pm.')).toBeVisible();
      await expect(card.getByText('Feeling unwell')).toBeVisible();
      await expect(page.locator('[role="group"][aria-label="Confirm this action"] button')).toHaveCount(3);
      await assertTouchTargetSize(page, '[role="group"][aria-label="Confirm this action"] button', 48);
      await assertNoHorizontalOverflow(page);

      await card.getByRole('button', { name: 'Confirm' }).click();
      await expect(sheet.getByText(/Your teacher knows you cannot attend/)).toBeVisible();
      await expect(card).toBeHidden();
      await expect(sheet.getByRole('link', { name: 'Timetable' })).toHaveAttribute('href', '/student/timetable');
      expect(sent.turns).toEqual(["I can't attend a class", 'Tomorrow 6:00 pm: Perspective', 'Feeling unwell']);
      expect(sent.confirms).toEqual([{ method: 'POST', url: expect.stringContaining('/api/assistant/actions/act-1'), body: { token: 'ct' } }]);
      await assertNoHorizontalOverflow(page);

      // Escape closes the sheet and hands focus back to the button that opened it.
      await focusInsideSheet(page);
      await page.keyboard.press('Escape');
      await expect(sheet).toBeHidden();
      await expect(launcher).toBeVisible();
      // The poll names whatever does hold focus when this fails.
      await expect.poll(() => activeLabel(page), { message: 'focus after closing the sheet' }).toBe('Open Neram Assistant');
      await expect(launcher).toBeFocused();
    });

    test('Report a problem still opens the report form from inside the assistant', async ({ page }) => {
      test.skip(!serverUp, `Nexus dev server not reachable at ${NEXUS}`);
      const sent = await openDashboard(page);

      await page.getByRole('button', { name: 'Open Neram Assistant' }).click();
      const sheet = page.getByRole('dialog', { name: 'Neram Assistant' });
      await expect(sheet).toBeVisible();
      await sheet.getByRole('button', { name: /Report a problem/ }).click();
      // The assistant closes first so it is not in the screenshot, then the form opens.
      await expect(sheet).toBeHidden();
      // At phone width the report form is a bottom sheet with no dialog role, so
      // find it by its heading and its submit button. The top bar mounts its own
      // (closed, kept-mounted) copy of the same form, hence the visible filter.
      await expect(page.getByText('Report an Issue', { exact: true }).filter({ visible: true })).toBeVisible({ timeout: 30_000 });
      await expect(page.getByRole('button', { name: /Submit Ticket/ })).toBeVisible();
      // Nothing was sent to the assistant on the way.
      expect(sent.turns).toEqual([]);
      await assertNoHorizontalOverflow(page);
    });
  });

  test.describe('on a desktop', () => {
    test.use({ viewport: DESKTOP, isMobile: false, hasTouch: false });

    test('the top-bar icon opens a right-hand drawer, and Escape returns focus to it', async ({ page }) => {
      test.skip(!serverUp, `Nexus dev server not reachable at ${NEXUS}`);
      const sent = await openDashboard(page);

      const topBarIcon = page.locator('header').getByRole('button', { name: 'Open Neram Assistant' });
      await expect(topBarIcon).toHaveCount(1);
      await expect(topBarIcon).toBeVisible();
      await topBarIcon.click();

      const drawer = page.getByRole('dialog', { name: 'Neram Assistant' });
      await expect(drawer).toBeVisible();
      // Settled at the right edge, 420px wide.
      await expect.poll(async () => {
        const b = await drawer.boundingBox();
        return b ? Math.round(b.x + b.width) : 0;
      }).toBeGreaterThanOrEqual(DESKTOP.width - 10);
      const box = (await drawer.boundingBox())!;
      expect(box.width).toBeGreaterThanOrEqual(400);
      expect(box.height).toBeGreaterThanOrEqual(DESKTOP.height - 1);
      await expect(drawer.getByRole('button', { name: /I can.t attend a class/ })).toBeVisible();
      await assertNoHorizontalOverflow(page);

      await focusInsideSheet(page);
      await page.keyboard.press('Escape');
      await expect(drawer).toBeHidden();
      await expect(topBarIcon).toBeFocused();
      await assertNoHorizontalOverflow(page);
    });
  });
});
