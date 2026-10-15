import { test, expect } from '@playwright/test';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { createHash, randomBytes } from 'crypto';
import { assertNoHorizontalOverflow } from '../../utils/mobile-helpers';
import { TEACHER_ACCOUNT } from '../../utils/credentials';

/**
 * No-login college update link (/college-update/<token>), the form staff send
 * on WhatsApp. Runs against local marketing (3010) on the STAGING database.
 *
 * Links are made here the way Admin makes them (32 random bytes base64url,
 * sha256 hex stored), which also proves the two apps agree on the token.
 * Borrows one free staging college with no fees and removes every row after.
 *
 * Run: pnpm test:e2e --project=marketing-chrome --no-deps tests/e2e/college-hub/college-update-link-marketing.spec.ts
 */

const MARKETING = 'http://localhost:3010';
const ADMIN = 'http://localhost:3013';
let db: SupabaseClient;
let college: { id: string; name: string };
const linkIds: string[] = [];

function service(): SupabaseClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are needed (apps/nexus/.env.local)');
  if (!/staging|hgxjavrsrvpihqrpezdh/.test(url)) throw new Error(`Refusing to run against a non-staging database: ${url}`);
  return createClient(url, key, { auth: { persistSession: false } });
}

async function makeLink(opts: { expiresInMs?: number; revoked?: boolean; sections?: string[] } = {}): Promise<string> {
  const token = randomBytes(32).toString('base64url');
  const { data, error } = await db
    .from('college_update_links')
    .insert({
      college_id: college.id,
      token_hash: createHash('sha256').update(token).digest('hex'),
      sections: opts.sections ?? ['profile', 'fees', 'admissions', 'location', 'photos'],
      recipient_name: 'E2E Principal',
      expires_at: new Date(Date.now() + (opts.expiresInMs ?? 14 * 86_400_000)).toISOString(),
      revoked_at: opts.revoked ? new Date().toISOString() : null,
      created_by: 'e2e',
    })
    .select('id')
    .single();
  if (error) throw error;
  linkIds.push(data.id);
  return token;
}

test.describe.configure({ mode: 'serial' });
test.setTimeout(180_000);

test.describe('College update link', () => {
  test.use({ baseURL: MARKETING, viewport: { width: 375, height: 812 }, isMobile: true, hasTouch: true });

  test.beforeAll(async () => {
    db = service();
    const { data: candidates } = await db.from('colleges').select('id, name').eq('status', 'active').eq('neram_tier', 'free').order('name', { ascending: false }).limit(40);
    for (const c of candidates ?? []) {
      const [{ count: fees }, { count: subs }] = await Promise.all([
        db.from('college_fees').select('id', { count: 'exact', head: true }).eq('college_id', c.id),
        db.from('college_content_submissions').select('id', { count: 'exact', head: true }).eq('college_id', c.id),
      ]);
      if (!fees && !subs) {
        college = c;
        break;
      }
    }
    if (!college) throw new Error('No free staging college without fees to borrow');
  });

  test.afterAll(async () => {
    if (!db || !college) return;
    await db.from('college_content_submissions').delete().eq('college_id', college.id);
    if (linkIds.length) await db.from('college_update_links').delete().in('id', linkIds);
  });

  test('a college person fills the form on a phone and it lands in review', async ({ page }) => {
    const token = await makeLink();
    await page.goto(`/college-update/${token}`, { timeout: 120_000 });
    await expect(page.getByRole('heading', { name: "Check and update your college's details" })).toBeVisible({ timeout: 60_000 });
    await expect(page.getByText(college.name).first()).toBeVisible();
    await expect(page.getByLabel('Your name')).toHaveValue('E2E Principal');
    await assertNoHorizontalOverflow(page);

    // The visit is counted from the browser.
    await expect
      .poll(async () => (await db.from('college_update_links').select('open_count').eq('id', linkIds[0]).single()).data?.open_count, { timeout: 20_000 })
      .toBeGreaterThan(0);

    // Sending with nothing about the sender is refused on the page.
    await page.getByRole('button', { name: 'Send to Neram Classes' }).click();
    await expect(page.getByText('Please tell us who you are first.')).toBeVisible();

    await expect(async () => {
      await page.getByLabel('Your role at the college').fill('Principal');
      await page.getByLabel('Your mobile number').fill('9000000421');
      await expect(page.getByLabel('Your mobile number')).toHaveValue('9000000421', { timeout: 1000 });
    }).toPass({ timeout: 30_000 });

    const fees = page.locator('#part-fees');
    await fees.getByLabel('Tuition per year (Rs)').fill('175000');
    const admissions = page.locator('#part-admissions');
    await admissions.getByLabel('Applications open').fill('2027-05-01');
    await admissions.getByLabel('Applications close').fill('2027-07-31');
    const location = page.locator('#part-location');
    await location.getByLabel('Google Maps link or coordinates').fill('https://www.google.com/maps/place/X/@12.8342,79.7036,17z');
    await location.getByRole('button', { name: 'Use this pin' }).click();
    await expect(location.getByLabel('Latitude')).toHaveValue('12.8342');
    await expect(page.getByText('3 of 5 parts changed')).toBeVisible();

    await page.getByRole('button', { name: 'Send to Neram Classes' }).click();
    await expect(page.getByText(/Thank you, E2E/)).toBeVisible({ timeout: 60_000 });

    const { data: rows } = await db
      .from('college_content_submissions')
      .select('section, status, source, submitted_by_name, submitter_role, submitter_phone, update_link_id, payload')
      .eq('college_id', college.id)
      .order('section');
    expect(rows?.map((r) => r.section)).toEqual(['admissions', 'fees', 'location']);
    for (const r of rows ?? []) {
      expect(r).toMatchObject({ status: 'pending', source: 'link', submitted_by_name: 'E2E Principal', submitter_role: 'Principal', submitter_phone: '9000000421', update_link_id: linkIds[0] });
    }
    expect(rows?.find((r) => r.section === 'fees')?.payload).toMatchObject({ tuition: 175000 });
    expect(rows?.find((r) => r.section === 'location')?.payload).toEqual({ latitude: 12.8342, longitude: 79.7036 });

    // Nothing is public until staff approve.
    const { count } = await db.from('college_fees').select('id', { count: 'exact', head: true }).eq('college_id', college.id);
    expect(count).toBe(0);
  });

  test('expired, cancelled and made-up links are refused politely', async ({ page, request }) => {
    const expired = await makeLink({ expiresInMs: -60_000 });
    await page.goto(`/college-update/${expired}`, { timeout: 120_000 });
    await expect(page.getByRole('heading', { name: 'This link has expired' })).toBeVisible({ timeout: 60_000 });
    expect((await request.post(`/api/college-update/${expired}`, { data: { sections: {} } })).status()).toBe(410);

    const cancelled = await makeLink({ revoked: true });
    await page.goto(`/college-update/${cancelled}`);
    await expect(page.getByRole('heading', { name: 'This link is no longer active' })).toBeVisible({ timeout: 60_000 });
    expect((await request.post(`/api/college-update/${cancelled}`, { data: { sections: {} } })).status()).toBe(410);

    const madeUp = randomBytes(32).toString('base64url');
    await page.goto(`/college-update/${madeUp}`);
    await expect(page.getByRole('heading', { name: 'This link does not work' })).toBeVisible({ timeout: 60_000 });
    expect((await request.post(`/api/college-update/${madeUp}`, { data: { sections: {} } })).status()).toBe(404);
  });

  test('a link can only write the sections it asks for', async ({ request }) => {
    const token = await makeLink({ sections: ['fees'] });
    const res = await request.post(`/api/college-update/${token}`, {
      data: {
        submitter: { name: 'E2E Principal', role: 'Principal', phone: '9000000421' },
        sections: { profile: { about: 'Should be ignored' } },
      },
    });
    expect(res.status()).toBe(422);
    const { count } = await db.from('college_content_submissions').select('id', { count: 'exact', head: true }).eq('college_id', college.id).eq('section', 'profile');
    expect(count).toBe(0);
    expect((await request.post(`/api/college-update/${token}/upload`, { multipart: { file: { name: 'a.png', mimeType: 'image/png', buffer: Buffer.from('x') } } })).status()).toBe(403);
  });

  test('a link made in Admin opens the form for the right college', async ({ page, request }) => {
    // Local Admin accepts the dev test token for the staff test account.
    const staff = { Authorization: `Bearer test_${Buffer.from(TEACHER_ACCOUNT.email).toString('base64')}` };
    const res = await request.post(`${ADMIN}/api/college-hub/update-links`, {
      headers: staff,
      data: { college_id: college.id, recipient_name: 'E2E Principal', recipient_phone: '90000 00422', sections: ['fees', 'photos'], expires_in_days: 7 },
      timeout: 120_000,
    });
    test.skip(res.status() >= 500 && (await res.text()).includes('<!DOCTYPE html>'), 'Local Admin dev server on 3013 is not serving routes');
    expect(res.status(), await res.text()).toBe(201);
    const json = await res.json();
    linkIds.push(json.link.id);
    expect(json.message).toContain(json.url);
    expect(json.message).not.toMatch(/—|--/);
    expect(json.whatsapp_url).toMatch(/^https:\/\/wa\.me\/919000000422\?text=/);

    await page.goto(new URL(json.url).pathname, { timeout: 120_000 });
    await expect(page.getByText(college.name).first()).toBeVisible({ timeout: 60_000 });
    await expect(page.locator('#part-fees')).toBeVisible();
    await expect(page.locator('#part-photos')).toBeVisible();
    await expect(page.locator('#part-admissions')).toHaveCount(0);
  });
});
