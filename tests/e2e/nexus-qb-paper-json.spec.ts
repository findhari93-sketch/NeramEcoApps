import { test, expect, type APIRequestContext } from '@playwright/test';
import { APP_URLS, getTestAuthToken, injectAuthForPage } from '../utils/credentials';
import { assertNoHorizontalOverflow } from '../utils/mobile-helpers';

/**
 * One JSON per paper: download it, edit it, push it back.
 *
 * WHAT IS WORTH PROVING IN A BROWSER, AND WHAT IS NOT
 *
 * The document format itself is pure and already covered exhaustively by
 * apps/nexus/src/lib/paper-json.test.ts: round trips, v1 files, patch
 * semantics, the diff. Repeating any of that here would be slower and prove
 * less.
 *
 * What only a real request can prove is the part that crosses the wire and the
 * database: that a downloaded file names its own paper, that uploading it back
 * updates the rows it says it will and NOTHING else, that a file from a
 * different paper is refused, and that the test is rebuilt without anyone
 * pressing Build test. That last one is the whole point of the feature and it
 * cannot be unit tested: it needs an actual paper with actual active questions.
 *
 * WHY THIS SEEDS ITS OWN PAPER
 *
 * Reading whatever paper happens to exist makes the suite a coin toss: green on
 * a machine whose bank is populated, four silent skips on a fresh one. So
 * beforeAll creates a paper in an impossible year and afterAll deletes it. The
 * year is 1901 precisely so it can never collide with a real NATA or JEE paper
 * and can never be mistaken for one by a human looking at the papers list.
 */

const NEXUS = APP_URLS.nexus;
const PHONE = { width: 375, height: 812 };

/**
 * A cold Next dev server spends 15 to 25 seconds compiling a route nothing has
 * visited yet. The 30s default covers the compile and almost nothing else,
 * which is the documented trap in this suite.
 */
const COLD_COMPILE_BUDGET = 120_000;

/** Impossible on purpose: no real paper can collide with it. */
const SEED_YEAR = 1901;
const OTHER_YEAR = 1902;

test.describe.configure({ mode: 'serial' });

interface Seeded {
  paperId: string;
}

/**
 * getTestAuthToken hands back the whole login result, not a string. Reading it
 * as one produces `Bearer [object Object]`, which every route answers 401 to,
 * and the suite then looks like an authorization bug rather than a typo.
 */
async function auth(request: APIRequestContext) {
  const login = await getTestAuthToken(request, 'teacher');
  expect(login?.testToken, 'teacher test-login did not return a token').toBeTruthy();
  return {
    Authorization: `Bearer ${login!.testToken}`,
    'Content-Type': 'application/json',
  };
}

/**
 * Three questions, one per section, enough to exercise sections and marking.
 *
 * correct_answer is the POSITIONAL id ('a'), not the printed label ('A').
 * POST /papers stores whatever it is handed, and the bulk-upload wizard
 * normalises with resolveCorrectAnswer before it posts, so 'a' is what a real
 * import puts in the bank and what gradeQBAnswerStrict compares against.
 * Seeding 'A' here would make the very first re-upload report a legitimate
 * correction and look like a phantom edit.
 */
function seedQuestions() {
  return [
    {
      question_number: 1,
      nta_question_id: 'E2E-1',
      question_format: 'MCQ',
      question_text: 'E2E: which line sits on the eye level in a two point perspective?',
      section: 'aptitude',
      categories: ['aptitude'],
      options: [
        { nta_id: '1', text: 'The horizon', label: 'A' },
        { nta_id: '2', text: 'The ground line', label: 'B' },
        { nta_id: '3', text: 'The picture plane', label: 'C' },
        { nta_id: '4', text: 'The vertical axis', label: 'D' },
      ],
      correct_answer: 'a',
      explanation_brief: 'E2E original explanation.',
      solution_video_url: 'https://youtu.be/e2e-original',
    },
    {
      question_number: 2,
      nta_question_id: 'E2E-2',
      question_format: 'NUMERICAL',
      question_text: 'E2E: how many edges does a cuboid have?',
      section: 'math_numerical',
      categories: ['mathematics'],
      options: [],
      correct_answer: '12',
    },
    {
      question_number: 3,
      nta_question_id: 'E2E-3',
      question_format: 'DRAWING_PROMPT',
      question_text: 'E2E: compose a street view with two shops and a tree.',
      section: 'drawing',
      categories: ['drawing'],
      options: [],
      drawing_objects: ['shop', 'tree'],
      drawing_color_constraint: 'maximum 4 colours',
      drawing_design_principle: 'balance',
    },
  ];
}

async function createPaper(request: APIRequestContext, year: number): Promise<string> {
  const headers = await auth(request);
  const res = await request.post(`${NEXUS}/api/question-bank/papers`, {
    headers,
    data: {
      exam_type: 'NATA',
      year,
      session: null,
      shift: null,
      parsed_questions: seedQuestions(),
    },
    timeout: COLD_COMPILE_BUDGET,
  });
  expect(res.ok(), `seeding paper ${year} failed: ${await res.text()}`).toBeTruthy();
  const json = await res.json();
  return json.data.id as string;
}

async function deletePaper(request: APIRequestContext, paperId: string) {
  const headers = await auth(request);
  await request.delete(`${NEXUS}/api/question-bank/papers/${paperId}`, { headers }).catch(() => {});
}

async function fetchDocument(request: APIRequestContext, paperId: string) {
  const headers = await auth(request);
  const res = await request.get(`${NEXUS}/api/question-bank/papers/${paperId}/json`, {
    headers,
    timeout: COLD_COMPILE_BUDGET,
  });
  expect(res.ok(), `export failed: ${await res.text()}`).toBeTruthy();
  return (await res.json()).data;
}

/**
 * Assert a tap target, once it has stopped moving.
 *
 * MUI opens a Menu with a Grow transition and a Dialog with a Fade, both of
 * which scale the surface up over ~300ms. `toBeVisible()` is satisfied the
 * instant opacity leaves zero, so a boundingBox taken straight after it
 * measures a half-grown element: the Download JSON item reported 36px for a row
 * that settles well above the 44px floor. Polling re-measures until the
 * transition finishes rather than sleeping a guessed number of milliseconds.
 */
async function assertTapTarget(locator: any, min = 44) {
  await expect
    .poll(async () => Math.round((await locator.boundingBox())?.height ?? 0), { timeout: 15_000 })
    .toBeGreaterThanOrEqual(min);
}

/** Find one question in the document by its number, whatever section it landed in. */
function questionNumbered(document: any, number: number) {
  for (const section of document.sections) {
    const found = section.questions.find((q: any) => q.question_number === number);
    if (found) return found;
  }
  throw new Error(`Q${number} is not in this document`);
}

test.describe('QB paper JSON round trip', () => {
  let seed: Seeded;

  test.beforeAll(async ({ request }) => {
    // A leftover from a crashed run would make getOrCreateOriginalPaper return
    // the old paper and every count below would be off by whatever it holds.
    const headers = await auth(request);
    const existing = await request.get(`${NEXUS}/api/question-bank/papers`, {
      headers,
      timeout: COLD_COMPILE_BUDGET,
    });
    if (existing.ok()) {
      for (const paper of (await existing.json()).data || []) {
        if (paper.year === SEED_YEAR || paper.year === OTHER_YEAR) {
          await deletePaper(request, paper.id);
        }
      }
    }

    seed = { paperId: await createPaper(request, SEED_YEAR) };
  });

  test.afterAll(async ({ request }) => {
    if (seed?.paperId) await deletePaper(request, seed.paperId);
  });

  // ── Export ──────────────────────────────────────────────────────────────

  test('AC1: the export names its schema, its version and its paper', async ({ request }) => {
    const document = await fetchDocument(request, seed.paperId);
    expect(document.schema).toBe('nexus-paper');
    expect(document.version).toBe(2);
    expect(document.paper).toMatchObject({ exam_type: 'NATA', year: SEED_YEAR });
    expect(document.paper.id).toBe(seed.paperId);
  });

  test('AC2: every seeded question is in the export, in its own section', async ({ request }) => {
    const document = await fetchDocument(request, seed.paperId);
    const total = document.sections.reduce((n: number, s: any) => n + s.questions.length, 0);
    expect(total).toBe(3);
    expect(document.sections.map((s: any) => s.section_key)).toEqual([
      'math_numerical',
      'aptitude',
      'drawing',
    ]);
  });

  test('AC3: the export carries explanations and solution video links', async ({ request }) => {
    const q = questionNumbered(await fetchDocument(request, seed.paperId), 1);
    expect(q.solution.explanation_brief).toBe('E2E original explanation.');
    expect(q.solution.video_url).toBe('https://youtu.be/e2e-original');
  });

  test('AC4: the export carries the drawing setup', async ({ request }) => {
    const q = questionNumbered(await fetchDocument(request, seed.paperId), 3);
    expect(q.drawing.design_principle).toBe('balance');
    expect(q.drawing.colour_constraint).toBe('maximum 4 colours');
    expect(q.drawing.objects).toEqual([{ name: 'shop' }, { name: 'tree' }]);
  });

  test('AC5: ?download=1 sends a named file', async ({ request }) => {
    const headers = await auth(request);
    const res = await request.get(
      `${NEXUS}/api/question-bank/papers/${seed.paperId}/json?download=1`,
      { headers, timeout: COLD_COMPILE_BUDGET },
    );
    expect(res.ok()).toBeTruthy();
    expect(res.headers()['content-disposition']).toContain(`filename="nata_${SEED_YEAR}.json"`);
    // Whatever the browser saves has to parse, or the round trip is broken at
    // its first step and every test below is testing a different code path.
    expect(JSON.parse(await res.text()).schema).toBe('nexus-paper');
  });

  // ── Import ──────────────────────────────────────────────────────────────

  test('AC6: an unchanged upload changes nothing', async ({ request }) => {
    const headers = await auth(request);
    const document = await fetchDocument(request, seed.paperId);

    const res = await request.post(`${NEXUS}/api/question-bank/papers/import`, {
      headers,
      data: { json: document, expect_paper_id: seed.paperId },
      timeout: COLD_COMPILE_BUDGET,
    });
    expect(res.ok(), await res.text()).toBeTruthy();

    const { questions } = (await res.json()).data;
    expect(questions.updated).toBe(0);
    expect(questions.created).toBe(0);
    expect(questions.unchanged).toBe(3);
  });

  test('AC7: an edited explanation lands, and nothing else moves', async ({ request }) => {
    const headers = await auth(request);
    const document = await fetchDocument(request, seed.paperId);
    questionNumbered(document, 1).solution.explanation_brief = 'E2E edited explanation.';

    const res = await request.post(`${NEXUS}/api/question-bank/papers/import`, {
      headers,
      data: { json: document, expect_paper_id: seed.paperId },
      timeout: COLD_COMPILE_BUDGET,
    });
    expect(res.ok(), await res.text()).toBeTruthy();

    const { questions } = (await res.json()).data;
    expect(questions.updated).toBe(1);
    expect(questions.created).toBe(0);
    expect(questions.unchanged).toBe(2);

    const after = await fetchDocument(request, seed.paperId);
    expect(questionNumbered(after, 1).solution.explanation_brief).toBe('E2E edited explanation.');
    // The video link was in the same block and was not touched. If a re-upload
    // nulled it, the patch semantics are broken in the writer.
    expect(questionNumbered(after, 1).solution.video_url).toBe('https://youtu.be/e2e-original');
  });

  test('AC8: a partial file is a patch, not a replacement', async ({ request }) => {
    const headers = await auth(request);
    const patch = {
      schema: 'nexus-paper',
      version: 2,
      paper: { id: seed.paperId, exam_type: 'NATA', year: SEED_YEAR },
      sections: [
        {
          name: 'Aptitude',
          section_key: 'aptitude',
          question_count: 1,
          questions: [{ question_number: 1, marks_correct: 5 }],
        },
      ],
    };

    const res = await request.post(`${NEXUS}/api/question-bank/papers/import`, {
      headers,
      data: { json: patch, expect_paper_id: seed.paperId },
      timeout: COLD_COMPILE_BUDGET,
    });
    expect(res.ok(), await res.text()).toBeTruthy();

    const { questions } = (await res.json()).data;
    expect(questions.updated).toBe(1);
    // The two the file never mentioned. Untouched, never deleted.
    expect(questions.untouched).toBe(2);

    const after = await fetchDocument(request, seed.paperId);
    expect(questionNumbered(after, 1).marks_correct).toBe(5);
    expect(questionNumbered(after, 1).question_text).toContain('two point perspective');
    expect(questionNumbered(after, 2).question_text).toContain('cuboid');
  });

  test('AC9: duration in the file makes the paper, and its test, timed', async ({ request }) => {
    const headers = await auth(request);
    const document = await fetchDocument(request, seed.paperId);
    document.paper.duration_minutes = 180;

    const res = await request.post(`${NEXUS}/api/question-bank/papers/import`, {
      headers,
      data: { json: document, expect_paper_id: seed.paperId },
      timeout: COLD_COMPILE_BUDGET,
    });
    expect(res.ok(), await res.text()).toBeTruthy();
    expect((await res.json()).data.test.duration_minutes).toBe(180);

    const after = await fetchDocument(request, seed.paperId);
    expect(after.paper.duration_minutes).toBe(180);
  });

  // ── The point of the whole thing ────────────────────────────────────────

  test('AC10: the test is built without anyone pressing Build test', async ({ request }) => {
    const headers = await auth(request);
    const document = await fetchDocument(request, seed.paperId);

    const res = await request.post(`${NEXUS}/api/question-bank/papers/import`, {
      headers,
      data: { json: document, expect_paper_id: seed.paperId },
      timeout: COLD_COMPILE_BUDGET,
    });
    expect(res.ok(), await res.text()).toBeTruthy();

    const { test: built } = (await res.json()).data;
    // `activated` is deliberately not asserted to be > 0: bulkActivateQuestions
    // counts what it changed, and by this point the earlier imports in this
    // serial file have already activated everything. The question count on the
    // built test is the real proof that all three are active, because
    // generatePaperMockTest composes from active questions only.
    expect(built.rebuilt).toBe(true);
    expect(built.test_id).toBeTruthy();
    expect(built.question_count).toBe(3);

    // And the paper really is holding it, not just reporting one.
    const placed = await request.get(
      `${NEXUS}/api/question-bank/papers/${seed.paperId}/test`,
      { headers },
    );
    expect(placed.ok()).toBeTruthy();
    expect((await placed.json()).data?.test_id).toBe(built.test_id);
  });

  // ── Refusals ────────────────────────────────────────────────────────────

  test('AC11: a file from another paper is refused, by name', async ({ request }) => {
    const headers = await auth(request);
    const otherId = await createPaper(request, OTHER_YEAR);
    try {
      const otherDocument = await fetchDocument(request, otherId);
      const res = await request.post(`${NEXUS}/api/question-bank/papers/import`, {
        headers,
        // The document says OTHER_YEAR; the caller says they have SEED open.
        data: { json: otherDocument, expect_paper_id: seed.paperId },
        timeout: COLD_COMPILE_BUDGET,
      });
      expect(res.status()).toBe(400);
      const { error } = await res.json();
      expect(error).toContain(String(OTHER_YEAR));
      expect(error).toContain('not the paper you have open');

      // And the paper the caller had open is untouched.
      const after = await fetchDocument(request, seed.paperId);
      expect(after.paper.year).toBe(SEED_YEAR);
    } finally {
      await deletePaper(request, otherId);
    }
  });

  test('AC12: a file that names no paper, uploaded to no paper, is refused', async ({ request }) => {
    const headers = await auth(request);
    const res = await request.post(`${NEXUS}/api/question-bank/papers/import`, {
      headers,
      data: {
        json: {
          schema: 'nexus-paper',
          version: 2,
          paper: {},
          sections: [
            {
              name: 'Aptitude',
              section_key: 'aptitude',
              question_count: 1,
              questions: [{ question_number: 1, question_text: 'Orphan.', question_format: 'MCQ' }],
            },
          ],
        },
      },
      timeout: COLD_COMPILE_BUDGET,
    });
    expect(res.status()).toBe(400);
    expect((await res.json()).error).toContain('needs an exam_type and a year');
  });

  test('AC13: an unreadable file is refused with a reason, not a 500', async ({ request }) => {
    const headers = await auth(request);
    const res = await request.post(`${NEXUS}/api/question-bank/papers/import`, {
      headers,
      data: { json: { nothing: 'useful' }, expect_paper_id: seed.paperId },
      timeout: COLD_COMPILE_BUDGET,
    });
    expect(res.status()).toBe(400);
    expect((await res.json()).error).toBeTruthy();
  });

  test('AC14: tags a file invents are reported, never created', async ({ request }) => {
    const headers = await auth(request);
    const document = await fetchDocument(request, seed.paperId);
    questionNumbered(document, 1).tag_slugs = ['definitely_not_a_real_tag_e2e'];

    const res = await request.post(`${NEXUS}/api/question-bank/papers/import`, {
      headers,
      data: { json: document, expect_paper_id: seed.paperId },
      timeout: COLD_COMPILE_BUDGET,
    });
    expect(res.ok(), await res.text()).toBeTruthy();
    expect((await res.json()).data.unknown_tags).toContain('definitely_not_a_real_tag_e2e');
  });

  // ── Access ──────────────────────────────────────────────────────────────

  test('AC15: a student cannot export or import a paper', async ({ request }) => {
    const login = await getTestAuthToken(request, 'student');
    expect(login?.testToken, 'student test-login did not return a token').toBeTruthy();
    const headers = {
      Authorization: `Bearer ${login!.testToken}`,
      'Content-Type': 'application/json',
    };

    const read = await request.get(`${NEXUS}/api/question-bank/papers/${seed.paperId}/json`, {
      headers,
      timeout: COLD_COMPILE_BUDGET,
    });
    expect([401, 403]).toContain(read.status());

    const write = await request.post(`${NEXUS}/api/question-bank/papers/import`, {
      headers,
      data: { json: {}, expect_paper_id: seed.paperId },
      timeout: COLD_COMPILE_BUDGET,
    });
    expect([401, 403]).toContain(write.status());
  });

  test('AC16: an unauthenticated caller gets 401', async ({ request }) => {
    const res = await request.get(`${NEXUS}/api/question-bank/papers/${seed.paperId}/json`, {
      timeout: COLD_COMPILE_BUDGET,
    });
    expect(res.status()).toBe(401);
  });

  // ── Mobile ──────────────────────────────────────────────────────────────

  test('mobile: the upload dialog fits a 375px phone', async ({ browser }) => {
    // The 30s default is the documented trap in this suite. It covers neither
    // the cold compile of the paper page nor MSAL's own 10s redirect timeout,
    // so the test dies while the screen it is asserting about is still being
    // built. COLD_COMPILE_BUDGET on goto does not help: that is a navigation
    // deadline, not the test's.
    test.setTimeout(COLD_COMPILE_BUDGET * 3);

    const context = await browser.newContext({ viewport: PHONE });
    const page = await context.newPage();
    try {
      await injectAuthForPage(page, 'teacher');
      await page.goto(`${NEXUS}/teacher/question-bank/papers/${seed.paperId}`, {
        timeout: COLD_COMPILE_BUDGET,
        waitUntil: 'domcontentloaded',
      });

      // Exact label, not /more|actions/i. That loose pattern matched the app
      // shell's own nav button first and opened the Manage bottom sheet, so the
      // failure read as "the menu item does not exist" while the real menu had
      // never been opened.
      const menu = page.getByRole('button', { name: 'More paper actions' });
      await menu.waitFor({ state: 'visible', timeout: 60_000 });
      await menu.click();

      const upload = page.getByRole('menuitem', { name: /upload edited json/i });
      await upload.waitFor({ state: 'visible', timeout: 30_000 });
      await upload.click();

      const dialog = page.getByRole('dialog');
      await dialog.waitFor({ state: 'visible', timeout: 30_000 });
      await expect(dialog.getByText(/Download this paper/i)).toBeVisible();

      await assertNoHorizontalOverflow(page);

      // The two things a thumb has to hit.
      for (const name of [/choose a \.json file/i, /see what changes/i]) {
        await assertTapTarget(dialog.getByRole('button', { name }).first());
      }

      // 16px in the paste box, or iOS zooms the page on focus and the teacher
      // has to pinch back out to reach the buttons.
      const fontSize = await dialog
        .locator('textarea')
        .first()
        .evaluate((el) => window.getComputedStyle(el).fontSize);
      expect(parseFloat(fontSize)).toBeGreaterThanOrEqual(16);
    } finally {
      await context.close();
    }
  });

  test('mobile: the download item is reachable from the same menu', async ({ browser }) => {
    test.setTimeout(COLD_COMPILE_BUDGET * 3);

    const context = await browser.newContext({ viewport: PHONE });
    const page = await context.newPage();
    try {
      await injectAuthForPage(page, 'teacher');
      await page.goto(`${NEXUS}/teacher/question-bank/papers/${seed.paperId}`, {
        timeout: COLD_COMPILE_BUDGET,
        waitUntil: 'domcontentloaded',
      });

      // Exact label, not /more|actions/i. That loose pattern matched the app
      // shell's own nav button first and opened the Manage bottom sheet, so the
      // failure read as "the menu item does not exist" while the real menu had
      // never been opened.
      const menu = page.getByRole('button', { name: 'More paper actions' });
      await menu.waitFor({ state: 'visible', timeout: 60_000 });
      await menu.click();

      const download = page.getByRole('menuitem', { name: /download json/i });
      await expect(download).toBeVisible({ timeout: 30_000 });
      await assertTapTarget(download);
    } finally {
      await context.close();
    }
  });
});
