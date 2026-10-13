import { test, expect, type Page } from '@playwright/test';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { randomBytes } from 'node:crypto';
import { assertNoHorizontalOverflow, assertTouchTargetSize } from '../utils/mobile-helpers';

/**
 * The review link a past student opens: /r/<token> on Marketing.
 *
 * Seeds its own review_requests rows on the database local Marketing points at
 * (staging), all named "E2E Review ..." so a crashed run is easy to clean:
 *   delete from testimonials where student_name like 'E2E Review%' or consent_display_name like 'E2E Review%';
 *   delete from review_requests where student_name like 'E2E Review%';
 * AI compose is mocked in the browser so the run costs nothing and never flakes
 * on Gemini. The Admin screens need a staff session (Entra MFA keeps that out of
 * Playwright); their logic is covered by the review-requests unit tests.
 */

const PREFIX = 'E2E Review';
const COIMBATORE = '998ca9d0-9e41-4b4f-8a28-25411f1054a7';
const E2E_GOOGLE_URL = 'https://search.google.com/local/writereview?placeid=E2E_TEST_PLACE_ID_000';

function admin(): SupabaseClient | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key, { auth: { persistSession: false } });
}

const db = admin();
let seededGoogleLink = false;
let seedError: string | null = null;
/** Only what this run made is deleted, never another run's rows. */
const createdIds: string[] = [];

// One worker for the whole file: the temporary Google link is unique per centre,
// so two workers seeding and removing it would race each other.
test.describe.configure({ mode: 'serial' });

async function seedRequest(over: Record<string, unknown> = {}): Promise<{ id: string; token: string }> {
  const token = `e2e_${randomBytes(24).toString('base64url')}`;
  const { data, error } = await db!
    .from('review_requests')
    .insert({
      token,
      status: 'active',
      student_name: `${PREFIX} Priya Sharma`,
      exam_type: 'NATA',
      exam_year: 2026,
      air_rank: 142,
      college_admitted: 'SPA Delhi',
      center_id: COIMBATORE,
      city: 'Coimbatore',
      learning_mode: 'offline',
      expires_at: new Date(Date.now() + 7 * 86_400_000).toISOString(),
      ...over,
    })
    .select('id, token')
    .single();
  if (error) throw new Error(`seed failed: ${error.message}`);
  createdIds.push((data as { id: string }).id);
  return data as { id: string; token: string };
}

test.beforeAll(async () => {
  if (!db) {
    seedError = 'No Supabase service credentials in the environment.';
    return;
  }
  // A Google link for the Coimbatore centre, only if staging has none, so the
  // Google step can be asserted. Removed in afterAll.
  const { data: existing } = await db.from('review_platform_urls').select('id').eq('center_id', COIMBATORE).eq('platform', 'google').maybeSingle();
  if (!existing) {
    const { error } = await db.from('review_platform_urls').insert({ center_id: COIMBATORE, platform: 'google', review_url: E2E_GOOGLE_URL, is_active: true });
    if (error) seedError = error.message;
    else seededGoogleLink = true;
  }
});

test.afterAll(async () => {
  if (!db) return;
  if (createdIds.length) {
    const { data: reqs } = await db.from('review_requests').select('id, testimonial_id').in('id', createdIds);
    const testimonialIds = (reqs || []).map((r: any) => r.testimonial_id).filter(Boolean);
    await db.from('review_requests').update({ testimonial_id: null }).in('id', createdIds);
    if (testimonialIds.length) await db.from('testimonials').delete().in('id', testimonialIds);
    await db.from('review_requests').delete().in('id', createdIds);
  }
  if (seededGoogleLink) await db.from('review_platform_urls').delete().eq('center_id', COIMBATORE).eq('review_url', E2E_GOOGLE_URL);
});

async function mockCompose(page: Page, review: string) {
  await page.route('**/api/r/compose', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ ok: true, review, transcript: null, language: 'English', aiCallsLeft: 4 }),
    }),
  );
}

test.describe('Review link (mobile 375px)', () => {
  test.use({ viewport: { width: 375, height: 812 }, hasTouch: true, isMobile: true });

  test.beforeEach(() => {
    test.skip(!db, 'needs Supabase service credentials');
    expect(seedError, `seed problem: ${seedError}`).toBeNull();
  });

  test('AC1: shows the prefilled facts and fits the phone', async ({ page }) => {
    const { token } = await seedRequest();
    await page.goto(`/r/${token}`);
    await expect(page.getByRole('heading', { name: /Congratulations, E2E/ })).toBeVisible();
    await expect(page.getByText('SPA Delhi')).toBeVisible();
    await expect(page.getByText(/AIR 142/)).toBeVisible();
    await assertNoHorizontalOverflow(page);
    await assertTouchTargetSize(page, 'button:visible', 44);
  });

  test('AC2: rate, type, improve with AI, send, then see the Google step', async ({ page, context }) => {
    const { token } = await seedRequest();
    const polished = 'Neram helped me crack NATA 2026 with AIR 142. The drawing practice and mock tests made all the difference, and I am now at SPA Delhi.';
    await mockCompose(page, polished);
    await page.goto(`/r/${token}`);

    await page.getByRole('button', { name: 'Looks right, continue' }).click();
    await expect(page.getByRole('heading', { name: 'How was Neram for you?' })).toBeVisible();
    // Tap the star itself, as a student would; the radio input is visually hidden.
    await page.getByText('5 stars, Excellent', { exact: true }).locator('..').click();
    await expect(page.getByText('Excellent', { exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Mock tests' }).click();
    await page.getByRole('button', { name: 'Continue' }).click();

    await page.getByRole('button', { name: 'Prefer typing?' }).click();
    await page.getByLabel('Your review').fill('Neram teachers were very good. Drawing practice helped me a lot for NATA.');
    await page.getByRole('button', { name: 'Improve with AI' }).click();

    await expect(page.getByRole('heading', { name: 'Check your review' })).toBeVisible();
    await expect(page.getByLabel(/Your review \(you can edit it\)/)).toHaveValue(polished);
    // The student can switch back to their own words.
    await page.getByRole('button', { name: 'My words' }).click();
    await expect(page.getByLabel(/Your review \(you can edit it\)/)).toHaveValue(/Neram teachers were very good/);
    await page.getByRole('button', { name: 'AI version' }).click();

    await page.getByLabel(/Show my review with this name/).check();
    await assertNoHorizontalOverflow(page);
    await page.getByRole('button', { name: 'Send my review' }).click();

    await expect(page.getByRole('heading', { name: /Thank you/ })).toBeVisible();
    const googleButton = page.getByRole('button', { name: 'Copy review and open Google' });
    await expect(googleButton).toBeVisible();

    const popup = context.waitForEvent('page');
    await googleButton.click();
    const google = await popup;
    expect(google.url()).toContain('E2E_TEST_PLACE_ID');
    await google.close();

    await page.getByRole('button', { name: 'I posted it on Google' }).click();
    await expect(page.getByRole('button', { name: 'Thank you for posting on Google' })).toBeVisible();

    // Tracking is fire and forget (keepalive), so wait for it to land.
    const readRow = async () =>
      (await db!.from('review_requests').select('status, testimonial_id, google_clicked_at, google_posted_self_reported_at').eq('token', token).single()).data!;
    await expect.poll(async () => (await readRow()).google_posted_self_reported_at, { timeout: 10_000 }).not.toBeNull();
    const row = await readRow();
    expect(row.status).toBe('submitted');
    expect(row.google_clicked_at).not.toBeNull();
    const { data: t } = await db!.from('testimonials').select('publication_status, is_verified_student, original_text, rank, source').eq('id', row.testimonial_id).single();
    expect(t).toMatchObject({ publication_status: 'pending_moderation', is_verified_student: true, original_text: polished, rank: 142, source: 'learner' });
  });

  test('AC3: an expired or cancelled link explains itself and offers WhatsApp', async ({ page }) => {
    const { token } = await seedRequest({ status: 'cancelled' });
    await page.goto(`/r/${token}`);
    await expect(page.getByRole('heading', { name: 'This link cannot be opened' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Message Neram on WhatsApp' })).toHaveAttribute('href', /wa\.me/);

    await page.goto('/r/not-a-real-token');
    await expect(page.getByText(/This link is not valid/)).toBeVisible();
  });

  test('slow network shows a skeleton while the link opens', async ({ page }) => {
    const { token } = await seedRequest();
    await page.route('**/api/r/validate**', async (route) => {
      await new Promise((r) => setTimeout(r, 1500));
      await route.continue();
    });
    await page.goto(`/r/${token}`);
    await expect(page.getByLabel('Opening your review link')).toBeVisible();
    await expect(page.getByRole('heading', { name: /Congratulations/ })).toBeVisible({ timeout: 15_000 });
  });
});

test.describe('Review link API', () => {
  test.beforeEach(() => {
    test.skip(!db, 'needs Supabase service credentials');
  });

  test('a student can update while waiting, and is locked once staff moderate', async ({ request }) => {
    const { token } = await seedRequest();
    const body = {
      token,
      text: 'The classes were clear and the teachers were patient with every doubt I had.',
      rating: 4,
      displayName: `${PREFIX} P.`,
      consentToPublish: true,
      photoConsent: false,
      inputMode: 'typed',
    };
    const first = await request.post('/api/r/submit', { data: body });
    expect(first.status()).toBe(200);
    const again = await request.post('/api/r/submit', { data: { ...body, rating: 5 } });
    expect((await again.json()).updated).toBe(true);

    const { data: row } = await db!.from('review_requests').select('testimonial_id').eq('token', token).single();
    const { data: t } = await db!.from('testimonials').select('rating').eq('id', row!.testimonial_id).single();
    expect(t!.rating).toBe(5);

    await db!.from('testimonials').update({ publication_status: 'published', moderated_at: new Date().toISOString() }).eq('id', row!.testimonial_id);
    const locked = await request.post('/api/r/submit', { data: body });
    expect(locked.status()).toBe(409);
  });

  test('refuses without consent', async ({ request }) => {
    const { token } = await seedRequest();
    const res = await request.post('/api/r/submit', {
      data: { token, text: 'Long enough review text for the check.', rating: 5, displayName: 'P', consentToPublish: false },
    });
    expect(res.status()).toBe(400);
  });

  test('compose needs something to work on and a live link', async ({ request }) => {
    const { token } = await seedRequest();
    const empty = await request.post('/api/r/compose', { multipart: { token, text: 'hi' } });
    expect(empty.status()).toBe(400);
    const bad = await request.post('/api/r/compose', { multipart: { token: 'nope', text: 'A long enough text to compose from.' } });
    expect(bad.status()).toBe(404);
  });

  test('validate never returns the phone, ids or token', async ({ request }) => {
    const { token, id } = await seedRequest({ phone: '+919999900077' });
    const res = await request.get(`/api/r/validate?token=${token}`);
    expect(res.status()).toBe(200);
    const text = await res.text();
    expect(text).not.toContain('+919999900077');
    expect(text).not.toContain(id);
    expect(text).not.toContain(token);
    expect(res.headers()['cache-control']).toContain('no-store');
  });
});
