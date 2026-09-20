import { test, expect, type APIResponse, type APIRequestContext, type Page } from '@playwright/test';
import { APP_URLS, getTestAuthToken, injectAuthForPage } from '../utils/credentials';
import { assertNoHorizontalOverflow } from '../utils/mobile-helpers';

/**
 * Drawing questions with parts: "1(a) ... 1(b) ..." and "Draw X OR draw Y".
 *
 * JEE Paper 2 prints several drawing tasks under one question number, and the
 * question bank used to hold them as one text with one solution. A question
 * now carries drawing_parts, each part with its own solution, and a mode that
 * tells students whether to answer every part or any one.
 *
 * The parser, the composer and the payload stripping are pure and covered by
 * apps/nexus/src/lib/drawing-parts.test.ts, paper-json.test.ts and
 * packages/database/src/queries/nexus/qb-student-payload.test.ts. What only a
 * real request and a real browser can prove is here: the save route rebuilds
 * the question text from the parts against the actual CHECK constraint, the
 * JSON export carries them, and a teacher can split a question on a phone.
 *
 * Seeds its own paper in an impossible year so it never collides with a real
 * one, and deletes it afterwards.
 */

const NEXUS = APP_URLS.nexus;
const PHONE = { width: 375, height: 812 };
const COLD_COMPILE_BUDGET = 120_000;
const SEED_YEAR = 1903;

test.describe.configure({ mode: 'serial', timeout: 240_000 });

const Q_ANY_ONE = 1;
const Q_ALL = 2;
const Q_MCQ = 3;
const Q_UNSPLIT = 4;

function seedQuestions() {
  return [
    {
      question_number: Q_ANY_ONE,
      question_format: 'DRAWING_PROMPT',
      question_text:
        'E2E: Draw from memory a balloon seller, selling balloons to a group of small children.\n\nOR\n\nDraw from memory a scene of village women around a handpump.',
      section: 'drawing',
      categories: ['drawing'],
      options: [],
    },
    {
      question_number: Q_ALL,
      question_format: 'DRAWING_PROMPT',
      question_text:
        '1(a) E2E: Draw a rectangular frame of size 140 mm x 210 mm with cubes, cones and cylinders. [20 marks]\n\n1(b) Draw the graphic given below rotated clockwise by 90 degrees. [20 marks]',
      section: 'drawing',
      categories: ['drawing'],
      options: [],
    },
    {
      question_number: Q_MCQ,
      nta_question_id: 'E2E-PARTS-3',
      question_format: 'MCQ',
      question_text: 'E2E: which line sits on the eye level in a two point perspective?',
      section: 'aptitude',
      categories: ['aptitude'],
      options: [
        { nta_id: '1', text: 'The horizon', label: 'A' },
        { nta_id: '2', text: 'The ground line', label: 'B' },
      ],
      correct_answer: 'a',
    },
    {
      question_number: Q_UNSPLIT,
      question_format: 'DRAWING_PROMPT',
      question_text:
        'E2E: Draw a scene of a kite festival by using colors. OR Draw a harmonic three dimensional composition of cuboids.',
      section: 'drawing',
      categories: ['drawing'],
      options: [],
    },
  ];
}

/**
 * A dev server request that survives a compile crash.
 *
 * This machine runs Node 24, which Next 14.2 does not support: the first
 * on-demand compile of a heavy route can kill the render worker, and the route
 * answers with Next's HTML error page ("Jest worker encountered 2 child process
 * exceptions") or a bare 404 instead of the handler's JSON. It is load related,
 * so a run that shares the dev server with another suite hits it often, and it
 * reads exactly like a code regression: expect(res.ok()) fails while the body
 * is HTML the handler never produced. An HTML body is the tell, so retry on it
 * and let a genuine JSON error through untouched. See the node24-jest-worker
 * note in the project memory.
 */
async function resilient(
  label: string,
  send: () => Promise<APIResponse>,
  attempts = 4,
): Promise<APIResponse> {
  let last: APIResponse | null = null;
  for (let i = 0; i < attempts; i++) {
    last = await send();
    if (last.ok()) return last;
    const body = await last.text();
    if (!body.trimStart().startsWith('<')) return last;
    if (i === attempts - 1) break;
    console.warn(`${label}: dev server returned an HTML error page, retrying (${i + 1}/${attempts})`);
    await new Promise((r) => setTimeout(r, 4000));
  }
  return last!;
}

async function headersFor(request: APIRequestContext, role: 'teacher' | 'student' = 'teacher') {
  const login = await getTestAuthToken(request, role);
  expect(login?.testToken, `${role} test-login did not return a token`).toBeTruthy();
  return { Authorization: `Bearer ${login!.testToken}`, 'Content-Type': 'application/json' };
}

async function deletePaper(request: APIRequestContext, paperId: string) {
  const headers = await headersFor(request);
  await request.delete(`${NEXUS}/api/question-bank/papers/${paperId}`, { headers }).catch(() => {});
}

/** Question id by its number on the seeded paper. */
async function questionIds(request: APIRequestContext, paperId: string): Promise<Record<number, string>> {
  const headers = await headersFor(request);
  const res = await resilient('paper fetch', () =>
    request.get(`${NEXUS}/api/question-bank/papers/${paperId}`, {
      headers,
      timeout: COLD_COMPILE_BUDGET,
    }),
  );
  expect(res.ok(), `paper fetch failed: ${await res.text()}`).toBeTruthy();
  const { questions } = (await res.json()).data;
  const out: Record<number, string> = {};
  for (const q of questions) out[q.display_order] = q.id;
  return out;
}

async function patchQuestion(request: APIRequestContext, id: string, body: unknown, role: 'teacher' | 'student' = 'teacher') {
  const headers = await headersFor(request, role);
  return request.patch(`${NEXUS}/api/question-bank/questions/${id}`, {
    headers,
    data: body,
    timeout: COLD_COMPILE_BUDGET,
  });
}

test.describe('QB drawing parts', () => {
  let paperId: string;
  let ids: Record<number, string>;

  test.beforeAll(async ({ request }) => {
    // Hooks do not inherit the describe timeout, and seeding a paper on a cold
    // dev server compiles four API routes before the first assertion runs.
    test.setTimeout(240_000);
    const headers = await headersFor(request);
    const existing = await resilient('paper list', () =>
      request.get(`${NEXUS}/api/question-bank/papers`, {
        headers,
        timeout: COLD_COMPILE_BUDGET,
      }),
    );
    if (existing.ok()) {
      for (const paper of (await existing.json()).data || []) {
        if (paper.year === SEED_YEAR) await deletePaper(request, paper.id);
      }
    }

    const res = await resilient('paper seed', () =>
      request.post(`${NEXUS}/api/question-bank/papers`, {
        headers,
        data: { exam_type: 'JEE_PAPER_2', year: SEED_YEAR, session: null, shift: null, parsed_questions: seedQuestions() },
        timeout: COLD_COMPILE_BUDGET,
      }),
    );
    expect(res.ok(), `seeding failed: ${await res.text()}`).toBeTruthy();
    paperId = (await res.json()).data.id;
    ids = await questionIds(request, paperId);
    expect(Object.keys(ids)).toHaveLength(4);
  });

  test.afterAll(async ({ request }) => {
    if (paperId) await deletePaper(request, paperId);
  });

  // ── The save route ──────────────────────────────────────────────────────

  test('AC1: saving either/or parts rebuilds the text and mirrors the first solution', async ({ request }) => {
    const res = await patchQuestion(request, ids[Q_ANY_ONE], {
      question_format: 'DRAWING_PROMPT',
      question_text: 'stale text the server must replace',
      drawing_parts: {
        mode: 'any_one',
        stem: null,
        items: [
          { text: 'Draw from memory a balloon seller, selling balloons to a group of small children.' },
          {
            text: 'Draw from memory a scene of village women around a handpump.',
            solution_image_url: 'https://example.com/e2e/solution-b.png',
          },
        ],
      },
    });
    expect(res.status(), await res.text()).toBe(200);
    const row = (await res.json()).data;
    expect(row.drawing_parts.mode).toBe('any_one');
    expect(row.drawing_parts.items.map((p: any) => p.label)).toEqual(['A', 'B']);
    expect(row.question_text).toBe(
      '(A) Draw from memory a balloon seller, selling balloons to a group of small children.\n\nOR\n\n(B) Draw from memory a scene of village women around a handpump.',
    );
    expect(row.solution_image_url).toBe('https://example.com/e2e/solution-b.png');
  });

  test('AC2: answer-all parts total their marks into the question', async ({ request }) => {
    const res = await patchQuestion(request, ids[Q_ALL], {
      question_format: 'DRAWING_PROMPT',
      drawing_parts: {
        mode: 'all',
        items: [
          { text: 'Draw a rectangular frame with cubes, cones and cylinders.', marks: 20 },
          { text: 'Draw the graphic rotated clockwise by 90 degrees.', marks: 20 },
        ],
      },
    });
    expect(res.status(), await res.text()).toBe(200);
    const row = (await res.json()).data;
    expect(row.drawing_marks).toBe(40);
    expect(row.question_text).toContain('[20 marks]\n\n(B) Draw the graphic');
  });

  test('AC3: parts are refused on an MCQ and when fewer than two', async ({ request }) => {
    const onMcq = await patchQuestion(request, ids[Q_MCQ], {
      drawing_parts: { mode: 'any_one', items: [{ text: 'a' }, { text: 'b' }] },
    });
    expect(onMcq.status()).toBe(400);

    const tooFew = await patchQuestion(request, ids[Q_ANY_ONE], {
      question_format: 'DRAWING_PROMPT',
      drawing_parts: { mode: 'any_one', items: [{ text: 'only one' }] },
    });
    expect(tooFew.status()).toBe(400);
  });

  test('a student cannot edit parts', async ({ request }) => {
    const res = await patchQuestion(
      request,
      ids[Q_ANY_ONE],
      { question_format: 'DRAWING_PROMPT', drawing_parts: null },
      'student',
    );
    expect([401, 403]).toContain(res.status());
  });

  test('AC4: the paper JSON carries parts, and an unchanged upload changes nothing', async ({ request }) => {
    const headers = await headersFor(request);
    const exported = await request.get(`${NEXUS}/api/question-bank/papers/${paperId}/json`, {
      headers,
      timeout: COLD_COMPILE_BUDGET,
    });
    expect(exported.ok()).toBeTruthy();
    const document = (await exported.json()).data;
    const drawing = document.sections.find((s: any) => s.section_key === 'drawing');
    const q1 = drawing.questions.find((q: any) => q.question_number === Q_ANY_ONE);
    expect(q1.drawing.parts.mode).toBe('any_one');
    expect(q1.drawing.parts.items[1].solution_image).toBe('https://example.com/e2e/solution-b.png');

    const res = await request.post(`${NEXUS}/api/question-bank/papers/import`, {
      headers,
      data: { json: document, expect_paper_id: paperId },
      timeout: COLD_COMPILE_BUDGET,
    });
    expect(res.ok(), await res.text()).toBeTruthy();
    const { questions } = (await res.json()).data;
    expect(questions.updated).toBe(0);
    expect(questions.created).toBe(0);
    expect(questions.unchanged).toBe(4);
  });

  // ── The teacher's screen, on a phone ────────────────────────────────────

  test.describe('on a phone', () => {
    let page: Page;

    test.beforeAll(async ({ browser }) => {
      // Hooks do not inherit the describe timeout, and a cold dev server spends
      // well over the 30s default compiling /login and the paper page.
      test.setTimeout(240_000);
      page = await browser.newPage({ viewport: PHONE });
      const authed = await injectAuthForPage(page, 'teacher');
      expect(authed, 'test-login must succeed').toBe(true);
      for (let attempt = 0; ; attempt++) {
        try {
          await page.goto(`${NEXUS}/teacher/question-bank/papers/${paperId}`, { waitUntil: 'domcontentloaded' });
          break;
        } catch (err) {
          if (attempt >= 2) throw err;
        }
      }
      await expect(page.getByRole('button', { name: `Open question ${Q_ANY_ONE}` })).toBeVisible({
        timeout: COLD_COMPILE_BUDGET,
      });
    });

    test.afterAll(async () => {
      await page?.close();
    });

    test('AC5: the list says which questions are either/or and which have parts', async () => {
      await expect(page.getByLabel('Attempt any one of 2').first()).toBeVisible();
      await expect(page.getByLabel('Answer both parts').first()).toBeVisible();
      await assertNoHorizontalOverflow(page);
    });

    test('AC6: a split is suggested, previewed, and saved with its mode', async ({ request }) => {
      await page.getByRole('button', { name: `Open question ${Q_UNSPLIT}` }).click();

      const suggestion = page.getByRole('region', { name: 'Split suggestion' });
      await expect(suggestion).toBeVisible({ timeout: 60_000 });
      await expect(suggestion.getByText('This looks like 2 options joined by OR')).toBeVisible();

      await suggestion.getByRole('button', { name: 'Split into A and B' }).click();

      const mode = page.getByRole('group', { name: 'How students answer' });
      await expect(mode).toBeVisible();
      await expect(mode.getByRole('button', { name: /Attempt any one/ })).toHaveAttribute('aria-pressed', 'true');
      await expect(page.getByRole('separator', { name: 'or' }).first()).toBeVisible();

      // Touch targets on the controls a teacher uses with a thumb.
      for (const name of [/Attempt any one/, /Answer all parts/]) {
        const box = await mode.getByRole('button', { name }).boundingBox();
        expect(box?.height ?? 0).toBeGreaterThanOrEqual(44);
      }
      await assertNoHorizontalOverflow(page);

      await page.getByRole('button', { name: /^Save$/ }).click();

      await expect
        .poll(
          async () => {
            const headers = await headersFor(request);
            const res = await request.get(`${NEXUS}/api/question-bank/papers/${paperId}`, { headers });
            const q = (await res.json()).data.questions.find((row: any) => row.id === ids[Q_UNSPLIT]);
            return q?.drawing_parts?.mode ?? null;
          },
          { timeout: 30_000 },
        )
        .toBe('any_one');
    });

    test('AC7: the pane holds the job and nothing else', async () => {
      // Below md the pane is a full screen sheet over the list, so the previous
      // test's question has to be closed before another row can be tapped.
      await page.getByRole('button', { name: 'Close question' }).click();
      await page.getByRole('button', { name: `Open question ${Q_ANY_ONE}` }).click();
      await expect(page.getByRole('group', { name: 'How students answer' })).toBeVisible({
        timeout: COLD_COMPILE_BUDGET,
      });

      // The sections a teacher never opened on a drawing.
      for (const gone of ['Classification', 'Drawing setup', 'Source & Format']) {
        await expect(page.getByText(gone, { exact: true })).toHaveCount(0);
      }
      for (const gone of ['Brief Explanation', 'Detailed Explanation', 'Sub-topic', 'Shared instruction']) {
        await expect(page.getByLabel(gone, { exact: true })).toHaveCount(0);
      }

      await expect(page.getByText('Worth 50 marks in the exam.')).toBeVisible();
      await expect(page.getByText('More settings', { exact: true })).toBeVisible();
      await assertNoHorizontalOverflow(page);
    });

    test('AC8: a part solution asks for the prompt first and the image second', async () => {
      await page.getByRole('button', { name: /Solution for A/ }).click();

      // Every part's solution stays mounted while collapsed, so the headings
      // exist once per part. Only the open one is visible.
      const step1 = page.getByText('1. Make the image with Gemini').filter({ visible: true });
      const step2 = page.getByText('2. Upload the image it gives you').filter({ visible: true });
      await expect(step1).toBeVisible();
      await expect(step2).toBeVisible();

      // Order is the point: there is nothing to upload until Gemini has been
      // asked, and the dropzone used to come first.
      const top1 = (await step1.boundingBox())?.y ?? 0;
      const top2 = (await step2.boundingBox())?.y ?? 0;
      expect(top1).toBeLessThan(top2);

      await expect(page.getByRole('button', { name: /Copy prompt for A/ })).toBeVisible();
      // One video field per part is four fields nobody fills in, so it is a
      // button until asked for.
      await expect(page.getByLabel(/Solution video URL for A/)).toHaveCount(0);

      for (const name of ['Add a video link', 'Merge into one question']) {
        const box = await page.getByRole('button', { name }).first().boundingBox();
        expect(box?.height ?? 0, `${name} must be tappable`).toBeGreaterThanOrEqual(44);
      }
      await assertNoHorizontalOverflow(page);
    });
  });
});
