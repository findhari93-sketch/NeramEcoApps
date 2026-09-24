import { test, expect, type APIRequestContext, type Page } from '@playwright/test';
import { APP_URLS, getTestAuthToken, injectAuthForPage } from '../utils/credentials';

/**
 * Student language: the avatar mark, the language filter, the Set stage sheet
 * and the profile chip, at 375px.
 *
 * Writes users.home_language and users.limited_english on ONE real student of the
 * teacher's first classroom and puts the original values back in afterAll. Skips
 * (rather than failing) when the columns have not reached this database, which the
 * /api/students payload tells us by carrying or not carrying `home_language`.
 */

const NEXUS = APP_URLS.nexus;

/** The e2e ring selector shared with avatar-ring-nexus-mobile.spec.ts. */
const RING = /(Class 10|Class 11|Class 12|Break Year|Not set|Dormant):/;

test.use({ viewport: { width: 375, height: 812 } });
// One worker, in order: the tests share one student's language.
test.describe.configure({ mode: 'default', timeout: 120_000 });

interface StudentRow {
  id: string;
  name: string;
  email: string | null;
  participation_status: 'active' | 'dormant';
  home_language?: string | null;
  limited_english?: boolean | null;
}

test.describe('Student language on a phone', () => {
  let token = '';
  let classroomId = '';
  let student: StudentRow | null = null;
  let original: string | null = null;
  let originalLimited = false;
  let migrated = false;
  let canClassify = false;

  const headers = () => ({ Authorization: `Bearer ${token}` });

  const setLanguage = (request: APIRequestContext, value: unknown, limitedEnglish?: boolean) =>
    request.patch(`${NEXUS}/api/students/classification`, {
      headers: headers(),
      data: {
        classroomId,
        studentIds: [student!.id],
        homeLanguage: value,
        ...(limitedEnglish === undefined ? {} : { limitedEnglish }),
      },
    });

  async function rowNow(request: APIRequestContext): Promise<StudentRow | undefined> {
    const res = await request.get(`${NEXUS}/api/students?classroom=${classroomId}`, { headers: headers() });
    const body = await res.json();
    return (body.students as StudentRow[]).find((s) => s.id === student!.id);
  }

  const languageNow = async (request: APIRequestContext) => (await rowNow(request))?.home_language;

  async function openStudents(page: Page, query = '') {
    const ok = await injectAuthForPage(page, 'teacher');
    test.skip(!ok, 'Nexus test-login unavailable');
    await page.goto(`${NEXUS}/teacher/students${query}`, { waitUntil: 'domcontentloaded' });
    await expect(page.getByRole('group', { name: 'Filter students by language' })).toBeVisible({
      timeout: 60_000,
    });
  }

  /** Opens the Set stage sheet's Language select and picks one. */
  async function pickLanguage(page: Page, name: RegExp) {
    const sheet = page.getByRole('presentation').filter({ hasText: /Set class and exam year/i });
    const field = sheet.locator('[data-testid="language-select"]');
    await field.scrollIntoViewIfNeeded();
    await field.click();
    await page.getByRole('option', { name }).click();
  }

  test.beforeAll(async ({ request }) => {
    const auth = await getTestAuthToken(request, 'teacher');
    classroomId = auth?.classrooms?.[0]?.id ?? '';
    if (!auth || !classroomId) return;
    token = auth.testToken;

    // Retry past the dev server's first-request 404 while it compiles the route.
    const probe = () => request.get(`${NEXUS}/api/students?classroom=${classroomId}`, { headers: headers() });
    let res = await probe();
    for (let attempt = 0; attempt < 8 && res.status() === 404; attempt++) {
      await new Promise((r) => setTimeout(r, 1500));
      res = await probe();
    }
    if (res.status() !== 200) return;

    const rows = ((await res.json()).students || []) as StudentRow[];
    student = rows.find((s) => s.participation_status === 'active' && !!s.email) ?? null;
    if (!student || !('home_language' in student)) return;
    migrated = true;
    original = student.home_language ?? null;
    originalLimited = student.limited_english === true;

    // Probe the write with the values it already has: a no-op, but it answers 403
    // for a viewer without coord.student.stage.
    canClassify = (await setLanguage(request, original, originalLimited)).status() === 200;
  });

  test.afterAll(async ({ request }) => {
    if (migrated && canClassify && student) await setLanguage(request, original, originalLimited);
  });

  test.beforeEach(() => {
    test.skip(!migrated, 'users.home_language is not in this environment yet');
  });

  test('the API refuses anything but one of the five languages', async ({ request }) => {
    test.skip(!canClassify, 'Signed-in account cannot classify');
    expect((await setLanguage(request, 'Tamil')).status()).toBe(400);
    expect((await setLanguage(request, 'telugu')).status()).toBe(400);
  });

  test('a saved language reaches the roster and the avatar lookup, and a repeat changes nothing', async ({
    request,
  }) => {
    test.skip(!canClassify, 'Signed-in account cannot classify');

    const first = await setLanguage(request, 'hindi', false);
    expect(first.status()).toBe(200);
    expect(await languageNow(request)).toBe('hindi');

    const facts = await (
      await request.get(`${NEXUS}/api/students/stage-facts`, { headers: headers() })
    ).json();
    expect(facts.facts[student!.id]?.language).toBe('hindi');
    expect(facts.facts[student!.id]?.limitedEnglish).toBe(false);

    const repeat = await (await setLanguage(request, 'hindi', false)).json();
    expect(repeat.changed).toBe(0);
  });

  test('the limited English tick rides on top of the language', async ({ request }) => {
    test.skip(!canClassify, 'Signed-in account cannot classify');
    expect((await setLanguage(request, 'tamil', true)).status()).toBe(200);
    const row = await rowNow(request);
    expect(row?.home_language).toBe('tamil');
    expect(row?.limited_english).toBe(true);
  });

  test('the language filter fits the phone and narrows to students wearing the mark', async ({
    page,
    request,
  }) => {
    test.skip(!canClassify, 'Signed-in account cannot classify');
    await setLanguage(request, 'tamil', false);
    await openStudents(page);

    const group = page.getByRole('group', { name: 'Filter students by language' });
    const chips = group.getByRole('button');
    // Five languages plus the separate English fluency narrowing.
    await expect(chips).toHaveCount(6);
    for (let i = 0; i < 6; i++) {
      const box = await chips.nth(i).boundingBox();
      expect(box!.height, `language chip ${i}`).toBeGreaterThanOrEqual(44);
    }

    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
    );
    expect(overflow, 'the language row pushes the page sideways at 375px').toBe(false);

    // All active, so the chosen student is in the list whatever their class.
    await page.getByRole('tablist', { name: /filter students/i }).getByRole('tab', { name: /^All active/ }).click();

    const tamil = group.getByRole('button', { name: /^Tamil, / });
    await tamil.click();
    await expect(tamil).toHaveAttribute('aria-pressed', 'true');
    await expect(page).toHaveURL(/[?&]lang=tamil\b/);

    const rings = page.getByLabel(RING).filter({ has: page.locator('.MuiAvatar-root') });
    await expect(rings.first()).toBeVisible({ timeout: 30_000 });
    const count = await rings.count();
    for (let i = 0; i < count; i++) {
      const label = (await rings.nth(i).getAttribute('aria-label')) || '';
      expect(label, 'every ring left after the Tamil filter says so').toMatch(/ Tamil\.$/);
      await expect(rings.nth(i).getByTestId('language-badge')).toHaveText('த');
    }
  });

  test('Set stage marks one student Kannada, and Undo puts it back', async ({ page, request }) => {
    test.skip(!canClassify, 'Signed-in account cannot classify');
    await setLanguage(request, 'english', false);
    await openStudents(page);

    await page.getByRole('tablist', { name: /filter students/i }).getByRole('tab', { name: /^All active/ }).click();
    await page.getByRole('button', { name: /^Select( students)?$/ }).click();

    const row = page.getByRole('option').filter({ hasText: student!.email! }).first();
    await expect(row).toBeVisible({ timeout: 30_000 });
    await row.click();
    await expect(row).toHaveAttribute('aria-selected', 'true');

    await page.getByRole('button', { name: 'Set stage', exact: true }).click();
    await pickLanguage(page, /Kannada/);

    const sheet = page.getByRole('presentation').filter({ hasText: /Set class and exam year/i });
    const apply = sheet.getByRole('button', { name: /^Apply/ });
    const applyBox = await apply.boundingBox();
    expect(applyBox!.y + applyBox!.height).toBeLessThanOrEqual(812);
    await apply.click();

    await expect(page.getByText('Marked Kannada for 1 student.')).toBeVisible({ timeout: 30_000 });
    await expect.poll(() => languageNow(request), { timeout: 30_000 }).toBe('kannada');

    await page.getByRole('button', { name: 'Undo' }).click();
    await expect.poll(() => languageNow(request), { timeout: 30_000 }).toBe('english');
  });

  test('the profile chip opens the sheet at Language', async ({ page, request }) => {
    test.skip(!canClassify, 'Signed-in account cannot classify');
    await setLanguage(request, 'malayalam', false);

    const ok = await injectAuthForPage(page, 'teacher');
    test.skip(!ok, 'Nexus test-login unavailable');
    await page.goto(`${NEXUS}/teacher/students/${student!.id}`, { waitUntil: 'domcontentloaded' });

    const chip = page.getByRole('button', { name: 'Malayalam. Change language' });
    await expect(chip).toBeVisible({ timeout: 60_000 });
    await expect(chip.getByTestId('language-badge').or(chip.getByText('M')).first()).toBeVisible();

    // 28px visual; the ::before stretches the tap area to 44px.
    const tapHeight = await chip.evaluate((el) => {
      const before = getComputedStyle(el, '::before');
      return el.getBoundingClientRect().height - parseFloat(before.top) - parseFloat(before.bottom);
    });
    expect(tapHeight).toBeGreaterThanOrEqual(44);

    await chip.click();
    const field = page.locator('[data-testid="language-select"]');
    await expect(field).toBeVisible();
    await expect(page.getByText('Now: Malayalam')).toBeVisible();
    // Scrolled into view once the sheet finished sliding in.
    await expect
      .poll(async () => {
        const box = await field.boundingBox();
        return !!box && box.y >= 0 && box.y + box.height <= 812;
      })
      .toBe(true);
  });
});
