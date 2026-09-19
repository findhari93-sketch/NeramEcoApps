import { test, expect, type Page } from '@playwright/test';
import { APP_URLS, STUDENT_ACCOUNT, TEACHER_ACCOUNT, injectAuthForPage } from '../utils/credentials';
import { createInspirationExemplar, deleteInspirationExemplar } from '../utils/inspiration-fixtures';
import { assertNoHorizontalOverflow, assertTouchTargetSize } from '../utils/mobile-helpers';

/**
 * Inspiration on a phone.
 *
 * API half (serial): an exemplar image outside project storage is refused; a
 * teacher uploads a real image and adds an exemplar; a student finds it by search,
 * sees no teacher fields, saves it and finds it in Saved; a student cannot edit;
 * the teacher hides it and the student can no longer open it (checked from both
 * sides: the student's own hidden-scope search and the teacher's). The exemplar
 * is deleted in afterAll. Test tokens run with every feature on (see
 * inspiration-access.ts), so the flag does not gate this half.
 *
 * UI half: the search home and a drawing page fit 375px with thumb-sized
 * targets, and Back from a drawing returns to the results. Its own beforeAll
 * uploads a real image and creates a second, dedicated exemplar (title starts
 * "Qwzx"), because the tile-visibility assertion here must FAIL on a missing
 * tile rather than self-skip: staging has almost no visible drawings, so this
 * half cannot depend on whatever the API half's exemplar happens to look like
 * at the moment the UI runs. That fixture is deleted in this describe's own
 * afterAll. The Reference/Student's-drawing image toggle is out of scope here
 * (controller ruling: deferred).
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

    // An image outside project storage is refused before anything is written.
    const outside = await request.post(`${NEXUS}/api/inspiration/exemplars`, {
      headers: auth(teacherToken),
      failOnStatusCode: false,
      data: {
        image_url: 'https://placehold.co/600x800.png',
        title: UNIQUE,
        brief: 'Should never be created',
        type_slugs: ['3d_composition'],
      },
    });
    expect(outside.status()).toBe(400);
    expect((await outside.json()).error).toBe('Upload the drawing first.');

    const fixture = await createInspirationExemplar(request, teacherToken, {
      title: UNIQUE,
      brief: 'A travel bag and a hat, drawn for the end to end run',
    });
    if ('error' in fixture) throw new Error(`could not create the exemplar: ${fixture.error}`);
    exemplarId = fixture.id;

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
    // Saved is still a student-facing list: no teacher-only field leaks into it.
    expect(JSON.stringify(saved.items)).not.toMatch(/score_pct|curation|authorId|tutor_/);
    for (const item of saved.items) expect(item.staff).toBeUndefined();
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

    // The student is held to the visible scope no matter what the query string
    // asks for, so a hidden-scope search (even by its own unique title) must
    // not surface it.
    const studentHidden = await (
      await request.get(`${NEXUS}/api/inspiration/search?scope=hidden&q=${encodeURIComponent(UNIQUE)}`, { headers: auth(studentToken) })
    ).json();
    expect(studentHidden.items.find((i: { id: string }) => i.id === exemplarId)).toBeUndefined();

    // The teacher's own hidden-scope search is the one place it should still
    // show up, correctly flagged as no longer visible.
    const teacherHidden = await (
      await request.get(`${NEXUS}/api/inspiration/search?scope=hidden&q=${encodeURIComponent(UNIQUE)}`, { headers: auth(teacherToken) })
    ).json();
    const teacherHit = teacherHidden.items.find((i: { id: string }) => i.id === exemplarId);
    expect(teacherHit).toBeTruthy();
    expect(teacherHit.staff.visible).toBe(false);

    const open = await request.get(`${NEXUS}/api/inspiration/items/${exemplarId}`, { headers: auth(studentToken), failOnStatusCode: false });
    expect(open.status()).toBe(404);
  });

  test.afterAll(async ({ request }) => {
    if (exemplarId && teacherToken) {
      expect([200, 404]).toContain(await deleteInspirationExemplar(request, teacherToken, exemplarId));
    }
  });
});

test.describe('Inspiration on a phone', () => {
  // fullyParallel is on repo-wide; two simultaneous test-logins for the same
  // student account can 500 (see the sketchbook/catchup specs), so this
  // describe runs its own cases in order on one worker.
  test.describe.configure({ mode: 'default' });
  test.use({ viewport: { width: 375, height: 812 } });

  const PHONE_FIXTURE_TITLE = `Qwzx phone fixture ${Date.now()}`;
  let phoneTeacherToken = '';
  let phoneFixtureId = '';
  let phoneReady = true;

  test.beforeAll(async ({ request }) => {
    const t = await request.post(`${NEXUS}/api/auth/test-login`, { data: { email: TEACHER_ACCOUNT.email, role: 'teacher' } });
    if (t.status() !== 200) {
      phoneReady = false;
      return;
    }
    phoneTeacherToken = (await t.json()).testToken;

    const fixture = await createInspirationExemplar(request, phoneTeacherToken, {
      title: PHONE_FIXTURE_TITLE,
      brief: 'A travel bag and a hat for the phone test',
    });
    if ('error' in fixture) {
      phoneReady = false;
      console.log(`[inspiration phone fixture] ${fixture.error}`);
      return;
    }
    phoneFixtureId = fixture.id;
  });

  test.afterAll(async ({ request }) => {
    if (phoneFixtureId && phoneTeacherToken) {
      expect([200, 404]).toContain(await deleteInspirationExemplar(request, phoneTeacherToken, phoneFixtureId));
    }
  });

  async function open(page: Page, route: string): Promise<'ok' | 'off' | 'down'> {
    const ok = await injectAuthForPage(page, 'student');
    if (!ok) return 'down';
    await page.goto(`${NEXUS}${route}`, { waitUntil: 'domcontentloaded' });
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

    await assertTouchTargetSize(page, 'a[href$="/student/inspiration/saved"]');
  });

  test('a drawing opens, fits, and Back returns to the same results', async ({ page }) => {
    test.setTimeout(120_000);
    test.skip(!phoneReady, 'could not create the phone fixture exemplar');

    const q = encodeURIComponent(PHONE_FIXTURE_TITLE);
    const state = await open(page, `/student/inspiration?q=${q}`);
    test.skip(state !== 'ok', 'Nexus not running or flag off');

    // isVisible({ timeout }) does not wait, it only polls once and returns.
    // Anchor on a render-confirming element first (the search box mounting
    // proves the client bundle for this route has hydrated), then give the
    // grid's own fetch a moment to settle.
    await expect(page.getByRole('textbox', { name: 'Search Inspiration' })).toBeVisible({ timeout: 90_000 });
    await page.waitForLoadState('networkidle').catch(() => {});

    // This search is scoped to our own fixture's unique title, so unlike the
    // old sort=newest probe, a missing tile here is a real failure, not an
    // acceptable "staging has no visible drawings" skip.
    const tile = page.getByTestId('inspiration-tile').first();
    await expect(tile).toBeVisible({ timeout: 60_000 });

    const typeChip = page.getByRole('button', { name: /^3D Composition/ });
    await expect(typeChip).toBeVisible();
    await typeChip.click();
    await expect(page).toHaveURL(/type=3d_composition/);
    await typeChip.click();
    await expect(page).not.toHaveURL(/type=/);

    await assertTouchTargetSize(page, '[data-testid="inspiration-tile"] button');

    await tile.getByRole('link').click();
    // A dynamic /student/inspiration/[itemId] route can take 26 to 36s to
    // compile on first hit (see the repo's documented cold-route trap); the
    // default 5s expect timeout is too tight for that first navigation.
    await expect(page).toHaveURL(new RegExp(`/student/inspiration/${phoneFixtureId}`), { timeout: 90_000 });

    // exact: true, because the item page's own "More like this" section can
    // render other tiles whose heart button is named "Save <that title>" (or,
    // once saved, "Remove <that title> from saved", which contains "saved" too)
    // — a plain substring match on 'Save'/'Saved' hits those as well as the
    // page's own Save/Saved action button, a strict-mode violation.
    const saveButton = page.getByRole('button', { name: /^(Save|Saved)$/ });
    await expect(saveButton).toBeVisible();
    await page.getByRole('button', { name: 'Save', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Saved', exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Saved', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Save', exact: true })).toBeVisible();

    await assertNoHorizontalOverflow(page);

    await page.getByRole('link', { name: 'Back to Inspiration' }).click();
    // Back returns to the URL saved when the tile was opened (history.replaceState),
    // which still carries q and, since the type chip was untoggled before the
    // tile was opened, no type=. The dev server serves both projects' copies of
    // this test at once, so the RSC round trip for Back can outlast the default
    // 5s even on a warm route (seen: the results had painted, the URL lagged).
    await expect(page).toHaveURL(/\/student\/inspiration\?q=/, { timeout: 30_000 });
  });

  /**
   * The heart on a tile, seen from the Saved list.
   *
   * Saved is opened FIRST on purpose. The list keeps its answer in a cache that
   * outlives the page (lib/swr-cache.ts), and the bug this guards was a Saved
   * list that replayed the answer from before the heart was tapped: the drawing
   * was in the database and on no screen the student could see.
   */
  test('a drawing saved from the grid is on the Saved list straight away', async ({ page }) => {
    test.setTimeout(150_000);
    test.skip(!phoneReady, 'could not create the phone fixture exemplar');

    const first = await open(page, '/student/inspiration/saved');
    test.skip(first !== 'ok', 'Nexus not running or flag off');
    await expect(page.getByRole('heading', { name: 'Saved', exact: true })).toBeVisible({ timeout: 90_000 });
    // The cache is written on a debounce and flushed as the page is left, so the
    // answer has to have arrived before we navigate away from it.
    await page.waitForLoadState('networkidle').catch(() => {});

    await page.goto(`${NEXUS}/student/inspiration?q=${encodeURIComponent(PHONE_FIXTURE_TITLE)}`, {
      waitUntil: 'domcontentloaded',
    });
    const tile = page.getByTestId('inspiration-tile').first();
    await expect(tile).toBeVisible({ timeout: 90_000 });

    const heart = tile.getByRole('button', { name: `Save ${PHONE_FIXTURE_TITLE}` });
    await heart.click();
    const filled = page.getByRole('button', { name: `Remove ${PHONE_FIXTURE_TITLE} from saved` });
    await expect(filled).toBeVisible();

    await page.getByRole('link', { name: 'Saved' }).click();
    await expect(page).toHaveURL(/\/student\/inspiration\/saved/, { timeout: 60_000 });
    await expect(page.getByRole('button', { name: `Remove ${PHONE_FIXTURE_TITLE} from saved` })).toBeVisible({
      timeout: 60_000,
    });
    // Never the empty state over a drawing that is saved.
    await expect(page.getByText('Nothing saved yet').first()).toBeHidden();

    // Leave the student's Saved list as it was found.
    await page.getByRole('button', { name: `Remove ${PHONE_FIXTURE_TITLE} from saved` }).click();
  });
});
