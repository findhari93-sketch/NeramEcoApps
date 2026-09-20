import { test, expect, type Page } from '@playwright/test';
import { APP_URLS, STUDENT_ACCOUNT, TEACHER_ACCOUNT, injectAuthForPage, getTestAuthToken } from '../utils/credentials';
import { assertNoHorizontalOverflow } from '../utils/mobile-helpers';

/**
 * Student Sketchbook on a phone.
 *
 * API half: a student adds a sketch and the rhythm answers "1 of 3"; a
 * teacher sees it in the inbox, flips it, reacts; the student's page carries
 * the reaction; a student cannot read the teacher inbox. UI half: the student
 * home renders at phone width without sideways scroll, with 48px targets, and
 * self-skips when the flag is off for this environment.
 *
 * Every table-dependent API case self-skips when the sketchbook migration has
 * not landed on this dev database (probed once in setup, below). The two
 * guard cases (role check, token check) run either way: both refuse before
 * touching a sketchbook table.
 *
 * The "Sketchbook API" describe's `tablesReady` is module-level state shared
 * only WITHIN that describe (it runs `mode: 'serial'`, guaranteeing one
 * worker for its own tests). It is not read by the "on a phone" describe:
 * with `fullyParallel: true` in the root config, Playwright is free to run
 * different describes in this same file on separate worker PROCESSES, each
 * with its own copy of module state, so the phone describe cannot rely on a
 * flag the API describe computed elsewhere. Its one table-dependent
 * assertion (the dashboard card) instead runs the same probe itself.
 */

const NEXUS = APP_URLS.nexus;
// 1x1 white PNG.
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8/x8AAwMCAO+ip1sAAAAASUVORK5CYII=', 'base64');

let studentToken = '';
let teacherToken = '';
let sketchId = '';
/** Set false when the setup probe finds the sketchbook migration missing. */
let tablesReady = true;

test.describe('Sketchbook API', () => {
  test.describe.configure({ mode: 'serial' });

  test('setup: tokens', async ({ request }) => {
    const s = await request.post(`${NEXUS}/api/auth/test-login`, { data: { email: STUDENT_ACCOUNT.email, role: 'student' } });
    test.skip(s.status() !== 200, 'Nexus dev server or test-login not available');
    studentToken = (await s.json()).testToken;
    const t = await request.post(`${NEXUS}/api/auth/test-login`, { data: { email: TEACHER_ACCOUNT.email, role: 'teacher' } });
    teacherToken = (await t.json()).testToken;

    // Controller ruling: the sketchbook migration is NOT applied on this dev
    // database this session (it points at staging and the apply was refused).
    // Probe once here so every table-dependent case below can self-skip with a
    // clear reason instead of failing on a 500 that has nothing to do with the
    // feature under test.
    const probe = await request.get(`${NEXUS}/api/sketchbook/me?summary=1`, {
      headers: { Authorization: `Bearer ${studentToken}` },
      failOnStatusCode: false,
    });
    if (probe.status() !== 200) {
      tablesReady = false;
      console.log(`[sketchbook probe] GET /api/sketchbook/me?summary=1 -> ${probe.status()}: ${await probe.text()}`);
    }
  });

  test('student adds a sketch and gets a rhythm back', async ({ request }) => {
    test.skip(!tablesReady, 'sketchbook migration not applied to the dev database');
    const up = await request.post(`${NEXUS}/api/drawing/upload`, {
      headers: { Authorization: `Bearer ${studentToken}` },
      multipart: { bucket: 'drawing-uploads', file: { name: 'e2e-sketch.png', mimeType: 'image/png', buffer: PNG } },
    });
    expect(up.status()).toBe(200);
    const { url } = await up.json();
    const res = await request.post(`${NEXUS}/api/sketchbook/entries`, {
      headers: { Authorization: `Bearer ${studentToken}` },
      data: { original_image_url: url, caption: 'E2E chair study' },
    });
    expect(res.status()).toBe(201);
    const body = await res.json();
    sketchId = body.sketch.id;
    expect(body.rhythm.week.count).toBeGreaterThanOrEqual(1);
    expect(body.rhythm.week.goal).toBeGreaterThanOrEqual(1);
  });

  test('student cannot open the teacher inbox', async ({ request }) => {
    const res = await request.get(`${NEXUS}/api/sketchbook/inbox`, { headers: { Authorization: `Bearer ${studentToken}` }, failOnStatusCode: false });
    expect(res.status()).toBe(403);
  });

  test('teacher sees it in the inbox, flips and reacts', async ({ request }) => {
    test.skip(!tablesReady, 'sketchbook migration not applied to the dev database');
    const inbox = await request.get(`${NEXUS}/api/sketchbook/inbox`, { headers: { Authorization: `Bearer ${teacherToken}` } });
    expect(inbox.status()).toBe(200);
    const { sketches } = await inbox.json();
    expect(sketches.some((s: { id: string }) => s.id === sketchId)).toBe(true);

    const flip = await request.post(`${NEXUS}/api/sketchbook/entries/${sketchId}/flip`, { headers: { Authorization: `Bearer ${teacherToken}` }, data: { action: 'seen' } });
    expect(flip.status()).toBe(200);
    const react = await request.post(`${NEXUS}/api/sketchbook/entries/${sketchId}/react`, { headers: { Authorization: `Bearer ${teacherToken}` }, data: { reaction: 'fire' } });
    expect(react.status()).toBe(200);
  });

  test('the student sees the reaction and who saw it', async ({ request }) => {
    test.skip(!tablesReady, 'sketchbook migration not applied to the dev database');
    const res = await request.get(`${NEXUS}/api/sketchbook/me?sketch=${sketchId}`, { headers: { Authorization: `Bearer ${studentToken}` } });
    expect(res.status()).toBe(200);
    const body = await res.json();
    const mine = body.sketches.find((s: { id: string }) => s.id === sketchId);
    expect(mine.reaction).toBe('fire');
    expect(mine.seenBy).not.toBeNull();
  });

  test('featuring under a test token is refused with a clear reason', async ({ request }) => {
    // The route checks the token before looking up the sketch, so this runs
    // even without a real sketch: any UUID-shaped id reaches the same check.
    //
    // The empty body is the point. Featuring no longer takes a classroom or a
    // caption, so a 400 about the Microsoft token, rather than about a missing
    // field, is the proof that classroom_id really is optional now.
    const id = sketchId || '00000000-0000-0000-0000-000000000001';
    const res = await request.post(`${NEXUS}/api/sketchbook/entries/${id}/feature`, {
      headers: { Authorization: `Bearer ${teacherToken}` }, data: {}, failOnStatusCode: false,
    });
    expect(res.status()).toBe(400);
    expect((await res.json()).error).toContain('Microsoft sign-in');
  });

  test('cleanup: student deletes the sketch', async ({ request }) => {
    test.skip(!tablesReady, 'sketchbook migration not applied to the dev database');
    const res = await request.delete(`${NEXUS}/api/sketchbook/entries/${sketchId}`, { headers: { Authorization: `Bearer ${studentToken}` } });
    expect(res.status()).toBe(204);
  });
});

test.describe('Sketchbook on a phone', () => {
  test.use({ viewport: { width: 375, height: 812 } });

  async function open(page: Page, path: string): Promise<'ok' | 'off' | 'down'> {
    const ok = await injectAuthForPage(page, 'student');
    if (!ok) return 'down';
    await page.goto(`${NEXUS}${path}`, { waitUntil: 'domcontentloaded' });
    const shell = page.locator('button[aria-label="Open profile menu"]');
    try { await shell.waitFor({ timeout: 90_000 }); } catch { return 'down'; }
    const skip = page.getByRole('button', { name: 'Skip' });
    if (await skip.isVisible().catch(() => false)) await skip.click();
    // Mirrors FeatureGate.tsx's FeatureUnavailable copy: "<label> is coming
    // soon" / "We are getting this ready for you...". Neither half names the
    // feature, so this matches whichever feature the gate is for.
    if (await page.getByText(/is coming soon|getting this ready for you/i).first().isVisible().catch(() => false)) return 'off';
    return 'ok';
  }

  test('home renders without sideways scroll and with 48px targets', async ({ page }) => {
    const state = await open(page, '/student/sketchbook');
    test.skip(state === 'down', 'Nexus not running');
    test.skip(state === 'off', 'student.sketchbook is off in this environment');
    // exact: true, because without the migration the page's own empty state
    // renders an "Your sketchbook is empty" heading, and getByRole's default
    // substring match on "Sketchbook" resolves both, which is a strict-mode
    // violation rather than a pass.
    await expect(page.getByRole('heading', { name: 'Sketchbook', exact: true })).toBeVisible();
    await assertNoHorizontalOverflow(page);
    const fab = page.getByRole('button', { name: 'Add a sketch' });
    await expect(fab).toBeVisible();
    const box = await fab.boundingBox();
    expect(box && box.height >= 48 && box.width >= 48).toBe(true);
    const older = await page.getByRole('button', { name: 'Older month' }).boundingBox();
    expect(older && older.height >= 48).toBe(true);
  });

  test('dashboard shows the sketchbook card', async ({ page }) => {
    // open() already budgets up to 90s for a cold compile (see its own
    // shell.waitFor above), and this test does two more round trips on top
    // of that (a fresh token, then the probe), so the default 30s test
    // timeout is too tight for a cold dev server.
    test.setTimeout(90_000);
    const state = await open(page, '/student/dashboard');
    test.skip(state !== 'ok', 'Nexus not running or flag off');
    // The dashboard layout itself must never scroll sideways, regardless of
    // whether the sketchbook card below has data to show.
    await assertNoHorizontalOverflow(page);
    // Same probe as the API describe's setup, run locally: this describe can
    // land on a different worker process than that one, so its `tablesReady`
    // is not visible here. Without the migration, SketchbookHomeCard correctly
    // renders nothing (see SketchbookHomeCard.tsx's `if (error) return null;`),
    // so there is no link to find; skip only that assertion, not the whole run.
    const auth = await getTestAuthToken(page.request, 'student');
    const probe = await page.request.get(`${NEXUS}/api/sketchbook/me?summary=1`, {
      headers: auth ? { Authorization: `Bearer ${auth.testToken}` } : {},
      failOnStatusCode: false,
    });
    test.skip(probe.status() !== 200, 'sketchbook migration not applied to the dev database');
    await expect(page.getByRole('link', { name: /open sketchbook/i })).toBeVisible();
  });
});
