import { test, expect, type Browser, type Page } from '@playwright/test';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { assertNoHorizontalOverflow } from '../../utils/mobile-helpers';
import { TEACHER_ACCOUNT } from '../../utils/credentials';

/**
 * College partner programme (Papni pilot): plans, college accounts, the
 * dashboard review queue, lead delivery and the map.
 *
 * Runs against local marketing (3010) and admin (3013) on the STAGING database.
 * It borrows one free-tier staging college that has no fees yet, gives it a
 * Gold trial, and puts everything back afterwards. Accounts use @neram.test
 * addresses, which the apps never email. The test lead uses a 9000000xxx number.
 *
 * Run: pnpm test:e2e --project=marketing-chrome --no-deps tests/e2e/college-hub/college-partner-marketing.spec.ts
 */

const MARKETING = 'http://localhost:3010';
const ADMIN = 'http://localhost:3013';
const STAMP = Date.now();
const OWNER = { name: 'E2E Owner', email: `e2e-college-owner-${STAMP}@neram.test`, password: `Owner-${STAMP}-pw` };
const EDITOR = { name: 'E2E Editor', email: `e2e-college-editor-${STAMP}@neram.test`, password: `Editor-${STAMP}-pw` };
const TEST_PHONE = '9000000417';
const TUITION = 123456;

let db: SupabaseClient;
let college: { id: string; name: string; slug: string; state_slug: string; annual_fee_approx: number | null; college_provided: Record<string, string> | null };
let otherLeadId: string | null = null;
let editorLink = '';

function service(): SupabaseClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are needed (apps/nexus/.env.local)');
  if (!/staging|hgxjavrsrvpihqrpezdh/.test(url)) throw new Error(`Refusing to run against a non-staging database: ${url}`);
  return createClient(url, key, { auth: { persistSession: false } });
}

async function welcome(page: Page, link: string, password: string) {
  await page.goto(link);
  await expect(page.getByRole('heading', { name: 'Welcome to your college dashboard' })).toBeVisible({ timeout: 60_000 });
  await page.getByLabel('New password').fill(password);
  await page.getByLabel('Type it again').fill(password);
  await page.getByRole('button', { name: 'Save and open the dashboard' }).click();
  await expect(page).toHaveURL(/\/college-dashboard$/, { timeout: 60_000 });
}

async function signIn(browser: Browser, who: { email: string; password: string }) {
  const ctx = await browser.newContext({ baseURL: MARKETING });
  const page = await ctx.newPage();
  await page.goto('/college-dashboard/login');
  await page.getByLabel('Work email').fill(who.email);
  await page.getByLabel('Password', { exact: true }).fill(who.password);
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page).toHaveURL(/\/college-dashboard$/, { timeout: 60_000 });
  return page;
}

async function token(page: Page): Promise<string> {
  return page.evaluate(() => {
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i)!;
      if (k.includes('auth-token')) return JSON.parse(localStorage.getItem(k)!).access_token as string;
    }
    return '';
  });
}

test.describe.configure({ mode: 'serial' });
test.setTimeout(180_000);

test.describe('College partner programme', () => {
  test.use({ baseURL: MARKETING });

  test.beforeAll(async () => {
    db = service();
    const { data: candidates } = await db
      .from('colleges')
      .select('id, name, slug, state_slug, annual_fee_approx, college_provided')
      .eq('status', 'active')
      .eq('neram_tier', 'free')
      .not('state_slug', 'is', null)
      .order('name')
      .limit(40);
    for (const c of candidates ?? []) {
      const [{ count: fees }, { count: plans }] = await Promise.all([
        db.from('college_fees').select('id', { count: 'exact', head: true }).eq('college_id', c.id),
        db.from('college_plans').select('id', { count: 'exact', head: true }).eq('college_id', c.id),
      ]);
      if (!fees && !plans) {
        college = c as typeof college;
        break;
      }
    }
    if (!college) throw new Error('No free staging college without fees and plans to borrow');

    const today = new Date(Date.now() + 330 * 60_000).toISOString().slice(0, 10);
    const end = new Date(Date.now() + 30 * 86_400_000).toISOString().slice(0, 10);
    const { error } = await db.from('college_plans').insert({ college_id: college.id, tier: 'gold', starts_on: today, ends_on: end, amount: 0, notes: 'E2E pilot', created_by: 'e2e' });
    if (error) throw error;
  });

  test.afterAll(async () => {
    if (!db || !college) return;
    const { data: people } = await db.from('college_admins').select('id, supabase_uid').eq('college_id', college.id).ilike('email', 'e2e-college-%@neram.test');
    await db.from('college_content_submissions').delete().eq('college_id', college.id);
    await db.from('college_leads').delete().eq('phone', TEST_PHONE);
    if (otherLeadId) await db.from('college_leads').delete().eq('id', otherLeadId);
    await db.from('college_admins').delete().eq('college_id', college.id).ilike('email', 'e2e-college-%@neram.test');
    for (const p of people ?? []) if (p.supabase_uid) await db.auth.admin.deleteUser(p.supabase_uid);
    await db.from('college_fees').delete().eq('college_id', college.id);
    await db.from('college_plans').delete().eq('college_id', college.id);
    await db.from('colleges').update({ annual_fee_approx: college.annual_fee_approx, college_provided: college.college_provided ?? {}, neram_tier: 'free' }).eq('id', college.id);
  });

  test('the plan trigger puts the college on Gold', async () => {
    const { data } = await db.from('colleges').select('neram_tier, tier_end_date').eq('id', college.id).single();
    expect(data?.neram_tier).toBe('gold');
    expect(data?.tier_end_date).toBeTruthy();
  });

  test('an invited owner sets a password and sees the Gold plan', async ({ page }) => {
    const link = await db.auth.admin.generateLink({ type: 'invite', email: OWNER.email, options: { data: { name: OWNER.name } } });
    expect(link.error).toBeNull();
    await db.from('college_admins').insert({
      college_id: college.id, name: OWNER.name, email: OWNER.email, role: 'owner', is_active: true,
      supabase_uid: link.data.user!.id, invited_at: new Date().toISOString(), invited_by: 'e2e',
    });
    await welcome(page, `/college-dashboard/welcome?token_hash=${link.data.properties!.hashed_token}&type=invite`, OWNER.password);
    await expect(page.getByText('Gold plan')).toBeVisible({ timeout: 30_000 });
    await expect(page.getByText(/days left/)).toBeVisible();
    const { data: me } = await db.from('college_admins').select('accepted_at').ilike('email', OWNER.email).single();
    expect(me?.accepted_at).toBeTruthy();
  });

  test('the owner invites an editor and gets a link to share (no email to test addresses)', async ({ browser }) => {
    const page = await signIn(browser, OWNER);
    await page.goto('/college-dashboard/team');
    await page.getByRole('button', { name: 'Invite a teammate' }).click();
    const dialog = page.getByRole('dialog');
    await dialog.getByLabel('Name').fill(EDITOR.name);
    await dialog.getByLabel('Work email').fill(EDITOR.email);
    await dialog.getByRole('button', { name: 'Send invite' }).click();
    await expect(dialog.getByText(/The email was not sent \(test address\)/)).toBeVisible({ timeout: 30_000 });
    editorLink = (await dialog.locator('code').textContent()) ?? '';
    expect(editorLink).toContain('/college-dashboard/welcome?token_hash=');
    await dialog.getByRole('button', { name: 'Done' }).click();
    await expect(page.getByText(EDITOR.email)).toBeVisible();
    await expect(page.getByText('Invite sent')).toBeVisible();
  });

  test('the editor accepts, sends fees for review, and cannot manage the team', async ({ browser }) => {
    const ctx = await browser.newContext({ baseURL: MARKETING });
    const page = await ctx.newPage();
    await welcome(page, editorLink.replace(/^https?:\/\/[^/]+/, ''), EDITOR.password);

    await page.goto('/college-dashboard/team');
    await expect(page.getByText('Only owners can invite people.')).toBeVisible({ timeout: 30_000 });
    await expect(page.getByRole('button', { name: 'Invite a teammate' })).toHaveCount(0);

    await page.goto('/college-dashboard/profile#fees');
    const fees = page.locator('#fees');
    await expect(fees.getByLabel('Tuition per year (Rs)')).toBeVisible({ timeout: 30_000 });
    // Typing before hydration is lost: retry until both values stick.
    await expect(async () => {
      await fees.getByLabel('Tuition per year (Rs)').fill(String(TUITION));
      await fees.getByLabel('Academic year').fill('2026-27');
      await expect(fees.getByLabel('Academic year')).toHaveValue('2026-27', { timeout: 1000 });
      await expect(fees.getByLabel('Tuition per year (Rs)')).toHaveValue(String(TUITION), { timeout: 1000 });
    }).toPass({ timeout: 30_000 });
    await fees.getByRole('button', { name: 'Send for review' }).click();
    await expect(fees.getByText(/Sent for review on/)).toBeVisible({ timeout: 30_000 });

    const { data: sub } = await db.from('college_content_submissions').select('payload, status, submitted_by_name').eq('college_id', college.id).eq('section', 'fees').single();
    expect(sub?.status).toBe('pending');
    expect(sub?.payload).toMatchObject({ academic_year: '2026-27', tuition: TUITION });
    expect(sub?.submitted_by_name).toBe(EDITOR.name);

    // Nothing is public until staff approve.
    const { count } = await db.from('college_fees').select('id', { count: 'exact', head: true }).eq('college_id', college.id);
    expect(count).toBe(0);
    await ctx.close();
  });

  test('staff approve the fees in Admin and the college page shows them', async ({ request, page }) => {
    const { data: sub } = await db.from('college_content_submissions').select('id').eq('college_id', college.id).eq('section', 'fees').eq('status', 'pending').single();
    // Local Admin accepts the dev test token for the staff test account.
    const staff = { Authorization: `Bearer test_${Buffer.from(TEACHER_ACCOUNT.email).toString('base64')}` };
    const res = await request.patch(`${ADMIN}/api/college-hub/content-reviews/${sub!.id}`, { headers: staff, data: { decision: 'approve', note: 'E2E' }, timeout: 120_000 });
    // A broken local Admin dev server answers 500 with an HTML error page for every route.
    test.skip(res.status() === 500 && (await res.text()).includes('<!DOCTYPE html>'), 'Local Admin dev server on 3013 is not serving routes');
    expect(res.status(), await res.text()).toBe(200);

    const { data: row } = await db.from('colleges').select('annual_fee_approx, college_provided').eq('id', college.id).single();
    expect(row?.annual_fee_approx).toBe(TUITION);
    expect(row?.college_provided?.fees).toBeTruthy();

    await page.goto(`/en/colleges/${college.state_slug}/${college.slug}`, { timeout: 120_000 });
    const fees = page.locator('#fees');
    await expect(fees.getByText(/Provided by the college/)).toBeVisible({ timeout: 30_000 });
  });

  test('a consented lead reaches the dashboard straight away while the plan is on', async ({ request, browser }) => {
    const res = await request.post('/api/colleges/leads', {
      data: { college_id: college.id, name: 'E2E Test Student', phone: TEST_PHONE, parent_phone: '9000000418', consent_given: true, city: 'Chennai' },
    });
    const json = await res.json();
    expect(res.status()).toBe(200);
    expect(json.delivered).toBe(true);

    const again = await (await request.post('/api/colleges/leads', { data: { college_id: college.id, name: 'E2E Test Student', phone: TEST_PHONE, consent_given: true } })).json();
    expect(again.duplicate).toBe(true);

    const page = await signIn(browser, OWNER);
    await page.goto('/college-dashboard/leads');
    await expect(page.getByText('E2E Test Student')).toBeVisible({ timeout: 30_000 });
    await expect(page.getByRole('link', { name: `Call ${TEST_PHONE}` })).toBeVisible();
    await page.getByLabel('What happened').click();
    await page.getByRole('option', { name: 'Visited campus' }).click();
    await expect.poll(async () => (await db.from('college_leads').select('status').eq('phone', TEST_PHONE).single()).data?.status).toBe('visited');
  });

  test('a college cannot touch another college\'s enquiry', async ({ request, browser }) => {
    const { data: other } = await db.from('colleges').select('id').eq('status', 'active').neq('id', college.id).limit(1).single();
    const { data: lead } = await db
      .from('college_leads')
      .insert({ college_id: other!.id, name: 'E2E Other College Lead', phone: '9000000419', consent_given: true, status: 'new', admin_review_status: 'approved', source: 'interested_button' })
      .select('id')
      .single();
    otherLeadId = lead!.id;

    const page = await signIn(browser, OWNER);
    const t = await token(page);
    const res = await request.patch('/api/college-dashboard/leads', { headers: { Authorization: `Bearer ${t}` }, data: { id: otherLeadId, status: 'admitted' } });
    expect(res.status()).toBe(404);
    const list = await (await request.get('/api/college-dashboard/leads', { headers: { Authorization: `Bearer ${t}` } })).json();
    expect(list.data.some((l: { id: string }) => l.id === otherLeadId)).toBe(false);
  });

  test('a viewer can look but not send changes', async ({ request, browser }) => {
    await db.from('college_admins').update({ role: 'viewer' }).ilike('email', EDITOR.email);
    const page = await signIn(browser, EDITOR);
    await page.goto('/college-dashboard/profile');
    await expect(page.getByText('You have view-only access.')).toBeVisible({ timeout: 30_000 });
    await expect(page.getByRole('button', { name: 'Send for review' })).toHaveCount(0);
    const res = await request.post('/api/college-dashboard/content', {
      headers: { Authorization: `Bearer ${await token(page)}` },
      data: { section: 'profile', values: { about: 'Viewer edit' } },
    });
    expect(res.status()).toBe(403);
  });

  test('after the plan is revoked, the college sees it ended and new leads wait for staff', async ({ request, browser }) => {
    await db.from('college_plans').update({ status: 'revoked', revoked_at: new Date().toISOString(), revoked_by: 'e2e', revoke_reason: 'E2E' }).eq('college_id', college.id).eq('status', 'active');
    const { data } = await db.from('colleges').select('neram_tier').eq('id', college.id).single();
    expect(data?.neram_tier).toBe('free');

    const page = await signIn(browser, OWNER);
    await expect(page.getByText(/Your gold plan was stopped on/)).toBeVisible({ timeout: 30_000 });
    await expect(page.getByText('Free listing')).toBeVisible();

    await db.from('college_leads').delete().eq('phone', TEST_PHONE);
    const json = await (await request.post('/api/colleges/leads', { data: { college_id: college.id, name: 'E2E Test Student', phone: TEST_PHONE, consent_given: true } })).json();
    expect(json.delivered).toBe(false);
  });

  test('dashboard pages fit a 375px phone', async ({ browser }) => {
    const page = await signIn(browser, OWNER);
    await page.setViewportSize({ width: 375, height: 812 });
    for (const path of ['/college-dashboard', '/college-dashboard/profile', '/college-dashboard/leads', '/college-dashboard/team', '/college-dashboard/analytics']) {
      await page.goto(path);
      await page.waitForLoadState('networkidle');
      await assertNoHorizontalOverflow(page);
    }
  });
});

test.describe('College page map', () => {
  test.use({ baseURL: MARKETING });

  test('loads Google Maps only after "Show map" and hides it without a pin', async ({ page }) => {
    const sb = service();
    const { data: withPin } = await sb.from('colleges').select('slug, state_slug').eq('status', 'active').not('latitude', 'is', null).not('state_slug', 'is', null).limit(1).single();
    await page.goto(`/en/colleges/${withPin!.state_slug}/${withPin!.slug}`, { timeout: 120_000 });
    const location = page.locator('#location');
    await expect(location.locator('iframe')).toHaveCount(0);
    await location.getByRole('button', { name: /on the map/ }).click();
    await expect(location.locator('iframe[src*="maps.google.com"]')).toHaveCount(1);

    const { data: noPin } = await sb.from('colleges').select('slug, state_slug').eq('status', 'active').is('latitude', null).not('state_slug', 'is', null).limit(1).single();
    await page.goto(`/en/colleges/${noPin!.state_slug}/${noPin!.slug}`, { timeout: 120_000 });
    await expect(page.locator('#location').getByRole('button', { name: /on the map/ })).toHaveCount(0);
    await expect(page.locator('#location').getByRole('link', { name: 'Directions' })).toBeVisible();
  });
});
