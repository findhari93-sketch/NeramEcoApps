/**
 * Ads ROI: what each month of Google Ads spend brought back, counted from
 * Neram's own database. Spec: docs/superpowers/specs/2026-10-14-ads-roi-design.md.
 *
 * Pure. roi-store.ts gathers people and spend; this file only counts. Two tiers
 * stay apart and are never summed: 'confirmed' (an ad click id on the account)
 * and 'said_google_ad' (the student's own onboarding answer). Credit goes to
 * the month of the first ad click (the sign-up month for an answer), so fees
 * paid months later still land on the month whose spend bought the click.
 */

export type RoiTier = 'confirmed' | 'said_google_ad';
export type RoiStage = 'signed_up' | 'demo_booked' | 'demo_attended' | 'joined';

export interface RoiPerson {
  userId: string;
  name: string | null;
  phone10: string | null;
  tier: RoiTier;
  /** YYYY-MM in IST. */
  cohortMonth: string;
  demoBooked: boolean;
  demoAttended: boolean;
  joined: boolean;
  /** Rupees, from paid payments only. */
  feesPaid: number;
}

export interface TierCounts {
  confirmed: number;
  said_google_ad: number;
}

export interface SpendEntry {
  amount: number;
  source: 'manual' | 'google';
}

export interface RoiPersonView {
  userId: string;
  name: string | null;
  phoneLast4: string | null;
  tier: RoiTier;
  stage: RoiStage;
  /** The same flags the counts use, so a drill-down lists exactly who a number counts. */
  demoBooked: boolean;
  demoAttended: boolean;
  joined: boolean;
  feesPaid: number;
}

export interface RoiRow {
  spend: number | null;
  signups: TierCounts;
  demosBooked: TierCounts;
  demosAttended: TierCounts;
  joined: TierCounts;
  fees: TierCounts;
  /** Fees per rupee spent: confirmed only, and confirmed plus said_google_ad. Null without spend. */
  returnPerRupee: { confirmed: number; withSaid: number } | null;
  /** Plain "Google Search" answers in this month: shown, never credited. */
  alsoSaidGoogle: number;
}

export interface RoiMonth extends RoiRow {
  month: string;
  spendSource: SpendEntry['source'] | null;
  people: RoiPersonView[];
}

export interface RoiReport {
  months: RoiMonth[];
  total: RoiRow;
}

/** Ad click ids were first stored in October 2026; earlier months only read 0 confirmed. */
export const ROI_FROM_MONTH = '2026-01';
const IST_MS = 5.5 * 3600 * 1000;

export function istMonth(iso: string): string {
  return new Date(Date.parse(iso) + IST_MS).toISOString().slice(0, 7);
}

export function phone10(raw: string | null | undefined): string | null {
  const d = String(raw ?? '').replace(/\D/g, '');
  return d.length >= 10 ? d.slice(-10) : null;
}

/** The stored forms of one number, for an exact .in() match. Prod holds '+91…' and bare 10 digits. */
export function phoneVariants(p10: string): string[] {
  return [p10, `+91${p10}`, `91${p10}`];
}

export function monthsBetween(from: string, to: string): string[] {
  const out: string[] = [];
  let [y, m] = from.split('-').map(Number);
  const [ty, tm] = to.split('-').map(Number);
  while (y < ty || (y === ty && m <= tm)) {
    out.push(`${y}-${String(m).padStart(2, '0')}`);
    m += 1;
    if (m > 12) {
      m = 1;
      y += 1;
    }
  }
  return out;
}

export function furthestStage(p: RoiPerson): RoiStage {
  if (p.joined) return 'joined';
  if (p.demoAttended) return 'demo_attended';
  if (p.demoBooked) return 'demo_booked';
  return 'signed_up';
}

const zero = (): TierCounts => ({ confirmed: 0, said_google_ad: 0 });
const round2 = (n: number) => Math.round(n * 100) / 100;

function emptyRow(): RoiRow {
  return { spend: null, signups: zero(), demosBooked: zero(), demosAttended: zero(), joined: zero(), fees: zero(), returnPerRupee: null, alsoSaidGoogle: 0 };
}

function addPerson(row: RoiRow, p: RoiPerson) {
  row.signups[p.tier] += 1;
  if (p.demoBooked) row.demosBooked[p.tier] += 1;
  if (p.demoAttended) row.demosAttended[p.tier] += 1;
  if (p.joined) row.joined[p.tier] += 1;
  row.fees[p.tier] += p.feesPaid;
}

function returnOf(row: Pick<RoiRow, 'spend' | 'fees'>): RoiRow['returnPerRupee'] {
  return row.spend && row.spend > 0
    ? { confirmed: round2(row.fees.confirmed / row.spend), withSaid: round2((row.fees.confirmed + row.fees.said_google_ad) / row.spend) }
    : null;
}

function setReturn(row: RoiRow) {
  row.returnPerRupee = returnOf(row);
}

export function buildRoi(people: RoiPerson[], spend: Record<string, SpendEntry>, alsoSaidGoogle: Record<string, number>, months: string[]): RoiReport {
  const byMonth = new Map<string, RoiMonth>();
  for (const month of months) {
    const s = spend[month];
    const has = !!s && s.amount > 0;
    byMonth.set(month, { month, ...emptyRow(), spend: has ? s.amount : null, spendSource: has ? s.source : null, alsoSaidGoogle: alsoSaidGoogle[month] ?? 0, people: [] });
  }
  const total = emptyRow();
  for (const m of byMonth.values()) {
    if (m.spend) total.spend = (total.spend ?? 0) + m.spend;
    total.alsoSaidGoogle += m.alsoSaidGoogle;
  }
  for (const p of people) {
    const row = byMonth.get(p.cohortMonth);
    if (!row) continue;
    addPerson(row, p);
    addPerson(total, p);
    row.people.push({
      userId: p.userId,
      name: p.name,
      phoneLast4: p.phone10 ? p.phone10.slice(-4) : null,
      tier: p.tier,
      stage: furthestStage(p),
      demoBooked: p.demoBooked,
      demoAttended: p.demoAttended,
      joined: p.joined,
      feesPaid: p.feesPaid,
    });
  }
  for (const m of byMonth.values()) setReturn(m);
  // The total ratio only compares like with like: fees from months whose spend is known.
  const paidFor = [...byMonth.values()].filter((m) => m.spend !== null);
  total.returnPerRupee = returnOf({
    spend: total.spend,
    fees: {
      confirmed: paidFor.reduce((sum, m) => sum + m.fees.confirmed, 0),
      said_google_ad: paidFor.reduce((sum, m) => sum + m.fees.said_google_ad, 0),
    },
  });
  return { months: [...byMonth.values()], total };
}

export function validateSpendInput(month: unknown, amount: unknown, currentMonth: string): string | null {
  if (typeof month !== 'string' || !/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) return 'month must be YYYY-MM';
  if (month < ROI_FROM_MONTH) return `month must be ${ROI_FROM_MONTH} or later`;
  if (month > currentMonth) return 'month cannot be in the future';
  if (amount === null) return null;
  if (typeof amount !== 'number' || !Number.isFinite(amount) || amount < 0 || amount > 1_000_000) return 'amount must be a number from 0 to 10,00,000';
  return null;
}
