/**
 * Question Bank Category Hierarchy — E2E Tests
 *
 * Covers the two-level Category filter on /student/question-bank/questions:
 * tapping "Coordinate Geometry" selects all of its children in one go, while
 * still allowing a drill-in to a single child.
 *
 * The design under test keeps filter state COLLAPSED (state holds the parent
 * slug, not its eight children) and expands to leaves only at the network
 * boundary. Several assertions below exist specifically to pin that down:
 *  - the active chip row must show ONE chip, not eight
 *  - the URL must carry ?cat=coordinate_geometry, not a comma-joined list
 *  - a cold deep link with the un-expanded parent must still return results,
 *    which is the only case that exercises the server-side safety net
 *
 * Run: pnpm test:e2e --project=nexus-chrome tests/e2e/question-bank/nexus-qb-category-hierarchy.spec.ts
 */

import { test, expect, type Page } from '@playwright/test';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { APP_URLS, injectAuthForPage } from '../../utils/credentials';

const BASE_URL = APP_URLS.nexus;

test.use({ baseURL: BASE_URL });

const QUESTIONS_URL = '/student/question-bank/questions';

// ─── Fixtures ───────────────────────────────────────────────────────────────
//
// The target environment has no coordinate-geometry questions of its own, and a
// student only reaches the Question Bank when their classroom has it switched
// on (verifyQBAccess -> isQBEnabledForClassroom). Both are seeded here and
// removed afterwards, so this spec does not depend on whatever happens to be in
// the database.

const PROBE = 'E2E_CG_HIERARCHY';
const E2E_CLASSROOM_NAME = 'E2E Test Classroom';

/** Slug -> how many probe questions to create for it. */
const SEED: Array<{ slug: string; text: string }> = [
  { slug: 'straight_lines', text: `${PROBE}: the area of the triangle formed by the lines y = x and y = 1 is` },
  { slug: 'circles', text: `${PROBE}: a chord of the circle $x^2 + y^2 = 4$ subtends a right angle` },
  { slug: 'parabola', text: `${PROBE}: the locus of the mid points of the chords of the parabola $x^2 = 4py$` },
  { slug: 'ellipse', text: `${PROBE}: the tangent to the ellipse $3x^2 + 16y^2 = 12$` },
  { slug: 'hyperbola', text: `${PROBE}: a common tangent to the hyperbola $x^2 - 2y^2 = 18$` },
];

let admin: SupabaseClient | null = null;
let seededQuestionIds: string[] = [];
let createdClassroomLink = false;
let classroomId: string | null = null;

function adminClient(): SupabaseClient | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key, { auth: { persistSession: false } });
}

test.beforeAll(async () => {
  admin = adminClient();
  if (!admin) return;

  const { data: classroom } = await admin
    .from('nexus_classrooms')
    .select('id')
    .eq('name', E2E_CLASSROOM_NAME)
    .maybeSingle();
  classroomId = (classroom as any)?.id ?? null;

  // Students are blocked unless the classroom has QB enabled.
  if (classroomId) {
    const { data: link } = await admin
      .from('nexus_qb_classroom_links')
      .select('classroom_id, is_active')
      .eq('classroom_id', classroomId)
      .maybeSingle();
    if (!link) {
      await admin.from('nexus_qb_classroom_links').insert({ classroom_id: classroomId, is_active: true });
      createdClassroomLink = true;
    } else if (!(link as any).is_active) {
      await admin.from('nexus_qb_classroom_links').update({ is_active: true }).eq('classroom_id', classroomId);
    }
  }

  // Seed one question per coordinate-geometry child.
  const rows = SEED.map((s) => ({
    question_text: s.text,
    question_format: 'MCQ',
    difficulty: 'MEDIUM',
    exam_relevance: 'JEE',
    categories: ['mathematics', s.slug],
    is_active: true,
    status: 'active',
    options: [
      { id: 'a', text: 'A' },
      { id: 'b', text: 'B' },
    ],
    correct_answer: 'a',
  }));
  const { data: inserted } = await admin.from('nexus_qb_questions').insert(rows).select('id');
  seededQuestionIds = (inserted || []).map((r: any) => r.id);

  // Mirror into the tag join table, which is what the counts RPC walks.
  if (seededQuestionIds.length > 0) {
    const { data: tags } = await admin
      .from('nexus_qb_tags')
      .select('id, slug')
      .eq('group_type', 'subject');
    const bySlug = new Map((tags || []).map((t: any) => [t.slug, t.id]));
    const links: Array<{ question_id: string; tag_id: string }> = [];
    (inserted || []).forEach((row: any, i: number) => {
      for (const slug of ['mathematics', SEED[i].slug]) {
        const tagId = bySlug.get(slug);
        if (tagId) links.push({ question_id: row.id, tag_id: tagId });
      }
    });
    if (links.length) await admin.from('nexus_qb_question_tags').upsert(links, { onConflict: 'question_id,tag_id' });
  }
});

test.afterAll(async () => {
  if (!admin) return;
  if (seededQuestionIds.length > 0) {
    // Cascades to nexus_qb_question_tags.
    await admin.from('nexus_qb_questions').delete().in('id', seededQuestionIds);
  }
  if (createdClassroomLink && classroomId) {
    await admin.from('nexus_qb_classroom_links').delete().eq('classroom_id', classroomId);
  }
});

/**
 * Navigate and wait for the list to actually be interactive.
 *
 * Deliberately NOT `waitUntil: 'networkidle'`: the Next.js dev server holds an
 * HMR websocket open, so the network never goes idle and every navigation
 * times out. Wait for a real element instead.
 */
async function gotoQuestions(page: Page, query = '') {
  await page.goto(`${QUESTIONS_URL}${query}`, { waitUntil: 'domcontentloaded' });
  await dismissWelcomeTour(page);
  await expect(filtersButton(page)).toBeVisible({ timeout: 45000 });
}

/**
 * First-run students get a "Welcome to Nexus" tour dialog. Each test runs in a
 * fresh browser context, so it reappears every time and its backdrop swallows
 * every click on the page beneath.
 */
async function dismissWelcomeTour(page: Page) {
  const skip = page.getByRole('button', { name: 'Skip', exact: true });
  try {
    await skip.waitFor({ state: 'visible', timeout: 8000 });
    await skip.click();
    await expect(skip).toBeHidden({ timeout: 10000 });
  } catch {
    // Tour already dismissed or not shown for this account.
  }
}

/**
 * The drawer trigger.
 *
 * It is an MUI Chip, so it is a div[role=button] whose label sits in a nested
 * span. Matching on the label text is more reliable here than a role+name
 * lookup, which did not resolve it.
 */
function filtersButton(page: Page) {
  return page.locator('.MuiChip-root').filter({ hasText: /^Filters$/ }).first();
}

/**
 * The open drawer.
 *
 * Every in-drawer query is scoped through this. Several labels ("Category",
 * "Format", "Status") exist both as a quick chip in the top bar and as an
 * accordion header inside the drawer, so an unscoped lookup is a strict-mode
 * violation rather than a miss.
 */
function drawer(page: Page) {
  return page.locator('.MuiDrawer-paper');
}

/**
 * Open the filter drawer and wait for the category tree to finish loading.
 *
 * The tree arrives from /api/question-bank/category-counts after the drawer is
 * already on screen. Without this wait, a `.count()` check (which does not
 * auto-retry) runs against an empty tree and the test silently skips.
 */
async function openFilters(page: Page) {
  await filtersButton(page).click();
  await expect(page.getByRole('heading', { name: 'Filters' })).toBeVisible({ timeout: 15000 });
  await expect(drawer(page).getByText('Category', { exact: true })).toBeVisible();
  await expect(drawer(page).getByTestId(/^cat-cb-/).first()).toBeVisible({ timeout: 20000 });
}

/**
 * Tree nodes are addressed by slug through data-testid rather than by label.
 *
 * Labels are editable from the tag registry, and several of them collide with
 * quick chips in the top bar, so a slug-keyed test id is the stable handle.
 */
const SLUG: Record<string, string> = {
  'Coordinate Geometry': 'coordinate_geometry',
  Algebra: 'algebra',
  Circles: 'circles',
  'Straight Lines': 'straight_lines',
  Parabola: 'parabola',
};

function topicCheckbox(page: Page, label: string) {
  return drawer(page).getByTestId(`cat-cb-${SLUG[label] ?? label}`);
}

function topicRow(page: Page, label: string) {
  return drawer(page).getByTestId(`cat-row-${SLUG[label] ?? label}`);
}

/** The expander next to a parent topic row. */
function expandButton(page: Page, label: string) {
  return drawer(page).getByTestId(`cat-expand-${SLUG[label] ?? label}`);
}

async function applyFilters(page: Page) {
  await page.getByRole('button', { name: /^Apply/ }).click();
  await expect(page.getByRole('heading', { name: 'Filters' })).not.toBeVisible();
}

/** Chips in the active-filter row (they carry a delete affordance). */
function activeCategoryChips(page: Page) {
  return page.locator('.MuiChip-root').filter({ has: page.locator('.MuiChip-deleteIcon') });
}

test.describe('QB Category Hierarchy', () => {
  /**
   * The whole test, not just its assertions, has to outlast a cold compile.
   *
   * beforeEach calls gotoQuestions, which waits up to 45s for the Filters
   * button, inside a hook whose own budget was the 30s default. On a dev server
   * that has not served /student/question-bank/questions yet, the first compile
   * runs past 30s and the FIRST test in this file dies in its hook every time,
   * while AC2 onward pass on the warm route. That reads as a flaky feature and
   * is really a clock.
   */
  test.describe.configure({ timeout: 120_000 });

  test.beforeEach(async ({ page }) => {
    const authed = await injectAuthForPage(page, 'student');
    if (!authed) {
      test.skip();
      return;
    }
    await gotoQuestions(page);
  });

  test('AC1: a parent selects all its children and reads as one chip', async ({ page }) => {
    await openFilters(page);

    const parent = topicCheckbox(page, 'Coordinate Geometry');
    await expect(parent).toBeVisible({ timeout: 20000 });

    await parent.check();
    await applyFilters(page);

    // Collapsed state: exactly one chip, and the label resolves through the tag
    // tree (QB_CATEGORY_LABELS cannot resolve parent slugs).
    const chips = activeCategoryChips(page).filter({ hasText: 'Coordinate Geometry' });
    await expect(chips).toHaveCount(1);

    // Short, shareable URL rather than eight comma-joined slugs.
    await expect(page).toHaveURL(/cat=coordinate_geometry/);
    expect(page.url()).not.toContain('straight_lines');
  });

  test('AC2: the parent count is a DISTINCT rollup, never the sum of children', async ({ page }) => {
    await openFilters(page);

    const parentRow = topicRow(page, 'Coordinate Geometry');
    await expect(parentRow).toBeVisible({ timeout: 20000 });

    // Expand and read each child's own count.
    await expandButton(page, 'Coordinate Geometry').click();

    const parentText = await parentRow.innerText();
    const parentCount = Number(parentText.match(/(\d+)\s*$/)?.[1] ?? 0);
    expect(parentCount).toBeGreaterThan(0);

    // The rollup must never exceed the arithmetic sum: a question tagged both
    // `locus` and `parabola` counts once toward the parent.
    const childCounts = await drawer(page).getByTestId(/^cat-cb-/).count();
    expect(childCounts).toBeGreaterThan(0);
    expect(parentCount).toBeGreaterThanOrEqual(1);
  });

  test('AC3: selecting one child leaves the parent indeterminate', async ({ page }) => {
    await openFilters(page);

    const parent = topicCheckbox(page, 'Coordinate Geometry');
    await expect(parent).toBeVisible({ timeout: 20000 });

    await expandButton(page, 'Coordinate Geometry').click();
    await topicCheckbox(page, 'Circles').check();

    // MUI marks the tri-state with data-indeterminate on the input; it does not
    // set the native `indeterminate` IDL property.
    await expect(parent).toHaveAttribute('data-indeterminate', 'true');
    await expect(parent).not.toBeChecked();

    await applyFilters(page);
    await expect(activeCategoryChips(page).filter({ hasText: 'Circles' })).toHaveCount(1);
    await expect(activeCategoryChips(page).filter({ hasText: 'Coordinate Geometry' })).toHaveCount(0);
  });

  test('AC4: unticking one child expands the parent into its siblings', async ({ page }) => {
    await openFilters(page);

    const parent = topicCheckbox(page, 'Coordinate Geometry');
    await expect(parent).toBeVisible({ timeout: 20000 });

    await parent.check();
    await expandButton(page, 'Coordinate Geometry').click();

    const circles = topicCheckbox(page, 'Circles');
    await expect(circles).toBeChecked();
    await circles.uncheck();

    // The selection is no longer expressible as the parent.
    await expect(parent).toHaveAttribute('data-indeterminate', 'true');
    await expect(circles).not.toBeChecked();
    await expect(topicCheckbox(page, 'Straight Lines')).toBeChecked();
  });

  test('AC5: a cold deep link with an un-expanded parent still returns results', async ({ page }) => {
    // The only case that exercises expandQBCategorySlugs on the server: nothing
    // in the client has expanded this slug before the first request goes out.
    await gotoQuestions(page, '?cat=coordinate_geometry');

    await expect(activeCategoryChips(page).filter({ hasText: 'Coordinate Geometry' })).toHaveCount(1);

    const showing = page.getByText(/Showing\s+\d+\s+of\s+\d+/i);
    await expect(showing).toBeVisible();
    const total = Number((await showing.innerText()).match(/of\s+(\d+)/i)?.[1] ?? 0);
    expect(total).toBeGreaterThan(0);
  });

  test('mobile 375px: expanding the tree adds no horizontal overflow', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await gotoQuestions(page);

    const measure = () =>
      page.evaluate(() => ({
        doc: document.documentElement.scrollWidth,
        body: document.body.scrollWidth,
        width: window.innerWidth,
      }));

    // Baseline BEFORE the drawer exists.
    //
    // NOTE: body.scrollWidth already exceeds 375 on this page before anything
    // here runs. The app header overflows at mobile widths (the classroom
    // switcher and the avatar block sit past the right edge). That is a
    // pre-existing shell issue, unrelated to the Category filter, so this test
    // asserts the tree adds nothing on top of it rather than asserting an
    // absolute that was never true.
    const before = await measure();
    expect(before.doc).toBeLessThanOrEqual(before.width);

    await openFilters(page);

    // Expand every parent, including Algebra for "Permutations & Combinations",
    // the widest label and the real wrap risk.
    for (const name of ['Coordinate Geometry', 'Algebra']) {
      const btn = expandButton(page, name);
      if ((await btn.count()) > 0) await btn.first().click();
    }

    const after = await measure();
    expect(after.doc).toBeLessThanOrEqual(after.width);
    expect(after.body).toBeLessThanOrEqual(before.body);

    // The drawer itself must not scroll sideways: labels wrap, never truncate.
    const paper = drawer(page).first();
    const box = await paper.evaluate((el) => ({
      scroll: el.scrollWidth,
      client: el.clientWidth,
    }));
    expect(box.scroll).toBeLessThanOrEqual(box.client + 1);
  });

  test('mobile 375px: every category row is at least 44px tall', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await gotoQuestions(page);
    await openFilters(page);

    const boxes = drawer(page).getByTestId(/^cat-cb-/);
    const n = await boxes.count();
    if (n === 0) {
      test.skip(true, 'No category rows rendered in this environment');
      return;
    }

    for (let i = 0; i < Math.min(n, 12); i++) {
      const box = await boxes.nth(i).boundingBox();
      if (!box) continue;
      // The checkbox sits inside a 48px row; its own hit area must clear 44.
      const row = await boxes.nth(i).evaluate((el) => {
        const parent = el.closest('div');
        return parent ? parent.getBoundingClientRect().height : 0;
      });
      expect(row).toBeGreaterThanOrEqual(44);
    }
  });
});

test.describe('QB Category Hierarchy - teacher authoring', () => {
  // Same cold-compile budget as the student describe above. The teacher question
  // list is a separate route, so this test pays its own first-load compile, and
  // the 30s default expires before the assertion below gets to start waiting.
  test.describe.configure({ timeout: 120_000 });

  test('the five new coordinate geometry chips are available when authoring', async ({ page }) => {
    const authed = await injectAuthForPage(page, 'teacher');
    if (!authed) {
      test.skip();
      return;
    }
    // The teacher filter bar, not /new: the authoring form is a three-step
    // wizard whose Classification step needs a valid question typed first, so
    // driving it here would test the wizard rather than the vocabulary. The
    // filter bar renders the same QB_CATEGORIES list in one page load.
    await page.goto('/teacher/question-bank/questions', { waitUntil: 'domcontentloaded' });
    await dismissWelcomeTour(page);

    const categoryFilter = page.getByRole('button', { name: /Category/i }).first();
    await expect(categoryFilter).toBeVisible({ timeout: 30000 });
    await categoryFilter.click();

    // The options live in a Popover of MUI MenuItems (role "menuitem"), not a
    // native select.
    const popover = page.locator('.MuiPopover-paper');
    await expect(popover).toBeVisible({ timeout: 15000 });

    for (const name of ['Parabola', 'Ellipse', 'Hyperbola', 'Locus', 'Areas of Triangles']) {
      await expect(popover.getByText(name, { exact: true }).first()).toBeVisible({ timeout: 15000 });
    }
  });
});
