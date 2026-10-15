/**
 * Pure helpers for college plans (Admin > College Hub > Plans).
 *
 * Dates are plain 'YYYY-MM-DD' strings in India time, the same calendar the
 * database uses (college_plans.starts_on / ends_on are DATE columns and the
 * daily job compares them with today in Asia/Kolkata). Working on strings with
 * UTC arithmetic keeps the maths free of the server's own time zone.
 */

export const PLAN_TIERS = ['silver', 'gold', 'platinum'] as const;
export type PlanTier = (typeof PLAN_TIERS)[number];

export const PLAN_STATUSES = ['active', 'revoked', 'ended'] as const;
export type PlanStatus = (typeof PLAN_STATUSES)[number];

export type PlanState = 'scheduled' | 'active' | 'expiring' | 'ended' | 'revoked';

/** Plans with this many days or fewer left show as "Expiring". */
export const EXPIRING_WITHIN_DAYS = 30;

export interface CollegePlan {
  id: string;
  college_id: string;
  tier: PlanTier;
  starts_on: string;
  ends_on: string;
  amount: number;
  status: PlanStatus;
  notes: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  revoked_at: string | null;
  revoked_by: string | null;
  revoke_reason: string | null;
}

/** What each tier switches on, in one line, for the Give plan dialog. */
export const TIER_SUMMARY: Record<PlanTier, string> = {
  silver: 'Infrastructure and faculty sections on the public page.',
  gold: 'Everything in Silver, plus placements, ROI calculator, Aintra chat and full lead phone numbers.',
  platinum: 'Everything in Gold, plus the virtual tour.',
};

export const TIER_LABEL: Record<PlanTier, string> = {
  silver: 'Silver',
  gold: 'Gold',
  platinum: 'Platinum',
};

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

export function isPlanTier(v: unknown): v is PlanTier {
  return typeof v === 'string' && (PLAN_TIERS as readonly string[]).includes(v);
}

/** True for a real calendar date written as YYYY-MM-DD. */
export function isIsoDate(v: unknown): v is string {
  if (typeof v !== 'string' || !ISO_DATE.test(v)) return false;
  const d = new Date(`${v}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === v;
}

/** Today in India, as YYYY-MM-DD. */
export function todayIST(now: Date = new Date()): string {
  return now.toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
}

function toUtc(date: string): Date {
  return new Date(`${date}T00:00:00Z`);
}

function fromUtc(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export function addDays(date: string, days: number): string {
  const d = toUtc(date);
  d.setUTCDate(d.getUTCDate() + days);
  return fromUtc(d);
}

/** Adds calendar months, clamping to the last day (31 Jan + 1 month = 28 or 29 Feb). */
export function addMonths(date: string, months: number): string {
  const d = toUtc(date);
  const day = d.getUTCDate();
  d.setUTCDate(1);
  d.setUTCMonth(d.getUTCMonth() + months);
  const lastDay = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate();
  d.setUTCDate(Math.min(day, lastDay));
  return fromUtc(d);
}

/** Whole days from `from` to `to` (negative when `to` is earlier). */
export function daysBetween(from: string, to: string): number {
  return Math.round((toUtc(to).getTime() - toUtc(from).getTime()) / 86_400_000);
}

export type PlanPreset = 'trial' | 'season' | 'year';

export const PRESET_LABEL: Record<PlanPreset, string> = {
  trial: 'Trial, 1 month',
  season: 'Admission season (to 31 Aug)',
  year: '1 year',
};

/**
 * End date for a quick preset, counted from the start date.
 * - trial: one calendar month.
 * - season: 31 August of the admission year. A start after 31 August belongs
 *   to next year's season.
 * - year: one year, ending the day before the anniversary (365 days in all).
 */
export function presetEndDate(preset: PlanPreset, start: string): string {
  if (preset === 'trial') return addMonths(start, 1);
  if (preset === 'year') return addDays(addMonths(start, 12), -1);
  const year = Number(start.slice(0, 4));
  const thisSeason = `${year}-08-31`;
  return start > thisSeason ? `${year + 1}-08-31` : thisSeason;
}

/** Days left until the plan's last day (0 on the last day, negative once over). */
export function daysLeft(plan: Pick<CollegePlan, 'ends_on'>, today: string = todayIST()): number {
  return daysBetween(today, plan.ends_on);
}

/** How a plan reads to staff today. */
export function planState(
  plan: Pick<CollegePlan, 'status' | 'starts_on' | 'ends_on'>,
  today: string = todayIST(),
): PlanState {
  if (plan.status === 'revoked') return 'revoked';
  if (plan.status === 'ended' || plan.ends_on < today) return 'ended';
  if (plan.starts_on > today) return 'scheduled';
  if (daysLeft(plan, today) <= EXPIRING_WITHIN_DAYS) return 'expiring';
  return 'active';
}

export const PLAN_STATE_LABEL: Record<PlanState, string> = {
  scheduled: 'Starts later',
  active: 'Active',
  expiring: 'Expiring soon',
  ended: 'Ended',
  revoked: 'Revoked',
};

export type PlanFilter = 'all' | 'active' | 'expiring' | 'ended' | 'revoked';

export const PLAN_FILTERS: PlanFilter[] = ['all', 'active', 'expiring', 'ended', 'revoked'];

/**
 * Does a plan belong under a filter chip?
 * "Active" covers every plan still running or about to (scheduled, active and
 * expiring), because all of them hold the college's one active slot.
 */
export function matchesPlanFilter(
  plan: Pick<CollegePlan, 'status' | 'starts_on' | 'ends_on'>,
  filter: PlanFilter,
  today: string = todayIST(),
  expiringWithinDays: number = EXPIRING_WITHIN_DAYS,
): boolean {
  const state = planState(plan, today);
  switch (filter) {
    case 'all':
      return true;
    case 'active':
      return state === 'active' || state === 'expiring' || state === 'scheduled';
    case 'expiring':
      return (state === 'active' || state === 'expiring') && daysLeft(plan, today) <= expiringWithinDays;
    case 'ended':
      return state === 'ended';
    case 'revoked':
      return state === 'revoked';
    default:
      return false;
  }
}

export function isPlanFilter(v: unknown): v is PlanFilter {
  return typeof v === 'string' && (PLAN_FILTERS as string[]).includes(v);
}

export interface GivePlanInput {
  college_id: string;
  tier: PlanTier;
  starts_on: string;
  ends_on: string;
  amount: number;
  notes: string | null;
}

/**
 * Checks a Give plan request. Returns the cleaned input or a message for staff.
 * `today` lets an end date in the past be refused (the plan would end tonight).
 */
export function validateGivePlan(
  body: unknown,
  today: string = todayIST(),
): { ok: true; value: GivePlanInput } | { ok: false; error: string } {
  const b = (body ?? {}) as Record<string, unknown>;
  if (typeof b.college_id !== 'string' || !b.college_id.trim()) return { ok: false, error: 'Choose a college.' };
  if (!isPlanTier(b.tier)) return { ok: false, error: 'Choose Silver, Gold or Platinum.' };
  const starts = b.starts_on === undefined || b.starts_on === null || b.starts_on === '' ? today : b.starts_on;
  if (!isIsoDate(starts)) return { ok: false, error: 'Start date is not a valid date.' };
  if (!isIsoDate(b.ends_on)) return { ok: false, error: 'End date is not a valid date.' };
  if (b.ends_on < starts) return { ok: false, error: 'End date must be on or after the start date.' };
  if (b.ends_on < today) return { ok: false, error: 'End date is in the past.' };
  const amount = b.amount === undefined || b.amount === null || b.amount === '' ? 0 : Number(b.amount);
  if (!Number.isFinite(amount) || amount < 0) return { ok: false, error: 'Amount must be 0 or more.' };
  const notes = typeof b.notes === 'string' && b.notes.trim() ? b.notes.trim().slice(0, 1000) : null;
  return {
    ok: true,
    value: { college_id: b.college_id.trim(), tier: b.tier, starts_on: starts, ends_on: b.ends_on, amount, notes },
  };
}

/** "Rs 40,000", or "Free trial" for 0. */
export function formatPlanAmount(amount: number | string | null | undefined): string {
  const n = Number(amount ?? 0);
  if (!Number.isFinite(n) || n <= 0) return 'Free trial';
  return `Rs ${n.toLocaleString('en-IN', { maximumFractionDigits: 0 })}`;
}
