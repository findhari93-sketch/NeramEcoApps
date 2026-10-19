import { test, expect } from '@playwright/test';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { APP_URLS } from '../utils/credentials';
import { assertNoHorizontalOverflow } from '../utils/mobile-helpers';

/**
 * Duplicates v2 (2026-10-19): one record per family, a plain sentence for why a
 * pair matched, guardrails that keep siblings apart, bulk merge, and Undo.
 *
 * Seeds its own people on the database the admin dev server points at
 * (staging) with random 9000xxxxxx numbers, and removes them afterwards:
 *   Kavya Ramaswamy (student)  + "Kavya" lead on the same number       -> same person, ready
 *   Kavya Ramaswamy            + "Ramaswamy Natarajan" lead on the parent phone from her form -> parent, ready
 *   Meena Subbiah (student)    + "Arun Subbiah" lead on the same number -> names differ, needs review
 *
 * Run: PW_APPS=admin npx playwright test tests/e2e/duplicates-admin.spec.ts --project=admin-chrome --no-deps --workers=1
 */

const ADMIN = APP_URLS.admin;
const run = String(Date.now()).slice(-5);
const phone = (n: number) => `90${run}${String(n).padStart(3, '0')}`;

function admin(): SupabaseClient | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key, { auth: { persistSession: false } });
}
const db = admin();
const ids: Record<string, string> = {};
const allIds = () => Object.values(ids);

async function seed() {
  if (!db) return;
  const rows = [
    { key: 'kavya', name: 'E2E Kavya Ramaswamy', email: `e2e.kavya.${run}@neramclasses.com`, phone: phone(1), user_type: 'student', ms_oid: `e2e-dupe-${run}-k` },
    { key: 'kavyaLead', name: 'E2E Kavya', email: `e2e.kavya.${run}@gmail.com`, phone: `+91${phone(1)}`, user_type: 'lead', firebase_uid: `e2e-dupe-${run}-kl` },
    { key: 'parent', name: 'E2E Ramaswamy Natarajan', email: `e2e.ramaswamy.${run}@gmail.com`, phone: `+91${phone(2)}`, user_type: 'lead', firebase_uid: `e2e-dupe-${run}-p` },
    { key: 'meena', name: 'E2E Meena Subbiah', email: `e2e.meena.${run}@neramclasses.com`, phone: phone(3), user_type: 'student', ms_oid: `e2e-dupe-${run}-m` },
    { key: 'arun', name: 'E2E Arun Subbiah', email: `e2e.arun.${run}@gmail.com`, phone: `+91${phone(3)}`, user_type: 'lead', firebase_uid: `e2e-dupe-${run}-a` },
  ];
  for (const { key, ...row } of rows) {
    const { data, error } = await db.from('users').insert(row).select('id').single();
    if (error) throw error;
    ids[key] = data.id;
  }
  await db.from('user_contacts').insert({
    user_id: ids.kavya, kind: 'phone', value: `+91 ${phone(2)}`, value_key: phone(2), relation: 'parent', source: 'lead_form',
  });
  for (const id of [ids.kavya, ids.meena]) {
    const { error } = await db.rpc('detect_user_duplicate_candidates', { p_user_id: id });
    if (error) throw error;
  }
}

async function cleanup() {
  if (!db || allIds().length === 0) return;
  const list = allIds().join(',');
  await db.from('user_duplicate_candidates').delete().or(`user_a.in.(${list}),user_b.in.(${list})`);
  await db.from('user_merge_log').delete().or(`winner_id.in.(${list}),loser_id.in.(${list})`);
  await db.from('user_identities').delete().in('user_id', allIds());
  await db.from('users').delete().in('id', allIds());
}

/** Opens the page; false when the runner has no Microsoft session (as the other admin UI specs do). */
async function open(page: any, path: string): Promise<boolean> {
  await page.goto(`${ADMIN}${path}`, { waitUntil: 'domcontentloaded' });
  const rendered = await page
    .getByRole('heading', { name: 'Duplicates' })
    .waitFor({ timeout: 60_000 })
    .then(() => true, () => false);
  return rendered && !/\/login|microsoftonline/.test(page.url());
}

async function pairFor(request: any, tab: string, a: string, b: string) {
  const res = await request.get(`${ADMIN}/api/duplicates?tab=${tab}&limit=100`);
  expect(res.status()).toBe(200);
  const body = await res.json();
  return (body.candidates as any[]).find((c) => [c.a?.id, c.b?.id].sort().join() === [a, b].sort().join());
}

test.describe('Duplicates: family merge, guardrails, Undo', () => {
  test.skip(!db, 'needs NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY for staging');
  test.describe.configure({ mode: 'serial' });
  // The dev server compiles /duplicates on first visit.
  test.setTimeout(180_000);

  test.beforeAll(seed);
  test.afterAll(cleanup);

  test('detection explains each pair and keeps a sibling for a person', async ({ request }) => {
    const self = await pairFor(request, 'ready', ids.kavya, ids.kavyaLead);
    expect(self).toMatchObject({ relation_guess: 'self', auto_ok: true, confidence: 'strong' });
    expect(self.evidence.kind).toBe('phone');

    const parent = await pairFor(request, 'ready', ids.kavya, ids.parent);
    expect(parent).toMatchObject({ relation_guess: 'parent', auto_ok: true, reason: 'contact_phone' });

    const sibling = await pairFor(request, 'review', ids.meena, ids.arun);
    expect(sibling).toMatchObject({ auto_ok: false, blocked_reason: 'names_differ' });
  });

  test('the page says why they matched and why one waits', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    test.skip(!(await open(page, `/duplicates?tab=ready&user=${ids.kavya}`)), 'No Microsoft session on this runner');
    await expect(page.getByText(`is the parent phone on E2E Kavya Ramaswamy's application`)).toBeVisible();
    await expect(page.getByText('Parent and student').first()).toBeVisible();
    await assertNoHorizontalOverflow(page);

    await open(page, `/duplicates?tab=review&user=${ids.meena}`);
    await expect(page.getByText(/could be a parent or a sibling/i)).toBeVisible();
    await page.setViewportSize({ width: 1024, height: 800 });
    await assertNoHorizontalOverflow(page);
    const merge = page.getByRole('button', { name: 'Review and merge' }).first();
    const box = await merge.boundingBox();
    expect(box?.height ?? 0).toBeGreaterThanOrEqual(44);
  });

  test('a family merge keeps the student and can be undone', async ({ request }) => {
    const pair = await pairFor(request, 'ready', ids.kavya, ids.parent);
    const preview = await (await request.get(`${ADMIN}/api/duplicates/${pair.id}`)).json();
    expect(preview.winnerId).toBe(ids.kavya);
    expect(preview.relation).toBe('parent');

    const merged = await request.post(`${ADMIN}/api/duplicates/${pair.id}/merge`, { data: { expectedLoserId: ids.parent } });
    expect(merged.status()).toBe(200);
    const { logId, winnerId } = await merged.json();
    expect(winnerId).toBe(ids.kavya);
    expect(logId).toBeTruthy();

    const { data: student } = await db!.from('users').select('name, email, phone').eq('id', ids.kavya).single();
    expect(student).toMatchObject({ name: 'E2E Kavya Ramaswamy', phone: phone(1) });
    const { data: contacts } = await db!.from('user_contacts').select('kind, relation').eq('user_id', ids.kavya);
    expect(contacts).toContainEqual({ kind: 'email', relation: 'parent' });
    const { data: gone } = await db!.from('users').select('id').eq('id', ids.parent);
    expect(gone).toHaveLength(0);

    const undo = await request.post(`${ADMIN}/api/duplicates/merges/${logId}/undo`, { data: {} });
    expect(undo.status()).toBe(200);
    const { data: back } = await db!.from('users').select('id, name').eq('id', ids.parent).single();
    expect(back?.name).toBe('E2E Ramaswamy Natarajan');

    const again = await pairFor(request, 'review', ids.kavya, ids.parent);
    expect(again).toMatchObject({ status: 'open', blocked_reason: 'undone', auto_ok: false });

    const twice = await request.post(`${ADMIN}/api/duplicates/merges/${logId}/undo`, { data: {}, failOnStatusCode: false });
    expect(twice.status()).toBe(409);
  });

  test('bulk merge refuses junk, merges a same-person pair, and Undo restores it', async ({ request }) => {
    const empty = await request.post(`${ADMIN}/api/duplicates/bulk-merge`, { data: { ids: [] }, failOnStatusCode: false });
    expect(empty.status()).toBe(400);
    const pair = await pairFor(request, 'ready', ids.kavya, ids.kavyaLead);
    const res = await request.post(`${ADMIN}/api/duplicates/bulk-merge`, { data: { ids: [pair.id, '00000000-0000-0000-0000-000000000000'] } });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.merged.map((m: any) => m.candidateId)).toEqual([pair.id]);
    expect(body.failed).toHaveLength(1);

    const { data: kept } = await db!.from('users').select('personal_email, firebase_uid, phone').eq('id', ids.kavya).single();
    expect(kept).toMatchObject({ personal_email: `e2e.kavya.${run}@gmail.com`, firebase_uid: `e2e-dupe-${run}-kl`, phone: phone(1) });

    const undo = await request.post(`${ADMIN}/api/duplicates/merges/${body.merged[0].logId}/undo`, { data: {} });
    expect(undo.status()).toBe(200);
    const { data: restored } = await db!.from('users').select('firebase_uid').eq('id', ids.kavyaLead).single();
    expect(restored?.firebase_uid).toBe(`e2e-dupe-${run}-kl`);
    const { data: student } = await db!.from('users').select('personal_email, firebase_uid').eq('id', ids.kavya).single();
    expect(student).toMatchObject({ personal_email: null, firebase_uid: null });

    // The undone pair waits for a person and is not merged by the next scan.
    await db!.rpc('detect_user_duplicate_candidates', { p_user_id: ids.kavya });
    const back = await pairFor(request, 'review', ids.kavya, ids.kavyaLead);
    expect(back).toMatchObject({ auto_ok: false, blocked_reason: 'undone' });
  });

  test('bulk merge from the page, then Undo from the toast', async ({ page, request }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    test.skip(!(await open(page, `/duplicates?tab=review&user=${ids.kavya}`)), 'No Microsoft session on this runner');
    const card = page.getByRole('article').filter({ hasText: 'E2E Kavya' }).first();
    await card.getByRole('checkbox', { name: 'Select this pair for merging' }).check();
    await page.getByRole('button', { name: /^Merge 1$/ }).first().click();
    await expect(page.getByRole('dialog', { name: 'Merge 1 pair?' })).toBeVisible();
    await page.getByRole('dialog').getByRole('button', { name: 'Merge 1' }).click();
    await expect(page.getByText(/Merged 1 pair/)).toBeVisible({ timeout: 30_000 });

    const { data: lead } = await db!.from('users').select('id').eq('id', ids.kavyaLead);
    expect(lead).toHaveLength(0);
    const { data: kept } = await db!.from('users').select('personal_email, firebase_uid').eq('id', ids.kavya).single();
    expect(kept?.personal_email).toBe(`e2e.kavya.${run}@gmail.com`);

    const history = await pairFor(request, 'history', ids.kavya, ids.kavyaLead);
    expect(history?.undo?.undoable).toBe(true);
    const undo = await request.post(`${ADMIN}/api/duplicates/merges/${history.merge_log_id}/undo`, { data: {} });
    expect(undo.status()).toBe(200);
    const { data: restored } = await db!.from('users').select('id').eq('id', ids.kavyaLead);
    expect(restored).toHaveLength(1);
  });

  test('every new route refuses a caller without a staff token', async () => {
    for (const [method, path] of [
      ['POST', '/api/duplicates/bulk-merge'],
      ['PATCH', '/api/duplicates/settings'],
      ['POST', '/api/duplicates/merges/00000000-0000-0000-0000-000000000000/undo'],
      ['GET', `/api/crm/contacts?person=${ids.kavya}`],
    ]) {
      const res = await fetch(`${ADMIN}${path}`, { method, headers: { 'Content-Type': 'application/json' }, body: method === 'GET' ? undefined : '{}' });
      expect(res.status, path).toBe(401);
    }
  });
});
