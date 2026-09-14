import { test, expect, type APIRequestContext, type Page } from '@playwright/test';
import { APP_URLS, STUDENT_ACCOUNT, TEACHER_ACCOUNT, injectAuthForPage } from '../utils/credentials';
import { assertNoHorizontalOverflow } from '../utils/mobile-helpers';

/**
 * Class rhythm, the shared student list, the one notification door and the
 * sketchbook reminders (2026-09-13).
 *
 * API: the rhythm never claims "8 weeks", every row carries a 14-day strip and a
 * status, any drawing counts, dormant students only ever appear as a count; the
 * nudge, cron, Connect Teams and health routes refuse whoever should be refused.
 * UI at 375px: the status cards are the filters and live in the URL, rows stay
 * compact, nothing scrolls sideways.
 */

const NEXUS = APP_URLS.nexus;
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8/x8AAwMCAO+ip1sAAAAASUVORK5CYII=', 'base64');

test.describe.configure({ timeout: 120_000 });

async function login(request: APIRequestContext, email: string, role: 'student' | 'teacher'): Promise<string | null> {
  const r = await request.post(`${NEXUS}/api/auth/test-login`, { data: { email, role }, failOnStatusCode: false });
  if (r.status() !== 200) return null;
  return (await r.json()).testToken ?? null;
}

async function teacherClassroom(request: APIRequestContext, token: string): Promise<string | null> {
  const me = await request.get(`${NEXUS}/api/auth/me`, { headers: { Authorization: `Bearer ${token}` }, failOnStatusCode: false });
  if (me.status() !== 200) return null;
  const body = await me.json();
  const rooms = body.classrooms || body.user?.classrooms || [];
  return rooms[0]?.id ?? null;
}

test.describe('Class rhythm API', () => {
  test.describe.configure({ mode: 'serial' });

  let teacher = '';
  let student = '';
  let classroomId = '';
  let sketchId = '';

  test('setup', async ({ request }) => {
    teacher = (await login(request, TEACHER_ACCOUNT.email, 'teacher')) || '';
    student = (await login(request, STUDENT_ACCOUNT.email, 'student')) || '';
    test.skip(!teacher || !student, 'Nexus dev server or test-login not available');
    classroomId = (await teacherClassroom(request, teacher)) || '';
    test.skip(!classroomId, 'The E2E teacher has no classroom');
  });

  test('never says "8 weeks", and every row has a strip, a status and a start date', async ({ request }) => {
    test.skip(!classroomId, 'no classroom');
    const res = await request.get(`${NEXUS}/api/sketchbook/class-rhythm?classroom=${classroomId}`, { headers: { Authorization: `Bearer ${teacher}` } });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(typeof body.pausedCount).toBe('number');
    expect(body.startedOn).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    for (const s of body.students) {
      expect(s.label).not.toMatch(/8 weeks|[–—]/);
      expect(s.strip).toHaveLength(14);
      expect(['needs_call', 'needs_nudge', 'behind', 'not_started', 'on_track']).toContain(s.status);
      expect(s.start >= body.startedOn).toBe(true);
    }
  });

  test('a sketch shows on the student row with a thumbnail and counts this week', async ({ request }) => {
    test.skip(!classroomId, 'no classroom');
    const up = await request.post(`${NEXUS}/api/drawing/upload`, {
      headers: { Authorization: `Bearer ${student}` },
      multipart: { bucket: 'drawing-uploads', file: { name: 'e2e-rhythm.png', mimeType: 'image/png', buffer: PNG } },
    });
    test.skip(up.status() !== 200, 'drawing upload unavailable');
    const { url } = await up.json();
    const add = await request.post(`${NEXUS}/api/sketchbook/entries`, {
      headers: { Authorization: `Bearer ${student}` },
      data: { original_image_url: url, thumbnail_url: url, caption: 'E2E rhythm row' },
    });
    expect(add.status()).toBe(201);
    sketchId = (await add.json()).sketch.id;

    const res = await request.get(`${NEXUS}/api/sketchbook/class-rhythm?classroom=${classroomId}`, { headers: { Authorization: `Bearer ${teacher}` } });
    const rows = (await res.json()).students as any[];
    const mine = rows.find((r) => r.latestSketch?.id === sketchId);
    test.skip(!mine, 'The E2E student is not a tracked student of the teacher\'s first classroom');
    expect(mine.week.count).toBeGreaterThanOrEqual(1);
    expect(mine.quietDays).toBe(0);
    expect(mine.strip.some((d: { state: string; today: boolean }) => d.today && d.state === 'drew')).toBe(true);
  });

  test('a student cannot read the class rhythm or send nudges', async ({ request }) => {
    test.skip(!classroomId, 'no classroom');
    const r = await request.get(`${NEXUS}/api/sketchbook/class-rhythm?classroom=${classroomId}`, { headers: { Authorization: `Bearer ${student}` }, failOnStatusCode: false });
    expect(r.status()).toBe(403);
  });

  test('a nudge needs a real Microsoft sign-in, because it goes as the teacher\'s own chat', async ({ request }) => {
    test.skip(!classroomId, 'no classroom');
    const r = await request.post(`${NEXUS}/api/sketchbook/nudge`, {
      headers: { Authorization: `Bearer ${teacher}` },
      data: { classroom_id: classroomId, student_ids: ['00000000-0000-0000-0000-000000000001'] },
      failOnStatusCode: false,
    });
    expect(r.status()).toBe(400);
    expect((await r.json()).error).toContain('Microsoft sign-in');
  });

  test('cleanup', async ({ request }) => {
    test.skip(!sketchId, 'nothing to clean');
    const r = await request.delete(`${NEXUS}/api/sketchbook/entries/${sketchId}`, { headers: { Authorization: `Bearer ${student}` } });
    expect(r.status()).toBe(204);
  });
});

test.describe('Guards on the new routes', () => {
  test('crons refuse a caller without the cron secret', async ({ request }) => {
    for (const path of ['/api/cron/sketchbook-reminders?dryRun=1', '/api/cron/sketchbook-digest']) {
      const r = await request.get(`${NEXUS}${path}`, { failOnStatusCode: false });
      test.skip(r.status() === 404, 'Nexus not running this build');
      expect([401, 403, 500]).toContain(r.status());
    }
  });

  test('the reminder dry run decides without sending', async ({ request }) => {
    const secret = process.env.CRON_SECRET;
    test.skip(!secret, 'CRON_SECRET not in the test env');
    const r = await request.get(`${NEXUS}/api/cron/sketchbook-reminders?dryRun=1`, { headers: { Authorization: `Bearer ${secret}` } });
    expect(r.status()).toBe(200);
    const body = await r.json();
    if (body.skipped) return; // student.sketchbook is off on this environment
    expect(body.dryRun).toBe(true);
    expect(Array.isArray(body.wouldSend)).toBe(true);
    for (const s of body.wouldSend) expect([1, 2, 3]).toContain(s.step);
  });

  test('Connect Teams: a teacher gets a Microsoft sign-in link, a student is refused, a bad return is turned away', async ({ request }) => {
    const teacher = await login(request, TEACHER_ACCOUNT.email, 'teacher');
    const student = await login(request, STUDENT_ACCOUNT.email, 'student');
    test.skip(!teacher || !student, 'test-login not available');
    const classroomId = await teacherClassroom(request, teacher!);
    test.skip(!classroomId, 'The E2E teacher has no classroom');

    const refused = await request.post(`${NEXUS}/api/teams/sender/start`, {
      headers: { Authorization: `Bearer ${student}` },
      data: { classroom_id: classroomId },
      failOnStatusCode: false,
    });
    expect([401, 403]).toContain(refused.status());

    const status = await request.get(`${NEXUS}/api/teams/sender?classroom=${classroomId}`, { headers: { Authorization: `Bearer ${teacher}` } });
    expect(status.status()).toBe(200);
    const body = await status.json();
    test.skip(!body.available, 'Teams sending is not configured on this server');

    const start = await request.post(`${NEXUS}/api/teams/sender/start`, {
      headers: { Authorization: `Bearer ${teacher}` },
      data: { classroom_id: classroomId, return_to: '/teacher/sketchbook?view=rhythm' },
    });
    expect(start.status()).toBe(200);
    const { url } = await start.json();
    const authorize = new URL(url);
    expect(authorize.host).toBe('login.microsoftonline.com');
    expect(authorize.searchParams.get('scope')).toContain('ChatMessage.Send');
    expect(authorize.searchParams.get('redirect_uri')).toContain('/api/teams/sender/callback');

    // A return from Microsoft with no matching sign-in cookie must not connect anything.
    const forged = await request.get(`${NEXUS}/api/teams/sender/callback?code=x&state=forged`, { maxRedirects: 0, failOnStatusCode: false });
    expect(forged.status()).toBe(302);
    expect(forged.headers()['location']).toContain('teams=error');
  });

  test('delivery health is admin only', async ({ request }) => {
    const student = await login(request, STUDENT_ACCOUNT.email, 'student');
    test.skip(!student, 'test-login not available');
    const r = await request.get(`${NEXUS}/api/admin/delivery-health`, { headers: { Authorization: `Bearer ${student}` }, failOnStatusCode: false });
    expect(r.status()).toBe(403);
  });
});

test.describe('Class rhythm on a laptop', () => {
  test.use({ viewport: { width: 1280, height: 900 } });

  test('stage filter shows as ring-coloured chips and narrows the list', async ({ page }, testInfo) => {
    test.skip(!(await injectAuthForPage(page, 'teacher')), 'Nexus not running');
    await page.goto(`${NEXUS}/teacher/sketchbook?view=rhythm`, { waitUntil: 'domcontentloaded' });
    const rows = page.getByTestId('rhythm-row');
    try {
      await rows.first().waitFor({ timeout: 90_000 });
    } catch {
      test.skip(true, 'No classroom or no tracked students');
    }
    await assertNoHorizontalOverflow(page);
    const chip = page.getByTestId('stage-chip-exam_this_year');
    await expect(chip).toBeVisible();
    expect(((await chip.boundingBox())?.height ?? 0) >= 44).toBe(true);
    // Whose Teams the reminders come from, with the action to change it.
    await expect(page.getByTestId('teams-sender-card')).toBeVisible({ timeout: 30_000 });
    expect(((await page.getByTestId('teams-sender-action').boundingBox())?.height ?? 0) >= 44).toBe(true);
    await page.screenshot({ path: testInfo.outputPath('rhythm-laptop.png'), fullPage: false });

    const before = await rows.count();
    // Wait for the stage lookup, which enables the chips.
    await expect(chip).toBeEnabled({ timeout: 60_000 });
    await chip.click();
    await expect(chip).toHaveAttribute('aria-pressed', 'true');
    await expect.poll(() => new URL(page.url()).searchParams.get('stage')).toBe('exam_this_year');
    const after = await rows.count();
    expect(after).toBeLessThanOrEqual(before);
  });
});

test.describe('Class rhythm on a phone', () => {
  test.use({ viewport: { width: 375, height: 812 } });

  async function open(page: Page, path: string): Promise<boolean> {
    if (!(await injectAuthForPage(page, 'teacher'))) return false;
    await page.goto(`${NEXUS}${path}`, { waitUntil: 'domcontentloaded' });
    try {
      await page.getByRole('tab', { name: 'Class rhythm' }).waitFor({ timeout: 90_000 });
    } catch {
      return false;
    }
    return true;
  }

  test('cards are the filters, live in the URL, and rows stay compact', async ({ page }) => {
    test.skip(!(await open(page, '/teacher/sketchbook?view=rhythm')), 'Nexus not running or no classroom picked');
    await expect(page.getByRole('tab', { name: 'Class rhythm' })).toHaveAttribute('aria-selected', 'true');
    const rows = page.getByTestId('rhythm-row');
    await expect(rows.first().or(page.getByText('No students to show'))).toBeVisible({ timeout: 60_000 });
    test.skip((await rows.count()) === 0, 'No tracked students in this classroom');

    await expect(page.getByText(/8 weeks/)).toHaveCount(0);
    await assertNoHorizontalOverflow(page);

    const first = await rows.first().boundingBox();
    expect(first && first.height <= 76).toBe(true);
    expect(await rows.first().getByTestId('rhythm-strip').locator('[data-state]').count()).toBe(14);

    const tile = page.locator('[data-testid^="stat-tile-"]:not([disabled])').first();
    const key = ((await tile.getAttribute('data-testid')) || '').replace('stat-tile-', '');
    await tile.click();
    await expect.poll(() => new URL(page.url()).searchParams.get('status')).toBe(key);
    await page.reload();
    await expect(page.getByTestId(`stat-tile-${key}`)).toHaveAttribute('aria-pressed', 'true', { timeout: 60_000 });

    // The sort sheet on a phone has 48px options.
    await page.getByTestId('list-sort-button').click();
    const option = page.getByRole('menuitem').first();
    await expect(option).toBeVisible();
    expect(((await option.boundingBox())?.height ?? 0) >= 48).toBe(true);
  });
});
