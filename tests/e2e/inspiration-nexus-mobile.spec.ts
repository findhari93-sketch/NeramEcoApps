import { test, expect, type Page } from '@playwright/test';
import { APP_URLS, STUDENT_ACCOUNT, TEACHER_ACCOUNT, injectAuthForPage } from '../utils/credentials';
import { assertNoHorizontalOverflow } from '../utils/mobile-helpers';

/**
 * Inspiration on a phone.
 *
 * API half (serial): a teacher adds an exemplar; a student finds it by search,
 * sees no teacher fields, saves it and finds it in Saved; a student cannot edit;
 * the teacher hides it and the student can no longer open it. The exemplar is
 * deleted in afterAll. Test tokens run with every feature on (see
 * inspiration-access.ts), so the flag does not gate this half.
 *
 * UI half: the search home and a drawing page fit 375px with thumb-sized
 * targets, and Back from a drawing returns to the results.
 */

const NEXUS = APP_URLS.nexus;
const UNIQUE = `Vbnqz exemplar ${Date.now()}`;
const auth = (token: string) => ({ Authorization: `Bearer ${token}` });

let studentToken = '';
let teacherToken = '';
let exemplarId = '';
let ready = true;

test.describe('Inspiration API', () => {
  test.describe.configure({ mode: 'serial' });

  test('setup: tokens and a migration probe', async ({ request }) => {
    const s = await request.post(`${NEXUS}/api/auth/test-login`, { data: { email: STUDENT_ACCOUNT.email, role: 'student' } });
    test.skip(s.status() !== 200, 'Nexus dev server or test-login not available');
    studentToken = (await s.json()).testToken;
    const t = await request.post(`${NEXUS}/api/auth/test-login`, { data: { email: TEACHER_ACCOUNT.email, role: 'teacher' } });
    teacherToken = (await t.json()).testToken;

    const probe = await request.get(`${NEXUS}/api/inspiration/search`, { headers: auth(teacherToken), failOnStatusCode: false });
    if (probe.status() !== 200) {
      ready = false;
      console.log(`[inspiration probe] ${probe.status()}: ${await probe.text()}`);
    }
  });

  test('a teacher adds an exemplar and a student finds it by search', async ({ request }) => {
    test.skip(!ready || !teacherToken, 'inspiration migrations not applied to this database');
    const create = await request.post(`${NEXUS}/api/inspiration/exemplars`, {
      headers: auth(teacherToken),
      data: {
        image_url: 'https://placehold.co/600x800.png',
        title: UNIQUE,
        brief: 'A travel bag and a hat, drawn for the end to end run',
        type_slugs: ['3d_composition'],
        exam_types: ['NATA'],
        paper_years: [2025],
      },
    });
    expect(create.status()).toBe(201);
    exemplarId = (await create.json()).id;

    const found = await request.get(`${NEXUS}/api/inspiration/search?q=${encodeURIComponent(UNIQUE)}`, { headers: auth(studentToken) });
    expect(found.status()).toBe(200);
    const body = await found.json();
    const hit = body.items.find((i: { id: string }) => i.id === exemplarId);
    expect(hit).toBeTruthy();
    expect(hit.staff).toBeUndefined();
    expect(hit.credit).toBe('Neram reference');
    expect(JSON.stringify(body.items)).not.toMatch(/score_pct|curation|authorId|tutor_/);
  });

  test('a student saves it and finds it in Saved', async ({ request }) => {
    test.skip(!exemplarId, 'no exemplar was created');
    const save = await request.post(`${NEXUS}/api/inspiration/items/${exemplarId}/save`, { headers: auth(studentToken) });
    expect(save.status()).toBe(200);
    const saved = await (await request.get(`${NEXUS}/api/inspiration/search?saved=1`, { headers: auth(studentToken) })).json();
    expect(saved.items.map((i: { id: string }) => i.id)).toContain(exemplarId);
  });

  test('a student cannot change Inspiration or ask for hidden drawings', async ({ request }) => {
    test.skip(!exemplarId, 'no exemplar was created');
    const edit = await request.patch(`${NEXUS}/api/inspiration/items/${exemplarId}`, { headers: auth(studentToken), data: { curation: 'hidden' } });
    expect(edit.status()).toBe(403);
    const hidden = await (await request.get(`${NEXUS}/api/inspiration/search?scope=hidden`, { headers: auth(studentToken) })).json();
    for (const item of hidden.items) expect(item.staff).toBeUndefined();
  });

  test('a teacher hides it and the student can no longer open it', async ({ request }) => {
    test.skip(!exemplarId, 'no exemplar was created');
    const hide = await request.patch(`${NEXUS}/api/inspiration/items/${exemplarId}`, { headers: auth(teacherToken), data: { curation: 'hidden' } });
    expect(hide.status()).toBe(200);
    expect((await hide.json()).item.staff.hiddenReason).toBe('Hidden by a teacher');
    const open = await request.get(`${NEXUS}/api/inspiration/items/${exemplarId}`, { headers: auth(studentToken), failOnStatusCode: false });
    expect(open.status()).toBe(404);
  });

  test.afterAll(async ({ request }) => {
    if (exemplarId && teacherToken) {
      await request.delete(`${NEXUS}/api/inspiration/items/${exemplarId}`, { headers: auth(teacherToken), failOnStatusCode: false });
    }
  });
});

test.describe('Inspiration on a phone', () => {
  // fullyParallel is on repo-wide; two simultaneous test-logins for the same
  // student account can 500 (see the sketchbook/catchup specs), so this
  // describe runs its own cases in order on one worker.
  test.describe.configure({ mode: 'default' });
  test.use({ viewport: { width: 375, height: 812 } });

  async function open(page: Page, path: string): Promise<'ok' | 'off' | 'down'> {
    const ok = await injectAuthForPage(page, 'student');
    if (!ok) return 'down';
    await page.goto(`${NEXUS}${path}`, { waitUntil: 'domcontentloaded' });
    const shell = page.locator('button[aria-label="Open profile menu"]');
    try {
      await shell.waitFor({ timeout: 90_000 });
    } catch {
      return 'down';
    }
    const skip = page.getByRole('button', { name: 'Skip' });
    if (await skip.isVisible().catch(() => false)) await skip.click();
    if (await page.getByText(/is coming soon|getting this ready for you/i).first().isVisible().catch(() => false)) return 'off';
    return 'ok';
  }

  test('search home fits the screen with thumb-sized targets', async ({ page }) => {
    test.setTimeout(120_000);
    const state = await open(page, '/student/inspiration');
    test.skip(state === 'down', 'Nexus not running');
    test.skip(state === 'off', 'student.inspiration is off in this environment');

    await expect(page.getByRole('heading', { name: 'Inspiration', exact: true })).toBeVisible();
    const search = page.getByRole('textbox', { name: 'Search Inspiration' });
    await expect(search).toBeVisible();
    expect(await search.evaluate((el) => parseFloat(getComputedStyle(el).fontSize))).toBeGreaterThanOrEqual(16);
    await assertNoHorizontalOverflow(page);

    const saved = await page.getByRole('link', { name: 'Saved' }).boundingBox();
    expect(saved && saved.height >= 44).toBe(true);
  });

  test('a drawing opens, fits, and Back returns to the same results', async ({ page }) => {
    test.setTimeout(120_000);
    const state = await open(page, '/student/inspiration?sort=newest');
    test.skip(state !== 'ok', 'Nexus not running or flag off');

    // isVisible({ timeout }) does not wait, it only polls once and returns.
    // Anchor on a render-confirming element first (the search box mounting
    // proves the client bundle for this route has hydrated), then give the
    // grid's own fetch a moment to settle before deciding a tile is missing.
    await expect(page.getByRole('textbox', { name: 'Search Inspiration' })).toBeVisible({ timeout: 90_000 });
    await page.waitForLoadState('networkidle').catch(() => {});

    const tile = page.getByTestId('inspiration-tile').first();
    test.skip(!(await tile.isVisible({ timeout: 20_000 }).catch(() => false)), 'no visible drawings in this environment');
    const heart = await tile.getByRole('button').boundingBox();
    expect(heart && heart.height >= 44 && heart.width >= 44).toBe(true);

    await tile.getByRole('link').click();
    await expect(page).toHaveURL(/\/student\/inspiration\/[0-9a-f-]{36}/);
    await expect(page.getByRole('button', { name: /^(Save|Saved)$/ })).toBeVisible();
    await assertNoHorizontalOverflow(page);

    await page.getByRole('link', { name: 'Back to Inspiration' }).click();
    await expect(page).toHaveURL(/\/student\/inspiration\?sort=newest$/);
  });
});
