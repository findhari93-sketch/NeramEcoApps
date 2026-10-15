/**
 * Database side of the Ads ROI page: who came from Google Ads, how far each of
 * them got, and what was spent. Counting lives in roi.ts.
 *
 * Lists are read in pages of 1,000 (PostgREST's row cap) and ids in chunks of
 * 100 (long .in() lists overflow the URL). A person is followed through every
 * account that shares their phone, because staff often enrol a student under a
 * second, phone-only account; their fees still belong to the ad that found them.
 */

import { isRealProspect, type UserForConversion } from './ads/conversions';
import { writeAudit } from './audit';
import { readAdsEnv, type AdsEnv } from './config';
import { isGoogleAdsTouch } from './funnel';
import { buildRoi, istMonth, monthsBetween, phone10, phoneVariants, ROI_FROM_MONTH, type RoiPerson, type RoiReport, type SpendEntry } from './roi';
import { loadEntityDays } from './store';

const PAGE = 1000;
const CHUNK = 100;
const SAMPLE_CUSTOMER = '1234567890';
const DEMO_DEAD = new Set(['cancelled', 'rejected']);
export const SPEND_KEY = 'spend_manual';

type UserRow = UserForConversion & { name: string | null };
type Credited = { u: UserRow; tier: RoiPerson['tier']; cohortMonth: string; p10: string | null };

async function pages(make: (from: number, to: number) => any): Promise<any[]> {
  const out: any[] = [];
  for (let offset = 0; ; offset += PAGE) {
    const { data, error } = await make(offset, offset + PAGE - 1);
    if (error) throw new Error(error.message);
    out.push(...(data ?? []));
    if (!data || data.length < PAGE) return out;
  }
}

async function chunked<T>(values: T[], fetch: (part: T[]) => any): Promise<any[]> {
  const out: any[] = [];
  for (let i = 0; i < values.length; i += CHUNK) {
    const { data, error } = await fetch(values.slice(i, i + CHUNK));
    if (error) throw new Error(error.message);
    out.push(...(data ?? []));
  }
  return out;
}

function push<K, V>(map: Map<K, V[]>, key: K, value: V) {
  const list = map.get(key);
  if (list) list.push(value);
  else map.set(key, [value]);
}

export async function loadRoiPeople(db: any, fromIso: string): Promise<{ people: RoiPerson[]; alsoSaidGoogle: Record<string, number> }> {
  const users: UserRow[] = await pages((a, b) =>
    db
      .from('users')
      .select('id, name, email, phone, phone_verified, user_type, first_touch, first_touch_at, created_at')
      .eq('phone_verified', true)
      .gte('created_at', fromIso)
      .order('id', { ascending: true })
      .range(a, b),
  );

  const answers = new Map<string, string>();
  const { data: question, error: qErr } = await db.from('onboarding_questions').select('id').eq('question_key', 'referral_source').maybeSingle();
  if (qErr) throw new Error(qErr.message);
  if (question) {
    const rows = await pages((a, b) => db.from('onboarding_responses').select('id, user_id, response').eq('question_id', question.id).order('id', { ascending: true }).range(a, b));
    for (const r of rows) if (r.user_id && r.response?.value) answers.set(r.user_id, String(r.response.value));
  }

  const candidates: Credited[] = [];
  const alsoSaidGoogle: Record<string, number> = {};
  for (const u of users) {
    if (!isRealProspect(u)) continue;
    const p10 = phone10(u.phone);
    if (isGoogleAdsTouch(u.first_touch)) {
      candidates.push({ u, tier: 'confirmed', cohortMonth: istMonth(u.first_touch_at ?? u.created_at), p10 });
      continue;
    }
    const said = answers.get(u.id);
    if (said === 'google_ad') candidates.push({ u, tier: 'said_google_ad', cohortMonth: istMonth(u.created_at), p10 });
    else if (said === 'google') {
      const m = istMonth(u.created_at);
      alsoSaidGoogle[m] = (alsoSaidGoogle[m] ?? 0) + 1;
    }
  }

  // One phone, one credit: the confirmed account first, then the earliest.
  candidates.sort((a, b) => (a.tier === b.tier ? a.u.created_at.localeCompare(b.u.created_at) : a.tier === 'confirmed' ? -1 : 1));
  const seenPhones = new Set<string>();
  const credited = candidates.filter((c) => {
    if (!c.p10) return true;
    if (seenPhones.has(c.p10)) return false;
    seenPhones.add(c.p10);
    return true;
  });
  if (!credited.length) return { people: [], alsoSaidGoogle };

  const variants = [...seenPhones].flatMap(phoneVariants);
  const twins = await chunked(variants, (part) => db.from('users').select('id, phone').in('phone', part));
  const idsByPhone = new Map<string, string[]>();
  for (const t of twins) {
    const p = phone10(t.phone);
    if (p) push(idsByPhone, p, t.id);
  }
  const idsOf = (c: Credited) => new Set([c.u.id, ...(c.p10 ? idsByPhone.get(c.p10) ?? [] : [])]);
  const allIds = [...new Set(credited.flatMap((c) => [...idsOf(c)]))];

  const demosById = await chunked(allIds, (part) => db.from('demo_class_registrations').select('id, user_id, phone, status, attended, created_at').in('user_id', part));
  const demosByPhone = await chunked(variants, (part) => db.from('demo_class_registrations').select('id, user_id, phone, status, attended, created_at').in('phone', part));
  const students = await chunked(allIds, (part) => db.from('student_profiles').select('id, user_id, created_at').in('user_id', part));
  const spByUser = new Map<string, any[]>();
  for (const s of students) push(spByUser, s.user_id, s);
  const payById = await chunked(allIds, (part) => db.from('payments').select('id, amount, user_id, student_profile_id, paid_at, created_at').eq('status', 'paid').in('user_id', part));
  const payBySp = await chunked(
    students.map((s) => s.id),
    (part) => db.from('payments').select('id, amount, user_id, student_profile_id, paid_at, created_at').eq('status', 'paid').in('student_profile_id', part),
  );
  const payments = new Map<string, any>();
  for (const p of [...payById, ...payBySp]) payments.set(p.id, p);

  const people: RoiPerson[] = credited.map((c) => {
    const ids = idsOf(c);
    // Only what happened from the ad click (or the sign-up, for an answer) onward. A shared phone
    // can belong to an older sibling or a parent whose 2025 enrolment the ad did not bring.
    const since = Date.parse(c.tier === 'confirmed' ? c.u.first_touch_at ?? c.u.created_at : c.u.created_at);
    const after = (iso: string | null | undefined) => !iso || Date.parse(iso) >= since;
    const demos = [...demosById, ...demosByPhone].filter((d) => (ids.has(d.user_id) || (!!c.p10 && phone10(d.phone) === c.p10)) && after(d.created_at));
    const live = demos.filter((d) => !DEMO_DEAD.has(String(d.status)));
    const sps = new Set([...ids].flatMap((id) => spByUser.get(id) ?? []).filter((sp) => after(sp.created_at)).map((sp) => sp.id));
    const oldSps = new Set(students.filter((sp) => !sps.has(sp.id)).map((sp) => sp.id));
    let feesPaid = 0;
    for (const pay of payments.values()) {
      if (!(ids.has(pay.user_id) || sps.has(pay.student_profile_id))) continue;
      if (oldSps.has(pay.student_profile_id) || !after(pay.paid_at ?? pay.created_at)) continue;
      feesPaid += Number(pay.amount) || 0;
    }
    return {
      userId: c.u.id,
      name: c.u.name ?? null,
      phone10: c.p10,
      tier: c.tier,
      cohortMonth: c.cohortMonth,
      demoBooked: live.length > 0,
      demoAttended: live.some((d) => d.attended === true),
      joined: sps.size > 0,
      feesPaid,
    };
  });
  return { people, alsoSaidGoogle };
}

export async function loadManualSpend(db: any): Promise<Record<string, number>> {
  const { data, error } = await db.from('marketing_ai_settings').select('key, value').eq('key', SPEND_KEY).maybeSingle();
  if (error) throw new Error(error.message);
  const out: Record<string, number> = {};
  const value = data?.value;
  if (value && typeof value === 'object') for (const [m, n] of Object.entries(value)) if (typeof n === 'number' && Number.isFinite(n)) out[m] = n;
  return out;
}

export async function saveManualSpend(db: any, month: string, amount: number | null, adminId: string): Promise<Record<string, number>> {
  const before = await loadManualSpend(db);
  const after = { ...before };
  if (amount === null) delete after[month];
  else after[month] = amount;
  const { error } = await db.from('marketing_ai_settings').upsert({ key: SPEND_KEY, value: after, updated_by: adminId, updated_at: new Date().toISOString() }, { onConflict: 'key' });
  if (error) throw new Error(error.message);
  await writeAudit(db, { actor: { type: 'admin', id: adminId }, event: 'spend_manual_set', entityType: 'month', entityId: month, before: { amount: before[month] ?? null }, after: { amount } });
  return after;
}

export async function loadSpend(db: any, fromMonth: string, toDate: string, env: AdsEnv = readAdsEnv()): Promise<Record<string, SpendEntry>> {
  const out: Record<string, SpendEntry> = {};
  for (const [m, amount] of Object.entries(await loadManualSpend(db))) out[m] = { amount, source: 'manual' };
  if (env.mode === 'live' && env.customerId && env.customerId !== SAMPLE_CUSTOMER) {
    const rows = await loadEntityDays(db, env.customerId, `${fromMonth}-01`, toDate, ['campaign']);
    const live: Record<string, number> = {};
    for (const r of rows) live[r.date.slice(0, 7)] = (live[r.date.slice(0, 7)] ?? 0) + r.cost_micros / 1e6;
    for (const [m, amount] of Object.entries(live)) out[m] = { amount: Math.round(amount), source: 'google' };
  }
  return out;
}

export async function loadRoi(db: any, now = new Date()): Promise<RoiReport> {
  const today = new Date(now.getTime() + 5.5 * 3600 * 1000).toISOString().slice(0, 10);
  const months = monthsBetween(ROI_FROM_MONTH, today.slice(0, 7));
  const [{ people, alsoSaidGoogle }, spend] = await Promise.all([loadRoiPeople(db, `${ROI_FROM_MONTH}-01T00:00:00+05:30`), loadSpend(db, ROI_FROM_MONTH, today)]);
  return buildRoi(people, spend, alsoSaidGoogle, months);
}
