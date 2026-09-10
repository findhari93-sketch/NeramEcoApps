import { test, expect } from '@playwright/test';
import { APP_URLS, getTestAuthToken, injectAuthForPage } from '../utils/credentials';

/**
 * Search on the Students screen at 375px, plus the "Not yet in class" payload.
 *
 * Data-driven on purpose: the test classroom's roster is not fixed, so the
 * respelling is built from a real student's first name. It doubles one inner
 * consonant ("Aryakumar" becomes "Aryykumar"), which no substring search can
 * find but which reads as the same name once optional letters are folded away,
 * exactly like "Nethrra" and "Nethra". Consonants beside an h are avoided,
 * because the dh, th and sh folds would change the key and make the typo larger
 * than it looks.
 *
 * Read-only. Local dev writes to the production database, so nothing here adds,
 * links or removes anyone.
 */

const NEXUS = APP_URLS.nexus;
const SEARCH_PLACEHOLDER = 'Search by name or email...';
const VOWELS = new Set(['a', 'e', 'i', 'o', 'u']);

test.use({ viewport: { width: 375, height: 812 } });

/**
 * Double one inner consonant of the first name, or return null when none is
 * safe. The result must not appear in the name as typed, or the test would pass
 * on a plain substring match and prove nothing about the fuzzy tier.
 */
function respell(name: string): string | null {
  const first = name.split(' ')[0] || '';
  if (!/^[A-Za-z]{4,}$/.test(first)) return null;
  const lower = first.toLowerCase();
  for (let i = 1; i < lower.length - 1; i++) {
    const ch = lower[i];
    if (VOWELS.has(ch) || ch === 'h') continue;
    if (lower[i - 1] === 'h' || lower[i + 1] === 'h') continue;
    if (lower[i - 1] === ch || lower[i + 1] === ch) continue;
    const typed = first.slice(0, i + 1) + first[i] + first.slice(i + 1);
    if (!name.toLowerCase().includes(typed.toLowerCase())) return typed;
  }
  return null;
}

test.describe('Students search tolerates spelling', () => {
  // The dev server compiles /teacher/students on its first hit, which alone can
  // outlast Playwright's 30s default. Same budget the other Nexus UI specs use.
  test.describe.configure({ timeout: 120_000 });

  let target: { name: string; typed: string } | null = null;

  test.beforeAll(async ({ request }) => {
    // Pay the cold compile once, up front, instead of inside every test's budget.
    await request.get(`${NEXUS}/teacher/students`, { timeout: 110_000 }).catch(() => null);

    const auth = await getTestAuthToken(request, 'teacher');
    const classroomId = auth?.classrooms?.[0]?.id;
    if (!auth || !classroomId) return;
    // examBatch=current is what the screen loads by default, so the chosen
    // student is guaranteed to be in the list the search runs over.
    const res = await request.get(`${NEXUS}/api/students?classroom=${classroomId}&examBatch=current`, {
      headers: { Authorization: `Bearer ${auth.testToken}` },
    });
    if (res.status() !== 200) return;
    const { students } = await res.json();
    for (const student of students || []) {
      const typed = student?.name ? respell(student.name) : null;
      if (typed) {
        target = { name: student.name, typed };
        break;
      }
    }
  });

  test.beforeEach(async ({ page }) => {
    const ok = await injectAuthForPage(page, 'teacher');
    test.skip(!ok, 'Nexus test-login unavailable');
    await page.goto(`${NEXUS}/teacher/students`, { waitUntil: 'domcontentloaded', timeout: 90_000 });
    await expect(page.getByPlaceholder(SEARCH_PLACEHOLDER)).toBeVisible({ timeout: 60_000 });
  });

  test('a respelled name still finds the student, whatever category is selected', async ({ page }) => {
    test.skip(!target, 'No student in the test classroom has a first name that can be respelled');
    await page.getByPlaceholder(SEARCH_PLACEHOLDER).fill(target!.typed);
    // The roster request can still be compiling on a cold server.
    await expect(page.locator('[role="button"]').filter({ hasText: target!.name }).first()).toBeVisible({
      timeout: 45_000,
    });
    await expect(page.getByText('Searching every student in this classroom, in all categories.')).toBeVisible();
  });

  test('a search that matches nobody says so', async ({ page }) => {
    await page.getByPlaceholder(SEARCH_PLACEHOLDER).fill('qqqzzzxx');
    await expect(page.getByText('No student matches "qqqzzzxx"')).toBeVisible({ timeout: 45_000 });
  });

  test('searching never pushes the page sideways at 375px', async ({ page }) => {
    await page.getByPlaceholder(SEARCH_PLACEHOLDER).fill(target?.typed ?? 'qqqzzzxx');
    await page.waitForTimeout(300);
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
    );
    expect(overflow).toBe(false);
  });
});

test.describe('Not yet in class payload', () => {
  test('returns new accounts and past students separately', async ({ request }) => {
    const auth = await getTestAuthToken(request, 'teacher');
    const classroomId = auth?.classrooms?.[0]?.id;
    test.skip(!auth || !classroomId, 'Nexus test-login unavailable');

    const res = await request.get(`${NEXUS}/api/classrooms/${classroomId}/available-students`, {
      headers: { Authorization: `Bearer ${auth!.testToken}` },
    });
    test.skip(res.status() === 502, 'Microsoft directory unavailable in this environment');
    test.skip(res.status() === 403, 'The test account may not list the directory');
    expect(res.status()).toBe(200);

    const body = await res.json();
    expect(Array.isArray(body.students)).toBe(true);
    expect(Array.isArray(body.past)).toBe(true);
    for (const student of body.students) expect(student).toHaveProperty('createdAt');

    const pastOids = new Set(body.past.map((p: { ms_oid: string }) => p.ms_oid));
    for (const student of body.students) expect(pastOids.has(student.ms_oid)).toBe(false);
  });
});
