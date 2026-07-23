/**
 * Timetable phase 1: the evening band, the two views, and the request-count fix.
 *
 * Covers what the redesign actually changed:
 *  - /api/auth/me serves an admin-configured timetable window (and a sane
 *    default when none is saved).
 *  - /api/timetable/my-schedule returns classes, the student's own RSVPs, their
 *    attendance and the week's holidays in ONE response. The page used to make
 *    2N + 2 requests for the same data, so this is the regression guard.
 *  - The student page renders, the Agenda/Grid switch works and the choice
 *    survives a reload.
 *  - Mobile: no horizontal page scroll at 375px, and the controls are tappable.
 *
 * Auth is injected via the test-login token, so this spec does not depend on the
 * MS-login setup project (the Entra MFA wall blocks that auto-login). It skips
 * gracefully when test auth is not configured.
 *
 * Run: pnpm test:e2e tests/e2e/timetable-evening-band-nexus.spec.ts --project=nexus-chrome --no-deps
 */

import { test, expect } from '@playwright/test';
import { getTestAuthToken, injectAuthForPage, APP_URLS } from '../utils/credentials';
import { assertNoHorizontalOverflow, assertTouchTargetSize } from '../utils/mobile-helpers';

test.use({ storageState: { cookies: [], origins: [] } });

/** Monday of the current week, as YYYY-MM-DD. */
function currentWeekRange(): { start: string; end: string } {
  const now = new Date();
  const monday = new Date(now);
  const dow = now.getDay();
  monday.setDate(now.getDate() + (dow === 0 ? -6 : 1 - dow));
  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);
  const iso = (d: Date) =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  return { start: iso(monday), end: iso(sunday) };
}

const HHMM = /^([01]\d|2[0-3]):([0-5]\d)$/;

/**
 * Open the student timetable with the first-run welcome tour suppressed.
 *
 * That tour is a MUI Dialog, which marks the rest of the app aria-hidden, so
 * every role-based query silently finds nothing while it is up. Seeding its
 * "seen" flag via addInitScript applies to reloads too.
 */
async function openTimetable(page: any) {
  await page.addInitScript(() => {
    try {
      window.localStorage.setItem('nexus_welcome_seen_v1', new Date().toISOString());
    } catch {
      /* storage blocked */
    }
  });
  await page.goto(`${APP_URLS.nexus}/student/timetable`, { waitUntil: 'domcontentloaded' });
}

test.describe('Timetable evening band', () => {
  test.describe.configure({ timeout: 120_000 });

  test('AC1: /api/auth/me serves a usable timetable window', async ({ request }) => {
    const student = await getTestAuthToken(request, 'student');
    test.skip(!student, 'Test auth not configured');

    const res = await request.get(`${APP_URLS.nexus}/api/auth/me`, {
      headers: { Authorization: `Bearer ${student!.testToken}` },
    });
    expect(res.ok()).toBe(true);

    const { timetableWindow } = await res.json();
    expect(timetableWindow, 'auth/me must carry the window so the page needs no extra request').toBeTruthy();

    // Whatever is stored, what comes back must always be drawable.
    expect(timetableWindow.start).toMatch(HHMM);
    expect(timetableWindow.end).toMatch(HHMM);
    expect(timetableWindow.end > timetableWindow.start).toBe(true);
    expect(Array.isArray(timetableWindow.days)).toBe(true);
    expect(timetableWindow.days.length).toBeGreaterThan(0);
    for (const d of timetableWindow.days) {
      expect(d).toBeGreaterThanOrEqual(1);
      expect(d).toBeLessThanOrEqual(7);
    }
  });

  test('AC2: my-schedule returns schedule, RSVPs, attendance and holidays in one response', async ({ request }) => {
    const student = await getTestAuthToken(request, 'student');
    test.skip(!student, 'Test auth not configured');

    const { start, end } = currentWeekRange();
    const res = await request.get(
      `${APP_URLS.nexus}/api/timetable/my-schedule?start=${start}&end=${end}`,
      { headers: { Authorization: `Bearer ${student!.testToken}` } },
    );
    expect(res.ok()).toBe(true);

    const data = await res.json();
    // The whole point of the fold-in: these four keys used to cost 2N + 2 requests.
    expect(Array.isArray(data.classes)).toBe(true);
    expect(Array.isArray(data.classrooms)).toBe(true);
    expect(data.rsvps, 'rsvps must be folded in, not fetched per class').toBeTruthy();
    expect(data.attendance, 'attendance must be folded in, not fetched per class').toBeTruthy();
    expect(data.holidays, 'holidays must be folded in, not fetched separately').toBeTruthy();
    expect(typeof data.rsvps).toBe('object');
    expect(typeof data.attendance).toBe('object');
    expect(typeof data.holidays).toBe('object');
  });

  test('AC3: my-schedule rejects a call with no date range', async ({ request }) => {
    const student = await getTestAuthToken(request, 'student');
    test.skip(!student, 'Test auth not configured');

    const res = await request.get(`${APP_URLS.nexus}/api/timetable/my-schedule`, {
      headers: { Authorization: `Bearer ${student!.testToken}` },
    });
    expect(res.status()).toBe(400);
  });

  test('AC4: the student page loads one schedule request, not one per class', async ({ page }) => {
    const ok = await injectAuthForPage(page, 'student');
    test.skip(!ok, 'Test auth not configured');

    const perClassCalls: string[] = [];
    page.on('request', (req) => {
      const url = req.url();
      // The old shape: one RSVP and one attendance request per class id.
      if (url.includes('/api/timetable/rsvp?class_id')) perClassCalls.push(url);
      if (url.includes('/api/timetable/attendance-report?class_id')) perClassCalls.push(url);
    });

    // Wait on the response rather than a fixed delay: acquiring the MSAL token
    // before the first fetch can take longer than any sleep worth hard-coding.
    const scheduleResponse = page.waitForResponse(
      (r: any) => r.url().includes('/api/timetable/my-schedule'),
      { timeout: 60_000 },
    );
    await openTimetable(page);
    await scheduleResponse;

    // Give any legacy per-class fetch a chance to fire before asserting it did not.
    await page.waitForTimeout(3000);
    expect(perClassCalls, 'per-class RSVP/attendance fetches must be gone').toHaveLength(0);
  });

  test('AC5: Agenda and Grid switch, and the choice survives a reload', async ({ page }) => {
    const ok = await injectAuthForPage(page, 'student');
    test.skip(!ok, 'Test auth not configured');

    await openTimetable(page);

    const grid = page.getByRole('button', { name: 'Grid view' });
    const agenda = page.getByRole('button', { name: 'Agenda view' });
    await expect(grid).toBeVisible({ timeout: 30_000 });

    await grid.click();
    await expect(grid).toHaveAttribute('aria-pressed', 'true');
    // The band note is the honesty line about the compact window.
    await expect(page.getByText(/Showing .*(AM|PM)|Showing the full day/)).toBeVisible();

    await page.reload({ waitUntil: 'domcontentloaded' });
    await expect(grid).toHaveAttribute('aria-pressed', 'true', { timeout: 30_000 });

    await agenda.click();
    await expect(agenda).toHaveAttribute('aria-pressed', 'true');
  });

  test('AC6: the grid draws only the configured hours, not a full day', async ({ page, request }) => {
    const student = await getTestAuthToken(request, 'student');
    test.skip(!student, 'Test auth not configured');
    const ok = await injectAuthForPage(page, 'student');
    test.skip(!ok, 'Test auth not configured');

    const me = await request.get(`${APP_URLS.nexus}/api/auth/me`, {
      headers: { Authorization: `Bearer ${student!.testToken}` },
    });
    const { timetableWindow } = await me.json();

    await openTimetable(page);
    const grid = page.getByRole('button', { name: 'Grid view' });
    await expect(grid).toBeVisible({ timeout: 30_000 });
    await grid.click();

    // A full 8 AM to 8 PM day would be 13 hour labels. The band should be far
    // fewer, unless a class outside the window legitimately expanded it (in
    // which case the note says so).
    const startHour = parseInt(timetableWindow.start.slice(0, 2), 10);
    const endHour = parseInt(timetableWindow.end.slice(0, 2), 10);
    const expectedLabels = endHour - startHour + 1;

    const note = await page.getByText(/Showing /).innerText();
    if (!/expanded to fit/.test(note)) {
      const labels = await page.getByTestId('grid-hour-label').count();
      expect(labels).toBeLessThanOrEqual(expectedLabels + 1);
    }
  });

  test('mobile: no horizontal overflow at 375px', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    const ok = await injectAuthForPage(page, 'student');
    test.skip(!ok, 'Test auth not configured');

    await openTimetable(page);
    await page.waitForTimeout(3000);
    await assertNoHorizontalOverflow(page);
  });

  test('mobile: the grid scrolls sideways without pushing the page', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    const ok = await injectAuthForPage(page, 'student');
    test.skip(!ok, 'Test auth not configured');

    await openTimetable(page);
    const grid = page.getByRole('button', { name: 'Grid view' });
    await expect(grid).toBeVisible({ timeout: 30_000 });
    await grid.click();
    await page.waitForTimeout(1500);

    // The six-column band is wider than a phone on purpose. It must scroll
    // inside its own container, never scroll the document.
    await assertNoHorizontalOverflow(page);
  });

  test('mobile: view controls meet the 44px touch target', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    const ok = await injectAuthForPage(page, 'student');
    test.skip(!ok, 'Test auth not configured');

    await openTimetable(page);
    await expect(page.getByRole('button', { name: 'Grid view' })).toBeVisible({ timeout: 30_000 });

    await assertTouchTargetSize(page, 'button[aria-label="Grid view"]');
    await assertTouchTargetSize(page, 'button[aria-label="Agenda view"]');
    await assertTouchTargetSize(page, 'button[aria-label="Previous week"]');
    await assertTouchTargetSize(page, 'button[aria-label="Next week"]');
  });

  test('empty state: a week with no classes still renders the shell', async ({ page }) => {
    const ok = await injectAuthForPage(page, 'student');
    test.skip(!ok, 'Test auth not configured');

    await openTimetable(page);
    await expect(page.getByRole('heading', { name: 'Timetable' })).toBeVisible({ timeout: 30_000 });

    // Jump far enough forward that no class exists, and confirm the page holds.
    const next = page.getByRole('button', { name: 'Next week' });
    for (let i = 0; i < 8; i++) await next.click();
    await page.waitForTimeout(2500);

    await expect(page.getByRole('heading', { name: 'Timetable' })).toBeVisible();
    await assertNoHorizontalOverflow(page);
  });
});
