import { test, expect, type Page, type Route } from '@playwright/test';
import { APP_URLS, getTestAuthToken, injectAuthForPage } from '../utils/credentials';
import { assertNoHorizontalOverflow } from '../utils/mobile-helpers';

/**
 * Question bank: scoped filters and "What to study".
 *
 * The founder's class report (2026-10-01):
 *   1. Inside "JEE Paper 2 2019 Session 1, Mathematics" the Filters drawer
 *      offered Aptitude (100), Drawing (6), NATA and every year.
 *   2. A Functions question sat under Trigonometry because `sin x` appeared,
 *      and nothing told a student which NCERT chapter to study.
 *
 * Nothing here writes. The "What to study" payload is added to a real question
 * response with page.route, so the panel is tested whatever the environment's
 * classifier has or has not written yet.
 */
test.describe.configure({ mode: 'default', timeout: 180_000 });

const STUDY = {
  source: 'ai',
  primary: {
    slug: 'functions',
    label: 'Functions',
    ncert: [
      {
        ref: 'c11.2.4',
        class_level: 11,
        chapter_no: 2,
        chapter_title: 'Relations and Functions',
        section_no: '2.4',
        section_title: 'Functions',
        url: 'https://ncert.nic.in/textbook/pdf/kemh102.pdf',
      },
    ],
  },
  also_uses: [{ slug: 'trigonometric_ratios', label: 'Trigonometric Ratios & Identities', ncert: [] }],
  concepts: [
    {
      name: 'Domain of a square root function',
      why: 'Each square root needs a non-negative argument',
      ncert: {
        ref: 'c11.2.4',
        class_level: 11,
        chapter_no: 2,
        chapter_title: 'Relations and Functions',
        section_no: '2.4',
        section_title: 'Functions',
        url: 'https://ncert.nic.in/textbook/pdf/kemh102.pdf',
      },
      foundation: null,
    },
  ],
};

/** Add `study` to every single-question response, leaving the rest real. */
async function withStudy(page: Page) {
  await page.route(/\/api\/question-bank\/questions\/[0-9a-f-]{36}\?/, async (route: Route) => {
    if (route.request().method() !== 'GET') return route.fallback();
    const res = await route.fetch();
    const json = await res.json().catch(() => null);
    if (!json?.data) return route.fulfill({ response: res });
    await route.fulfill({ response: res, json: { ...json, data: { ...json.data, study: STUDY } } });
  });
}

/**
 * The first-run welcome tour aria-hides the whole app, so every role query
 * below would miss controls that are on screen. Mark it seen before any page
 * loads, as class-prep-nexus-mobile.spec.ts does.
 */
async function skipWelcomeTour(page: Page) {
  await page.addInitScript(() => {
    try {
      window.localStorage.setItem('nexus_welcome_seen_v1', new Date().toISOString());
    } catch {
      /* blocked storage just means the tour shows */
    }
  });
}

async function studentPage(browser: import('@playwright/test').Browser, width = 1280) {
  const page = await browser.newPage({ viewport: { width, height: width < 600 ? 812 : 900 } });
  await skipWelcomeTour(page);
  const authed = await injectAuthForPage(page, 'student');
  expect(authed, 'student test-login must succeed, check NODE_ENV and .env.test').toBe(true);
  return page;
}

test.describe('QB filters stay inside the paper being practised', () => {
  test('a paper section asks for counts of that shift and section only, and hides other subjects', async ({ browser }, testInfo) => {
    testInfo.setTimeout(180_000);
    const page = await studentPage(browser);
    const countsReq = page.waitForRequest((r) => r.url().includes('/api/question-bank/category-counts'), { timeout: 120_000 });
    await page.goto(
      `${APP_URLS.nexus}/student/question-bank/questions?exam=JEE_PAPER_2&year=2019&session=Session+1&shift=forenoon&section=math_mcq`,
      { waitUntil: 'domcontentloaded' },
    );
    const url = new URL((await countsReq).url());
    expect(url.searchParams.get('shift')).toBe('forenoon');
    expect(url.searchParams.get('section')).toBe('math_mcq');

    await page.getByRole('button', { name: /^Filters/ }).first().click();
    await expect(page.getByText('Filtering: JEE Paper 2 2019 Session 1, Mathematics')).toBeVisible({ timeout: 30_000 });
    await expect(page.getByText('Exam Type', { exact: true })).toHaveCount(0);
    await expect(page.getByText('Year', { exact: true })).toHaveCount(0);
    await expect(page.getByText(/^Aptitude \(\d+\)$/)).toHaveCount(0);
    await expect(page.getByText(/^Drawing \(\d+\)$/)).toHaveCount(0);
    await expect(page.getByText('Question Format', { exact: true })).toHaveCount(0);
    await page.close();
  });
});

test.describe('What to study', () => {
  test('a hint on request before answering, with the NCERT section', async ({ browser }, testInfo) => {
    testInfo.setTimeout(180_000);
    const page = await studentPage(browser);
    await withStudy(page);
    await page.goto(`${APP_URLS.nexus}/student/question-bank/questions?exam=JEE_PAPER_2`, { waitUntil: 'domcontentloaded' });

    const ask = page.getByRole('button', { name: 'Stuck? See what this question needs' });
    await expect(ask).toBeVisible({ timeout: 120_000 });
    await expect(page.getByText('What to study')).toHaveCount(0);
    await ask.click();

    await expect(page.getByRole('heading', { name: 'What to study' })).toBeVisible();
    const ncert = page.getByRole('link', { name: /NCERT Class 11 · Ch 2 Relations and Functions, 2\.4 Functions, opens in a new tab/ }).first();
    await expect(ncert).toHaveAttribute('href', 'https://ncert.nic.in/textbook/pdf/kemh102.pdf');
    await expect(ncert).toHaveAttribute('target', '_blank');
    await expect(page.getByText('Trigonometric Ratios & Identities')).toBeVisible();
    await page.close();
  });

  test('mobile 375: the panel fits, and its links are thumb sized', async ({ browser }, testInfo) => {
    testInfo.setTimeout(180_000);
    const page = await studentPage(browser, 375);
    await withStudy(page);
    // Phone: the list first, the reader over it. Open a real question by its
    // shareable link (?qid=) rather than guessing a row's accessible name.
    const listRes = page.waitForResponse(
      (r) => /\/api\/question-bank\/questions\?/.test(r.url()) && r.request().method() === 'GET',
      { timeout: 120_000 },
    );
    await page.goto(`${APP_URLS.nexus}/student/question-bank/questions?exam=JEE_PAPER_2`, { waitUntil: 'domcontentloaded' });
    const listJson = await (await listRes).json();
    const firstId: string | undefined = ((listJson.data ?? listJson).questions ?? [])[0]?.id;
    test.skip(!firstId, 'No JEE Paper 2 questions in this environment');
    await page.goto(`${APP_URLS.nexus}/student/question-bank/questions?exam=JEE_PAPER_2&qid=${firstId}`, {
      waitUntil: 'domcontentloaded',
    });

    const ask = page.getByRole('button', { name: 'Stuck? See what this question needs' });
    await expect(ask).toBeVisible({ timeout: 120_000 });
    await ask.click();
    await expect(page.getByRole('heading', { name: 'What to study' })).toBeVisible();

    await assertNoHorizontalOverflow(page);
    const box = await page.getByRole('link', { name: /NCERT Class 11/ }).first().boundingBox();
    expect(box?.height ?? 0).toBeGreaterThanOrEqual(44);
    await page.screenshot({ path: testInfo.outputPath('qb-study-375.png'), fullPage: false });
    await page.close();
  });
});

test.describe('Foundation section deep link', () => {
  test('opens at the linked section and Back returns to the question', async ({ browser }, testInfo) => {
    testInfo.setTimeout(180_000);
    const page = await studentPage(browser);
    const auth = await getTestAuthToken(page.request, 'student');
    const headers = { Authorization: `Bearer ${auth?.testToken}` };
    const list = await page.request.get(`${APP_URLS.nexus}/api/foundation/chapters`, { headers });
    const chapters = list.ok() ? (await list.json()).chapters ?? [] : [];
    test.skip(!Array.isArray(chapters) || chapters.length === 0, 'No Foundation chapters readable in this environment');

    const chapter = chapters[0];
    const detail = await page.request.get(`${APP_URLS.nexus}/api/foundation/chapters/${chapter.id}`, { headers });
    const sections = detail.ok() ? (await detail.json()).sections ?? [] : [];
    test.skip(sections.length === 0, 'Chapter has no sections');
    const section = sections[sections.length > 1 ? 1 : 0];

    const back = '/student/question-bank/questions?exam=JEE_PAPER_2';
    await page.goto(
      `${APP_URLS.nexus}/student/foundation/${chapter.id}?section=${section.id}&back=${encodeURIComponent(back)}`,
      { waitUntil: 'domcontentloaded' },
    );
    await expect(page.getByText('This section answers your question:')).toBeVisible({ timeout: 120_000 });
    await expect(page.getByText(section.title).first()).toBeVisible();

    await page.getByRole('button', { name: 'Back to the question' }).first().click();
    await expect(page).toHaveURL(/\/student\/question-bank\/questions\?exam=JEE_PAPER_2/, { timeout: 60_000 });
    await page.close();
  });

  test('an outside back link is ignored', async ({ browser }, testInfo) => {
    testInfo.setTimeout(180_000);
    const page = await studentPage(browser);
    await page.goto(`${APP_URLS.nexus}/student/foundation/00000000-0000-0000-0000-000000000000?back=${encodeURIComponent('https://evil.example')}`, {
      waitUntil: 'domcontentloaded',
    });
    await expect(page.getByRole('button', { name: 'Back to the question' })).toHaveCount(0);
    await page.close();
  });
});

test.describe('Teacher review', () => {
  test('the reclassify queue loads for a teacher', async ({ browser }, testInfo) => {
    testInfo.setTimeout(180_000);
    const page = await browser.newPage();
    await skipWelcomeTour(page);
    expect(await injectAuthForPage(page, 'teacher')).toBe(true);
    await page.goto(`${APP_URLS.nexus}/teacher/question-bank/reclassify`, { waitUntil: 'domcontentloaded' });
    await expect(page.getByText('Re-classify topics')).toBeVisible({ timeout: 120_000 });
    await expect(page.getByText(/what students will be told to study/)).toBeVisible();
    await page.close();
  });

  test('a student cannot read or write a question study row', async ({ browser }) => {
    const page = await browser.newPage();
    const auth = await getTestAuthToken(page.request, 'student');
    expect(auth, 'student test-login must succeed').toBeTruthy();
    const res = await page.request.put(`${APP_URLS.nexus}/api/question-bank/questions/00000000-0000-0000-0000-000000000000/study`, {
      headers: { Authorization: `Bearer ${auth!.testToken}` },
      data: { primary_slug: 'functions', also_uses: [], concepts: [] },
    });
    // A signed-in student is refused for their role, not for a missing token.
    expect(res.status()).toBe(403);
    await page.close();
  });
});
