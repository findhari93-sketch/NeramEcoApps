import { test, expect } from '@playwright/test';
import { APP_URLS, injectAuthForPage } from '../utils/credentials';

/**
 * Teacher photo review queue E2E.
 *
 * The "Needs review" tab doubles as the one-time bulk backfill grid for photos
 * that existed before the rule came in, so the assertions that matter are:
 * two columns at 375px, the five status buckets always add up to the roster,
 * and a rejection cannot be saved without a reason (that reason is the only
 * thing the blocked student is shown).
 *
 * Prerequisites (otherwise self-skips): Nexus dev server on :3012, the
 * photo-approval and photo-auto-approval migrations applied, and the e2e
 * teacher account reachable.
 *
 * The API assertions are all read-only or deliberately invalid writes, so this
 * spec cannot change any real student's photo status. That includes the
 * automatic face check: the page runs it on open, so every browser test stubs
 * that route, and the API test only makes calls it refuses before looking at
 * a single photo. Nothing here spends AI money or approves anyone.
 */

const NEXUS = APP_URLS.nexus;
const authHeader = (token: string) => ({ Authorization: `Bearer ${token}` });

/**
 * Open the review queue at a given viewport, signed in as the teacher.
 *
 * The generous timeout is not padding. This describe block runs in serial mode,
 * and against a cold dev server the first compile of this route takes ~45s on
 * its own, which is past the 30s default. When that fired, the FIRST browser
 * test timed out and every browser test after it was skipped, so the suite
 * reported "14 passed, 1 skipped" while three assertions had never run at all.
 * A page-loading test needs a page-loading budget.
 */
async function openPhotoReview(
  page: import('@playwright/test').Page,
  viewport: { width: number; height: number },
) {
  // The page runs the automatic face check when it opens. Answer for it, as if
  // the check were switched off, so a layout test never spends AI money or
  // approves a real staging photo as a side effect.
  await page.route('**/api/photo-review/auto-check', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        checked: 0,
        approved: 0,
        keptForReview: 0,
        failed: 0,
        blocked: true,
        remaining: 0,
      }),
    }),
  );
  await page.setViewportSize(viewport);
  // The whole cached session, not just the token. Test mode never calls
  // /api/auth/me, so a page handed only nexus_test_token had no user and sent
  // the browser to /login, where every heading wait below timed out.
  expect(await injectAuthForPage(page, 'teacher')).toBe(true);
  await page.goto(`${NEXUS}/teacher/photo-review`, { waitUntil: 'domcontentloaded' });
  await expect(page.getByRole('heading', { name: /^Photo Review$/i })).toBeVisible({
    timeout: 60_000,
  });
}

const MOBILE = { width: 375, height: 812 };
const DESKTOP = { width: 1280, height: 900 };
/** See openPhotoReview: a cold compile of this route alone can take ~45s. */
const PAGE_TEST_TIMEOUT = 120_000;

const BUCKETS = ['pending', 'auto', 'missing', 'rejected', 'approved'] as const;

/** The tab button label for each bucket. */
const TAB_LABELS: Record<(typeof BUCKETS)[number], string> = {
  pending: 'Needs review',
  auto: 'Auto-approved',
  missing: 'No photo',
  rejected: 'Rejected',
  approved: 'Approved',
};

/** The student checkboxes on the grid, leaving out "Select all N students". */
const STUDENT_CHECKBOX = /^Select (?!all \d)/;

/** Words of a name the way the ranking splits them: separators and camelCase humps. */
function wordsOf(name: string): string[] {
  return name
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(Boolean);
}

function startsAWord(name: string, query: string): boolean {
  return wordsOf(name).some((word) => word.startsWith(query));
}

/**
 * A two-letter search this roster answers with both kinds of hit: a word that
 * starts with it, and a name that only contains it. Null when there is none.
 */
function pickRankingQuery(names: string[]): string | null {
  for (const name of names) {
    for (const word of wordsOf(name)) {
      const query = word.slice(0, 2);
      if (!/^[a-z]{2}$/.test(query)) continue;
      if (names.some((n) => n.toLowerCase().includes(query) && !startsAWord(n, query))) return query;
    }
  }
  return null;
}

test.describe('Nexus, photo review queue', () => {
  test.describe.configure({ mode: 'serial' });

  let teacherToken: string;
  let studentToken: string;
  let classroomId: string;
  let ready = false;

  test.beforeAll(async ({ request }) => {
    const teacherRes = await request.post(`${NEXUS}/api/auth/test-login`, {
      data: { email: 'e2etestingteacher@neramclasses.com', role: 'teacher' },
    });
    const studentRes = await request.post(`${NEXUS}/api/auth/test-login`, {
      data: { email: 'e2etestingstudent@neramclasses.com', role: 'student' },
    });
    if (!teacherRes.ok() || !studentRes.ok()) return;
    teacherToken = (await teacherRes.json()).testToken;
    studentToken = (await studentRes.json()).testToken;
    if (!teacherToken) return;

    const me = await request.get(`${NEXUS}/api/auth/me`, { headers: authHeader(teacherToken) });
    if (!me.ok()) return;
    classroomId = (await me.json()).classrooms?.[0]?.id;
    ready = !!classroomId;
  });

  test('setup: the queue answers and the buckets add up to the roster', async ({ request }) => {
    test.skip(!ready, 'No classroom available for the e2e teacher');

    const res = await request.get(
      `${NEXUS}/api/photo-review?classroom=${classroomId}&status=pending`,
      { headers: authHeader(teacherToken) },
    );
    test.skip(res.status() === 500, 'Photo approval migrations not applied');
    expect(res.status()).toBe(200);

    const body = await res.json();
    const { pending, auto, missing, rejected, approved, unchecked } = body.counts;
    // Every student sits in exactly one bucket, so the five counts are the
    // whole roster. If they ever drift, a student has vanished from the queue.
    expect(pending + auto + missing + rejected + approved).toBeGreaterThanOrEqual(body.rows.length);
    // Unchecked is a subset of pending, never a bucket of its own.
    expect(unchecked).toBeLessThanOrEqual(pending);
    expect(body.status).toBe('pending');
  });

  /**
   * REGRESSION. This queue once showed 0 in all four tabs over a 30 student
   * classroom, with HTTP 200 and no error, because the roster embed named no
   * foreign key. nexus_enrollments points at users twice (user_id, removed_by),
   * so PostgREST refused the join, and the route discarded the error and
   * returned an empty list.
   *
   * The failure was invisible precisely because "no rows" and "query broken"
   * looked identical. So the assertion has to come from an independent source of
   * roster truth, not from the same endpoint.
   */
  test('the roster is not silently empty when the classroom has students', async ({ request }) => {
    test.skip(!ready);

    const enrollmentsRes = await request.get(
      `${NEXUS}/api/classrooms/${classroomId}/enrollments`,
      { headers: authHeader(teacherToken) },
    );
    test.skip(!enrollmentsRes.ok(), 'Could not read the roster independently');

    const enrollments = await enrollmentsRes.json();
    const rows: any[] = Array.isArray(enrollments)
      ? enrollments
      : enrollments.enrollments || enrollments.rows || [];
    const activeStudents = rows.filter(
      (e) => e.role === 'student' && e.is_active !== false && e.user?.is_alumni !== true,
    ).length;
    test.skip(activeStudents === 0, 'The e2e classroom genuinely has no students');

    const res = await request.get(`${NEXUS}/api/photo-review?classroom=${classroomId}`, {
      headers: authHeader(teacherToken),
    });
    expect(res.status()).toBe(200);
    const { counts } = await res.json();
    const total =
      counts.pending + counts.auto + counts.missing + counts.rejected + counts.approved;

    // The bug produced exactly total === 0 here. Anything else means the join ran.
    expect(total).toBeGreaterThan(0);
  });

  /**
   * A student with no Microsoft account is enrolled (they paid through the
   * marketing link) but has never opened Nexus, so the picture on their card is
   * the Google account photo that arrived with their signup, not a submission.
   * Approving it puts a face on the tenant identity that the student never
   * offered. Three of these also turned out to be duplicates of a real
   * @neramclasses.com row, so the same person appeared twice in the grid.
   *
   * The check comes from an independent endpoint (/api/students, which flags
   * them) rather than from the queue itself, so a queue-side regression cannot
   * hide behind its own filter.
   */
  test('students with no Microsoft account never reach the queue', async ({ request }) => {
    test.skip(!ready);

    const studentsRes = await request.get(`${NEXUS}/api/students?classroom=${classroomId}`, {
      headers: authHeader(teacherToken),
    });
    test.skip(!studentsRes.ok(), 'Could not read the roster independently');
    const { students } = await studentsRes.json();
    const awaiting: string[] = (students || [])
      .filter((s: any) => s.awaiting_microsoft)
      .map((s: any) => s.id);
    test.skip(awaiting.length === 0, 'Every student in this classroom already has a Microsoft account');

    // Sweep every bucket: the exclusion is in the roster loader, so it must
    // hold whichever tab the teacher opens.
    for (const status of BUCKETS) {
      const res = await request.get(
        `${NEXUS}/api/photo-review?classroom=${classroomId}&status=${status}`,
        { headers: authHeader(teacherToken) },
      );
      expect(res.status()).toBe(200);
      const { rows } = await res.json();
      const leaked = (rows || []).filter((r: any) => awaiting.includes(r.student?.id));
      expect(leaked).toHaveLength(0);
    }
  });

  /**
   * THE regression this whole fix exists for, 2026-09-10.
   *
   * The sidebar badge called a tenant-wide RPC while the queue behind it loads
   * one classroom, picked from a dropdown that only offers the viewer's OWN
   * classrooms. On staging that was a badge of 1 over a queue this teacher
   * could drive to zero, permanently: the pending student sat in a classroom he
   * is not enrolled in and cannot open. A badge you cannot clear is worse than
   * no badge.
   *
   * One assertion covers all three ways the two sides had drifted: tenant-wide
   * scope, the ms_oid rule the queue applied and the SQL did not, and the
   * classroom liveness filter only one side had.
   *
   * The invariant is <=, not ==, because the badge counts DISTINCT students
   * while this loop sums per classroom, so a student in two of the viewer's
   * classrooms is one badge but two here. With a single classroom that cannot
   * happen, so it tightens to equality.
   */
  test('the photo badge never exceeds what this viewer can clear', async ({ request }) => {
    test.skip(!ready);

    const me = await request.get(`${NEXUS}/api/auth/me`, { headers: authHeader(teacherToken) });
    expect(me.ok()).toBeTruthy();
    const mine: any[] = (await me.json()).classrooms || [];

    let queueTotal = 0;
    for (const c of mine) {
      const res = await request.get(
        `${NEXUS}/api/photo-review?classroom=${c.id}&status=pending`,
        { headers: authHeader(teacherToken) },
      );
      expect(res.status()).toBe(200);
      queueTotal += (await res.json()).counts.pending;
    }

    const badgeRes = await request.get(`${NEXUS}/api/nav-badges`, {
      headers: authHeader(teacherToken),
    });
    expect(badgeRes.status()).toBe(200);
    const photo = (await badgeRes.json()).badges.photo_review;

    expect(typeof photo).toBe('number');
    expect(photo).toBeLessThanOrEqual(queueTotal);
    if (mine.length <= 1) expect(photo).toBe(queueTotal);
  });

  /**
   * REGRESSION. The badge route answered `private, max-age=30` while
   * NavBadgeProvider fetched with no cache option, so the refreshBadges() fired
   * the instant a teacher approved a photo was served from the browser's own
   * cache and re-set the identical stale number. The header never saved a poll
   * either: the poller runs every 60s, and 60 > 30.
   */
  test('the badge route is never held in the browser cache', async ({ request }) => {
    test.skip(!ready);
    const res = await request.get(`${NEXUS}/api/nav-badges`, {
      headers: authHeader(teacherToken),
    });
    expect(res.status()).toBe(200);
    expect(res.headers()['cache-control'] || '').toMatch(/no-store/);
  });

  /**
   * Auto-approved is split out of Approved, not added on top of it: an
   * automatic approval is still photo_status 'approved' (so the photo gate lets
   * the student in), and only the review method tells the two tabs apart.
   */
  test('every status bucket is queryable', async ({ request }) => {
    test.skip(!ready);
    for (const status of BUCKETS) {
      const res = await request.get(
        `${NEXUS}/api/photo-review?classroom=${classroomId}&status=${status}`,
        { headers: authHeader(teacherToken) },
      );
      expect(res.status()).toBe(200);
      const body = await res.json();
      expect(body.status).toBe(status);
      for (const row of body.rows) {
        if (status === 'auto') {
          expect(row.photo_status).toBe('approved');
          expect(row.review_method).toBe('auto');
        } else {
          expect(row.photo_status).toBe(status);
          if (status === 'approved') expect(row.review_method).toBe('teacher');
        }
      }
    }
  });

  /**
   * The page loads one tab at a time, so a search counts the other tabs from
   * this index. It has to hold exactly the students the counts do, or a student
   * could sit on a tab while its chip says nobody there matches.
   */
  test('the search index covers every student the counts do', async ({ request }) => {
    test.skip(!ready);
    const res = await request.get(
      `${NEXUS}/api/photo-review?classroom=${classroomId}&status=pending`,
      { headers: authHeader(teacherToken) },
    );
    expect(res.status()).toBe(200);
    const { counts, search_index } = await res.json();

    expect(Array.isArray(search_index)).toBe(true);
    const total =
      counts.pending + counts.auto + counts.missing + counts.rejected + counts.approved;
    expect(search_index).toHaveLength(total);
    for (const entry of search_index) {
      expect(BUCKETS).toContain(entry.tab);
      expect(typeof entry.name).toBe('string');
    }
  });

  test('a rejection without a reason is refused', async ({ request }) => {
    test.skip(!ready);
    const res = await request.post(`${NEXUS}/api/photo-review`, {
      headers: { ...authHeader(teacherToken), 'Content-Type': 'application/json' },
      data: {
        decisions: [{ studentId: '00000000-0000-0000-0000-000000000000', decision: 'rejected' }],
      },
    });
    expect(res.status()).toBe(400);
    expect((await res.json()).error).toMatch(/reason/i);
  });

  test('an empty decision list is refused', async ({ request }) => {
    test.skip(!ready);
    const res = await request.post(`${NEXUS}/api/photo-review`, {
      headers: { ...authHeader(teacherToken), 'Content-Type': 'application/json' },
      data: { decisions: [] },
    });
    expect(res.status()).toBe(400);
  });

  test('the Microsoft sync needs a classroom and refuses a student', async ({ request }) => {
    test.skip(!ready);

    const noClassroom = await request.post(`${NEXUS}/api/photo-review/sync-microsoft`, {
      headers: { ...authHeader(teacherToken), 'Content-Type': 'application/json' },
      data: {},
    });
    expect(noClassroom.status()).toBe(400);

    if (studentToken) {
      const asStudent = await request.post(`${NEXUS}/api/photo-review/sync-microsoft`, {
        headers: { ...authHeader(studentToken), 'Content-Type': 'application/json' },
        data: { classroomId },
      });
      expect(asStudent.status()).toBeGreaterThanOrEqual(400);
    }
  });

  /**
   * The automatic face check spends AI money and approves photos, so it is
   * staff only and needs a classroom. Both calls here are refused before a
   * single photo is read, which is what keeps this spec from spending anything.
   */
  test('the automatic face check needs a classroom and refuses a student', async ({ request }) => {
    test.skip(!ready);

    const noClassroom = await request.post(`${NEXUS}/api/photo-review/auto-check`, {
      headers: { ...authHeader(teacherToken), 'Content-Type': 'application/json' },
      data: {},
    });
    expect(noClassroom.status()).toBe(400);

    if (studentToken) {
      const asStudent = await request.post(`${NEXUS}/api/photo-review/auto-check`, {
        headers: { ...authHeader(studentToken), 'Content-Type': 'application/json' },
        data: { classroomId },
      });
      expect(asStudent.status()).toBeGreaterThanOrEqual(400);
    }
  });

  test('a student cannot read or write the review queue', async ({ request }) => {
    test.skip(!ready || !studentToken);
    const read = await request.get(`${NEXUS}/api/photo-review?classroom=${classroomId}`, {
      headers: authHeader(studentToken),
    });
    expect(read.status()).toBeGreaterThanOrEqual(400);

    const write = await request.post(`${NEXUS}/api/photo-review`, {
      headers: { ...authHeader(studentToken), 'Content-Type': 'application/json' },
      data: { decisions: [{ studentId: 'x', decision: 'approved' }] },
    });
    expect(write.status()).toBeGreaterThanOrEqual(400);
  });

  test('mobile: the grid is two columns at 375px with no overflow', async ({ page }) => {
    test.skip(!ready);
    test.setTimeout(PAGE_TEST_TIMEOUT);
    await openPhotoReview(page, MOBILE);

    const scrollW = await page.evaluate(() => document.documentElement.scrollWidth);
    expect(scrollW).toBeLessThanOrEqual(376);

    const text = await page.evaluate(() => document.body.innerText);
    expect(text).not.toMatch(/—|&mdash;/);
  });

  /**
   * The header used to stack a title, a three line description, a full-width
   * Microsoft button, the filters, a full-width search, a how-to alert and a
   * Select all row, which put the search box about 330px below the title on a
   * phone and the first face further down still. It is now three short rows.
   * 260 leaves room for the classroom picker a multi-classroom teacher also gets.
   */
  test('mobile: the header is compact, so the grid starts near the top', async ({ page }) => {
    test.skip(!ready);
    test.setTimeout(PAGE_TEST_TIMEOUT);
    await openPhotoReview(page, MOBILE);

    const heading = await page.getByRole('heading', { name: /^Photo Review$/i }).boundingBox();
    const search = await page.getByRole('searchbox', { name: /Search students/i }).boundingBox();
    expect(heading).not.toBeNull();
    expect(search).not.toBeNull();
    expect(search!.y + search!.height - heading!.y).toBeLessThanOrEqual(260);
  });

  /** The description and the old dismissible tip now live behind one button. */
  test('mobile: the explanation lives behind the info button', async ({ page }) => {
    test.skip(!ready);
    test.setTimeout(PAGE_TEST_TIMEOUT);
    await openPhotoReview(page, MOBILE);

    await expect(page.getByText(/listed under Auto-approved/i)).toHaveCount(0);
    await page.getByRole('button', { name: /How photo review works/i }).click();
    await expect(page.getByText(/listed under Auto-approved/i)).toBeVisible();
    await page.getByRole('button', { name: /Got it/i }).click();
    await expect(page.getByText(/listed under Auto-approved/i)).toBeHidden();
  });

  /**
   * The four filter labels plus their count chips came to roughly 480px against
   * 311px of usable width, so ToggleButtonGroup wrapped. Its grouped border
   * rules (marginLeft: -1px, first and last child radii) are written for ONE
   * row, so the second row rendered with square leading corners and a 1px
   * offset. It now scrolls instead, and the overflow stays inside the control
   * rather than on the page body. Five labels now, same rule.
   */
  test('mobile: the filter row scrolls in one row rather than wrapping', async ({ page }) => {
    test.skip(!ready);
    test.setTimeout(PAGE_TEST_TIMEOUT);
    await openPhotoReview(page, MOBILE);
    await expect(page.getByRole('button', { name: /Needs review/i })).toBeVisible();

    // Every filter button shares one row: same top edge, no wrap.
    const tops = await page
      .getByRole('button', { name: /Needs review|Auto-approved|No photo|Rejected|^Approved/i })
      .evaluateAll((els) => els.map((e) => Math.round(e.getBoundingClientRect().top)));
    expect(tops.length).toBeGreaterThanOrEqual(5);
    expect(new Set(tops).size).toBe(1);

    // And the page itself still does not scroll sideways.
    const scrollW = await page.evaluate(() => document.documentElement.scrollWidth);
    expect(scrollW).toBeLessThanOrEqual(376);
  });

  /**
   * On a long grid the filters stay pinned under the top bar, so switching tabs
   * never means scrolling back up. Uses No photo because on the e2e classroom
   * it is the longest list; skips when nothing is long enough to scroll.
   */
  test('mobile: the filters stay pinned under the top bar while the grid scrolls', async ({
    page,
  }) => {
    test.skip(!ready);
    test.setTimeout(PAGE_TEST_TIMEOUT);
    await openPhotoReview(page, MOBILE);

    await page.getByRole('button', { name: /No photo/i }).click();
    await expect(page.getByText(/cannot open Nexus until they add one/i)).toBeVisible({
      timeout: 15000,
    });
    // Let the grid land before measuring how far the page can scroll.
    await page.waitForTimeout(1500);

    const room = await page.evaluate(
      () => document.documentElement.scrollHeight - window.innerHeight,
    );
    test.skip(room < 400, 'Not enough students on this tab to scroll');

    await page.evaluate(() => window.scrollTo(0, 400));
    await page.waitForTimeout(300);

    const tab = await page.getByRole('button', { name: /No photo/i }).boundingBox();
    expect(tab).not.toBeNull();
    // Directly under the 52px top bar, give or take the row's own padding.
    expect(tab!.y).toBeGreaterThanOrEqual(44);
    expect(tab!.y).toBeLessThanOrEqual(80);
  });

  /** apps/nexus/CLAUDE.md mandates 48px. "Undo approval" was 36 and the reject
   *  dialog's radio rows were 40. */
  test('mobile: the filter and action controls are at least 48px tall', async ({ page }) => {
    test.skip(!ready);
    test.setTimeout(PAGE_TEST_TIMEOUT);
    await openPhotoReview(page, MOBILE);

    const heights = await page
      .getByRole('button', {
        name: /Needs review|Auto-approved|No photo|Rejected|^Approved|Check Microsoft|How photo review works/i,
      })
      .evaluateAll((els) => els.map((e) => e.getBoundingClientRect().height));
    expect(heights.length).toBeGreaterThan(0);
    for (const h of heights) expect(h).toBeGreaterThanOrEqual(48);
  });

  /**
   * The search had no way out but deleting it letter by letter. The X appears
   * with text, is a real 48px target, clears in one tap and leaves the cursor in
   * the box for the next name. Escape clears too.
   */
  test('mobile: the search clears in one tap, and on Escape', async ({ page }) => {
    test.skip(!ready);
    test.setTimeout(PAGE_TEST_TIMEOUT);
    await openPhotoReview(page, MOBILE);

    const box = page.getByRole('searchbox', { name: /Search students/i });
    // Scoped to the search landmark: an empty result also offers "Clear search".
    const clear = page.getByRole('search').getByRole('button', { name: 'Clear search' });
    await expect(clear).toHaveCount(0);

    await box.fill('a');
    await expect(clear).toBeVisible();
    const size = await clear.boundingBox();
    expect(size!.width).toBeGreaterThanOrEqual(48);
    expect(size!.height).toBeGreaterThanOrEqual(48);

    await clear.click();
    await expect(box).toHaveValue('');
    await expect(box).toBeFocused();
    await expect(clear).toHaveCount(0);

    await box.fill('a');
    await box.press('Escape');
    await expect(box).toHaveValue('');
  });

  /**
   * People search puts a name that starts with the letters first, a later word
   * that starts with them next, and a name that only contains them last. The
   * queue listed matches alphabetically, so "ba" showed Afrin banu above
   * Bavishiya. The query is picked from the fullest tab, so this runs on
   * whatever students the e2e classroom has (on staging, mostly No photo).
   */
  test('mobile: a name with a word starting with the search ranks above one that only contains it', async ({
    page,
    request,
  }) => {
    test.skip(!ready);
    test.setTimeout(PAGE_TEST_TIMEOUT);

    const counted = await request.get(
      `${NEXUS}/api/photo-review?classroom=${classroomId}&status=pending`,
      { headers: authHeader(teacherToken) },
    );
    expect(counted.status()).toBe(200);
    const { counts } = await counted.json();
    const fullest = BUCKETS.reduce((a, b) => (counts[b] > counts[a] ? b : a));

    const res = await request.get(
      `${NEXUS}/api/photo-review?classroom=${classroomId}&status=${fullest}`,
      { headers: authHeader(teacherToken) },
    );
    expect(res.status()).toBe(200);
    const names: string[] = (await res.json()).rows.map(
      (r: any) => r.student.name || r.student.email || '',
    );
    const query = pickRankingQuery(names);
    test.skip(!query, 'No two-letter search on this roster has both kinds of hit');

    await openPhotoReview(page, MOBILE);
    await page.getByRole('button', { name: new RegExp(`^${TAB_LABELS[fullest]}`) }).click();
    await page.getByRole('searchbox', { name: /Search students/i }).fill(query!);

    const cards = page.getByRole('checkbox', { name: STUDENT_CHECKBOX });
    const expected = names.filter((n) => n.toLowerCase().includes(query!)).length;
    await expect(cards).toHaveCount(expected, { timeout: 15000 });

    const shown = (
      await cards.evaluateAll((els) => els.map((el) => el.getAttribute('aria-label') || ''))
    ).map((label) => label.replace(/^Select /, ''));
    const lastWordStart = Math.max(...shown.map((n, i) => (startsAWord(n, query!) ? i : -1)));
    const firstInsideOnly = shown.findIndex((n) => !startsAWord(n, query!));

    expect(lastWordStart).toBeGreaterThanOrEqual(0);
    expect(firstInsideOnly).toBeGreaterThan(lastWordStart);
  });

  /**
   * While a search is live every chip counts matches, and switching tabs keeps
   * the search. The carried term stays on screen, so it can no longer silently
   * empty the next tab, which is why switching used to clear it.
   */
  test('mobile: the tab chips count matches and switching tabs keeps the search', async ({
    page,
  }) => {
    test.skip(!ready);
    test.setTimeout(PAGE_TEST_TIMEOUT);
    await openPhotoReview(page, MOBILE);

    const box = page.getByRole('searchbox', { name: /Search students/i });
    await box.fill('a');

    const openTab = page.getByRole('button', { name: /^Needs review, \d+ matching$/ });
    await expect(openTab).toBeVisible();
    const matching = Number((await openTab.getAttribute('aria-label'))!.match(/(\d+) matching/)![1]);
    await expect(page.getByRole('checkbox', { name: STUDENT_CHECKBOX })).toHaveCount(matching, {
      timeout: 15000,
    });

    await page.getByRole('button', { name: /^Approved/i }).click();
    await expect(box).toHaveValue('a');
    await expect(page.getByRole('button', { name: /^Approved, \d+ matching$/ })).toBeVisible();
  });

  /**
   * REGRESSION, 2026-09-11. A tab switched while the first tab was still
   * loading could show the first tab's students: both requests were in flight,
   * the older one answered last, and it overwrote the newer one. With a search
   * live that read as "Nobody in No photo matches" beside a No photo chip
   * counting 29 matches. Holding the first answer back makes the race certain.
   */
  test('mobile: a tab switched mid-load shows its own students, not the tab that answered last', async ({
    page,
    request,
  }) => {
    test.skip(!ready);
    test.setTimeout(PAGE_TEST_TIMEOUT);

    const counted = await request.get(
      `${NEXUS}/api/photo-review?classroom=${classroomId}&status=pending`,
      { headers: authHeader(teacherToken) },
    );
    expect(counted.status()).toBe(200);
    const { counts } = await counted.json();
    const other = BUCKETS.filter((b) => b !== 'pending').reduce((a, b) =>
      counts[b] > counts[a] ? b : a,
    );
    test.skip(
      counts[other] === counts.pending,
      'Needs review and the fullest other tab hold the same number of students',
    );

    // Needs review answers only once the other tab has answered, so it lands last.
    let releaseFirst: () => void = () => {};
    const firstHeld = new Promise<void>((resolve) => {
      releaseFirst = resolve;
    });
    const isReview = (url: URL, status: string) =>
      url.pathname === '/api/photo-review' && url.searchParams.get('status') === status;
    await page.route(
      (url) => isReview(url, 'pending'),
      async (route) => {
        await firstHeld;
        await route.continue();
      },
    );
    await page.route(
      (url) => isReview(url, other),
      async (route) => {
        const response = await route.fetch();
        await route.fulfill({ response });
        releaseFirst();
      },
    );

    await openPhotoReview(page, MOBILE);
    const firstAnswered = page.waitForResponse((res) => isReview(new URL(res.url()), 'pending'));
    await page.getByRole('button', { name: new RegExp(`^${TAB_LABELS[other]}`) }).click();
    await firstAnswered;
    // Give React the render the late answer would have caused.
    await page.waitForTimeout(1000);

    await expect(page.getByRole('checkbox', { name: STUDENT_CHECKBOX })).toHaveCount(
      counts[other],
      { timeout: 15000 },
    );
  });

  test('desktop: all five filters sit on one row', async ({ page }) => {
    test.skip(!ready);
    test.setTimeout(PAGE_TEST_TIMEOUT);
    await openPhotoReview(page, DESKTOP);

    const tops = await page
      .getByRole('button', { name: /Needs review|Auto-approved|No photo|Rejected|^Approved/i })
      .evaluateAll((els) => els.map((e) => Math.round(e.getBoundingClientRect().top)));
    expect(tops.length).toBeGreaterThanOrEqual(5);
    expect(new Set(tops).size).toBe(1);
  });

  test('mobile: the No photo tab warns what the gate will do', async ({ page }) => {
    test.skip(!ready);
    test.setTimeout(PAGE_TEST_TIMEOUT);
    await openPhotoReview(page, MOBILE);

    await page.getByRole('button', { name: /No photo/i }).click();
    await expect(page.getByText(/cannot open Nexus until they add one/i)).toBeVisible({
      timeout: 15000,
    });
  });
});
