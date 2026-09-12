import { test, expect, type Browser, type Page } from '@playwright/test';
import { APP_URLS, injectAuthForPage, getTestAuthToken } from '../utils/credentials';
import { assertNoHorizontalOverflow, assertTouchTargetSize } from '../utils/mobile-helpers';

/**
 * PowerPoint slides beside a study chapter, at 375px first and 1280px second.
 *
 * What these lock down:
 *   - a teacher's chapter page has a Slides tab whose empty state offers both ways
 *     in, whose picker searches by name and never browses, and whose attached state
 *     previews the pages and names a real problem with its fix;
 *   - the Setup checklist has a Slides line that leads to that tab;
 *   - a student switches between the PDF and the slides in one row of tabs, the
 *     choice is remembered, a download of the slides is a PDF, and slides that
 *     cannot be shown always offer the PDF;
 *   - none of the staff slides routes answer a student.
 *
 * Nothing here needs a deck in SharePoint or a chapter in the database. The
 * chapter, the slides answer and both PDFs are answered in the browser, so the
 * checks hold on an environment with no study files (staging has none), and
 * nothing is saved anywhere.
 */

const NEXUS = APP_URLS.nexus;
const PHONE = { width: 375, height: 812 };
const LAPTOP = { width: 1280, height: 860 };
const COLD_COMPILE_BUDGET = 150_000;
const CHAPTER = '00000000-0000-4000-8000-00000000c0de';
const FOLDER = '00000000-0000-4000-8000-00000000f01d';
const TITLE = 'Ch:1 History Of Architecture';
const MODE_KEY = 'nexus:study-reader-mode';

/**
 * In order, one at a time, without serial mode.
 *
 * The config runs every test in parallel, and two test logins for the same
 * student at once have answered 500. 'default' runs this file's tests one after
 * another in one worker, and unlike 'serial' a failure does not skip the rest.
 * The budget covers a cold route compile on the dev server, and set here it
 * reaches every test in the file.
 */
test.describe.configure({ mode: 'default', timeout: COLD_COMPILE_BUDGET });

/** A one-page PDF with a filled rectangle, so pdf.js has something to draw. */
function tinyPdf(width: number, height: number): Buffer {
  const stream = `0.25 0.35 0.85 rg 40 40 ${width - 80} ${height - 80} re f`;
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${width} ${height}] /Contents 4 0 R /Resources << >> >>`,
    `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`,
  ];
  let pdf = '%PDF-1.4\n';
  const offsets: number[] = [];
  objects.forEach((body, i) => {
    offsets.push(pdf.length);
    pdf += `${i + 1} 0 obj\n${body}\nendobj\n`;
  });
  const xref = pdf.length;
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (const offset of offsets) pdf += `${String(offset).padStart(10, '0')} 00000 n \n`;
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(pdf, 'latin1');
}

const chapterFile = (over: Record<string, unknown> = {}) => ({
  id: CHAPTER,
  folder_id: FOLDER,
  title: TITLE,
  file_name: '1.History of Architecture.pdf',
  file_type: 'application/pdf',
  file_size_bytes: 1024,
  page_count: 1,
  kind: 'pdf',
  downloadable: false,
  sort_order: 0,
  created_at: '2026-09-01T00:00:00Z',
  has_test: false,
  has_slides: false,
  slides_problem: null,
  recording: null,
  video_languages: [],
  ...over,
});

const slidesSource = (problem: string | null = null) => ({
  name: 'History of Architecture.pptx',
  web_url: 'https://example.sharepoint.com/sites/class/Shared%20Documents/History%20of%20Architecture.pptx',
  modified_at: new Date(Date.now() - 3 * 86_400_000).toISOString(),
  converted_at: new Date(Date.now() - 2 * 86_400_000).toISOString(),
  checked_at: new Date(Date.now() - 5 * 60_000).toISOString(),
  size_bytes: 480_000,
  problem,
});

const readySlides = (problem: string | null = null) => ({
  status: 'ready',
  url: `${NEXUS}/__e2e__/slides.pdf`,
  expires_in: 3600,
  version: new Date().toISOString(),
  source: slidesSource(problem),
});

async function newPage(browser: Browser, viewport: { width: number; height: number }) {
  const context = await browser.newContext({ viewport });
  const page = await context.newPage();
  return { context, page };
}

/** The two PDFs, the thumbnail, and the slides answer, all without leaving the browser. */
async function answerSlides(page: Page, slides: unknown) {
  await page.route(
    (url) => url.pathname === '/__e2e__/slides.pdf',
    (route) => route.fulfill({ status: 200, contentType: 'application/pdf', body: tinyPdf(960, 540) }),
  );
  await page.route(
    (url) => url.pathname === '/__e2e__/slides-download.pdf',
    (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/pdf',
        headers: { 'Content-Disposition': `attachment; filename="Ch 1 History Of Architecture slides.pdf"` },
        body: tinyPdf(960, 540),
      }),
  );
  await page.route(
    (url) => url.pathname === `/api/study-materials/files/${CHAPTER}/content`,
    (route) => route.fulfill({ status: 200, contentType: 'application/pdf', body: tinyPdf(595, 842) }),
  );
  await page.route(
    (url) => url.pathname === `/api/study-materials/files/${CHAPTER}/thumbnail`,
    (route) => route.fulfill({ status: 204, body: '' }),
  );
  await page.route(
    (url) => url.pathname === `/api/study-materials/files/${CHAPTER}/slides`,
    (route) => {
      if (route.request().method() !== 'GET') return route.fallback();
      const download = new URL(route.request().url()).searchParams.get('download') === '1';
      const body =
        download && slides && typeof slides === 'object'
          ? { slides: { ...(slides as object), url: `${NEXUS}/__e2e__/slides-download.pdf` } }
          : { slides };
      return route.fulfill({ json: body });
    },
  );
}

/** The teacher chapter page reads the chapter from this route. */
async function answerChapter(page: Page, file: Record<string, unknown>, slides: unknown) {
  await page.route(
    (url) => url.pathname === `/api/study-materials/files/${CHAPTER}`,
    (route) => route.fulfill({ json: { file: chapterFile(file) } }),
  );
  await answerSlides(page, slides);
}

/** The student Starred page, holding the one chapter. */
async function answerStarred(page: Page, file: Record<string, unknown>, slides: unknown) {
  await page.route(
    (url) => url.pathname === '/api/study-materials/favorites',
    (route) =>
      route.fulfill({
        json: {
          files: [
            {
              ...chapterFile(file),
              status: 'not_opened',
              is_favorite: true,
              breadcrumb: [{ id: FOLDER, name: 'Foundation Books' }],
            },
          ],
        },
      }),
  );
  await answerSlides(page, slides);
}

async function openTeacherChapter(page: Page, tab: string) {
  await page.goto(`${NEXUS}/teacher/study-materials/${CHAPTER}?tab=${tab}`, { waitUntil: 'domcontentloaded' });
}

/**
 * Opens the Starred page as a student, or says it could not.
 *
 * Every new browser context is a fresh session, so the student shell opens its
 * welcome tour. While that MUI dialog is open the rest of the app is aria-hidden
 * and nothing behind it can be pressed, so the tour is skipped first.
 */
async function openStarred(page: Page): Promise<boolean> {
  await page.goto(`${NEXUS}/student/study-materials/starred`, { waitUntil: 'domcontentloaded' });
  const title = page.getByText(TITLE).first();
  const skip = page.getByRole('button', { name: 'Skip' });
  try {
    await expect(title.or(skip).first()).toBeVisible({ timeout: 90_000 });
  } catch {
    return false;
  }
  // The tour can open a moment after the page itself.
  const tourOpen = await skip.waitFor({ state: 'visible', timeout: 8_000 }).then(
    () => true,
    () => false,
  );
  if (tourOpen) {
    await skip.click();
    await skip.waitFor({ state: 'hidden', timeout: 15_000 }).catch(() => undefined);
  }
  return title.waitFor({ state: 'visible', timeout: 60_000 }).then(
    () => true,
    () => false,
  );
}

test.describe('Chapter slides: teacher', () => {
  test('the Slides tab starts empty with both ways in, and fits a phone and a laptop', async ({ browser }, testInfo) => {
    for (const viewport of [PHONE, LAPTOP]) {
      const { context, page } = await newPage(browser, viewport);
      await answerChapter(page, {}, null);
      test.skip(!(await injectAuthForPage(page, 'teacher')), 'Nexus test-login unavailable');

      await openTeacherChapter(page, 'slides');
      await expect(page.getByText('No slides yet')).toBeVisible({ timeout: 90_000 });
      await expect(page.getByRole('button', { name: 'Slides', exact: true })).toHaveAttribute('aria-pressed', 'true');
      await expect(page.getByRole('button', { name: 'Find in SharePoint' })).toBeEnabled();
      await expect(page.getByRole('button', { name: 'Paste a SharePoint link' })).toBeEnabled();

      await assertNoHorizontalOverflow(page);
      if (viewport === PHONE) await assertTouchTargetSize(page, '.MuiToggleButtonGroup-root button', 44);
      await page.screenshot({ path: testInfo.outputPath(`teacher-slides-empty-${viewport.width}.png`), fullPage: true });
      await context.close();
    }
  });

  test('Find in SharePoint waits for a name, then searches every site for PowerPoint only', async ({ browser }) => {
    const { context, page } = await newPage(browser, PHONE);
    await answerChapter(page, {}, null);
    const searches: string[] = [];
    page.on('request', (req) => {
      if (req.url().includes('/api/sharepoint/search')) searches.push(req.url());
    });
    await page.route('**/api/sharepoint/search**', (route) =>
      route.fulfill({
        json: { items: [], mode: 'search', path: null, kind: 'presentation', scope: 'both', indexed: true, partial: null },
      }),
    );
    test.skip(!(await injectAuthForPage(page, 'teacher')), 'Nexus test-login unavailable');

    await openTeacherChapter(page, 'slides');
    await page.getByRole('button', { name: 'Find in SharePoint' }).click({ timeout: 90_000 });

    const sheet = page.locator('.MuiDrawer-root').last();
    await expect(sheet.getByText('Find the class slides')).toBeVisible({ timeout: 30_000 });
    await expect(sheet.getByText('Type the name of the PowerPoint to find it.')).toBeVisible();
    // Decks live across many Teams class sites, so no folder is worth listing.
    await page.waitForTimeout(1500);
    expect(searches).toEqual([]);

    await sheet.getByRole('textbox', { name: 'Search SharePoint for a PowerPoint' }).fill('History');
    await expect.poll(() => searches.length, { timeout: 15_000 }).toBeGreaterThan(0);
    const last = searches[searches.length - 1];
    expect(last).toContain('kind=presentation');
    expect(last).toContain('scope=both');
    await expect(sheet.getByText('Not listed here?')).toBeVisible();

    await assertNoHorizontalOverflow(page);
    await context.close();
  });

  test('a pasted link that is not SharePoint is refused with its reason, and the chapter stays empty', async ({ browser }) => {
    const { context, page } = await newPage(browser, PHONE);
    await answerChapter(page, {}, null);
    let puts = 0;
    await page.route(
      (url) => url.pathname === `/api/study-materials/files/${CHAPTER}/slides`,
      (route) => {
        if (route.request().method() !== 'PUT') return route.fallback();
        puts += 1;
        return route.fulfill({
          status: 400,
          json: {
            error: 'That link does not point at a file in SharePoint. Open the deck in SharePoint, choose Copy link, and paste that.',
            code: 'LINK_NOT_RECOGNISED',
          },
        });
      },
    );
    test.skip(!(await injectAuthForPage(page, 'teacher')), 'Nexus test-login unavailable');

    await openTeacherChapter(page, 'slides');
    await page.getByRole('button', { name: 'Paste a SharePoint link' }).click({ timeout: 90_000 });
    await page.getByLabel('SharePoint link to the deck').fill('https://example.com/deck.pptx');
    await page.getByRole('button', { name: 'Add slides' }).click();

    await expect(page.getByText(/does not point at a file in SharePoint/)).toBeVisible({ timeout: 30_000 });
    await expect(page.getByText('No slides yet')).toBeVisible();
    expect(puts).toBe(1);

    await assertNoHorizontalOverflow(page);
    await context.close();
  });

  test('attached slides are previewed, a real problem is named with its fix, and Remove asks first', async ({ browser }, testInfo) => {
    for (const viewport of [PHONE, LAPTOP]) {
      const { context, page } = await newPage(browser, viewport);
      await answerChapter(page, { has_slides: true, slides_problem: 'SOURCE_MISSING' }, readySlides('SOURCE_MISSING'));
      let deletes = 0;
      page.on('request', (req) => {
        if (req.method() === 'DELETE' && req.url().includes('/slides')) deletes += 1;
      });
      test.skip(!(await injectAuthForPage(page, 'teacher')), 'Nexus test-login unavailable');

      await openTeacherChapter(page, 'slides');
      await expect(page.getByText('History of Architecture.pptx')).toBeVisible({ timeout: 90_000 });
      await expect(page.getByText(/no longer in SharePoint/)).toBeVisible();
      // The minutes depend on how long the dev server took to compile the page.
      await expect(page.getByText(/Checked with SharePoint \d+ min ago/)).toBeVisible();
      await expect(page.getByRole('button', { name: 'Refresh now' })).toBeEnabled();
      await expect(page.getByRole('button', { name: 'Replace' })).toBeEnabled();
      await expect(page.locator('canvas >> visible=true').first()).toBeVisible({ timeout: 60_000 });

      await page.getByRole('button', { name: 'Remove' }).click();
      await expect(page.getByText('Remove the slides?')).toBeVisible();
      await page.getByRole('button', { name: 'Keep them' }).click();
      await expect(page.getByText('Remove the slides?')).toBeHidden();
      expect(deletes).toBe(0);

      await assertNoHorizontalOverflow(page);
      await page.screenshot({ path: testInfo.outputPath(`teacher-slides-attached-${viewport.width}.png`), fullPage: true });
      await context.close();
    }
  });

  test('the Setup checklist has a Slides line, and Add opens the Slides tab', async ({ browser }) => {
    const { context, page } = await newPage(browser, PHONE);
    await answerChapter(page, {}, null);
    test.skip(!(await injectAuthForPage(page, 'teacher')), 'Nexus test-login unavailable');

    await openTeacherChapter(page, 'setup');
    await expect(page.getByText('None. Students read the PDF only.')).toBeVisible({ timeout: 90_000 });
    await page.getByRole('button', { name: 'Add', exact: true }).click();
    await expect(page).toHaveURL(/[?&]tab=slides\b/, { timeout: 60_000 });
    await expect(page.getByText('No slides yet')).toBeVisible({ timeout: 60_000 });

    await context.close();
  });
});

test.describe('Chapter slides: student', () => {
  test('on a phone a student switches to the slides in one row of tabs, and the choice is remembered', async ({ browser }, testInfo) => {
    const { context, page } = await newPage(browser, PHONE);
    await answerStarred(page, { has_slides: true }, readySlides());
    test.skip(!(await injectAuthForPage(page, 'student')), 'Nexus test-login unavailable');
    test.skip(!(await openStarred(page)), 'The student test account cannot open Study Materials here');

    // The card says the deck is there. Visible only: hidden shell chrome can hold the same word.
    await expect(page.locator('text="Slides" >> visible=true').first()).toBeVisible();
    await page.getByText(TITLE).first().click();

    const dialog = page.getByRole('dialog');
    const tabs = dialog.getByRole('group', { name: 'Chapter view' });
    await expect(tabs.getByRole('button')).toHaveText(['PDF', 'Slides', 'Notes', 'Comments'], { timeout: 30_000 });

    await tabs.getByRole('button', { name: 'Slides' }).click();
    await expect(tabs.getByRole('button', { name: 'Slides' })).toHaveAttribute('aria-pressed', 'true');
    await expect(dialog.locator('canvas >> visible=true').first()).toBeVisible({ timeout: 60_000 });
    expect(await page.evaluate((key) => localStorage.getItem(key), MODE_KEY)).toBe('slides');

    await assertNoHorizontalOverflow(page);
    await assertTouchTargetSize(page, '[aria-label="Chapter view"] button', 44);
    await page.screenshot({ path: testInfo.outputPath('student-slides-375.png') });

    await dialog.getByRole('button', { name: 'Close' }).click();
    await expect(dialog).toBeHidden();
    await page.getByText(TITLE).first().click();
    await expect(
      page.getByRole('dialog').getByRole('group', { name: 'Chapter view' }).getByRole('button', { name: 'Slides' }),
    ).toHaveAttribute('aria-pressed', 'true', { timeout: 30_000 });

    await context.close();
  });

  test('on a laptop the header offers PDF or Slides, and downloading the slides gives a PDF', async ({ browser }, testInfo) => {
    const { context, page } = await newPage(browser, LAPTOP);
    await answerStarred(page, { has_slides: true, downloadable: true }, readySlides());
    test.skip(!(await injectAuthForPage(page, 'student')), 'Nexus test-login unavailable');
    test.skip(!(await openStarred(page)), 'The student test account cannot open Study Materials here');

    await page.getByText(TITLE).first().click();
    const dialog = page.getByRole('dialog');
    const readAs = dialog.getByRole('group', { name: 'Read this chapter as' });
    await expect(readAs).toBeVisible({ timeout: 30_000 });
    await readAs.getByRole('button', { name: 'Slides' }).click();
    await expect(dialog.locator('canvas >> visible=true').first()).toBeVisible({ timeout: 60_000 });

    const [download] = await Promise.all([
      page.waitForEvent('download', { timeout: 30_000 }),
      dialog.getByRole('button', { name: 'Download the slides as a PDF' }).click(),
    ]);
    expect(download.suggestedFilename()).toMatch(/\.pdf$/);
    expect(download.suggestedFilename()).not.toMatch(/\.pptx?$/);

    await assertNoHorizontalOverflow(page);
    await page.screenshot({ path: testInfo.outputPath('student-slides-1280.png') });
    await context.close();
  });

  test('slides that cannot be shown offer the PDF, and do not change what the student chose', async ({ browser }) => {
    const { context, page } = await newPage(browser, PHONE);
    await page.addInitScript((key) => {
      try {
        localStorage.setItem(key, 'slides');
      } catch {
        /* storage blocked: the assertion below then fails loudly */
      }
    }, MODE_KEY);
    await answerStarred(page, { has_slides: true }, { status: 'unavailable', code: 'RENDITION_UNAVAILABLE' });
    test.skip(!(await injectAuthForPage(page, 'student')), 'Nexus test-login unavailable');
    test.skip(!(await openStarred(page)), 'The student test account cannot open Study Materials here');

    await page.getByText(TITLE).first().click();
    const dialog = page.getByRole('dialog');
    await expect(dialog.getByText(/can't be shown right now/)).toBeVisible({ timeout: 60_000 });
    await dialog.getByRole('button', { name: 'Read the PDF' }).click();

    const tabs = dialog.getByRole('group', { name: 'Chapter view' });
    await expect(tabs.getByRole('button', { name: 'PDF' })).toHaveAttribute('aria-pressed', 'true');
    expect(await page.evaluate((key) => localStorage.getItem(key), MODE_KEY)).toBe('slides');

    await context.close();
  });
});

test.describe('Chapter slides: access', () => {
  test('none of the staff slides routes answer a student', async ({ request }) => {
    const auth = await getTestAuthToken(request, 'student');
    test.skip(!auth?.testToken, 'Nexus test-login unavailable');
    const headers = { Authorization: `Bearer ${auth!.testToken}`, 'Content-Type': 'application/json' };
    const base = `${NEXUS}/api/study-materials/files/${CHAPTER}/slides`;

    const calls = [
      request.put(base, { headers, data: { url: 'https://example.sharepoint.com/sites/class/deck.pptx' } }),
      request.patch(base, { headers }),
      request.delete(base, { headers }),
      // The picker behind attaching reads SharePoint with the app's permission.
      request.get(`${NEXUS}/api/sharepoint/search?q=history&kind=presentation&scope=both`, { headers }),
    ];
    for (const res of await Promise.all(calls)) {
      expect(res.status(), res.url()).toBe(403);
    }
  });

  test('a chapter that does not exist is refused plainly, never a server error', async ({ request }) => {
    const auth = await getTestAuthToken(request, 'teacher');
    test.skip(!auth?.testToken, 'Nexus test-login unavailable');
    const res = await request.get(`${NEXUS}/api/study-materials/files/${CHAPTER}/slides`, {
      headers: { Authorization: `Bearer ${auth!.testToken}` },
    });
    expect([403, 404]).toContain(res.status());
  });
});
