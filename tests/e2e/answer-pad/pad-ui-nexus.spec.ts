/**
 * Answer Pad UI: a whole class in the Teams meeting side panel (test plan level 7).
 *
 * Teams itself is replaced by the injected test host (window.__PAD_TEST_HOST__,
 * which a production build ignores), so the console and three student pads run
 * in ordinary browser contexts: a 320px side panel, a Pixel 5 and an iPhone 13.
 * Runs against a Nexus dev server wired to STAGING, never production:
 *
 *   E2E_NEXUS_URL=http://localhost:3022 npx playwright test tests/e2e/answer-pad/pad-ui-nexus.spec.ts --project=nexus-chrome --no-deps
 *
 * Realtime is expected to be unavailable until the Cloudflare proxy passes
 * WebSocket upgrades through, so every screen here is running on its safety
 * poll: the timeouts are sized for that, not for Realtime.
 */
import {
  test,
  expect,
  devices,
  type APIRequestContext,
  type Browser,
  type BrowserContextOptions,
  type Page,
} from '@playwright/test';
import { getViolations, injectAxe } from 'axe-playwright';
import { NEXUS, endLeftoverSession, json, padApi, tokenFor, type PadApi } from './pad-api';

/** Teaches E2E Test Classroom. The API specs never start sessions as this teacher, so runs cannot collide. */
const TEACHER = 'e2e-checklist@neramclasses.com';
/** Answers B, the key. */
const RIGHT = 'e2etestingstudent@neramclasses.com';
/** Answers A, then answers question 2 while offline. */
const WRONG = 'e2e-checklist-student@neramclasses.com';
/** Has the pad open and never answers. */
const SILENT = 'e2e-checklist-view-student@neramclasses.com';

const SIDE_PANEL: BrowserContextOptions = { viewport: { width: 320, height: 800 } };

/**
 * Console lines that are expected, not defects:
 *  - Realtime's WebSocket failing through the proxy (the pad falls back to polling),
 *  - the browser reporting requests made while the test switched the network off,
 *  - the 409 that asks the teacher to confirm ending with an unrevealed question.
 */
const EXPECTED_CONSOLE = /WebSocket connection to|ERR_INTERNET_DISCONNECTED|status of 409|Download the React DevTools|favicon\.ico/;

interface PadPage {
  page: Page;
  errors: string[];
}

async function openPad(browser: Browser, email: string, meeting: Record<string, string>, options: BrowserContextOptions): Promise<PadPage> {
  const context = await browser.newContext({ ...options, storageState: { cookies: [], origins: [] } });
  await context.addInitScript(
    ({ token, meeting: injectedMeeting }) => {
      (window as unknown as Record<string, unknown>).__PAD_TEST_HOST__ = {
        token,
        meeting: injectedMeeting,
        frame: 'sidePanel',
        theme: 'light',
      };
    },
    { token: tokenFor(email), meeting },
  );

  const page = await context.newPage();
  const errors: string[] = [];
  page.on('pageerror', (err) => errors.push(`pageerror: ${err.message}`));
  page.on('console', (message) => {
    if (message.type() === 'error' && !EXPECTED_CONSOLE.test(message.text())) errors.push(message.text());
  });
  await page.goto(`${NEXUS}/pad/teams`);
  return { page, errors };
}

async function expectNoSidewaysScroll(page: Page, who: string): Promise<void> {
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow, `${who} scrolls sideways`).toBeLessThanOrEqual(0);
}

async function expectNoSeriousAccessibilityIssues(page: Page, who: string): Promise<void> {
  await injectAxe(page);
  const violations = await getViolations(
    page,
    // The LOCAL / STAGING DB badge (components/EnvBadge.tsx) renders only on localhost, never on the deployed site.
    { exclude: [['body > div[aria-hidden="true"][style*="2147483647"]']] },
    { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa'] } },
  );
  const serious = violations
    .filter((violation) => violation.impact === 'serious' || violation.impact === 'critical')
    .map(
      (violation) =>
        `${violation.id}: ${violation.help} at ${violation.nodes
          .map((node) => `${node.target.join(' ')}${node.failureSummary ? ` (${node.failureSummary.replace(/\s+/g, ' ')})` : ''}`)
          .join(' | ')}`,
    );
  expect(serious, `${who} accessibility`).toEqual([]);
}

test.use({ storageState: { cookies: [], origins: [] } });

test.describe('Answer Pad UI: a class in the Teams side panel', () => {
  test.setTimeout(480_000);

  let api: APIRequestContext;
  let pad: PadApi;
  let classroomId = '';
  const pages: PadPage[] = [];

  const run = Date.now().toString(36);
  /** A meeting no scheduled class matches, so the console asks for the class once. */
  const meeting = { meetingId: `e2e-pad-ui-${run}`, chatId: `19:meeting_e2epadui${run}@thread.v2` };

  test.beforeAll(async ({ playwright }) => {
    api = await playwright.request.newContext();
    pad = padApi(api);
  });

  test.afterAll(async () => {
    for (const { page } of pages) await page.context().close().catch(() => undefined);
    // Never leave a live session behind for the next run.
    if (classroomId) await endLeftoverSession(pad, TEACHER, classroomId).catch(() => undefined);
    await api.dispose();
  });

  test('ask, answer, close, key, reveal, reload, a dropped connection, and end', async ({ browser }) => {
    const choice = await json(await pad.start(TEACHER, {}));
    const room = choice.classrooms?.find((c: { name: string }) => c.name === 'E2E Test Classroom');
    expect(room, 'E2E Test Classroom is missing on staging').toBeTruthy();
    classroomId = room.id;
    await endLeftoverSession(pad, TEACHER, classroomId);

    const teacher = await openPad(browser, TEACHER, meeting, SIDE_PANEL);
    pages.push(teacher);
    const console_ = teacher.page;

    await test.step('the teacher links this meeting to the class once', async () => {
      await expect(console_.getByRole('heading', { name: 'Which class is this?', exact: true })).toBeVisible({ timeout: 120_000 });
      await console_.getByRole('button', { name: 'E2E Test Classroom', exact: true }).click();
      await expect(console_.getByRole('button', { name: 'Ask question 1', exact: true })).toBeVisible({ timeout: 30_000 });
      await expectNoSidewaysScroll(console_, 'the console');
    });

    const right = await openPad(browser, RIGHT, meeting, { ...devices['Pixel 5'] });
    const wrong = await openPad(browser, WRONG, meeting, { ...devices['iPhone 13'] });
    const silent = await openPad(browser, SILENT, meeting, SIDE_PANEL);
    pages.push(right, wrong, silent);
    const students = [right.page, wrong.page, silent.page];

    let enrolled = 0;
    await test.step('students find the class from the meeting, and the console counts them', async () => {
      for (const student of students) {
        await expect(student.getByText("You're connected", { exact: true })).toBeVisible({ timeout: 120_000 });
      }
      // The class strip under the title counts the class down to who has the pad; the ready card says how many of the expected are here.
      await expect(console_.getByRole('button', { name: /, 3 with pad\. See who$/ })).toBeVisible({ timeout: 30_000 });
      const readiness = console_.getByText(/^3 of \d+$/);
      await expect(readiness).toBeVisible({ timeout: 30_000 });
      enrolled = Number((await readiness.textContent())?.split(' of ')[1]);
      expect(enrolled).toBeGreaterThanOrEqual(3);

      await expectNoSeriousAccessibilityIssues(console_, 'the ready console');
      await expectNoSeriousAccessibilityIssues(silent.page, 'a waiting pad');
    });

    await test.step("ASK opens the paper's Q.38 everywhere, one tap gives an answer, the console counts who joined", async () => {
      // The paper on the shared screen says Q.38, so every pad must say it too.
      await console_.getByLabel('Question number, as printed on the paper', { exact: true }).fill('38');
      await console_.getByRole('button', { name: 'Ask Q.38', exact: true }).click();
      await expect(console_.getByText('Q.38 open', { exact: true })).toBeVisible({ timeout: 20_000 });

      for (const student of students) {
        await expect(student.getByRole('heading', { name: 'Q.38', exact: true })).toBeVisible({ timeout: 20_000 });
        await expectNoSidewaysScroll(student, 'a student pad');
      }

      const answerB = right.page.getByRole('button', { name: 'Answer B', exact: true });
      expect((await answerB.boundingBox())?.height ?? 0, 'answer buttons are at least 44px tall').toBeGreaterThanOrEqual(44);
      await answerB.click();
      await wrong.page.getByRole('button', { name: 'Answer A', exact: true }).click();

      await expect(right.page.getByText('Your answer: B', { exact: true })).toBeVisible({ timeout: 20_000 });
      await expect(wrong.page.getByText('Your answer: A', { exact: true })).toBeVisible({ timeout: 20_000 });
      // Out of the students who joined this round, never the whole class list.
      await expect(console_.getByLabel(/^2 of \d+ answered$/)).toBeVisible({ timeout: 20_000 });
      await expect(console_.getByRole('button', { name: 'Show names' })).toHaveCount(0);
    });

    // Nudge is left out on purpose: it would send real Teams chats to every other
    // student in the staging classroom. Its rules are covered in PGlite and the
    // route and console tests.
    await test.step("the silent student says why they can't answer; the teacher sees it by name to accept", async () => {
      await silent.page.getByRole('button', { name: "I can't answer", exact: true }).click();
      await silent.page.getByRole('button', { name: "I don't know", exact: true }).click();
      await silent.page.getByRole('button', { name: 'Send to my teacher', exact: true }).click();
      await expect(silent.page.getByText("You told your teacher: I don't know. You can still answer above.", { exact: true })).toBeVisible({
        timeout: 20_000,
      });
      // The console says a reason is waiting; the name is one tap away, in the People sheet.
      await expect(console_.getByText('1 student gave a reason. Review it in See who.', { exact: true })).toBeVisible({ timeout: 20_000 });
      await console_.getByRole('button', { name: /^See who: \d+ not answered$/ }).click();
      const sheet = console_.getByRole('dialog', { name: 'Who is here' });
      await expect(sheet.getByText("Said: I don't know", { exact: true })).toBeVisible({ timeout: 20_000 });
      await expect(sheet.getByRole('button', { name: /^Accept .+'s reason$/ })).toBeVisible();
      await expectNoSidewaysScroll(console_, 'the People sheet');
      await sheet.getByRole('button', { name: 'Done', exact: true }).click();
      await expectNoSidewaysScroll(silent.page, 'the pad with a reason given');
    });

    await test.step('CLOSE stops answers, the key comes from the answers given, REVEAL grades every pad', async () => {
      await console_.getByRole('button', { name: 'Close answers', exact: true }).click();
      await expect(console_.getByRole('heading', { name: 'Q.38 closed', exact: true })).toBeVisible({ timeout: 20_000 });
      await expect(silent.page.getByText("You didn't answer this one", { exact: true })).toBeVisible({ timeout: 20_000 });

      const reveal = console_.getByRole('button', { name: 'Reveal answer', exact: true });
      await expect(reveal).toBeDisabled();
      await console_.getByRole('button', { name: 'B, 1 answered', exact: true }).click();
      await expect(reveal).toBeEnabled({ timeout: 20_000 });
      await reveal.click();
      await expect(console_.getByText('Answer: B', { exact: true })).toBeVisible({ timeout: 20_000 });

      await expect(right.page.getByText('Correct', { exact: true })).toBeVisible({ timeout: 20_000 });
      await expect(wrong.page.getByText('You answered A. The answer was B.', { exact: true })).toBeVisible({ timeout: 20_000 });
      await expect(silent.page.getByText('The answer was B. The next question will appear here.', { exact: true })).toBeVisible({
        timeout: 20_000,
      });
    });

    await test.step('the four groups add up to the class list, and names come on request', async () => {
      const groups = console_.getByRole('group', { name: /^(Correct|Incorrect|No answer|Not in the pad): \d+$/ });
      await expect(groups).toHaveCount(4);
      const labels = await groups.evaluateAll((elements) => elements.map((element) => element.getAttribute('aria-label') ?? ''));
      const counts = Object.fromEntries(labels.map((label) => [label.split(': ')[0], Number(label.split(': ')[1])]));

      expect(counts).toMatchObject({ Correct: 1, Incorrect: 1, 'No answer': 1 });
      expect(counts.Correct + counts.Incorrect + counts['No answer'] + counts['Not in the pad']).toBe(enrolled);

      await console_.getByRole('button', { name: 'Show names', exact: true }).click();
      await expect(console_.getByRole('button', { name: 'No answer (1)', exact: true })).toBeVisible({ timeout: 20_000 });
      await expect(console_.getByText("Said: I don't know", { exact: true })).toBeVisible();
      await expectNoSeriousAccessibilityIssues(console_, 'the revealed console');
    });

    await test.step('a reload on either side comes back exactly where the class was', async () => {
      await console_.reload();
      await expect(console_.getByRole('heading', { name: 'Q.38 revealed', exact: true })).toBeVisible({ timeout: 90_000 });
      await right.page.reload();
      await expect(right.page.getByText('Correct', { exact: true })).toBeVisible({ timeout: 90_000 });
    });

    await test.step('the next Ask offers Q.39, and an answer tapped with the network off is saved once it is back', async () => {
      await console_.getByRole('button', { name: 'Ask Q.39', exact: true }).click();
      await expect(wrong.page.getByRole('heading', { name: 'Q.39', exact: true })).toBeVisible({ timeout: 20_000 });

      await wrong.page.context().setOffline(true);
      await wrong.page.getByRole('button', { name: 'Answer C', exact: true }).click();
      await expect(wrong.page.getByText('No connection, still trying', { exact: true })).toBeVisible({ timeout: 10_000 });

      await wrong.page.context().setOffline(false);
      await expect(wrong.page.getByText('Your answer: C', { exact: true })).toBeVisible({ timeout: 45_000 });
      await expect(console_.getByLabel(/^1 of \d+ answered$/)).toBeVisible({ timeout: 20_000 });
    });

    await test.step('ending the round with a question still open asks first, then shows the round results', async () => {
      // End round is in the menu now, never beside it, and still asks first.
      await console_.getByRole('button', { name: 'Console menu', exact: true }).click();
      await console_.getByRole('menuitem', { name: /^End round/ }).click();
      await console_.getByRole('button', { name: 'End round', exact: true }).click();
      await expect(
        console_.getByText("Q.39 has no answer yet. It won't count until you set it from the report, and scores update then.", { exact: true }),
      ).toBeVisible({ timeout: 20_000 });

      await console_.getByRole('button', { name: 'End anyway', exact: true }).click();
      await expect(console_.getByRole('heading', { name: /^Round \d+ results$/ })).toBeVisible({ timeout: 20_000 });
      await expect(console_.getByText(/^1 question has no answer yet/)).toBeVisible();

      for (const student of students) {
        await expect(student.getByText('Results coming soon', { exact: true })).toBeVisible({ timeout: 20_000 });
      }
    });

    await test.step('no screen logged an unexpected error', async () => {
      const screens: Array<[string, PadPage]> = [
        ['the console', teacher],
        ['the Pixel 5 pad', right],
        ['the iPhone 13 pad', wrong],
        ['the side panel pad', silent],
      ];
      for (const [who, screen] of screens) expect(screen.errors, `${who} console errors`).toEqual([]);
    });
  });
});
