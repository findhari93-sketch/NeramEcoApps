import { test, expect, type APIRequestContext } from '@playwright/test';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { assertNoHorizontalOverflow, assertTouchTargetSize } from '../utils/mobile-helpers';

/**
 * /reviews as the source of truth (review links Phase 2): the facts block, the
 * verified badge, JSON-LD without a self-computed rating, the year / city /
 * mode / college filters, the switch-over that sends /testimonials to /reviews,
 * the homepage after the switch-over, and the online coaching page.
 *
 * Seeds published, verified testimonials named "E2E Hub ..." on the database
 * local Marketing reads (staging) and purges the "reviews" cache through the
 * real /api/revalidate route, so the dev server must run with the same
 * REVALIDATE_SECRET (default below). Leftovers, if a run crashes:
 *   delete from testimonials where student_name like 'E2E Hub%';
 */

const PREFIX = 'E2E Hub';
const CITY = 'E2E Hubcity';
const SECRET = process.env.REVALIDATE_SECRET || 'e2e-local-revalidate';

function admin(): SupabaseClient | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key, { auth: { persistSession: false } });
}
const db = admin();
const created: string[] = [];

test.describe.configure({ mode: 'serial' });

async function seed(rows: Array<Record<string, unknown>>) {
  const { data, error } = await db!
    .from('testimonials')
    .insert(
      rows.map((r, i) => ({
        content: { en: `${r.student_name} found the drawing practice and mock tests really useful for the exam.` },
        exam_type: 'NATA',
        year: 2026,
        city: CITY,
        learning_mode: 'offline',
        rating: 5,
        source: 'staff',
        publication_status: 'published',
        is_active: true,
        consent_given_at: new Date().toISOString(),
        consent_by: 'staff_recorded',
        consent_display_name: r.student_name,
        moderated_at: new Date(Date.now() + i).toISOString(),
        is_verified_student: true,
        course_name: 'NATA Preparation',
        ...r,
      })),
    )
    .select('id');
  if (error) throw new Error(`seed failed: ${error.message}`);
  created.push(...(data || []).map((d: { id: string }) => d.id));
  return (data || []).map((d: { id: string }) => d.id);
}

async function purge(request: APIRequestContext) {
  const res = await request.post('/api/revalidate', {
    headers: { 'x-revalidate-secret': SECRET },
    data: { tags: ['reviews', 'public-review-stats', 'centers'] },
  });
  expect(res.status(), 'the dev server must run with the same REVALIDATE_SECRET').toBe(200);
}

test.beforeAll(async ({ request }) => {
  if (!db) return;
  await seed([
    { student_name: `${PREFIX} Asha`, year: 2026, learning_mode: 'online', college_admitted: 'E2E College North', rank: 120 },
    { student_name: `${PREFIX} Bala`, year: 2025, learning_mode: 'offline', college_admitted: 'E2E College South', percentile: 98.5 },
    { student_name: `${PREFIX} Chitra`, year: 2026, learning_mode: 'hybrid', college_admitted: 'E2E College North' },
  ]);
  await purge(request);
});

test.afterAll(async ({ request }) => {
  if (!db) return;
  if (created.length) await db.from('testimonials').delete().in('id', created);
  await db.from('testimonials').delete().like('student_name', `${PREFIX}%`);
  await purge(request);
});

test.describe('Reviews hub (mobile 375px)', () => {
  test.use({ viewport: { width: 375, height: 812 }, hasTouch: true, isMobile: true });
  test.beforeEach(() => test.skip(!db, 'needs Supabase service credentials'));

  test('AC1: facts block, verified badge, rank and mode on the card', async ({ page }) => {
    await page.goto('/reviews');
    await expect(page.getByTestId('review-facts')).toContainText(/published student review/);
    const card = page.getByRole('article').filter({ hasText: `${PREFIX} Asha` });
    await expect(card).toBeVisible();
    await expect(card.getByText('Verified student')).toBeVisible();
    await expect(card.getByText(/AIR 120 · Online classes/)).toBeVisible();
    await assertNoHorizontalOverflow(page);
  });

  test('AC2: JSON-LD states reviews and no self-computed rating', async ({ page }) => {
    await page.goto('/reviews');
    const blocks = await page.locator('script[type="application/ld+json"]').allTextContents();
    const all = blocks.join('\n');
    expect(all).toContain('"@type":"Review"');
    expect(all).not.toContain('AggregateRating');
  });

  test('AC3: filter by city and learning mode, share the URL, clear', async ({ page }) => {
    await page.goto('/reviews');
    await page.getByLabel('City').click();
    await page.getByRole('option', { name: CITY }).click();
    await expect(page.getByRole('status')).toHaveText('3 reviews match');
    await expect(page).toHaveURL(/city=E2E\+Hubcity|city=E2E%20Hubcity/);

    await page.getByLabel('How they studied').click();
    await page.getByRole('option', { name: 'Online classes' }).click();
    await expect(page.getByRole('status')).toHaveText('1 review matches');
    await expect(page.getByRole('article').filter({ hasText: `${PREFIX} Asha` })).toBeVisible();
    await assertNoHorizontalOverflow(page);
    await assertTouchTargetSize(page, '[role="combobox"]', 44);

    await page.getByRole('button', { name: 'Clear filters' }).first().click();
    await expect(page).not.toHaveURL(/city=/);
  });

  test('AC4: a shared filtered link opens filtered', async ({ page }) => {
    await page.goto(`/reviews?city=${encodeURIComponent(CITY)}&year=2025`);
    await expect(page.getByRole('status')).toHaveText('1 review matches');
    await expect(page.getByRole('article').filter({ hasText: `${PREFIX} Bala` })).toBeVisible();
  });

  test('a filter with no match says so and offers to clear', async ({ page }) => {
    await page.goto(`/reviews?city=${encodeURIComponent(CITY)}&year=2015`);
    await expect(page.getByText('No reviews match these filters')).toBeVisible();
  });
});

test.describe('Reviews hub API and switch-over', () => {
  test.beforeEach(() => test.skip(!db, 'needs Supabase service credentials'));

  test('search API filters and returns card fields only, edge-cacheable', async ({ request }) => {
    const res = await request.get(`/api/reviews/search?city=${encodeURIComponent(CITY)}&mode=online`);
    expect(res.status()).toBe(200);
    expect(res.headers()['cache-control']).toContain('s-maxage');
    const body = await res.json();
    expect(body.total).toBe(1);
    expect(Object.keys(body.reviews[0]).sort()).toEqual(
      ['body', 'city', 'collegeAdmitted', 'courseName', 'createdAt', 'displayName', 'examType', 'id', 'isFeatured', 'isVerified', 'learningMode', 'percentile', 'photo', 'rank', 'rating', 'year'].sort(),
    );
  });

  test('switch-over: /testimonials stays below 9 verified, redirects at 9, and the homepage follows', async ({ request }) => {
    const before = await request.get('/testimonials', { maxRedirects: 0 });
    expect(before.status(), 'staging must start with fewer than 9 verified published reviews').toBe(200);

    const extra = await seed(
      Array.from({ length: 6 }, (_, i) => ({ student_name: `${PREFIX} Extra ${i + 1}`, city: 'E2E Elsewhere' })),
    );
    await purge(request);
    const after = await request.get('/testimonials', { maxRedirects: 0 });
    expect([301, 308]).toContain(after.status());
    expect(after.headers()['location']).toMatch(/\/reviews$/);

    const home = await (await request.get('/api/testimonials?homepage=true')).json();
    expect(home.data.length).toBeGreaterThanOrEqual(9);
    expect(home.data.every((t: { student_name: string }) => typeof t.student_name === 'string')).toBe(true);
    expect(home.data.some((t: { student_name: string }) => t.student_name.startsWith(PREFIX))).toBe(true);

    // Back below the line: the page serves again.
    await db!.from('testimonials').delete().in('id', extra);
    await purge(request);
    expect((await request.get('/testimonials', { maxRedirects: 0 })).status()).toBe(200);
  });

  test('the online coaching page shows real reviews from online students', async ({ page }) => {
    await page.goto('/nata-online-coaching');
    await expect(page.getByRole('heading', { name: 'What our NATA online students say' })).toBeVisible();
    await expect(page.getByRole('article').filter({ hasText: PREFIX }).first()).toBeVisible();
  });
});
