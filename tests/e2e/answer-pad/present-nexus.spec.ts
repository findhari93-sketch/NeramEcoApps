/**
 * Present to class: a question bank paper on the shared screen, driving the
 * Answer Pad (migration 20261028090000_answer_pad_present_mode.sql).
 *
 * Runs against a Nexus dev server wired to STAGING, never production, and
 * needs that migration applied to staging first:
 *
 *   E2E_NEXUS_URL=http://localhost:3012 npx playwright test tests/e2e/answer-pad/present-nexus.spec.ts --project=nexus-chrome --no-deps
 *
 * The API half walks one question the way a class does: ASK from the bank with
 * a timer, students answer, time runs out, Reveal grades with the bank's own
 * answer, +15s reopens. It checks at every step that no student ever receives
 * the answer before Reveal. The UI half opens the presenter at laptop and
 * projector widths and checks the question is on screen without its answer.
 */
import { test, expect, type APIRequestContext, type Page } from '@playwright/test';
import { injectAuthForPage } from '../../utils/credentials';
import { NEXUS, auth, endLeftoverSession, json, padApi, type PadApi } from './pad-api';

/** External-tier teacher who teaches E2E Test Classroom (the API specs' teacher). */
const TEACHER = 'e2e-checklist-teacher@neramclasses.com';
/** Answers with the bank's key. */
const RIGHT = 'e2etestingstudent@neramclasses.com';
/** Answers something else. */
const WRONG = 'e2e-checklist-student@neramclasses.com';

interface DeckItem {
  id: string;
  label: string;
  plan: { type: string; optionCount: number | null; hasKey: boolean };
}

/** A paper on staging with an MCQ the bank has a key for. */
async function findPaperWithKeyedMcq(api: APIRequestContext): Promise<{ paperId: string; item: DeckItem } | null> {
  const papers = await json(await api.get(`${NEXUS}/api/question-bank/papers`, { headers: auth(TEACHER) }));
  for (const paper of (papers?.data ?? []) as Array<{ id: string }>) {
    const res = await api.get(`${NEXUS}/api/question-bank/present?paper=${paper.id}`, { headers: auth(TEACHER) });
    if (res.status() !== 200) continue;
    const deck = await json(res);
    const item = (deck.items as DeckItem[]).find((i) => i.plan.type === 'mcq' && i.plan.hasKey && (i.plan.optionCount ?? 0) >= 2);
    if (item) return { paperId: paper.id, item };
  }
  return null;
}

test.use({ storageState: { cookies: [], origins: [] } });

test.describe.serial('Present to class: the pad loop', () => {
  test.setTimeout(240_000);

  let api: APIRequestContext;
  let pad: PadApi;
  let sessionId = '';
  let classroomId = '';
  let promptId = '';
  let item: DeckItem;
  let bankKey = '';

  test.beforeAll(async ({ playwright }) => {
    api = await playwright.request.newContext();
    pad = padApi(api);
  });

  test.afterAll(async () => {
    if (sessionId) await pad.end(TEACHER, sessionId).catch(() => undefined);
    await api.dispose();
  });

  test('the deck carries the questions and never an answer', async () => {
    const found = await findPaperWithKeyedMcq(api);
    test.skip(!found, 'No paper on staging with a keyed MCQ');
    item = found!.item;

    const raw = await (await api.get(`${NEXUS}/api/question-bank/present?paper=${found!.paperId}`, { headers: auth(TEACHER) })).text();
    expect(raw).not.toMatch(/correct_answer|is_correct|explanation_brief|"nta_id"/);
    // Students are refused the deck.
    expect((await api.get(`${NEXUS}/api/question-bank/present?paper=${found!.paperId}`, { headers: auth(RIGHT) })).status()).toBe(403);
  });

  test('asks the question from the bank with a timer; students see it without its answer', async () => {
    test.skip(!item, 'No deck');
    const choice = await json(await pad.start(TEACHER, {}));
    const room = choice.classrooms.find((c: { name: string }) => c.name === 'E2E Test Classroom');
    expect(room, 'E2E Test Classroom is missing on staging').toBeTruthy();
    classroomId = room.id;
    await endLeftoverSession(pad, TEACHER, classroomId);
    sessionId = (await json(await pad.start(TEACHER, { classroomId }))).sessionId;
    for (const student of [RIGHT, WRONG]) await json(await pad.heartbeat(student, sessionId));

    const asked = await json(await pad.ask(TEACHER, { sessionId, qbQuestionId: item.id, label: item.label, timeLimitSec: 30 }));
    expect(asked.changed).toBe(true);
    expect(asked.closesAt).toBeTruthy();
    promptId = asked.promptId;

    const teacher = await json(await pad.snapshot(TEACHER, sessionId));
    expect(teacher.prompt).toMatchObject({ qb_question_id: item.id, time_limit_s: 30, answer_type: 'mcq', option_count: item.plan.optionCount });
    expect(teacher.prompt.suggested_keys).toHaveLength(1);
    bankKey = teacher.prompt.suggested_keys[0];

    const studentRaw = await (await pad.snapshot(RIGHT, sessionId)).text();
    const student = JSON.parse(studentRaw);
    expect(student.prompt.qb.options).toHaveLength(item.plan.optionCount!);
    expect(student.prompt.correct_keys).toBeNull();
    expect(studentRaw).not.toMatch(/suggested_keys|is_correct|correct_answer|"solution":\{/);
  });

  test('answers, close, and Reveal grades with the bank answer', async () => {
    test.skip(!promptId, 'Nothing asked');
    const other = bankKey === 'A' ? 'B' : 'A';
    expect((await pad.submit(RIGHT, promptId, bankKey)).status()).toBe(200);
    expect((await pad.submit(WRONG, promptId, other)).status()).toBe(200);
    expect((await pad.close(TEACHER, promptId)).status()).toBe(200);

    // Before Reveal the students still have no answer.
    expect((await json(await pad.snapshot(RIGHT, sessionId))).prompt.correct_keys).toBeNull();

    expect((await pad.reveal(TEACHER, promptId)).status()).toBe(200);
    const right = await json(await pad.snapshot(RIGHT, sessionId));
    expect(right.prompt.correct_keys).toEqual([bankKey]);
    expect(right.my_response.is_correct).toBe(true);
    expect((await json(await pad.snapshot(WRONG, sessionId))).my_response.is_correct).toBe(false);
  });

  test('+15s on a closed question opens it again with a deadline', async () => {
    test.skip(!sessionId || !item, 'No session');
    const asked = await json(await pad.ask(TEACHER, { sessionId, qbQuestionId: item.id, label: item.label, timeLimitSec: 10 }));
    expect((await pad.close(TEACHER, asked.promptId)).status()).toBe(200);
    const more = await json(await api.post(`${NEXUS}/api/pad/prompts/${asked.promptId}/timer`, { headers: auth(TEACHER), data: { addSeconds: 15 } }));
    expect(more).toMatchObject({ state: 'open', reopened: true });
    expect(Date.parse(more.closesAt) - Date.now()).toBeGreaterThan(5_000);
  });
});

test.describe('Present to class: the presenter screen', () => {
  test.setTimeout(180_000);

  async function openPresenter(page: Page, width: number, height: number): Promise<boolean> {
    await page.setViewportSize({ width, height });
    if (!(await injectAuthForPage(page, 'teacher'))) return false;
    const papers = await page.request.get(`${NEXUS}/api/question-bank/papers`, { headers: auth(TEACHER) });
    const first = ((await papers.json())?.data ?? [])[0] as { id: string } | undefined;
    if (!first) return false;
    await page.goto(`${NEXUS}/pad/present?paper=${first.id}`);
    await expect(page.getByRole('navigation', { name: 'Presenter controls' })).toBeVisible({ timeout: 90_000 });
    return true;
  }

  for (const [width, height] of [
    [1280, 720],
    [1024, 768],
  ] as const) {
    test(`shows the question large, with no answer, at ${width}px`, async ({ page }) => {
      test.skip(!(await openPresenter(page, width, height)), 'No teacher sign-in or no paper on staging');

      await expect(page.getByRole('heading', { level: 1 })).toHaveText(/^Q\.|\d/);
      await expect(page.getByLabel(/correct answer/)).toHaveCount(0);
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      expect(overflow, 'the presenter scrolls sideways').toBeLessThanOrEqual(0);

      // Right arrow moves to the next question without asking it.
      const before = await page.getByRole('heading', { level: 1 }).textContent();
      await page.keyboard.press('ArrowRight');
      await expect(page.getByRole('heading', { level: 1 })).not.toHaveText(before ?? '');

      // The grid jumps anywhere.
      await page.keyboard.press('g');
      await expect(page.getByRole('dialog', { name: 'Go to a question' })).toBeVisible();
      await page.keyboard.press('Escape');

      // Every control is a comfortable size.
      for (const control of await page.getByRole('navigation', { name: 'Presenter controls' }).getByRole('button').all()) {
        const box = await control.boundingBox();
        if (box) expect(Math.min(box.width, box.height), 'a control is too small').toBeGreaterThanOrEqual(40);
      }
    });
  }
});
