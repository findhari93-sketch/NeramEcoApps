/**
 * College plans: the one place that gives, extends, changes and revokes a
 * college's paid plan. A database trigger copies the active plan onto
 * colleges.neram_tier / tier_* (or drops the college to free), so nothing here
 * writes those columns directly.
 */
import { getSupabaseAdminClient } from '@neram/database';
import {
  EXPIRING_WITHIN_DAYS,
  isIsoDate,
  isPlanTier,
  matchesPlanFilter,
  todayIST,
  type CollegePlan,
  type GivePlanInput,
  type PlanFilter,
  type PlanTier,
} from './helpers';

export class PlanError extends Error {
  constructor(message: string, public status: number) {
    super(message);
    this.name = 'PlanError';
  }
}

export const ACTIVE_PLAN_EXISTS =
  'This college already has an active plan. Extend or change it instead.';

export interface PlanCollege {
  id: string;
  name: string;
  slug: string | null;
  state_slug: string | null;
  city: string | null;
}

export interface PlanWithCollege extends CollegePlan {
  college: PlanCollege | null;
}

export interface PlanListRow extends PlanWithCollege {
  account_count: number;
}

const PLAN_COLUMNS =
  'id, college_id, tier, starts_on, ends_on, amount, status, notes, created_by, created_at, updated_at, revoked_at, revoked_by, revoke_reason';
const WITH_COLLEGE = `${PLAN_COLUMNS}, colleges(id, name, slug, state_slug, city)`;

// The generated Database types do not know these tables yet.
const plans = () => getSupabaseAdminClient().from('college_plans' as never) as any;

function toPlan(row: Record<string, unknown>): PlanWithCollege {
  const { colleges, ...rest } = row as Record<string, unknown> & { colleges?: PlanCollege | null };
  return { ...(rest as unknown as CollegePlan), amount: Number(rest.amount ?? 0), college: colleges ?? null };
}

async function getPlan(id: string): Promise<PlanWithCollege> {
  const { data, error } = await plans().select(WITH_COLLEGE).eq('id', id).maybeSingle();
  if (error) throw new PlanError(error.message, 500);
  if (!data) throw new PlanError('Plan not found.', 404);
  return toPlan(data);
}

async function getActivePlan(collegeId: string): Promise<PlanWithCollege | null> {
  const { data, error } = await plans()
    .select(WITH_COLLEGE)
    .eq('college_id', collegeId)
    .eq('status', 'active')
    .maybeSingle();
  if (error) throw new PlanError(error.message, 500);
  return data ? toPlan(data) : null;
}

/** Ends plans whose last day has passed. The nightly job does this too; calling it first keeps lists honest. */
export async function refreshPlans(): Promise<void> {
  const { error } = await (getSupabaseAdminClient() as any).rpc('refresh_college_plans');
  if (error) console.warn('[college-plans] refresh_college_plans failed:', error.message);
}

export async function givePlan(input: GivePlanInput & { staff: string }): Promise<PlanWithCollege> {
  const existing = await getActivePlan(input.college_id);
  if (existing) throw new PlanError(ACTIVE_PLAN_EXISTS, 409);

  const { data, error } = await plans()
    .insert({
      college_id: input.college_id,
      tier: input.tier,
      starts_on: input.starts_on,
      ends_on: input.ends_on,
      amount: input.amount,
      notes: input.notes,
      status: 'active',
      created_by: input.staff,
    })
    .select(WITH_COLLEGE)
    .single();
  if (error) {
    // Two staff giving a plan at once: the one-active index refuses the second.
    if (error.code === '23505') throw new PlanError(ACTIVE_PLAN_EXISTS, 409);
    if (error.code === '23503') throw new PlanError('College not found.', 404);
    throw new PlanError(error.message, 500);
  }
  return toPlan(data);
}

async function requireActive(id: string): Promise<PlanWithCollege> {
  const plan = await getPlan(id);
  if (plan.status !== 'active') {
    throw new PlanError(`This plan has ${plan.status === 'revoked' ? 'been revoked' : 'ended'}. Give a new plan instead.`, 409);
  }
  return plan;
}

async function updatePlan(id: string, patch: Record<string, unknown>): Promise<PlanWithCollege> {
  const { data, error } = await plans()
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq('id', id)
    .eq('status', 'active')
    .select(WITH_COLLEGE)
    .maybeSingle();
  if (error) throw new PlanError(error.message, 500);
  if (!data) throw new PlanError('This plan changed while you were editing it. Refresh and try again.', 409);
  return toPlan(data);
}

export async function extendPlan(id: string, endsOn: string): Promise<PlanWithCollege> {
  if (!isIsoDate(endsOn)) throw new PlanError('End date is not a valid date.', 400);
  const plan = await requireActive(id);
  if (endsOn < plan.starts_on) throw new PlanError('End date must be on or after the start date.', 400);
  if (endsOn < todayIST()) throw new PlanError('End date is in the past.', 400);
  return updatePlan(id, { ends_on: endsOn });
}

export async function changeTier(id: string, tier: PlanTier): Promise<PlanWithCollege> {
  if (!isPlanTier(tier)) throw new PlanError('Choose Silver, Gold or Platinum.', 400);
  const plan = await requireActive(id);
  if (plan.tier === tier) return plan;
  return updatePlan(id, { tier });
}

export async function revokePlan(id: string, reason: string, staff: string): Promise<PlanWithCollege> {
  const why = (reason ?? '').trim();
  if (!why) throw new PlanError('Give a reason for revoking.', 400);
  await requireActive(id);
  const now = new Date().toISOString();
  return updatePlan(id, {
    status: 'revoked',
    revoked_at: now,
    revoked_by: staff,
    revoke_reason: why.slice(0, 1000),
  });
}

/** Revokes the college's active plan if it has one. Returns it, or null. */
export async function revokeActivePlanFor(collegeId: string, reason: string, staff: string): Promise<PlanWithCollege | null> {
  const active = await getActivePlan(collegeId);
  if (!active) return null;
  return revokePlan(active.id, reason, staff);
}

export interface ListPlansOptions {
  status?: PlanFilter;
  tier?: PlanTier | null;
  expiringWithinDays?: number;
}

export interface ListPlansResult {
  plans: PlanListRow[];
  counts: Record<PlanFilter, number>;
  today: string;
}

/**
 * Every plan matching the filter, newest first, with how many active
 * dashboard accounts each college has. `counts` are per filter chip for the
 * same tier filter, so the chips read true whatever is selected.
 */
export async function listPlans(opts: ListPlansOptions = {}): Promise<ListPlansResult> {
  await refreshPlans();
  const supabase = getSupabaseAdminClient();
  let q = plans().select(WITH_COLLEGE).order('created_at', { ascending: false }).limit(2000);
  if (opts.tier) q = q.eq('tier', opts.tier);
  const { data, error } = await q;
  if (error) throw new PlanError(error.message, 500);

  const today = todayIST();
  const within = opts.expiringWithinDays ?? EXPIRING_WITHIN_DAYS;
  const all = ((data ?? []) as Record<string, unknown>[]).map(toPlan);

  const counts: Record<PlanFilter, number> = { all: 0, active: 0, expiring: 0, ended: 0, revoked: 0 };
  for (const p of all) {
    for (const f of Object.keys(counts) as PlanFilter[]) {
      if (matchesPlanFilter(p, f, today, within)) counts[f] += 1;
    }
  }
  const filter = opts.status ?? 'all';
  const picked = all.filter((p) => matchesPlanFilter(p, filter, today, within));

  const collegeIds = Array.from(new Set(picked.map((p) => p.college_id)));
  const accountCount = new Map<string, number>();
  if (collegeIds.length) {
    // Chunked: a long in() list makes a URL PostgREST refuses.
    for (let i = 0; i < collegeIds.length; i += 150) {
      const { data: admins } = await (supabase.from('college_admins' as never) as any)
        .select('college_id')
        .in('college_id', collegeIds.slice(i, i + 150))
        .eq('is_active', true);
      for (const a of (admins ?? []) as { college_id: string }[]) {
        accountCount.set(a.college_id, (accountCount.get(a.college_id) ?? 0) + 1);
      }
    }
  }

  return {
    plans: picked.map((p) => ({ ...p, account_count: accountCount.get(p.college_id) ?? 0 })),
    counts,
    today,
  };
}

/** Every plan the college has had, newest first. */
export async function planHistory(collegeId: string): Promise<PlanWithCollege[]> {
  await refreshPlans();
  const { data, error } = await plans()
    .select(WITH_COLLEGE)
    .eq('college_id', collegeId)
    .order('created_at', { ascending: false });
  if (error) throw new PlanError(error.message, 500);
  return ((data ?? []) as Record<string, unknown>[]).map(toPlan);
}

/** For routes: map a thrown error to a status and a message staff can read. */
export function planErrorResponse(err: unknown): { status: number; error: string } {
  if (err instanceof PlanError) return { status: err.status, error: err.message };
  return { status: 500, error: err instanceof Error ? err.message : 'Something went wrong.' };
}
