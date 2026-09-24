/**
 * Shared steps for the teacher Catch-up specs (2026-10 redesign).
 *
 * The page is two views, Students and Calendar, behind one "Catch-up views"
 * tab strip. Both read from endpoints that staging has almost no data for, so
 * most UI specs serve the fixtures in tests/fixtures/catchup-overview.ts
 * instead. The mocks are opt-in per call, so a spec that wants the live
 * payload simply does not ask for them.
 */
import { expect, type Page } from '@playwright/test';
import { APP_URLS } from './credentials';
import { catchupOverviewPayload, catchupCalendarPayload } from '../fixtures/catchup-overview';

export const NEXUS = APP_URLS.nexus;

/**
 * WelcomeOrientation opens a full-screen modal on first sign-in when this key
 * is absent, and MUI hides everything behind a modal from the accessibility
 * tree. An init script runs before every navigation, so it is always set.
 */
export async function skipWelcome(page: Page): Promise<void> {
  await page.addInitScript(() => {
    try {
      window.localStorage.setItem('nexus_welcome_seen_v1', new Date().toISOString());
    } catch {
      // A blocked storage is the test environment's problem, not the page's.
    }
  });
}

/** Serve the fixture overview and calendar instead of staging's empty classroom. */
export async function mockCatchupApis(page: Page, opts: { overview?: boolean; calendar?: boolean } = {}) {
  const { overview = true, calendar = true } = opts;
  if (overview) {
    await page.route('**/api/catchup/overview**', (r) => r.fulfill({ json: catchupOverviewPayload }));
  }
  if (calendar) {
    await page.route('**/api/catchup/calendar**', (r) => r.fulfill({ json: catchupCalendarPayload(r.request().url()) }));
  }
}

/**
 * Open /teacher/catch-up with an optional query string and wait for the page
 * proper (the h1 and the two view tabs), not a guessed number of seconds.
 */
export async function openTeacherCatchup(page: Page, query = ''): Promise<void> {
  await page.goto(`${NEXUS}/teacher/catch-up${query ? `?${query.replace(/^\?/, '')}` : ''}`, {
    waitUntil: 'domcontentloaded',
  });
  await expect(page.getByRole('heading', { level: 1, name: 'Catch-up' })).toBeVisible({ timeout: 60_000 });
  await expect(page.getByRole('tablist', { name: 'Catch-up views' })).toBeVisible();
}

/** The eight stat cards that filter the Students view. */
export function diagnosisTiles(page: Page) {
  return page.getByRole('group', { name: 'Filter students by why they are behind' });
}

/** One student row (role=button, opens the sheet). Name is the accessible-name prefix. */
export function studentRows(page: Page) {
  return page.locator('[role="button"][aria-haspopup="dialog"]');
}

/**
 * Elements inside <main> that stick out past the viewport, ignoring anything
 * inside a strip that scrolls sideways on purpose (the reason chips).
 */
export async function overflowingInMain(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const w = document.documentElement.clientWidth;
    const bad: string[] = [];
    document.querySelectorAll('main *').forEach((el) => {
      const r = el.getBoundingClientRect();
      if (r.width === 0 || r.right <= w + 1) return;
      for (let p = el.parentElement; p; p = p.parentElement) {
        const o = getComputedStyle(p).overflowX;
        if (o === 'auto' || o === 'scroll' || o === 'hidden') return;
      }
      bad.push(`${el.tagName}.${(el.className || '').toString().slice(0, 40)} right=${Math.round(r.right)}`);
    });
    return bad.slice(0, 5);
  });
}
