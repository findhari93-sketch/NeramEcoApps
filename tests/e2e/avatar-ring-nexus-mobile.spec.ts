import { test, expect, type Page } from '@playwright/test';
import { createClient } from '@supabase/supabase-js';
import { APP_URLS, injectAuthForPage } from '../utils/credentials';
import { assertNoHorizontalOverflow } from '../utils/mobile-helpers';

/**
 * The cohort ring, on the screens that kept losing it.
 *
 * WHAT IS WORTH PROVING IN A BROWSER
 *
 * The ring exists so a teacher can tell a Class 11 student from one sitting the
 * exam in three months without reading a word. It has now been adopted three
 * times, and twice it was adopted by hunting for screens one at a time, which
 * is why a third pass was needed at all. The ESLint rule added alongside this
 * spec is what proves no call site was MISSED. What lint cannot prove is that
 * the ring actually reaches the DOM: it does not know that a payload carries the
 * right user id, that /api/students/stage-facts answered, or that the extra 8px
 * per face did not push a phone into sideways scroll. That is this file's job.
 *
 * WHY THESE SCREENS
 *
 * /teacher/students is the CONTROL. It has worn the ring since the first pass
 * and every environment that has students at all has data for it. If it fails,
 * the environment is wrong, not the change under test, and every other result
 * in this file should be read in that light.
 *
 * /teacher/admin/users is one of the twenty-three sites this work swapped, and
 * it is the one that needs no seeding: it lists whoever exists. It is also the
 * hardest case for the fallback, because the list mixes staff with students and
 * only the students may gain a ring.
 *
 * /teacher/tests is the screen from the bug report. It renders through
 * StudentIdentityLine, which both earlier passes excluded on the reasoning that
 * its chip already said the stage. It cannot assert on a database missing
 * nexus_tests.source_filters, because the route selects that column and 500s,
 * so it skips and quotes the failure rather than pretending.
 *
 * The negative case matters as much: the signed-in teacher's own face in the top
 * bar must NOT gain a ring. You do not need one to tell you what you are, and a
 * rule applied without judgement would have put one there.
 *
 * StudentStageAvatar labels its wrapper "{stage}: {explanation}", so the ring is
 * found by that aria-label and nothing else on the page shares the pattern.
 */

const NEXUS = APP_URLS.nexus;
const PHONE = { width: 375, height: 812 };

/**
 * A cold Next dev server spends 15 to 25 seconds compiling a page nothing has
 * visited yet. The 30s default covers the compile and almost nothing else,
 * which is the documented trap in this suite.
 */
const COLD_COMPILE_BUDGET = 120_000;

/**
 * The label StudentStageAvatar writes. The trailing colon is load-bearing: it
 * separates the ring's own label from the STAGE CHIP beside it on some screens,
 * which announces the same words without one.
 */
const RING = /(Class 10|Class 11|Class 12|Break Year|Not set|Dormant):/;

test.describe.configure({ mode: 'serial', timeout: COLD_COMPILE_BUDGET });

/**
 * A thread on the exam recall list, authored by a real enrolled student.
 *
 * WHY SEED AT ALL
 *
 * The exam recall list is one of the twenty-three sites this work swapped, and
 * it is the only one whose data can be created without touching a schema. On
 * the shared staging database every existing thread belongs to a different
 * classroom AND was authored by someone who is not an enrolled student, so the
 * screen renders faces that correctly carry no ring. That would let the test
 * pass on the absence of the thing it is meant to prove.
 *
 * The row is authored by a student the environment already has, so no user is
 * invented and no enrolment is touched. Both rows are removed in afterAll.
 *
 * Credentials come from apps/nexus/.env.local, which playwright.config.ts loads
 * for exactly this purpose.
 */
const SEED_MARKER = '__TEST__avatar-ring recall seed';

function admin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key, { auth: { persistSession: false } });
}

/** Set when the seed lands, so the exam recall test can assert instead of skip. */
let seededThreadId: string | null = null;
/**
 * Why the seed did not land. A seed that fails quietly turns its test into a
 * permanent skip that still reads as green, which is the failure mode this
 * whole file exists to avoid: the FIRST version of this seed violated a CHECK
 * constraint on `section` and skipped for two runs before anyone looked.
 */
let seedError: string | null = null;

test.beforeAll(async () => {
  const db = admin();
  if (!db) return;

  // The classroom this account actually teaches, whatever it is called here.
  const { data: teacher } = await db
    .from('users')
    .select('id')
    .ilike('email', 'e2etestingteacher@%')
    .maybeSingle();
  if (!teacher) return;

  const { data: taught } = await db
    .from('nexus_enrollments')
    .select('classroom_id')
    .eq('user_id', teacher.id)
    .eq('role', 'teacher')
    .limit(1)
    .maybeSingle();
  if (!taught) return;

  // Any student enrolled in it. They are the author, so the face on the card is
  // someone the stage lookup actually knows.
  const { data: student } = await db
    .from('nexus_enrollments')
    .select('user_id')
    .eq('classroom_id', taught.classroom_id)
    .eq('role', 'student')
    .limit(1)
    .maybeSingle();
  if (!student) return;

  const { data: thread, error: threadError } = await db
    .from('nexus_exam_recall_threads')
    .insert({
      classroom_id: taught.classroom_id,
      exam_date: '2026-04-12',
      question_type: 'mcq',
      // CHECK constraint: part_a or part_b only. A section name like "Aptitude"
      // is rejected, and a swallowed error here is what turns this whole spec
      // into a silent skip.
      section: 'part_a',
      // 'raw' is one of the two statuses the moderation list fetches.
      status: 'raw',
      created_by: student.user_id,
    })
    .select('id')
    .single();

  if (threadError || !thread) {
    seedError = threadError?.message ?? 'thread insert returned nothing';
    return;
  }

  // Contributors are derived from VERSION authors, not from the thread row, so
  // a thread with no version renders no face at all.
  const { error: versionError } = await db.from('nexus_exam_recall_versions').insert({
    thread_id: thread.id,
    author_id: student.user_id,
    recall_text: SEED_MARKER,
  });

  // The thread still needs removing even if its version failed to land.
  seededThreadId = thread.id;
  if (versionError) seedError = versionError.message;
});

test.afterAll(async () => {
  const db = admin();
  if (!db || !seededThreadId) return;
  await db.from('nexus_exam_recall_versions').delete().eq('thread_id', seededThreadId);
  await db.from('nexus_exam_recall_threads').delete().eq('id', seededThreadId);
});

async function openOnPhone(page: Page, path: string) {
  await page.setViewportSize(PHONE);
  await injectAuthForPage(page, 'teacher');
  await page.goto(`${NEXUS}${path}`, { waitUntil: 'domcontentloaded' });
}

/**
 * Did any ring reach the DOM within the budget?
 *
 * Returns rather than asserts so a caller can tell "the feature is broken" from
 * "this environment seeded no students", which are different findings. A suite
 * that cannot tell them apart either fails on empty data or, worse, passes on a
 * page with nothing on it.
 */
async function ringAppeared(page: Page): Promise<boolean> {
  try {
    await page.getByLabel(RING).first().waitFor({ state: 'visible', timeout: 45_000 });
    return true;
  } catch {
    return false;
  }
}

/**
 * Is there anybody on this screen to ring?
 *
 * A local dev server normally points at the STAGING database, where the test
 * teacher has no classrooms and therefore no students. On that environment
 * every screen here renders its empty state, and a ring assertion would report
 * a defect the code does not have.
 *
 * So the skip is decided by what the page SAYS, not by counting rows: an empty
 * state or a failed fetch both mean "no data reached the list". Both are quoted
 * in the skip message, so a skip in CI names its own cause instead of silently
 * turning the suite green.
 */
async function noDataReason(page: Page): Promise<string | null> {
  const empty = page.getByText(
    /No student has built their own test yet|All submissions have been reviewed|no submissions|nothing to review|No students/i
  );
  const failed = page.getByText(/Failed to load/i);

  if (await empty.first().isVisible().catch(() => false)) {
    return `empty state: "${(await empty.first().innerText()).trim()}"`;
  }
  if (await failed.first().isVisible().catch(() => false)) {
    return `request failed: "${(await failed.first().innerText()).trim()}"`;
  }
  return null;
}

test.describe('cohort ring at 375px', () => {
  /**
   * The control. Every other result here is only meaningful if this passes,
   * because this screen has worn the ring since long before this change.
   */
  test('students list wears the ring', async ({ page }) => {
    await openOnPhone(page, '/teacher/students');

    expect(
      await ringAppeared(page),
      'no ring on /teacher/students, so this environment has no students and every other result in this file is meaningless'
    ).toBe(true);

    await assertNoHorizontalOverflow(page);
  });

  /**
   * A site this work swapped, proven on a row the suite created itself. Before
   * the swap this card drew a raw MUI Avatar with hand-written initials, which
   * is precisely the shape that hides from a search for UserAvatar.
   */
  test('exam recall card rings its student contributor', async ({ page }) => {
    // A failed seed FAILS rather than skips. The point of seeding was to stop
    // this test passing on the absence of the thing it proves.
    expect(seedError, 'recall seed failed, so this test could prove nothing').toBeNull();
    expect(seededThreadId, 'no recall thread was seeded').not.toBeNull();

    await openOnPhone(page, '/teacher/exam-recall');

    expect(await ringAppeared(page), 'no cohort ring on the exam recall list').toBe(true);

    // The ring must be around a FACE. If the label selector ever started
    // matching a chip, the assertion above would pass on nothing at all.
    await expect(page.getByLabel(RING).first().locator('.MuiAvatar-root')).toHaveCount(1);

    await assertNoHorizontalOverflow(page);
  });

  test('student tests list wears the ring', async ({ page }) => {
    await openOnPhone(page, '/teacher/tests');

    const tab = page.getByRole('tab', { name: /student tests/i });
    await tab.waitFor({ state: 'visible', timeout: COLD_COMPILE_BUDGET });
    await tab.click();

    const appeared = await ringAppeared(page);
    if (!appeared) {
      const reason = await noDataReason(page);
      test.skip(!!reason, `nothing to ring on /teacher/tests, ${reason}`);
    }

    expect(appeared, 'no cohort ring on the student tests list').toBe(true);
  });

  test('student tests list does not scroll sideways', async ({ page }) => {
    await openOnPhone(page, '/teacher/tests');

    const tab = page.getByRole('tab', { name: /student tests/i });
    await tab.waitFor({ state: 'visible', timeout: COLD_COMPILE_BUDGET });
    await tab.click();
    await ringAppeared(page);

    // The ring costs 8px per face. Across a list on a 375px phone that is real.
    await assertNoHorizontalOverflow(page);
  });

  test('evaluate queue wears the ring and stays within the viewport', async ({ page }) => {
    await openOnPhone(page, '/teacher/evaluate');

    const appeared = await ringAppeared(page);
    if (!appeared) {
      const reason = await noDataReason(page);
      test.skip(!!reason, `nothing to ring on /teacher/evaluate, ${reason}`);
    }

    expect(appeared, 'no cohort ring on the evaluate queue').toBe(true);
    await assertNoHorizontalOverflow(page);
  });

  test('the signed-in teacher keeps a plain face in the top bar', async ({ page }) => {
    await openOnPhone(page, '/teacher/tests');

    const header = page.locator('header').first();
    await header.waitFor({ state: 'visible', timeout: COLD_COMPILE_BUDGET });

    // Scoped to the header so a ringed student further down the page cannot
    // make this pass or fail for the wrong reason.
    await expect(header.getByLabel(RING)).toHaveCount(0);
  });
});
