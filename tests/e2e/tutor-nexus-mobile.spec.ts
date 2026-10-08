/**
 * The AI Tutor's focus screen in the student practice reader, on a phone and at md.
 *
 * The server side is stubbed, so no pack, session or model is needed: the
 * question detail answers with `tutor_available: true` added, and
 * /api/assistant/tutor/turn answers from a tiny scripted tutor below. The
 * attempt route is stubbed too, so nothing is written.
 *
 *  - Learn with tutor opens a full-screen focus screen and puts tutor=1 in the URL
 *  - Guide me shows step 1 with lettered choices; a wrong choice is greyed as tried
 *  - Give me a hint shows "Hint 1 of 4"
 *  - Back closes the tutor and the question stays open (qid kept, reader showing)
 *  - every control in the sheet is at least 44 by 44, nothing scrolls sideways
 *  - at 1024px the focus screen covers the page (no list, header or Create test)
 *    with the question beside the conversation; Try it myself lands on its options
 *
 * The test-mode session turns every feature flag on, so the tutor's gate opens.
 *
 * Run: pnpm test:e2e --project=nexus-mobile --no-deps tests/e2e/tutor-nexus-mobile.spec.ts
 */
import { test, expect, type Page, type Route } from '@playwright/test';
import { APP_URLS, getTestAuthToken, injectAuthForPage } from '../utils/credentials';
import { assertNoHorizontalOverflow, assertTouchTargetSize } from '../utils/mobile-helpers';

const BASE_URL = APP_URLS.nexus;
test.use({ baseURL: BASE_URL, storageState: { cookies: [], origins: [] } });
test.describe.configure({ timeout: 240_000 });

interface Paper {
  exam: string;
  year: number;
}
let paper: Paper | null | undefined;

async function pickPaper(page: Page): Promise<Paper | null> {
  const auth = await getTestAuthToken(page.request, 'student');
  const classroomId = auth?.classrooms?.[0]?.id;
  if (!auth || !classroomId) return null;
  const res = await page.request.get(`/api/question-bank/exam-tree?classroom_id=${classroomId}`, {
    headers: { Authorization: `Bearer ${auth.testToken}` },
    timeout: 180_000,
  });
  if (!res.ok()) return null;
  const tree = (await res.json()).data as { exams: { exam_type: string; years: { year: number; count: number }[] }[] };
  for (const exam of tree?.exams ?? []) {
    const year = [...exam.years].sort((a, b) => b.count - a.count).find((y) => y.count >= 5);
    if (year) return { exam: exam.exam_type, year: year.year };
  }
  return null;
}

const CHOICES = [
  { id: 'c1', md: '$2$' },
  { id: 'c2', md: '$4$' },
  { id: 'c3', md: '$8$' },
];

function env(extra: Record<string, unknown>) {
  return { sessionId: 'e2e-session', llm: false, progress: null, hintsUsed: 0, chips: [], blocks: [], phase: 'attempt', ...extra };
}

/** A scripted tutor: start, guide_me, choose (always "not yet"), hint. Records every request. */
async function stubTutor(page: Page) {
  const sent: { action: { type: string }; clientMessageId: string }[] = [];
  let hints = 0;
  await page.route('**/api/assistant/tutor/turn', async (route: Route) => {
    const body = route.request().postDataJSON() as { action: { type: string; choiceId?: string }; clientMessageId: string };
    sent.push(body);
    const tried = body.action.type === 'choose' ? [body.action.choiceId] : [];
    const check = { id: 'b9', kind: 'check_question', stepId: 'st1', md: 'What is $2 \\times 2$?', choices: CHOICES, tried };
    const guidedChips = [
      { label: 'Why?', action: { type: 'why' } },
      { label: hints ? 'Next hint' : 'Give me a hint', action: { type: 'hint' } },
    ];
    switch (body.action.type) {
      case 'start':
        return route.fulfill({
          json: env({
            blocks: [
              { id: 'b1', kind: 'concept_chips', items: [{ slug: 'mult', label: 'Multiplication', state: 'DEVELOPING' }] },
              { id: 'b2', kind: 'tutor_text', md: 'How do you want to work on this one?' },
            ],
            chips: [
              { label: 'Try it myself', action: { type: 'try_myself' } },
              { label: 'Guide me step by step', action: { type: 'guide_me' } },
              { label: 'Give me a hint', action: { type: 'hint' } },
            ],
          }),
        });
      case 'guide_me':
        return route.fulfill({
          json: env({
            phase: 'guided',
            progress: { step: 1, total: 2 },
            blocks: [
              { id: 'b1', kind: 'step_progress', index: 1, total: 2 },
              { id: 'b2', kind: 'tutor_text', md: 'Doubling means adding a number to itself.' },
              { ...check, tried: [] },
            ],
            chips: guidedChips,
          }),
        });
      case 'choose':
        return route.fulfill({
          json: env({
            phase: 'guided',
            progress: { step: 1, total: 2 },
            blocks: [
              { id: 'b1', kind: 'verdict', result: 'not_yet', md: 'Not quite.', mistake: 'ARITHMETIC_ERROR', mistakeLabel: 'Arithmetic slip' },
              { id: 'b2', kind: 'tutor_text', md: 'Have another look.' },
              check,
            ],
            chips: guidedChips,
          }),
        });
      case 'hint':
        hints += 1;
        return route.fulfill({
          json: env({
            phase: 'guided',
            progress: { step: 1, total: 2 },
            hintsUsed: hints,
            blocks: [{ id: 'b1', kind: 'hint', level: hints, md: 'Count in twos.' }, { ...check, tried: ['c1'] }],
            chips: [{ label: 'Next hint', action: { type: 'hint' } }],
          }),
        });
      default:
        return route.fulfill({ json: env({ blocks: [{ id: 'b1', kind: 'tutor_text', md: 'OK.' }] }) });
    }
  });
  return sent;
}

/** Every question detail says the tutor is ready for it. */
async function stubDetail(page: Page) {
  await page.route(/\/api\/question-bank\/questions\/[0-9a-f-]{36}\?/, async (route) => {
    if (route.request().method() !== 'GET') return route.fallback();
    const res = await route.fetch();
    const json = await res.json();
    if (json?.data) json.data.tutor_available = true;
    return route.fulfill({ response: res, json });
  });
}

async function setUp(page: Page) {
  await page.addInitScript(() => {
    try {
      window.localStorage.setItem('nexus_welcome_seen_v1', new Date().toISOString());
    } catch {
      /* blocked storage */
    }
  });
  const ok = await injectAuthForPage(page, 'student');
  test.skip(!ok, 'Nexus test-login unavailable');
  if (paper === undefined) paper = await pickPaper(page);
  test.skip(!paper, 'No paper with 5 or more questions on this database');
  await page.route('**/api/question-bank/questions/*/attempt', (route) =>
    route.fulfill({ json: { data: { isCorrect: false, attempt: { id: 'e2e', created_at: new Date().toISOString() } } } }),
  );
  await stubDetail(page);
  return stubTutor(page);
}

async function openPaper(page: Page) {
  await page.goto(`/student/question-bank/questions?exam=${paper!.exam}&year=${paper!.year}`, { waitUntil: 'domcontentloaded' });
  await page.getByRole('button', { name: 'Skip' }).click({ timeout: 5_000 }).catch(() => {});
}

// A stubbed detail fetch can still be in flight when a test ends; let it go quietly.
test.afterEach(async ({ page }) => {
  await page.unrouteAll({ behavior: 'ignoreErrors' });
});

const reader = (page: Page) => page.getByRole('dialog', { name: 'Question reader' });
const tutorSheet = (page: Page) => page.getByRole('dialog', { name: 'Learn with tutor', exact: true });

test.describe('AI Tutor on a phone', () => {
  test.use({ viewport: { width: 375, height: 812 }, hasTouch: true, isMobile: true });

  test('opens from the reader, teaches a step, gives a hint, and Back keeps the question open', async ({ page }) => {
    const sent = await setUp(page);
    await openPaper(page);
    await page.getByRole('button', { name: 'Number grid' }).click({ timeout: 120_000 });
    const cell = page.locator('[data-roving] button[data-qid]').first();
    await expect(cell).toBeVisible({ timeout: 120_000 });
    const qid = await cell.getAttribute('data-qid');
    await cell.click();
    await expect(reader(page)).toBeVisible();

    // The door, in the reader header: a 48px icon at this width.
    const door = reader(page).getByRole('button', { name: 'Learn with tutor' });
    await expect(door).toBeVisible({ timeout: 60_000 });
    await door.click();
    await expect(tutorSheet(page)).toBeVisible();
    await expect(page).toHaveURL(/tutor=1/);
    await expect(tutorSheet(page).getByText('How do you want to work on this one?')).toBeVisible();
    await expect(tutorSheet(page).getByText('Developing')).toBeVisible();
    expect(sent[0].action.type).toBe('start');

    await tutorSheet(page).getByRole('button', { name: 'Guide me step by step' }).click();
    await expect(tutorSheet(page).getByText('Step 1 of 2').first()).toBeVisible();
    const choices = tutorSheet(page).getByTestId('tutor-choice');
    await expect(choices).toHaveCount(3);

    await choices.first().click();
    await expect(tutorSheet(page).getByText('Not yet')).toBeVisible();
    await expect(tutorSheet(page).getByText('Arithmetic slip')).toBeVisible();
    // Only the newest check takes answers, and the tried choice is off.
    await expect(tutorSheet(page).getByTestId('tutor-choice')).toHaveCount(3);
    await expect(tutorSheet(page).getByRole('button', { name: 'A, tried already' })).toBeDisabled();

    await tutorSheet(page).getByRole('button', { name: 'Give me a hint' }).click();
    await expect(tutorSheet(page).getByText('Hint 1 of 4').first()).toBeVisible();
    // Every press went out with its own id.
    expect(new Set(sent.map((s) => s.clientMessageId)).size).toBe(sent.length);
    await page.screenshot({ path: 'test-results/tutor-mobile-sheet.png' });

    // Sized for a thumb, and nothing scrolls sideways.
    await assertTouchTargetSize(page, '[role="dialog"][aria-label="Learn with tutor"] button:visible, [role="dialog"][aria-label="Learn with tutor"] [role="button"]:visible');
    await assertNoHorizontalOverflow(page);
    const sheetPaper = tutorSheet(page);
    expect(await sheetPaper.evaluate((el) => el.scrollWidth - el.clientWidth)).toBeLessThanOrEqual(1);

    // Back closes the tutor, not the question.
    await page.goBack();
    await expect(tutorSheet(page)).toBeHidden();
    await expect(reader(page)).toBeVisible();
    expect(page.url()).not.toContain('tutor=1');
    expect(page.url()).toContain(`qid=${qid}`);
  });

  test('Try it myself returns to the reader with a Back to tutor pill', async ({ page }) => {
    await setUp(page);
    await openPaper(page);
    await page.getByRole('button', { name: 'Number grid' }).click({ timeout: 120_000 });
    await page.locator('[data-roving] button[data-qid]').first().click();
    await reader(page).getByRole('button', { name: 'Learn with tutor' }).click({ timeout: 60_000 });
    await tutorSheet(page).getByRole('button', { name: 'Try it myself' }).click();
    await expect(tutorSheet(page)).toBeHidden();
    const pill = reader(page).getByRole('button', { name: /^Back to tutor/ });
    await expect(pill).toBeVisible();
    await pill.click();
    await expect(tutorSheet(page)).toBeVisible();
    // The conversation is still there.
    await expect(tutorSheet(page).getByText('How do you want to work on this one?')).toBeVisible();
  });
});

test.describe('AI Tutor focus screen at md', () => {
  test.use({ viewport: { width: 1024, height: 768 }, hasTouch: false, isMobile: false });

  test('covers the page, keeps the question answerable beside the tutor, and closes back to it', async ({ page }) => {
    await setUp(page);
    await openPaper(page);
    const door = page.getByRole('button', { name: 'Learn with tutor' });
    await expect(door).toBeVisible({ timeout: 120_000 });
    await door.click();
    const focus = tutorSheet(page);
    await expect(focus).toBeVisible();
    await expect(page).toHaveURL(/tutor=1/);
    await expect(focus.getByText('How do you want to work on this one?')).toBeVisible();
    // Nothing else on the page is reachable: the list, the header and Create test are behind it.
    await expect(page.getByRole('button', { name: 'Create test' })).toHaveCount(0);
    await expect(page.getByRole('region', { name: 'Questions', exact: true })).toHaveCount(0);
    const question = focus.getByRole('region', { name: 'Question', exact: true });
    await expect(question).toBeVisible();
    await expect(question.getByRole('button', { name: 'Next question' })).toHaveCount(0);
    await assertNoHorizontalOverflow(page);
    await page.screenshot({ path: 'test-results/tutor-md-focus.png' });

    // Try it myself hands the student to the question's options, without leaving.
    await focus.getByRole('button', { name: 'Try it myself' }).click();
    await expect(focus).toBeVisible();
    // An option on a choice question, the answer box on a typed one.
    await expect(question.locator('[role="radio"], textarea, input:not([type="hidden"])').first()).toBeFocused();

    await focus.getByRole('button', { name: 'Back to the question' }).click();
    await expect(focus).toBeHidden();
    await expect(page.getByRole('region', { name: 'Questions', exact: true })).toBeVisible();
    expect(page.url()).not.toContain('tutor=1');
  });

  test('Escape closes it too', async ({ page }) => {
    await setUp(page);
    await openPaper(page);
    await page.getByRole('button', { name: 'Learn with tutor' }).click({ timeout: 120_000 });
    await expect(tutorSheet(page)).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(tutorSheet(page)).toBeHidden();
    expect(page.url()).not.toContain('tutor=1');
  });
});
